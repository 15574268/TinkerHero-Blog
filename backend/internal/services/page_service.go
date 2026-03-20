package services

import (
	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type PageService struct {
	db *gorm.DB
}

func NewPageService(db *gorm.DB) *PageService {
	return &PageService{db: db}
}

// GetAllPages 获取所有页面
func (s *PageService) GetAllPages(c *gin.Context) {
	var pages []models.Page
	if err := s.db.Order("created_at desc").Find(&pages).Error; err != nil {
		logger.Error("获取页面失败", zap.Error(err))
		utils.InternalError(c, "获取页面失败")
		return
	}
	utils.Success(c, pages)
}

// GetPageBySlug 根据slug获取页面
func (s *PageService) GetPageBySlug(c *gin.Context) {
	slug := c.Param("slug")

	var page models.Page
	if err := s.db.Where("slug = ? AND status = ?", slug, models.PostPublished).First(&page).Error; err != nil {
		logger.Warn("页面不存在", zap.String("slug", slug))
		utils.NotFound(c, "页面不存在")
		return
	}

	utils.Success(c, page)
}

// CreatePage 创建页面
func (s *PageService) CreatePage(c *gin.Context) {
	var req struct {
		Title   string `json:"title" binding:"required"`
		Slug    string `json:"slug" binding:"required"`
		Content string `json:"content"`
		Status  string `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 验证 slug 唯一性
	var existingPage models.Page
	if err := s.db.Where("slug = ?", req.Slug).First(&existingPage).Error; err == nil {
		utils.BadRequest(c, "URL别名已存在")
		return
	}

	page := models.Page{
		Title:   req.Title,
		Slug:    req.Slug,
		Content: req.Content,
		Status:  models.PostStatus(req.Status),
	}

	if err := s.db.Create(&page).Error; err != nil {
		logger.Error("创建页面失败", zap.String("slug", req.Slug), zap.Error(err))
		utils.InternalError(c, "创建页面失败")
		return
	}

	logger.Info("创建页面成功", zap.Uint("id", page.ID), zap.String("slug", page.Slug))
	utils.Created(c, page)
}

// UpdatePage 更新页面
func (s *PageService) UpdatePage(c *gin.Context) {
	id := c.Param("id")

	var page models.Page
	if err := s.db.First(&page, "id = ?", id).Error; err != nil {
		logger.Warn("页面不存在", zap.String("id", id))
		utils.NotFound(c, "页面不存在")
		return
	}

	var req struct {
		Title   string `json:"title"`
		Slug    string `json:"slug"`
		Content string `json:"content"`
		Status  string `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 如果修改了 slug，验证唯一性
	if req.Slug != "" && req.Slug != page.Slug {
		var existingPage models.Page
		if err := s.db.Where("slug = ? AND id != ?", req.Slug, id).First(&existingPage).Error; err == nil {
			utils.BadRequest(c, "URL别名已存在")
			return
		}
	}

	updates := map[string]any{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Slug != "" {
		updates["slug"] = req.Slug
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	if err := s.db.Model(&page).Updates(updates).Error; err != nil {
		logger.Error("更新页面失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新页面失败")
		return
	}

	logger.Info("更新页面成功", zap.String("id", id))
	utils.Success(c, page)
}

// DeletePage 删除页面
func (s *PageService) DeletePage(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.Page{}, "id = ?", id).Error; err != nil {
		logger.Error("删除页面失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除页面失败")
		return
	}

	logger.Info("删除页面成功", zap.String("id", id))
	utils.NoContent(c)
}
