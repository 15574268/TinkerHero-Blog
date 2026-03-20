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

// ResourceService 资源服务
type ResourceService struct {
	db *gorm.DB
}

func NewResourceService(db *gorm.DB) *ResourceService {
	return &ResourceService{db: db}
}

// CreateResource 创建资源
func (s *ResourceService) CreateResource(c *gin.Context) {
	var req struct {
		Title         string  `json:"title" binding:"required,max=100"`
		Description   string  `json:"description" binding:"max=500"`
		URL           string  `json:"url" binding:"max=200"`
		CoverImage    string  `json:"cover_image" binding:"max=500"`
		Category      string  `json:"category" binding:"required,max=30"`
		Tags          string  `json:"tags" binding:"max=200"`
		Rating        float64 `json:"rating" binding:"min=0,max=5"`
		IsRecommended bool    `json:"is_recommended"`
		SortOrder     int     `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	resource := models.Resource{
		Title:         req.Title,
		Description:   req.Description,
		URL:           req.URL,
		CoverImage:    req.CoverImage,
		Category:      req.Category,
		Tags:          req.Tags,
		Rating:        req.Rating,
		IsRecommended: req.IsRecommended,
		SortOrder:     req.SortOrder,
	}

	if err := s.db.Create(&resource).Error; err != nil {
		logger.Error("创建资源失败", zap.String("title", req.Title), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, resource)
}

// GetResources 获取资源列表
func (s *ResourceService) GetResources(c *gin.Context) {
	category := c.Query("category")
	recommended := c.Query("recommended")

	query := s.db.Model(&models.Resource{})
	if category != "" {
		query = query.Where("category = ?", category)
	}
	if recommended == "true" {
		query = query.Where("is_recommended = ?", true)
	}

	var resources []models.Resource
	query.Order("sort_order, created_at desc").Find(&resources)

	utils.Success(c, resources)
}

// UpdateResource 更新资源
func (s *ResourceService) UpdateResource(c *gin.Context) {
	id := c.Param("id")

	var resource models.Resource
	if err := s.db.First(&resource, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "资源不存在")
		return
	}

	var req struct {
		Title         string  `json:"title" binding:"max=100"`
		Description   string  `json:"description" binding:"max=500"`
		URL           string  `json:"url" binding:"max=200"`
		CoverImage    string  `json:"cover_image" binding:"max=500"`
		Category      string  `json:"category" binding:"max=30"`
		Tags          string  `json:"tags" binding:"max=200"`
		Rating        float64 `json:"rating" binding:"min=0,max=5"`
		IsRecommended *bool   `json:"is_recommended"`
		SortOrder     *int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.URL != "" {
		updates["url"] = req.URL
	}
	if req.CoverImage != "" {
		updates["cover_image"] = req.CoverImage
	}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Tags != "" {
		updates["tags"] = req.Tags
	}
	if req.Rating >= 0 {
		updates["rating"] = req.Rating
	}
	if req.IsRecommended != nil {
		updates["is_recommended"] = *req.IsRecommended
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}

	if err := s.db.Model(&resource).Updates(updates).Error; err != nil {
		logger.Error("更新资源失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	utils.Success(c, resource)
}

// DeleteResource 删除资源
func (s *ResourceService) DeleteResource(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.Resource{}, "id = ?", id).Error; err != nil {
		logger.Error("删除资源失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}

// ChangelogService 更新日志服务
type ChangelogService struct {
	db *gorm.DB
}

func NewChangelogService(db *gorm.DB) *ChangelogService {
	return &ChangelogService{db: db}
}

// CreateChangelog 创建更新日志
func (s *ChangelogService) CreateChangelog(c *gin.Context) {
	var req struct {
		Version     string    `json:"version" binding:"required,max=20"`
		Title       string    `json:"title" binding:"required,max=100"`
		Content     string    `json:"content" binding:"required"`
		Type        string    `json:"type" binding:"oneof=release feature fix improvement"`
		PublishedAt time.Time `json:"published_at"`
		IsPublished bool      `json:"is_published"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	changelog := models.Changelog{
		Version:     req.Version,
		Title:       req.Title,
		Content:     req.Content,
		Type:        req.Type,
		PublishedAt: req.PublishedAt,
		IsPublished: req.IsPublished,
	}

	if err := s.db.Create(&changelog).Error; err != nil {
		logger.Error("创建更新日志失败", zap.String("version", req.Version), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, changelog)
}

// GetChangelogs 获取更新日志列表（管理员）
func (s *ChangelogService) GetChangelogs(c *gin.Context) {
	var changelogs []models.Changelog
	s.db.Order("published_at desc").Find(&changelogs)

	utils.Success(c, changelogs)
}

// GetPublishedChangelogs 获取已发布的更新日志（公开）
func (s *ChangelogService) GetPublishedChangelogs(c *gin.Context) {
	var changelogs []models.Changelog
	s.db.Where("is_published = ?", true).
		Order("published_at desc").
		Find(&changelogs)

	utils.Success(c, changelogs)
}

// DeleteChangelog 删除更新日志
func (s *ChangelogService) DeleteChangelog(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.Changelog{}, "id = ?", id).Error; err != nil {
		logger.Error("删除更新日志失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}

// UpdateChangelog 更新更新日志
func (s *ChangelogService) UpdateChangelog(c *gin.Context) {
	id := c.Param("id")

	var changelog models.Changelog
	if err := s.db.First(&changelog, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "更新日志不存在")
		return
	}

	var req struct {
		Version     string     `json:"version"`
		Title       string     `json:"title"`
		Content     string     `json:"content"`
		Type        string     `json:"type"`
		PublishedAt *time.Time `json:"published_at"`
		IsPublished *bool      `json:"is_published"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{}
	if req.Version != "" {
		updates["version"] = req.Version
	}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Type != "" {
		updates["type"] = req.Type
	}
	if req.PublishedAt != nil {
		updates["published_at"] = req.PublishedAt
	}
	if req.IsPublished != nil {
		updates["is_published"] = req.IsPublished
	}

	if err := s.db.Model(&changelog).Updates(updates).Error; err != nil {
		logger.Error("更新更新日志失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	utils.Success(c, changelog)
}

// MilestoneService 里程碑服务
type MilestoneService struct {
	db *gorm.DB
}

func NewMilestoneService(db *gorm.DB) *MilestoneService {
	return &MilestoneService{db: db}
}

// CreateMilestone 创建里程碑
func (s *MilestoneService) CreateMilestone(c *gin.Context) {
	var req struct {
		Title       string     `json:"title" binding:"required,max=100"`
		Description string     `json:"description" binding:"max=500"`
		Icon        string     `json:"icon" binding:"max=50"`
		Type        string     `json:"type" binding:"required,max=20"`
		Value       int        `json:"value"`
		AchievedAt  *time.Time `json:"achieved_at"`
		IsAchieved  bool       `json:"is_achieved"`
		SortOrder   int        `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	milestone := models.Milestone{
		Title:       req.Title,
		Description: req.Description,
		Icon:        req.Icon,
		Type:        req.Type,
		Value:       req.Value,
		AchievedAt:  req.AchievedAt,
		IsAchieved:  req.IsAchieved,
		SortOrder:   req.SortOrder,
	}

	if err := s.db.Create(&milestone).Error; err != nil {
		logger.Error("创建里程碑失败", zap.String("title", req.Title), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, milestone)
}

// GetMilestones 获取里程碑列表
func (s *MilestoneService) GetMilestones(c *gin.Context) {
	achieved := c.Query("achieved")

	query := s.db.Model(&models.Milestone{})
	switch achieved {
	case "true":
		query = query.Where("is_achieved = ?", true)
	case "false":
		query = query.Where("is_achieved = ?", false)
	}

	var milestones []models.Milestone
	query.Order("sort_order, created_at").Find(&milestones)

	utils.Success(c, milestones)
}

// UpdateMilestone 更新里程碑
func (s *MilestoneService) UpdateMilestone(c *gin.Context) {
	id := c.Param("id")

	var milestone models.Milestone
	if err := s.db.First(&milestone, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "里程碑不存在")
		return
	}

	var req struct {
		Title       string     `json:"title" binding:"max=100"`
		Description string     `json:"description" binding:"max=500"`
		Icon        string     `json:"icon" binding:"max=50"`
		Type        string     `json:"type" binding:"max=20"`
		Value       *int       `json:"value"`
		AchievedAt  *time.Time `json:"achieved_at"`
		IsAchieved  *bool      `json:"is_achieved"`
		SortOrder   *int       `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Icon != "" {
		updates["icon"] = req.Icon
	}
	if req.Type != "" {
		updates["type"] = req.Type
	}
	if req.Value != nil {
		updates["value"] = *req.Value
	}
	if req.AchievedAt != nil {
		updates["achieved_at"] = req.AchievedAt
	}
	if req.IsAchieved != nil {
		updates["is_achieved"] = *req.IsAchieved
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}

	if err := s.db.Model(&milestone).Updates(updates).Error; err != nil {
		logger.Error("更新里程碑失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	utils.Success(c, milestone)
}

// DeleteMilestone 删除里程碑
func (s *MilestoneService) DeleteMilestone(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.Milestone{}, "id = ?", id).Error; err != nil {
		logger.Error("删除里程碑失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}

// AutoCheckMilestones 自动检查里程碑达成情况
func (s *MilestoneService) AutoCheckMilestones() {
	var milestones []models.Milestone
	s.db.Where("is_achieved = ?", false).Find(&milestones)

	for _, m := range milestones {
		var achieved bool
		switch m.Type {
		case "posts":
			var count int64
			s.db.Model(&models.Post{}).Where("status = ?", "published").Count(&count)
			achieved = int(count) >= m.Value
		case "views":
			var total int64
			s.db.Model(&models.Post{}).Select("COALESCE(SUM(view_count), 0)").Scan(&total)
			achieved = int(total) >= m.Value
		case "comments":
			var count int64
			s.db.Model(&models.Comment{}).Where("status = ?", "approved").Count(&count)
			achieved = int(count) >= m.Value
		case "subscribers":
			var count int64
			s.db.Model(&models.Subscriber{}).Where("is_active = ?", true).Count(&count)
			achieved = int(count) >= m.Value
		}

		if achieved {
			now := time.Now()
			s.db.Model(&m).Updates(map[string]any{
				"is_achieved": true,
				"achieved_at": now,
			})
			logger.Info("里程碑达成", zap.String("title", m.Title), zap.Int("value", m.Value))
		}
	}
}
