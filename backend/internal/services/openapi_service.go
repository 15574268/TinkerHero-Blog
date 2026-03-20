package services

import (
	"context"
	"crypto/subtle"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// OpenAPIService 提供免登录、API Key 校验的发布接口
type OpenAPIService struct {
	db        *gorm.DB
	rdb       *redis.Client
	systemSvc *SystemService
	searchSvc *SearchService
}

func NewOpenAPIService(db *gorm.DB, rdb *redis.Client, systemSvc *SystemService) *OpenAPIService {
	return &OpenAPIService{db: db, rdb: rdb, systemSvc: systemSvc}
}

func (s *OpenAPIService) SetSearchService(searchSvc *SearchService) {
	s.searchSvc = searchSvc
}

// CheckPublishAuth 校验是否启用发布 + API Key 是否匹配
// 约定：
// - Header: X-API-Key: <key>
// - Query:  ?api_key=<key>（兜底）
func (s *OpenAPIService) CheckPublishAuth(c *gin.Context) bool {
	if s.systemSvc == nil || !s.systemSvc.GetConfigBool("api_publish_enabled") {
		utils.Forbidden(c, "API发布未开启")
		return false
	}
	expected := strings.TrimSpace(s.systemSvc.GetConfig("api_publish_key"))
	if expected == "" {
		utils.Forbidden(c, "API Key 未配置")
		return false
	}

	provided := strings.TrimSpace(c.GetHeader("X-API-Key"))
	if provided == "" {
		provided = strings.TrimSpace(c.Query("api_key"))
	}
	if provided == "" {
		utils.Forbidden(c, "缺少 API Key")
		return false
	}

	// constant-time compare
	if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		utils.Forbidden(c, "API Key 无效")
		return false
	}
	return true
}

type openCreatePostReq struct {
	Title      string `json:"title" binding:"required"`
	Slug       string `json:"slug"`
	Content    string `json:"content" binding:"required"`
	Summary    string `json:"summary"`
	CoverImage string `json:"cover_image"`

	CategoryID *uint  `json:"category_id"`
	TagIDs     []uint `json:"tag_ids"`

	IsTop        bool   `json:"is_top"`
	AllowComment *bool  `json:"allow_comment"`
	Password     string `json:"password"`
	PasswordHint string `json:"password_hint"`
}

