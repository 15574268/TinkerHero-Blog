package services

import (
	"context"
	"encoding/json"
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

type PostService struct {
	db        *gorm.DB
	rdb       *redis.Client
	searchSvc *SearchService
	systemSvc *SystemService
	autoLink  *AutoLinkService
	stopChan  chan struct{}
	getConfig func(key string) string
}

func NewPostService(db *gorm.DB, rdb *redis.Client, getConfig func(key string) string) *PostService {
	svc := &PostService{db: db, rdb: rdb, stopChan: make(chan struct{}), getConfig: getConfig}
	go svc.viewCountSyncLoop()
	return svc
}

// SetSystemService 设置系统服务（用于文章发布时通知订阅者）
func (s *PostService) SetSystemService(svc *SystemService) {
	s.systemSvc = svc
}

// SetAutoLinkService 设置自动内链服务（用于文章正文渲染时添加内链）
func (s *PostService) SetAutoLinkService(svc *AutoLinkService) {
	s.autoLink = svc
}

// StopViewCountSync stops the background view count sync goroutine.
func (s *PostService) StopViewCountSync() {
	select {
	case <-s.stopChan:
	default:
		close(s.stopChan)
	}
	s.flushViewCounts()
}

// viewCountSyncLoop periodically flushes accumulated view counts from Redis to DB.
func (s *PostService) viewCountSyncLoop() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.flushViewCounts()
		case <-s.stopChan:
			return
		}
	}
}

// flushViewCounts reads all pending view count increments from Redis and writes them to DB.
func (s *PostService) flushViewCounts() {
	ctx := context.Background()
	iter := s.rdb.Scan(ctx, 0, "view_incr:*", 500).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		count, err := s.rdb.GetDel(ctx, key).Int64()
		if err != nil || count <= 0 {
			continue
		}
		// key format: view_incr:<post_id>
		var postID uint
		if _, err := fmt.Sscanf(key, "view_incr:%d", &postID); err != nil || postID == 0 {
			continue
		}
		if err := s.db.Model(&models.Post{}).Where("id = ?", postID).
			UpdateColumn("view_count", gorm.Expr("view_count + ?", count)).Error; err != nil {
			logger.Warn("flush view_count failed", zap.Uint("post_id", postID), zap.Error(err))
			if err := s.rdb.IncrBy(ctx, key, count).Err(); err != nil {
				logger.Error("failed to restore view count to Redis, data lost",
					zap.Uint("post_id", postID), zap.Int64("count", count), zap.Error(err))
			}
		}
	}
	if err := iter.Err(); err != nil {
		logger.Warn("scan view_incr keys encountered error", zap.Error(err))
	}
}

// IncrViewCount increments view count in Redis (non-blocking).
func (s *PostService) IncrViewCount(postID uint) {
	ctx := context.Background()
	key := fmt.Sprintf("view_incr:%d", postID)
	s.rdb.Incr(ctx, key)
}

// SetSearchService 设置搜索服务（避免循环依赖）
func (s *PostService) SetSearchService(searchSvc *SearchService) {
	s.searchSvc = searchSvc
}

