package services

import (
	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type FriendLinkService struct {
	db *gorm.DB
}

func NewFriendLinkService(db *gorm.DB) *FriendLinkService {
	return &FriendLinkService{db: db}
}

// GetAllFriendLinks 获取所有友链（公开）
func (s *FriendLinkService) GetAllFriendLinks(c *gin.Context) {
	var links []models.FriendLink
	if err := s.db.Where("status = ?", true).Order("sort_order asc, created_at asc").Find(&links).Error; err != nil {
		logger.Error("获取友链失败", zap.Error(err))
		utils.InternalError(c, "获取友链失败")
		return
	}
	utils.Success(c, links)
}

// GetAllFriendLinksAdmin 获取所有友链（管理员）
func (s *FriendLinkService) GetAllFriendLinksAdmin(c *gin.Context) {
	var links []models.FriendLink
	if err := s.db.Order("sort_order asc, created_at asc").Find(&links).Error; err != nil {
		logger.Error("获取友链失败", zap.Error(err))
		utils.InternalError(c, "获取友链失败")
		return
	}
	utils.Success(c, links)
}

// CreateFriendLink 创建友链
func (s *FriendLinkService) CreateFriendLink(c *gin.Context) {
	var req struct {
		Name      string `json:"name" binding:"required"`
		URL       string `json:"url" binding:"required"`
		Logo      string `json:"logo"`
		Desc      string `json:"desc"`
		Status    bool   `json:"status"`
		SortOrder int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	link := models.FriendLink{
		Name:      req.Name,
		URL:       req.URL,
		Logo:      req.Logo,
		Desc:      req.Desc,
		Status:    req.Status,
		SortOrder: req.SortOrder,
	}

	if err := s.db.Create(&link).Error; err != nil {
		logger.Error("创建友链失败", zap.String("name", req.Name), zap.Error(err))
		utils.InternalError(c, "创建友链失败")
		return
	}

	logger.Info("创建友链成功", zap.Uint("id", link.ID), zap.String("name", link.Name))
	utils.Created(c, link)
}

// UpdateFriendLink 更新友链
func (s *FriendLinkService) UpdateFriendLink(c *gin.Context) {
	id := c.Param("id")

	var link models.FriendLink
	if err := s.db.First(&link, "id = ?", id).Error; err != nil {
		logger.Warn("友链不存在", zap.String("id", id))
		utils.NotFound(c, "友链不存在")
		return
	}

	var req struct {
		Name      string `json:"name"`
		URL       string `json:"url"`
		Logo      string `json:"logo"`
		Desc      string `json:"desc"`
		Status    bool   `json:"status"`
		SortOrder int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{
		"name":       req.Name,
		"url":        req.URL,
		"logo":       req.Logo,
		"desc":       req.Desc,
		"status":     req.Status,
		"sort_order": req.SortOrder,
	}

	if err := s.db.Model(&link).Updates(updates).Error; err != nil {
		logger.Error("更新友链失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新友链失败")
		return
	}

	s.db.First(&link, link.ID)
	logger.Info("更新友链成功", zap.String("id", id))
	utils.Success(c, link)
}

// DeleteFriendLink 删除友链
func (s *FriendLinkService) DeleteFriendLink(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.FriendLink{}, "id = ?", id).Error; err != nil {
		logger.Error("删除友链失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除友链失败")
		return
	}

	logger.Info("删除友链成功", zap.String("id", id))
	utils.NoContent(c)
}
