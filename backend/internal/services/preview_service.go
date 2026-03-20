package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// PreviewService 草稿预览服务
type PreviewService struct {
	db *gorm.DB
}

// NewPreviewService 创建预览服务
func NewPreviewService(db *gorm.DB) *PreviewService {
	return &PreviewService{db: db}
}

// CreatePreviewLink 创建预览链接
func (s *PreviewService) CreatePreviewLink(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req models.CreatePreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查文章是否存在且用户有权限
	var post models.Post
	if err := s.db.First(&post, req.PostID).Error; err != nil {
		logger.Warn("文章不存在", zap.Uint("post_id", req.PostID))
		utils.NotFound(c, "文章不存在")
		return
	}

	// 权限检查：只有作者或管理员可以创建预览链接
	role := c.GetString("role")
	if post.AuthorID != userID && role != "admin" {
		logger.Warn("权限不足", zap.Uint("user_id", userID), zap.Uint("post_id", req.PostID))
		utils.Forbidden(c, "权限不足")
		return
	}

	// 生成随机令牌
	token, err := generatePreviewToken()
	if err != nil {
		logger.Error("生成令牌失败", zap.Error(err))
		utils.InternalError(c, "生成令牌失败")
		return
	}

	// 计算过期时间
	expiresIn := req.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 24 // 默认24小时
	}
	expiredAt := time.Now().Add(time.Duration(expiresIn) * time.Hour)

	preview := models.PostPreview{
		PostID:    req.PostID,
		Token:     token,
		CreatedBy: userID,
		ExpiredAt: expiredAt,
	}

	if err := s.db.Create(&preview).Error; err != nil {
		logger.Error("创建预览链接失败", zap.Uint("post_id", req.PostID), zap.Error(err))
		utils.InternalError(c, "创建预览链接失败")
		return
	}

	logger.Info("创建预览链接成功", zap.Uint("preview_id", preview.ID), zap.Uint("post_id", req.PostID))
	utils.Success(c, gin.H{
		"preview_id":  preview.ID,
		"token":       token,
		"preview_url": fmt.Sprintf("/preview/%s", token),
		"expired_at":  expiredAt,
	})
}

// GetPreviewByToken 通过令牌获取预览内容
func (s *PreviewService) GetPreviewByToken(c *gin.Context) {
	token := c.Param("token")

	var preview models.PostPreview
	if err := s.db.Where("token = ?", token).
		Preload("Post").
		Preload("Post.Author").
		Preload("Post.Category").
		Preload("Post.Tags").
		First(&preview).Error; err != nil {
		logger.Warn("预览链接不存在", zap.String("token", token))
		utils.NotFound(c, "预览链接不存在或已过期")
		return
	}

	// 检查是否过期
	if time.Now().After(preview.ExpiredAt) {
		logger.Info("预览链接已过期", zap.String("token", token))
		utils.LegacyError(c, 410, "预览链接已过期")
		return
	}

	// 增加浏览次数
	s.db.Model(&preview).UpdateColumn("view_count", gorm.Expr("view_count + ?", 1))

	utils.Success(c, preview.Post)
}

// GetPreviewLinks 获取文章的预览链接列表
func (s *PreviewService) GetPreviewLinks(c *gin.Context) {
	postID := c.Param("id")
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	// 检查权限
	var post models.Post
	if err := s.db.First(&post, "id = ?", postID).Error; err != nil {
		logger.Warn("文章不存在", zap.String("post_id", postID))
		utils.NotFound(c, "文章不存在")
		return
	}

	if post.AuthorID != userID && role != "admin" {
		logger.Warn("权限不足", zap.Uint("user_id", userID), zap.String("post_id", postID))
		utils.Forbidden(c, "权限不足")
		return
	}

	var previews []models.PostPreview
	s.db.Where("post_id = ?", postID).Order("created_at desc").Find(&previews)

	utils.Success(c, previews)
}

// DeletePreviewLink 删除预览链接
func (s *PreviewService) DeletePreviewLink(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	var preview models.PostPreview
	if err := s.db.First(&preview, "id = ?", id).Error; err != nil {
		logger.Warn("预览链接不存在", zap.String("id", id))
		utils.NotFound(c, "预览链接不存在")
		return
	}

	// 权限检查
	if preview.CreatedBy != userID && role != "admin" {
		logger.Warn("权限不足", zap.Uint("user_id", userID), zap.String("preview_id", id))
		utils.Forbidden(c, "权限不足")
		return
	}

	if err := s.db.Delete(&preview).Error; err != nil {
		logger.Error("删除预览链接失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	logger.Info("删除预览链接成功", zap.String("id", id))
	utils.Success(c, gin.H{"message": "删除成功"})
}

// generatePreviewToken 生成随机令牌
func generatePreviewToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