// GetPosts 获取文章列表（带缓存）
func (s *PostService) GetPosts(c *gin.Context) {
	ctx := context.Background()

	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	categoryID := c.Query("category_id")
	tagID := c.Query("tag_id")

	if categoryID != "" {
		if _, err := strconv.Atoi(categoryID); err != nil {
			utils.BadRequest(c, "无效的分类ID")
			return
		}
	}
	if tagID != "" {
		if _, err := strconv.Atoi(tagID); err != nil {
			utils.BadRequest(c, "无效的标签ID")
			return
		}
	}

	cacheKey := fmt.Sprintf("posts:page:%d:size:%d:cat:%s:tag:%s", page, pageSize, categoryID, tagID)

	// 尝试从Redis获取缓存
	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Header("X-Cache", "HIT")
		c.Data(200, "application/json", []byte(cached))
		return
	}

	// 从数据库查询
	var posts []models.Post
	query := s.db.Model(&models.Post{}).Where("status = ?", models.PostPublished).
		Preload("Author").
		Preload("Category").
		Preload("Tags").
		Order("is_top desc, published_at desc")

	// 分类筛选
	if categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	// 标签筛选
	if tagID != "" {
		query = query.Joins("JOIN post_tags ON post_tags.post_id = posts.id").
			Where("post_tags.tag_id = ?", tagID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		logger.Error("获取文章数量失败", zap.Error(err))
		utils.InternalError(c, "获取文章列表失败")
		return
	}
	query = query.Offset(utils.GetOffset(page, pageSize)).Limit(pageSize)

	if err := query.Find(&posts).Error; err != nil {
		logger.Error("获取文章列表失败", zap.Error(err))
		utils.InternalError(c, "获取文章列表失败")
		return
	}

	// 填充默认封面与摘要（无 summary 时按 excerpt_length 截取正文）
	excerptLen := 150
	if s.getConfig != nil {
		if v := s.getConfig("excerpt_length"); v != "" {
			if i, err := strconv.Atoi(v); err == nil && i > 0 {
				excerptLen = i
			}
		}
		defaultCover := s.getConfig("default_cover_image")
		for i := range posts {
			if posts[i].CoverImage == "" && defaultCover != "" {
				posts[i].CoverImage = defaultCover
			}
			if posts[i].Summary == "" && posts[i].Content != "" {
				posts[i].Summary = truncateToRunes(posts[i].Content, excerptLen)
			}
		}
	}

	result := utils.NewPaginatedResult(posts, total, page, pageSize).ToMap()

	// 存入Redis缓存（5分钟）- 缓存完整的 API 响应格式
	wrapped := utils.APIResponse{Success: true, Data: result}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 5*time.Minute)
	}

	c.Header("X-Cache", "MISS")
	utils.Success(c, result)
}

// GetAdminPosts 后台获取文章列表（支持草稿/过滤）
func (s *PostService) GetAdminPosts(c *gin.Context) {
	// 仅管理员在 /admin 路由下可访问，这里假定中间件已做权限校验

	// 通用分页
	page, pageSize := utils.GetPagination(c)

	// 过滤参数
	status := c.Query("status")   // draft/published/scheduled 或空=全部
	my := c.Query("my") == "true" // 只看自己的文章
	categoryID := c.Query("category_id")
	tagID := c.Query("tag_id")

	var posts []models.Post
	query := s.db.Model(&models.Post{}).
		Preload("Author").
		Preload("Category").
		Preload("Tags").
		Order("created_at desc")

	// 状态过滤
	if status != "" {
		query = query.Where("status = ?", status)
	}

	// 分类筛选
	if categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	// 标签筛选
	if tagID != "" {
		query = query.Joins("JOIN post_tags ON post_tags.post_id = posts.id").
			Where("post_tags.tag_id = ?", tagID)
	}

	// 只看自己的文章（作者）
	if my {
		userID := c.GetUint("user_id")
		if userID > 0 {
			query = query.Where("author_id = ?", userID)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		logger.Error("统计文章数量失败", zap.Error(err))
		utils.InternalError(c, "获取文章列表失败")
		return
	}

	if err := query.Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Find(&posts).Error; err != nil {
		logger.Error("获取后台文章列表失败", zap.Error(err))
		utils.InternalError(c, "获取文章列表失败")
		return
	}

	// 使用统一的分页 Map 结构，方便前端解析
	result := utils.NewPaginatedResult(posts, total, page, pageSize).ToMap()
	utils.Success(c, result)
}

// GetPost 获取单篇文章（带缓存）。:id 参数可以是数字 ID 或 URL 别名（slug）
func (s *PostService) GetPost(c *gin.Context) {
	id := c.Param("id")
	ctx := context.Background()
	cacheKey := fmt.Sprintf("post:%s", id)

	// 优先从请求头获取密码（更安全）
	password := c.GetHeader("X-Post-Password")
	// 兼容 URL 参数方式（向后兼容）
	if password == "" {
		password = c.Query("password")
	}

	// 尝试从Redis获取缓存
	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil && password == "" {
		c.Header("X-Cache", "HIT")
		c.Data(200, "application/json", []byte(cached))
		return
	}

	var post models.Post
	query := s.db.Preload("Author").Preload("Category").Preload("Tags")
	// 纯数字按 ID 查，否则按 slug 查
	if _, numErr := strconv.ParseUint(id, 10, 64); numErr == nil {
		err = query.First(&post, "id = ?", id).Error
	} else {
		err = query.First(&post, "slug = ?", id).Error
	}
	if err != nil {
		utils.NotFound(c, "文章不存在")
		return
	}
	if post.CoverImage == "" && s.getConfig != nil && s.getConfig("default_cover_image") != "" {
		post.CoverImage = s.getConfig("default_cover_image")
	}

	// 检查文章状态 - 草稿文章只能被作者或管理员查看
	if post.Status == models.PostDraft {
		userID, exists := c.Get("user_id")
		role := c.GetString("role")
		uid, ok := userID.(uint)
		if !exists || !ok || (post.AuthorID != uid && role != "admin") {
			utils.NotFound(c, "文章不存在")
			return
		}
		// 草稿文章不缓存
		utils.Success(c, post)
		return
	}

	// 检查定时发布
	if post.Status == models.PostScheduled {
		userID, exists := c.Get("user_id")
		role := c.GetString("role")
		uid, ok := userID.(uint)
		if !exists || !ok || (post.AuthorID != uid && role != "admin") {
			utils.NotFound(c, "文章尚未发布")
			return
		}
	}

	// 检查密码保护
	if post.Password != "" {
		// 已登录且为文章作者或管理员：直接返回全文（用于后台编辑），不要求密码
		if userID, exists := c.Get("user_id"); exists {
			if uid, ok := userID.(uint); ok {
				role := c.GetString("role")
				if post.AuthorID == uid || role == "admin" {
					utils.Success(c, post)
					return
				}
			}
		}
		// 使用 bcrypt 验证密码
		if password == "" || bcrypt.CompareHashAndPassword([]byte(post.Password), []byte(password)) != nil {
			// 返回需要密码的提示
			c.JSON(403, gin.H{
				"error":         "该文章需要密码访问",
				"need_password": true,
				"password_hint": post.PasswordHint,
			})
			return
		}
		// 密码正确，但不缓存密码保护的文章
		utils.Success(c, post)
		return
	}

	// 增加浏览次数（异步写入 Redis，定时批量同步到数据库）
	s.IncrViewCount(post.ID)

	// 自动内链：在返回正文前进行处理（仅影响对外展示，不修改 DB）
	if s.autoLink != nil {
		cfg := s.autoLink.GetConfig()
		if cfg.Enabled {
			post.Content = s.autoLink.ProcessContent(post.Content, cfg, post.ID)
		}
	}

	// 存入Redis缓存（10分钟）- 缓存完整的 API 响应格式
	wrapped := utils.APIResponse{Success: true, Data: post}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 10*time.Minute)
	}

	c.Header("X-Cache", "MISS")
	utils.Success(c, post)
}

