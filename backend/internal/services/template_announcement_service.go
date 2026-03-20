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

// TemplateService 文章模板服务
type TemplateService struct {
	db *gorm.DB
}

func NewTemplateService(db *gorm.DB) *TemplateService {
	return &TemplateService{db: db}
}

// 预置模板
var defaultTemplates = []models.PostTemplate{
	{
		Name:        "技术教程",
		Description: "适合编写技术教程文章",
		Category:    "tutorial",
		Content: `# {title}

## 前言

{introduction}

## 准备工作

- 环境要求：
- 所需工具：

## 步骤一：{step1_title}

{step1_content}

## 步骤二：{step2_title}

{step2_content}

## 步骤三：{step3_title}

{step3_content}

## 常见问题

1. 问题一：解决方案
2. 问题二：解决方案

## 总结

{summary}

## 参考资料

- [参考1](url)
- [参考2](url)`,
		IsDefault: true,
	},
	{
		Name:        "产品评测",
		Description: "适合产品/工具评测文章",
		Category:    "review",
		Content: `# {product_name} 评测

## 产品简介

{introduction}

## 外观设计

{design_content}

## 功能特点

### 功能一：{feature1}

{feature1_content}

### 功能二：{feature2}

{feature2_content}

### 功能三：{feature3}

{feature3_content}

## 使用体验

{experience_content}

## 优缺点总结

### 优点
- 优点一
- 优点二

### 缺点
- 缺点一
- 缺点二

## 购买建议

{recommendation}

## 评分

- 外观设计：⭐⭐⭐⭐⭐
- 功能实用性：⭐⭐⭐⭐⭐
- 性价比：⭐⭐⭐⭐⭐
- 综合评分：⭐⭐⭐⭐⭐`,
		IsDefault: true,
	},
	{
		Name:        "技术分享",
		Description: "适合技术经验分享文章",
		Category:    "tech",
		Content: `# {title}

## 背景

{background}

## 问题分析

{problem_analysis}

## 解决方案

{solution}

### 方案一

{solution1}

### 方案二

{solution2}

## 最佳实践

{best_practice}

## 注意事项

1. {notice1}
2. {notice2}

## 总结

{summary}`,
		IsDefault: true,
	},
	{
		Name:        "新闻资讯",
		Description: "适合新闻资讯类文章",
		Category:    "news",
		Content: `# {title}

## 概要

{summary}

## 详细内容

{content}

## 相关信息

- 发布时间：{date}
- 来源：{source}

## 相关链接

- [链接1](url)
- [链接2](url)

## 个人观点

{opinion}`,
		IsDefault: true,
	},
}

// InitDefaultTemplates 初始化默认模板
func (s *TemplateService) InitDefaultTemplates() error {
	for _, tpl := range defaultTemplates {
		var existing models.PostTemplate
		if err := s.db.Where("name = ?", tpl.Name).First(&existing).Error; err == nil {
			continue // 已存在，跳过
		}

		if err := s.db.Create(&tpl).Error; err != nil {
			logger.Error("初始化默认模板失败", zap.String("name", tpl.Name), zap.Error(err))
			return err
		}
	}
	logger.Info("默认模板初始化完成")
	return nil
}

// GetTemplates 获取模板列表
func (s *TemplateService) GetTemplates(c *gin.Context) {
	category := c.Query("category")

	query := s.db.Model(&models.PostTemplate{})
	if category != "" {
		query = query.Where("category = ?", category)
	}

	var templates []models.PostTemplate
	query.Order("is_default desc, created_at desc").Find(&templates)

	utils.Success(c, templates)
}

// GetTemplate 获取单个模板
func (s *TemplateService) GetTemplate(c *gin.Context) {
	id := c.Param("id")

	var template models.PostTemplate
	if err := s.db.First(&template, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "模板不存在")
		return
	}

	utils.Success(c, template)
}

