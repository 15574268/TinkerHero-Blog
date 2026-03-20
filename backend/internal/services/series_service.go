package services

import (
	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// SeriesService 合集服务
type SeriesService struct {
	db *gorm.DB
}

func NewSeriesService(db *gorm.DB) *SeriesService {
	return &SeriesService{db: db}
}

// CreateSeries 创建合集
func (s *SeriesService) CreateSeries(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req struct {
		Title       string `json:"title" binding:"required,max=100"`
		Slug        string `json:"slug" binding:"required,max=100"`
		Description string `json:"description" binding:"max=500"`
		CoverImage  string `json:"cover_image" binding:"max=500"`
		Status      string `json:"status" binding:"oneof=draft published"`
		PostIDs     []uint `json:"post_ids"` // 初始文章列表
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查 slug 唯一性
	var existing models.Series
	if err := s.db.Where("slug = ?", req.Slug).First(&existing).Error; err == nil {
		utils.BadRequest(c, "Slug 已存在")
		return
	}

	tx := s.db.Begin()

	series := models.Series{
		Title:       req.Title,
		Slug:        req.Slug,
		Description: req.Description,
		CoverImage:  req.CoverImage,
		AuthorID:    userID,
		Status:      req.Status,
		PostCount:   len(req.PostIDs),
	}

	if err := tx.Create(&series).Error; err != nil {
		tx.Rollback()
		logger.Error("创建合集失败", zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	// 添加文章到合集
	for i, postID := range req.PostIDs {
		seriesPost := models.SeriesPost{
			SeriesID:  series.ID,
			PostID:    postID,
			SortOrder: i,
		}
		if err := tx.Create(&seriesPost).Error; err != nil {
			tx.Rollback()
			logger.Error("添加文章到合集失败", zap.Uint("series_id", series.ID), zap.Uint("post_id", postID), zap.Error(err))
			utils.InternalError(c, "添加文章失败")
			return
		}
	}

	tx.Commit()
	utils.Created(c, series)
}

// UpdateSeries 更新合集
func (s *SeriesService) UpdateSeries(c *gin.Context) {
	id := c.Param("id")

	var series models.Series
	if err := s.db.First(&series, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "合集不存在")
		return
	}

	var req struct {
		Title       string `json:"title" binding:"max=100"`
		Description string `json:"description" binding:"max=500"`
		CoverImage  string `json:"cover_image" binding:"max=500"`
		Status      string `json:"status" binding:"omitempty,oneof=draft published"`
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
	if req.CoverImage != "" {
		updates["cover_image"] = req.CoverImage
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	if err := s.db.Model(&series).Updates(updates).Error; err != nil {
		logger.Error("更新合集失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	utils.Success(c, series)
}

// AddPostToSeries 添加文章到合集
func (s *SeriesService) AddPostToSeries(c *gin.Context) {
	seriesID := c.Param("id")

	var req struct {
		PostID    uint `json:"post_id" binding:"required"`
		SortOrder int  `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查是否已存在
	var existing models.SeriesPost
	if err := s.db.Where("series_id = ? AND post_id = ?", seriesID, req.PostID).First(&existing).Error; err == nil {
		utils.BadRequest(c, "文章已在合集中")
		return
	}

	seriesPost := models.SeriesPost{
		SeriesID:  parseUint(seriesID),
		PostID:    req.PostID,
		SortOrder: req.SortOrder,
	}

	if err := s.db.Create(&seriesPost).Error; err != nil {
		logger.Error("添加文章到合集失败", zap.String("series_id", seriesID), zap.Error(err))
		utils.InternalError(c, "添加失败")
		return
	}

	// 更新文章数
	s.db.Model(&models.Series{}).Where("id = ?", seriesID).
		UpdateColumn("post_count", gorm.Expr("post_count + 1"))

	utils.SuccessWithMessage(c, "添加成功", nil)
}

// RemovePostFromSeries 从合集移除文章
func (s *SeriesService) RemovePostFromSeries(c *gin.Context) {
	seriesID := c.Param("id")
	postID := c.Param("post_id")

	result := s.db.Where("series_id = ? AND post_id = ?", seriesID, postID).
		Delete(&models.SeriesPost{})
	if result.Error != nil {
		logger.Error("从合集移除文章失败", zap.String("series_id", seriesID), zap.String("post_id", postID), zap.Error(result.Error))
		utils.InternalError(c, "移除失败")
		return
	}

	// 仅在实际删除了记录时才减少计数
	if result.RowsAffected > 0 {
		s.db.Model(&models.Series{}).Where("id = ?", seriesID).
			UpdateColumn("post_count", gorm.Expr("GREATEST(post_count - 1, 0)"))
	}

	utils.SuccessWithMessage(c, "移除成功", nil)
}

// ReorderSeriesPosts 重新排序合集文章
func (s *SeriesService) ReorderSeriesPosts(c *gin.Context) {
	seriesID := c.Param("id")

	var req struct {
		PostIDs []uint `json:"post_ids" binding:"required"` // 新顺序的文章ID列表
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	tx := s.db.Begin()
	for i, postID := range req.PostIDs {
		if err := tx.Model(&models.SeriesPost{}).
			Where("series_id = ? AND post_id = ?", seriesID, postID).
			Update("sort_order", i).Error; err != nil {
			tx.Rollback()
			logger.Error("排序合集文章失败", zap.String("series_id", seriesID), zap.Error(err))
			utils.InternalError(c, "排序失败")
			return
		}
	}
	tx.Commit()

	utils.SuccessWithMessage(c, "排序成功", nil)
}

// GetSeriesByID 获取合集详情含文章（管理员，任意状态）
func (s *SeriesService) GetSeriesByID(c *gin.Context) {
	id := c.Param("id")
	var series models.Series
	if err := s.db.Preload("Author").First(&series, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "合集不存在")
		return
	}
	var posts []models.SeriesPost
	s.db.Where("series_id = ?", series.ID).
		Preload("Post").
		Preload("Post.Author").
		Preload("Post.Category").
		Order("sort_order").
		Find(&posts)
	utils.Success(c, gin.H{
		"series": series,
		"posts":  posts,
	})
}

// GetSeriesList 获取合集列表（管理员）
func (s *SeriesService) GetSeriesList(c *gin.Context) {
	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	var total int64
	s.db.Model(&models.Series{}).Count(&total)

	var series []models.Series
	s.db.Preload("Author").
		Order("created_at desc").
		Offset(utils.GetOffset(page, pageSize)).
		Limit(pageSize).
		Find(&series)

	utils.Paginated(c, series, total, page, pageSize)
}

// GetPublishedSeries 获取已发布的合集（公开）
func (s *SeriesService) GetPublishedSeries(c *gin.Context) {
	var series []models.Series
	s.db.Where("status = ?", "published").
		Preload("Author").
		Order("created_at desc").
		Find(&series)

	utils.Success(c, series)
}

// GetSeriesBySlug 通过 Slug 获取合集详情
func (s *SeriesService) GetSeriesBySlug(c *gin.Context) {
	slug := c.Param("slug")

	var series models.Series
	if err := s.db.Where("slug = ? AND status = ?", slug, "published").
		Preload("Author").
		First(&series).Error; err != nil {
		utils.NotFound(c, "合集不存在")
		return
	}

	// 获取合集文章
	var posts []models.SeriesPost
	s.db.Where("series_id = ?", series.ID).
		Preload("Post").
		Preload("Post.Author").
		Preload("Post.Category").
		Order("sort_order").
		Find(&posts)

	// 增加浏览数
	s.db.Model(&series).UpdateColumn("view_count", gorm.Expr("view_count + 1"))

	utils.Success(c, gin.H{
		"series": series,
		"posts":  posts,
	})
}

// DeleteSeries 删除合集
func (s *SeriesService) DeleteSeries(c *gin.Context) {
	id := c.Param("id")

	tx := s.db.Begin()

	// 删除关联
	if err := tx.Where("series_id = ?", id).Delete(&models.SeriesPost{}).Error; err != nil {
		tx.Rollback()
		logger.Error("删除合集关联失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	if err := tx.Delete(&models.Series{}, "id = ?", id).Error; err != nil {
		tx.Rollback()
		logger.Error("删除合集失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	tx.Commit()
	utils.SuccessWithMessage(c, "删除成功", nil)
}

func parseUint(s string) uint {
	var result uint
	utils.ParseInt(s, &result)
	return result
}