// CreatePost 创建文章
func (s *PostService) CreatePost(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req models.CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误")
		return
	}

	// 验证 slug 唯一性
	var existingPost models.Post
	// 注意：posts 表对 slug 建了唯一索引（不区分 deleted_at），因此这里也要把软删除记录一起查出来，
	// 避免“代码认为可用，但插入时撞唯一约束导致 500”。
	if err := s.db.Unscoped().Where("slug = ?", req.Slug).First(&existingPost).Error; err == nil {
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
	if len(req.TagIDs) > 0 {
		seen := make(map[uint]bool)
		unique := make([]uint, 0, len(req.TagIDs))
		for _, id := range req.TagIDs {
			if !seen[id] {
				seen[id] = true
				unique = append(unique, id)
			}
		}
		req.TagIDs = unique

		var count int64
		if err := s.db.Model(&models.Tag{}).Where("id IN ?", req.TagIDs).Count(&count).Error; err != nil {
			logger.Error("查询标签失败", zap.Error(err))
			utils.InternalError(c, "查询标签失败")
			return
		}
		if int(count) != len(req.TagIDs) {
			utils.BadRequest(c, "部分标签不存在")
			return
		}
	}

	post := models.Post{
		Title:        req.Title,
		Slug:         req.Slug,
		Content:      req.Content,
		Summary:      req.Summary,
		CoverImage:   req.CoverImage,
		AuthorID:     userID,
		CategoryID:   req.CategoryID,
		Status:       req.Status,
		IsTop:        req.IsTop,
		AllowComment: req.AllowComment,
		PasswordHint: req.PasswordHint,
	}

	// 处理密码保护
	if req.Password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			utils.InternalError(c, "密码加密失败")
			return
		}
		post.Password = string(hashed)
	}

	if req.Status == models.PostPublished {
		now := time.Now()
		post.PublishedAt = &now
	} else if req.Status == models.PostScheduled {
		if req.PublishedAt == nil {
			utils.BadRequest(c, "定时发布必须指定发布时间")
			return
		}
		if req.PublishedAt.Before(time.Now()) {
			utils.BadRequest(c, "定时发布时间必须在未来")
			return
		}
		post.PublishedAt = req.PublishedAt
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
	if len(req.TagIDs) > 0 {
		var tags []models.Tag
		if err := tx.Find(&tags, req.TagIDs).Error; err != nil {
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

	// 清除文章相关缓存（使用 SCAN 而非通配符）
	ctx := context.Background()
	s.invalidatePostCache(ctx, "")

	if err := s.db.Preload("Author").Preload("Category").Preload("Tags").First(&post, "id = ?", post.ID).Error; err != nil {
		logger.Warn("reload post after create failed", zap.Uint("post_id", post.ID), zap.Error(err))
	}

	if s.searchSvc != nil && post.Status == models.PostPublished {
		go s.searchSvc.IndexPost(&post)
	}

	// 创建时如果已是立即发布（published），应触发一次订阅通知。
	// 后续编辑如果仍保持 published，不会再次通知（因为 UpdatePost 只在从非 published 切到 published 时通知）。
	if post.Status == models.PostPublished && s.systemSvc != nil {
		go func() {
			if err := s.systemSvc.NotifySubscribers(&post); err != nil {
				logger.Warn("订阅者通知发送失败", zap.Uint("post_id", post.ID), zap.Error(err))
			}
		}()
	}

	utils.Created(c, post)
}

// UpdatePost 更新文章
func (s *PostService) UpdatePost(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	var post models.Post
	if err := s.db.First(&post, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "文章不存在")
		return
	}

	if post.AuthorID != userID && role != "admin" {
		utils.Forbidden(c, "权限不足")
		return
	}

	var req models.UpdatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误")
		return
	}

	// 记录更新前的状态/是否从未设置过 published_at
	previousStatus := post.Status
	wasNeverPublished := post.PublishedAt == nil

	updates := map[string]any{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Summary != nil {
		updates["summary"] = *req.Summary
	}
	if req.CoverImage != nil {
		updates["cover_image"] = *req.CoverImage
	}
	if req.CategoryID != nil {
		updates["category_id"] = req.CategoryID
	}
	if req.Status != "" {
		updates["status"] = req.Status
		if req.Status == models.PostPublished && post.PublishedAt == nil {
			now := time.Now()
			updates["published_at"] = &now
		} else if req.Status == models.PostScheduled {
			if req.PublishedAt == nil {
				utils.BadRequest(c, "定时发布必须指定发布时间")
				return
			}
			updates["published_at"] = req.PublishedAt
		}
	}
	if req.IsTop != nil {
		updates["is_top"] = *req.IsTop
	}
	if req.AllowComment != nil {
		updates["allow_comment"] = *req.AllowComment
	}
	// 处理密码保护
	if req.Password != nil {
		if *req.Password == "" {
			updates["password"] = ""
		} else {
			hashed, err := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
			if err != nil {
				utils.InternalError(c, "密码加密失败")
				return
			}
			updates["password"] = string(hashed)
		}
	}
	if req.PasswordHint != nil {
		updates["password_hint"] = *req.PasswordHint
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Model(&post).Updates(updates).Error; err != nil {
		tx.Rollback()
		logger.Error("更新文章失败", zap.String("post_id", id), zap.Error(err))
		utils.InternalError(c, "更新文章失败")
		return
	}

	if req.TagIDs != nil {
		var tags []models.Tag
		if len(req.TagIDs) > 0 {
			if err := tx.Find(&tags, req.TagIDs).Error; err != nil {
				tx.Rollback()
				logger.Error("查询标签失败", zap.String("post_id", id), zap.Error(err))
				utils.InternalError(c, "更新标签失败")
				return
			}
		}
		if err := tx.Model(&post).Association("Tags").Replace(tags); err != nil {
			tx.Rollback()
			logger.Error("更新标签失败", zap.String("post_id", id), zap.Error(err))
			utils.InternalError(c, "更新标签失败")
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "提交事务失败")
		return
	}

	// 清除缓存
	ctx := context.Background()
	s.invalidatePostCache(ctx, id)

	if err := s.db.Preload("Author").Preload("Category").Preload("Tags").First(&post, "id = ?", post.ID).Error; err != nil {
		logger.Warn("reload post after update failed", zap.Uint("post_id", post.ID), zap.Error(err))
	}

	// 更新搜索索引
	if s.searchSvc != nil {
		if post.Status == models.PostPublished {
			go s.searchSvc.IndexPost(&post)
		} else {
			go s.searchSvc.DeletePostFromIndex(post.ID)
		}
	}

	// 当文章状态从非 published 切到 published，且 published_at 之前从未设置过时，才通知订阅者。
	// 这样能保证“首次发布只发一次”，同时 CreatePost（立即发布）已负责首次通知。
	isFirstPublish := req.Status == models.PostPublished && previousStatus != models.PostPublished && wasNeverPublished
	if isFirstPublish && s.systemSvc != nil {
		go func() {
			if err := s.systemSvc.NotifySubscribers(&post); err != nil {
				logger.Warn("订阅者通知发送失败", zap.Uint("post_id", post.ID), zap.Error(err))
			}
		}()
	}

	utils.Success(c, post)
}

// DeletePost 删除文章
func (s *PostService) DeletePost(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	var post models.Post
	if err := s.db.First(&post, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "文章不存在")
		return
	}

	if post.AuthorID != userID && role != "admin" {
		utils.Forbidden(c, "权限不足")
		return
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 删除关联数据
	// 1. 删除评论
	if err := tx.Where("post_id = ?", post.ID).Delete(&models.Comment{}).Error; err != nil {
		tx.Rollback()
		logger.Error("删除评论失败", zap.String("post_id", id), zap.Error(err))
		utils.InternalError(c, "删除评论失败")
		return
	}

	// 2. 删除文章标签关联
	if err := tx.Model(&post).Association("Tags").Clear(); err != nil {
		tx.Rollback()
		logger.Error("清除标签关联失败", zap.String("post_id", id), zap.Error(err))
		utils.InternalError(c, "清除标签关联失败")
		return
	}

	// 5. 删除文章
	if err := tx.Delete(&post).Error; err != nil {
		tx.Rollback()
		logger.Error("删除文章失败", zap.String("post_id", id), zap.Error(err))
		utils.InternalError(c, "删除文章失败")
		return
	}

	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "提交事务失败")
		return
	}

	// 清除缓存
	ctx := context.Background()
	s.invalidatePostCache(ctx, id)

	// 从搜索索引删除
	if s.searchSvc != nil {
		go s.searchSvc.DeletePostFromIndex(post.ID)
	}

	utils.NoContent(c)
}

