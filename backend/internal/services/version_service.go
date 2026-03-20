package services

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type VersionService struct {
	db *gorm.DB
}

func NewVersionService(db *gorm.DB) *VersionService {
	return &VersionService{db: db}
}

// SaveVersion 保存文章版本（使用事务+行锁避免版本号竞态）
func (s *VersionService) SaveVersion(post *models.Post, editorID uint, changeLog string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var maxVersion int
		if err := tx.Raw(
			"SELECT COALESCE(MAX(version), 0) FROM post_versions WHERE post_id = ? FOR UPDATE",
			post.ID,
		).Scan(&maxVersion).Error; err != nil {
			return err
		}

		version := models.PostVersion{
			PostID:    post.ID,
			Title:     post.Title,
			Content:   post.Content,
			Summary:   post.Summary,
			EditorID:  editorID,
			Version:   maxVersion + 1,
			ChangeLog: changeLog,
		}

		if err := tx.Create(&version).Error; err != nil {
			logger.Error("保存文章版本失败", zap.Uint("post_id", post.ID), zap.Error(err))
			return err
		}
		return nil
	})
}

// GetVersions 获取文章版本历史
func (s *VersionService) GetVersions(c *gin.Context) {
	postID := c.Param("id")

	var versions []models.PostVersion
	s.db.Where("post_id = ?", postID).
		Preload("Editor").
		Order("version desc").
		Find(&versions)

	utils.Success(c, versions)
}

// GetVersion 获取特定版本
func (s *VersionService) GetVersion(c *gin.Context) {
	postID := c.Param("id")
	versionNum := c.Param("version")

	var version models.PostVersion
	if err := s.db.Where("post_id = ? AND version = ?", postID, versionNum).
		Preload("Editor").
		First(&version).Error; err != nil {
		utils.NotFound(c, "版本不存在")
		return
	}

	utils.Success(c, version)
}

// RestoreVersion 恢复到指定版本
func (s *VersionService) RestoreVersion(c *gin.Context) {
	postID := c.Param("id")
	versionNum := c.Param("version")
	userID := c.GetUint("user_id")

	// 获取文章
	var post models.Post
	if err := s.db.First(&post, "id = ?", postID).Error; err != nil {
		utils.NotFound(c, "文章不存在")
		return
	}

	// 权限检查
	role := c.GetString("role")
	if post.AuthorID != userID && role != "admin" {
		utils.Forbidden(c, "权限不足")
		return
	}

	// 获取目标版本
	var targetVersion models.PostVersion
	if err := s.db.Where("post_id = ? AND version = ?", postID, versionNum).First(&targetVersion).Error; err != nil {
		utils.NotFound(c, "版本不存在")
		return
	}

	// 先保存当前版本
	s.SaveVersion(&post, userID, "恢复前自动保存")

	// 恢复到目标版本
	post.Title = targetVersion.Title
	post.Content = targetVersion.Content
	post.Summary = targetVersion.Summary

	if err := s.db.Save(&post).Error; err != nil {
		logger.Error("恢复版本失败", zap.String("post_id", postID), zap.String("version", versionNum), zap.Error(err))
		utils.InternalError(c, "恢复失败")
		return
	}

	utils.Success(c, gin.H{
		"message": "恢复成功",
		"post":    post,
	})
}

// CompareVersions 对比两个版本
func (s *VersionService) CompareVersions(c *gin.Context) {
	postID := c.Param("id")
	version1 := c.Query("v1")
	version2 := c.Query("v2")

	var v1, v2 models.PostVersion
	if err := s.db.Where("post_id = ? AND version = ?", postID, version1).First(&v1).Error; err != nil {
		utils.NotFound(c, "版本1不存在")
		return
	}
	if err := s.db.Where("post_id = ? AND version = ?", postID, version2).First(&v2).Error; err != nil {
		utils.NotFound(c, "版本2不存在")
		return
	}

	utils.Success(c, gin.H{
		"version1": v1,
		"version2": v2,
	})
}

// DeleteVersion 删除版本
func (s *VersionService) DeleteVersion(c *gin.Context) {
	postID := c.Param("id")
	versionNum := c.Param("version")

	// 检查是否是唯一版本
	var count int64
	s.db.Model(&models.PostVersion{}).Where("post_id = ?", postID).Count(&count)
	if count <= 1 {
		utils.BadRequest(c, "至少保留一个版本")
		return
	}

	if err := s.db.Where("post_id = ? AND version = ?", postID, versionNum).Delete(&models.PostVersion{}).Error; err != nil {
		logger.Error("删除版本失败", zap.String("post_id", postID), zap.String("version", versionNum), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.NoContent(c)
}

// AutoSave 自动保存
func (s *VersionService) AutoSave(c *gin.Context) {
	postID := c.Param("id")
	userID := c.GetUint("user_id")

	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Summary string `json:"summary"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查文章是否存在
	var post models.Post
	if err := s.db.First(&post, "id = ?", postID).Error; err != nil {
		utils.NotFound(c, "文章不存在")
		return
	}

	// 保存自动保存版本
	version := models.PostVersion{
		PostID:    post.ID,
		Title:     req.Title,
		Content:   req.Content,
		Summary:   req.Summary,
		EditorID:  userID,
		Version:   0, // 自动保存版本特殊标记
		ChangeLog: "自动保存",
	}

	// 查找是否已有自动保存版本，有则更新
	var existingAuto models.PostVersion
	err := s.db.Where("post_id = ? AND version = 0", postID).First(&existingAuto).Error
	if err == nil {
		s.db.Model(&existingAuto).Updates(map[string]any{
			"title":      req.Title,
			"content":    req.Content,
			"summary":    req.Summary,
			"editor_id":  userID,
			"created_at": time.Now(),
		})
		utils.Success(c, gin.H{"message": "自动保存成功", "version": existingAuto})
	} else {
		s.db.Create(&version)
		utils.Success(c, gin.H{"message": "自动保存成功", "version": version})
	}
}

// GetAutoSave 获取自动保存内容
func (s *VersionService) GetAutoSave(c *gin.Context) {
	postID := c.Param("id")

	var version models.PostVersion
	err := s.db.Where("post_id = ? AND version = 0", postID).First(&version).Error
	if err != nil {
		utils.NotFound(c, "无自动保存内容")
		return
	}

	utils.Success(c, version)
}