// CreateTemplate 创建模板
func (s *TemplateService) CreateTemplate(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req struct {
		Name        string `json:"name" binding:"required,max=50"`
		Description string `json:"description" binding:"max=200"`
		Category    string `json:"category" binding:"max=30"`
		Content     string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	template := models.PostTemplate{
		Name:        req.Name,
		Description: req.Description,
		Category:    req.Category,
		Content:     req.Content,
		AuthorID:    userID,
		IsDefault:   false,
	}

	if err := s.db.Create(&template).Error; err != nil {
		logger.Error("创建模板失败", zap.String("name", req.Name), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, template)
}

// UpdateTemplate 更新模板
func (s *TemplateService) UpdateTemplate(c *gin.Context) {
	id := c.Param("id")

	var template models.PostTemplate
	if err := s.db.First(&template, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "模板不存在")
		return
	}

	if template.IsDefault {
		utils.BadRequest(c, "默认模板不可修改")
		return
	}

	var req struct {
		Name        string `json:"name" binding:"max=50"`
		Description string `json:"description" binding:"max=200"`
		Category    string `json:"category" binding:"max=30"`
		Content     string `json:"content"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}

	if err := s.db.Model(&template).Updates(updates).Error; err != nil {
		logger.Error("更新模板失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	utils.Success(c, template)
}

// DeleteTemplate 删除模板
func (s *TemplateService) DeleteTemplate(c *gin.Context) {
	id := c.Param("id")

	var template models.PostTemplate
	if err := s.db.First(&template, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "模板不存在")
		return
	}

	if template.IsDefault {
		utils.BadRequest(c, "默认模板不可删除")
		return
	}

	if err := s.db.Delete(&template).Error; err != nil {
		logger.Error("删除模板失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}

// AnnouncementService 公告服务
type AnnouncementService struct {
	db *gorm.DB
}

func NewAnnouncementService(db *gorm.DB) *AnnouncementService {
	return &AnnouncementService{db: db}
}

// CreateAnnouncement 创建公告
func (s *AnnouncementService) CreateAnnouncement(c *gin.Context) {
	var req struct {
		Title     string     `json:"title" binding:"required,max=100"`
		Content   string     `json:"content" binding:"required"`
		Type      string     `json:"type" binding:"oneof=info warning success error"`
		Link      string     `json:"link" binding:"max=200"`
		StartTime *time.Time `json:"start_time"`
		EndTime   *time.Time `json:"end_time"`
		IsActive  *bool      `json:"is_active"`
		SortOrder int        `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	announcement := models.Announcement{
		Title:     req.Title,
		Content:   req.Content,
		Type:      req.Type,
		Link:      req.Link,
		StartTime: req.StartTime,
		EndTime:   req.EndTime,
		IsActive:  req.IsActive != nil && *req.IsActive,
		SortOrder: req.SortOrder,
	}

	if err := s.db.Create(&announcement).Error; err != nil {
		logger.Error("创建公告失败", zap.String("title", req.Title), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, announcement)
}

// UpdateAnnouncement 更新公告
func (s *AnnouncementService) UpdateAnnouncement(c *gin.Context) {
	id := c.Param("id")

	var announcement models.Announcement
	if err := s.db.First(&announcement, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "公告不存在")
		return
	}

	var req struct {
		Title     string     `json:"title" binding:"max=100"`
		Content   string     `json:"content"`
		Type      string     `json:"type" binding:"omitempty,oneof=info warning success error"`
		Link      string     `json:"link" binding:"max=200"`
		StartTime *time.Time `json:"start_time"`
		EndTime   *time.Time `json:"end_time"`
		IsActive  *bool      `json:"is_active"`
		SortOrder *int       `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Type != "" {
		updates["type"] = req.Type
	}
	if req.Link != "" {
		updates["link"] = req.Link
	}
	if req.StartTime != nil {
		updates["start_time"] = req.StartTime
	}
	if req.EndTime != nil {
		updates["end_time"] = req.EndTime
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}

	if err := s.db.Model(&announcement).Updates(updates).Error; err != nil {
		logger.Error("更新公告失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	utils.Success(c, announcement)
}

// GetAnnouncements 获取公告列表（管理员）
func (s *AnnouncementService) GetAnnouncements(c *gin.Context) {
	var announcements []models.Announcement
	s.db.Order("sort_order, created_at desc").Find(&announcements)

	utils.Success(c, announcements)
}

// GetActiveAnnouncements 获取活跃公告（公开）
func (s *AnnouncementService) GetActiveAnnouncements(c *gin.Context) {
	now := time.Now()

	var announcements []models.Announcement
	s.db.Where("is_active = ? AND (start_time IS NULL OR start_time <= ?) AND (end_time IS NULL OR end_time >= ?)",
		true, now, now).
		Order("sort_order, created_at desc").
		Find(&announcements)

	utils.Success(c, announcements)
}

// DeleteAnnouncement 删除公告
func (s *AnnouncementService) DeleteAnnouncement(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.Announcement{}, "id = ?", id).Error; err != nil {
		logger.Error("删除公告失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}