// CreateAndPublishPost 创建并发布文章（免登录，API Key 校验）
func (s *OpenAPIService) CreateAndPublishPost(c *gin.Context) {
	if !s.CheckPublishAuth(c) {
		return
	}

	var req openCreatePostReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误")
		return
	}

	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		// slug 为空时生成一个稳定但不美观的兜底值（避免中文标题无法 slugify 导致空串）
		slug = fmt.Sprintf("post-%d", time.Now().Unix())
	}

	// 验证 slug 唯一性
	var existingPost models.Post
	if err := s.db.Where("slug = ?", slug).First(&existingPost).Error; err == nil {
		utils.BadRequest(c, "URL别名已存在")
		return
	}

	// 验证分类是否存在
	if req.CategoryID != nil {
		var category models.Category
		if err := s.db.First(&category, "id = ?", *req.CategoryID).Error; err != nil {
			utils.BadRequest(c, "分类不存在")
			return
		}
	}

	// 去重并验证标签是否存在
	tagIDs := req.TagIDs
	if len(tagIDs) > 0 {
		seen := make(map[uint]bool)
		unique := make([]uint, 0, len(tagIDs))
		for _, id := range tagIDs {
			if !seen[id] {
				seen[id] = true
				unique = append(unique, id)
			}
		}
		tagIDs = unique

		var count int64
		if err := s.db.Model(&models.Tag{}).Where("id IN ?", tagIDs).Count(&count).Error; err != nil {
			logger.Error("查询标签失败", zap.Error(err))
			utils.InternalError(c, "查询标签失败")
			return
		}
		if int(count) != len(tagIDs) {
			utils.BadRequest(c, "部分标签不存在")
			return
		}
	}

	// 选择发布作者：优先最小 ID 的 admin，否则使用最小 ID 的 author，否则兜底为 1
	authorID := uint(1)
	{
		var u models.User
		if err := s.db.Where("role = ? AND is_active = ?", models.RoleAdmin, true).Order("id asc").Limit(1).Find(&u).Error; err == nil && u.ID > 0 {
			authorID = u.ID
		} else {
			var a models.User
			if err := s.db.Where("role = ? AND is_active = ?", models.RoleAuthor, true).Order("id asc").Limit(1).Find(&a).Error; err == nil && a.ID > 0 {
				authorID = a.ID
			}
		}
	}

	allowComment := true
	if req.AllowComment != nil {
		allowComment = *req.AllowComment
	}

	now := time.Now()
	post := models.Post{
		Title:        req.Title,
		Slug:         slug,
		Content:      req.Content,
		Summary:      req.Summary,
		CoverImage:   req.CoverImage,
		AuthorID:     authorID,
		CategoryID:   req.CategoryID,
		Status:       models.PostPublished,
		IsTop:        req.IsTop,
		AllowComment: allowComment,
		PasswordHint: req.PasswordHint,
		PublishedAt:  &now,
	}

	// 处理密码保护
	if strings.TrimSpace(req.Password) != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			utils.InternalError(c, "密码加密失败")
			return
		}
		post.Password = string(hashed)
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Create(&post).Error; err != nil {
		tx.Rollback()
		logger.Error("创建文章失败", zap.Error(err))
		utils.InternalError(c, "创建文章失败")
		return
	}

	// 关联标签
	if len(tagIDs) > 0 {
		var tags []models.Tag
		if err := tx.Find(&tags, tagIDs).Error; err != nil {
			tx.Rollback()
			logger.Error("关联标签失败", zap.Error(err))
			utils.InternalError(c, "关联标签失败")
			return
		}
		if err := tx.Model(&post).Association("Tags").Replace(tags); err != nil {
			tx.Rollback()
			logger.Error("关联标签失败", zap.Error(err))
			utils.InternalError(c, "关联标签失败")
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "提交事务失败")
		return
	}

	// 清理文章相关缓存（posts 列表 / 单篇 / 相关文章）
	s.invalidatePostCache(context.Background(), "")

	// reload for response + search indexing
	if err := s.db.Preload("Author").Preload("Category").Preload("Tags").First(&post, "id = ?", post.ID).Error; err != nil {
		logger.Warn("reload post after create failed", zap.Uint("post_id", post.ID), zap.Error(err))
	}

	// 更新搜索索引
	if s.searchSvc != nil {
		go s.searchSvc.IndexPost(&post)
	}

	// 通知订阅者
	if s.systemSvc != nil {
		go func() {
			if err := s.systemSvc.NotifySubscribers(&post); err != nil {
				logger.Warn("订阅者通知发送失败", zap.Uint("post_id", post.ID), zap.Error(err))
			}
		}()
	}

	utils.Created(c, post)
}

// invalidatePostCache 删除与文章相关的缓存键（复制自 PostService，避免导出内部方法）
func (s *OpenAPIService) invalidatePostCache(ctx context.Context, postID string) {
	if s.rdb == nil {
		return
	}
	// 清除单篇文章缓存
	if postID != "" {
		s.rdb.Del(ctx, fmt.Sprintf("post:%s", postID))
	}

	// 扫描并删除 posts:* 列表缓存
	cursor := uint64(0)
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, "posts:*", 100).Result()
		if err != nil {
			logger.Warn("扫描缓存键失败", zap.Error(err))
			break
		}
		if len(keys) > 0 {
			s.rdb.Del(ctx, keys...)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}

	// 扫描并删除 related_posts:* 缓存
	cursor = uint64(0)
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, "related_posts:*", 100).Result()
		if err != nil {
			logger.Warn("扫描相关文章缓存键失败", zap.Error(err))
			break
		}
		if len(keys) > 0 {
			s.rdb.Del(ctx, keys...)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}

// Optional helper: allow callers to purge a specific post cache by id (string or uint)
func (s *OpenAPIService) PurgePostCacheByID(id any) {
	switch v := id.(type) {
	case string:
		if strings.TrimSpace(v) == "" {
			return
		}
		s.invalidatePostCache(context.Background(), v)
	case uint:
		s.invalidatePostCache(context.Background(), strconv.FormatUint(uint64(v), 10))
	}
}