// LikePost 点赞文章
func (s *PostService) LikePost(c *gin.Context) {
	postID := c.Param("id")

	var post models.Post
	if err := s.db.First(&post, "id = ?", postID).Error; err != nil {
		utils.NotFound(c, "文章不存在")
		return
	}

	if err := s.db.Model(&post).UpdateColumn("like_count", gorm.Expr("like_count + ?", 1)).Error; err != nil {
		logger.Error("更新点赞数失败", zap.String("post_id", postID), zap.Error(err))
		utils.InternalError(c, "点赞失败")
		return
	}

	utils.SuccessWithMessage(c, "点赞成功", nil)
}

// FavoritePost 收藏文章
// invalidatePostCache 使文章缓存失效
// postID 为空时清除所有文章缓存，否则只清除指定文章缓存
func (s *PostService) invalidatePostCache(ctx context.Context, postID string) {
	// 清除单篇文章缓存
	if postID != "" {
		s.rdb.Del(ctx, fmt.Sprintf("post:%s", postID))
	}

	// 使用 SCAN 批量删除缓存键（优化性能）
	var cursor uint64
	for {
		var keys []string
		var err error

		keys, cursor, err = s.rdb.Scan(ctx, cursor, "posts:*", 100).Result()
		if err != nil {
			logger.Warn("扫描缓存键失败", zap.Error(err))
			break
		}
		if len(keys) > 0 {
			s.rdb.Del(ctx, keys...)
		}
		if cursor == 0 {
			break
		}
	}

	// 批量清除相关文章推荐缓存
	cursor = 0
	for {
		var keys []string
		var err error

		keys, cursor, err = s.rdb.Scan(ctx, cursor, "related_posts:*", 100).Result()
		if err != nil {
			logger.Warn("扫描相关文章缓存键失败", zap.Error(err))
			break
		}
		if len(keys) > 0 {
			s.rdb.Del(ctx, keys...)
		}
		if cursor == 0 {
			break
		}
	}
}

// truncateToRunes 按 rune 截断字符串，超过 max 时追加 "..."
func truncateToRunes(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 {
		return s
	}
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "..."
}
