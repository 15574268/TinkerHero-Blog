package services

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type PostTranslationService struct {
	db        *gorm.DB
	aiService *AIService
}

func NewPostTranslationService(db *gorm.DB, aiService *AIService) *PostTranslationService {
	return &PostTranslationService{
		db:        db,
		aiService: aiService,
	}
}

// GetTranslations 获取文章的所有语言版本
func (s *PostTranslationService) GetTranslations(c *gin.Context) {
	postID := c.Param("id")

	var translations []models.PostTranslation
	if err := s.db.Where("post_id = ?", postID).Find(&translations).Error; err != nil {
		logger.Error("获取翻译失败", zap.String("post_id", postID), zap.Error(err))
		utils.InternalError(c, "获取翻译失败")
		return
	}

	utils.Success(c, translations)
}

// GetTranslation 获取特定语言版本
func (s *PostTranslationService) GetTranslation(c *gin.Context) {
	postID := c.Param("id")
	lang := c.Param("lang")

	var translation models.PostTranslation
	if err := s.db.Where("post_id = ? AND language = ?", postID, lang).First(&translation).Error; err != nil {
		logger.Warn("翻译不存在", zap.String("post_id", postID), zap.String("lang", lang))
		utils.NotFound(c, "翻译不存在")
		return
	}

	utils.Success(c, translation)
}

// CreateTranslation 创建翻译版本
func (s *PostTranslationService) CreateTranslation(c *gin.Context) {
	postID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的文章ID")
		return
	}

	var req struct {
		Language string `json:"language" binding:"required"`
		Title    string `json:"title" binding:"required"`
		Content  string `json:"content" binding:"required"`
		Summary  string `json:"summary"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	translation := models.PostTranslation{
		PostID:   uint(postID),
		Language: req.Language,
		Title:    req.Title,
		Content:  req.Content,
		Summary:  req.Summary,
	}

	if err := s.db.Create(&translation).Error; err != nil {
		logger.Error("创建翻译失败", zap.Uint("post_id", uint(postID)), zap.String("language", req.Language), zap.Error(err))
		utils.InternalError(c, "创建翻译失败")
		return
	}

	logger.Info("创建翻译成功", zap.Uint("post_id", uint(postID)), zap.String("language", req.Language))
	utils.Created(c, translation)
}

// AutoTranslate 自动翻译文章
func (s *PostTranslationService) AutoTranslate(c *gin.Context) {
	var req struct {
		PostID   uint   `json:"post_id" binding:"required"`
		Language string `json:"language" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 获取原始文章
	var post models.Post
	if err := s.db.First(&post, req.PostID).Error; err != nil {
		logger.Warn("文章不存在", zap.Uint("post_id", req.PostID))
		utils.NotFound(c, "文章不存在")
		return
	}

	// 检查是否已存在该语言版本
	var existing models.PostTranslation
	if err := s.db.Where("post_id = ? AND language = ?", req.PostID, req.Language).First(&existing).Error; err == nil {
		logger.Warn("该语言版本已存在", zap.Uint("post_id", req.PostID), zap.String("language", req.Language))
		utils.BadRequest(c, "该语言版本已存在")
		return
	}

	// 使用AI翻译
	translatedTitle, err := s.aiService.CallAI(
		"Translate the following title to " + req.Language + ":\n\n" + post.Title)
	if err != nil {
		logger.Error("翻译标题失败", zap.Uint("post_id", req.PostID), zap.Error(err))
		utils.InternalError(c, "翻译标题失败")
		return
	}

	translatedContent, err := s.aiService.CallAI(
		"Translate the following content to " + req.Language + ":\n\n" + post.Content)
	if err != nil {
		logger.Error("翻译内容失败", zap.Uint("post_id", req.PostID), zap.Error(err))
		utils.InternalError(c, "翻译内容失败")
		return
	}

	translatedSummary := ""
	if post.Summary != "" {
		translatedSummary, _ = s.aiService.CallAI(
			"Translate the following summary to " + req.Language + ":\n\n" + post.Summary)
	}

	// 创建翻译记录
	translation := models.PostTranslation{
		PostID:           req.PostID,
		Language:         req.Language,
		Title:            translatedTitle,
		Content:          translatedContent,
		Summary:          translatedSummary,
		IsAutoTranslated: true,
	}

	if err := s.db.Create(&translation).Error; err != nil {
		logger.Error("保存翻译失败", zap.Uint("post_id", req.PostID), zap.String("language", req.Language), zap.Error(err))
		utils.InternalError(c, "保存翻译失败")
		return
	}

	logger.Info("自动翻译完成", zap.Uint("post_id", req.PostID), zap.String("language", req.Language))
	utils.Created(c, gin.H{
		"message":     "翻译完成",
		"translation": translation,
	})
}

// UpdateTranslation 更新翻译版本
func (s *PostTranslationService) UpdateTranslation(c *gin.Context) {
	id := c.Param("id")

	var translation models.PostTranslation
	if err := s.db.First(&translation, "id = ?", id).Error; err != nil {
		logger.Warn("翻译不存在", zap.String("id", id))
		utils.NotFound(c, "翻译不存在")
		return
	}

	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Summary string `json:"summary"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{
		"is_auto_translated": false, // 手动更新后标记为非自动翻译
	}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Summary != "" {
		updates["summary"] = req.Summary
	}

	if err := s.db.Model(&translation).Updates(updates).Error; err != nil {
		logger.Error("更新翻译失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	logger.Info("更新翻译成功", zap.String("id", id))
	utils.Success(c, translation)
}

// DeleteTranslation 删除翻译版本
func (s *PostTranslationService) DeleteTranslation(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.PostTranslation{}, "id = ?", id).Error; err != nil {
		logger.Error("删除翻译失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	logger.Info("删除翻译成功", zap.String("id", id))
	utils.NoContent(c)
}
