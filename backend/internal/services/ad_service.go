package services

import (
	"math"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// AdService 广告位管理服务
type AdService struct {
	db *gorm.DB
}

func NewAdService(db *gorm.DB) *AdService {
	return &AdService{db: db}
}

// ============ 广告位管理 ============

// GetPlacements 获取所有广告位
func (s *AdService) GetPlacements(c *gin.Context) {
	var placements []models.AdPlacement
	s.db.Order("sort_order").Find(&placements)
	utils.Success(c, placements)
}

// GetActivePlacements 获取启用的广告位（公开）
func (s *AdService) GetActivePlacements(c *gin.Context) {
	var placements []models.AdPlacement
	s.db.Where("is_active = ?", true).Order("sort_order").Find(&placements)
	utils.Success(c, placements)
}

// GetPlacementByCode 根据代码获取广告位
func (s *AdService) GetPlacementByCode(c *gin.Context) {
	code := c.Param("code")

	var placement models.AdPlacement
	if err := s.db.Where("code = ? AND is_active = ?", code, true).First(&placement).Error; err != nil {
		utils.NotFound(c, "广告位不存在")
		return
	}

	// 获取该广告位下的广告
	var ads []models.AdContent
	now := time.Now()
	s.db.Where("placement_id = ? AND is_active = ?", placement.ID, true).
		Where("start_date IS NULL OR start_date <= ?", now).
		Where("end_date IS NULL OR end_date >= ?", now).
		Order("priority desc, sort_order").
		Find(&ads)

	utils.Success(c, gin.H{
		"placement": placement,
		"ads":       ads,
	})
}

// CreatePlacement 创建广告位
func (s *AdService) CreatePlacement(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required,max=50"`
		Code        string `json:"code" binding:"required,max=50"`
		Description string `json:"description" binding:"max=200"`
		Location    string `json:"location" binding:"required"`
		Type        string `json:"type" binding:"required"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
		IsActive    *bool  `json:"is_active"`
		SortOrder   int    `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查代码唯一性
	var existing models.AdPlacement
	if err := s.db.Where("code = ?", req.Code).First(&existing).Error; err == nil {
		utils.BadRequest(c, "广告位代码已存在")
		return
	}

	placement := models.AdPlacement{
		Name:        req.Name,
		Code:        req.Code,
		Description: req.Description,
		Location:    req.Location,
		Type:        req.Type,
		Width:       req.Width,
		Height:      req.Height,
		IsActive:    req.IsActive != nil && *req.IsActive,
		SortOrder:   req.SortOrder,
	}

	if err := s.db.Create(&placement).Error; err != nil {
		logger.Error("创建广告位失败", zap.String("code", req.Code), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, placement)
}

// UpdatePlacement 更新广告位
func (s *AdService) UpdatePlacement(c *gin.Context) {
	id := c.Param("id")

	var placement models.AdPlacement
	if err := s.db.First(&placement, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "广告位不存在")
		return
	}

	var req models.AdPlacement
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	if err := s.db.Model(&placement).Updates(req).Error; err != nil {
		logger.Error("更新广告位失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}
	utils.Success(c, placement)
}

// DeletePlacement 删除广告位
func (s *AdService) DeletePlacement(c *gin.Context) {
	id := c.Param("id")

	// 删除关联的广告内容
	s.db.Where("placement_id = ?", id).Delete(&models.AdContent{})

	if err := s.db.Delete(&models.AdPlacement{}, "id = ?", id).Error; err != nil {
		logger.Error("删除广告位失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}

// ============ 广告内容管理 ============

// GetAds 获取广告列表
func (s *AdService) GetAds(c *gin.Context) {
	placementID := c.Query("placement_id")

	var ads []models.AdContent
	query := s.db.Preload("Placement")

	if placementID != "" {
		query = query.Where("placement_id = ?", placementID)
	}

	query.Order("priority desc, sort_order").Find(&ads)
	utils.Success(c, ads)
}

// GetAd 获取单个广告
func (s *AdService) GetAd(c *gin.Context) {
	id := c.Param("id")

	var ad models.AdContent
	if err := s.db.Preload("Placement").First(&ad, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "广告不存在")
		return
	}

	utils.Success(c, ad)
}

// CreateAd 创建广告
func (s *AdService) CreateAd(c *gin.Context) {
	var req struct {
		PlacementID  uint       `json:"placement_id" binding:"required"`
		Title        string     `json:"title" binding:"max=100"`
		ImageURL     string     `json:"image_url" binding:"max=500"`
		LinkURL      string     `json:"link_url" binding:"max=500"`
		HTMLCode     string     `json:"html_code"`
		AdSenseCode  string     `json:"adsense_code"`
		Type         string     `json:"type" binding:"required"`
		StartDate    *time.Time `json:"start_date"`
		EndDate      *time.Time `json:"end_date"`
		Priority     int        `json:"priority"`
		IsActive     *bool      `json:"is_active"`
		DeviceTarget string     `json:"device_target"`
		SortOrder    int        `json:"sort_order"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 验证广告位存在
	var placement models.AdPlacement
	if err := s.db.First(&placement, req.PlacementID).Error; err != nil {
		utils.BadRequest(c, "广告位不存在")
		return
	}

	ad := models.AdContent{
		PlacementID:  req.PlacementID,
		Title:        req.Title,
		ImageURL:     req.ImageURL,
		LinkURL:      req.LinkURL,
		HTMLCode:     req.HTMLCode,
		AdSenseCode:  req.AdSenseCode,
		Type:         req.Type,
		StartDate:    req.StartDate,
		EndDate:      req.EndDate,
		Priority:     req.Priority,
		IsActive:     req.IsActive != nil && *req.IsActive,
		DeviceTarget: req.DeviceTarget,
		SortOrder:    req.SortOrder,
	}

	if err := s.db.Create(&ad).Error; err != nil {
		logger.Error("创建广告失败", zap.Uint("placement_id", req.PlacementID), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, ad)
}

// UpdateAd 更新广告
func (s *AdService) UpdateAd(c *gin.Context) {
	id := c.Param("id")

	var ad models.AdContent
	if err := s.db.First(&ad, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "广告不存在")
		return
	}

	var req models.AdContent
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	s.db.Model(&ad).Updates(req)
	utils.Success(c, ad)
}

// DeleteAd 删除广告
func (s *AdService) DeleteAd(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.AdContent{}, "id = ?", id).Error; err != nil {
		logger.Error("删除广告失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}

// RecordAdView 记录广告展示
func (s *AdService) RecordAdView(c *gin.Context) {
	var req struct {
		AdID uint `json:"ad_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 增加展示次数
	s.db.Model(&models.AdContent{}).
		Where("id = ?", req.AdID).
		UpdateColumn("view_count", gorm.Expr("view_count + 1"))

	utils.SuccessWithMessage(c, "记录成功", nil)
}

// RecordAdClick 记录广告点击
func (s *AdService) RecordAdClick(c *gin.Context) {
	var req struct {
		AdID uint `json:"ad_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 原子更新点击次数和点击率
	s.db.Model(&models.AdContent{}).
		Where("id = ?", req.AdID).
		Updates(map[string]any{
			"click_count": gorm.Expr("click_count + 1"),
			"click_rate": gorm.Expr(
				"CASE WHEN view_count > 0 THEN ROUND((click_count + 1)::numeric / view_count * 100, 2) ELSE 0 END",
			),
		})

	// 记录点击详情
	click := models.AdClick{
		AdID:      req.AdID,
		IPAddress: c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
		Referrer:  c.GetHeader("Referer"),
		Device:    parseDevice(c.GetHeader("User-Agent")),
	}
	s.db.Create(&click)

	// 返回跳转URL
	var adInfo models.AdContent
	if err := s.db.First(&adInfo, req.AdID).Error; err == nil && adInfo.LinkURL != "" {
		utils.Success(c, gin.H{"redirect_url": adInfo.LinkURL})
		return
	}

	utils.SuccessWithMessage(c, "记录成功", nil)
}

// GetAdStats 获取广告统计
func (s *AdService) GetAdStats(c *gin.Context) {
	adID := c.Query("ad_id")
	placementID := c.Query("placement_id")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	// 按广告统计
	type AdStat struct {
		ID          uint    `json:"id"`
		Title       string  `json:"title"`
		ViewCount   int64   `json:"view_count"`
		ClickCount  int64   `json:"click_count"`
		ClickRate   float64 `json:"click_rate"`
		PlacementID uint    `json:"placement_id"`
		Placement   string  `json:"placement"`
	}

	var stats []AdStat
	query := s.db.Table("ad_contents").
		Select("ad_contents.id, ad_contents.title, ad_contents.view_count, ad_contents.click_count, ad_contents.click_rate, ad_contents.placement_id, ad_placements.name as placement").
		Joins("LEFT JOIN ad_placements ON ad_placements.id = ad_contents.placement_id")

	if adID != "" {
		query = query.Where("ad_contents.id = ?", adID)
	}
	if placementID != "" {
		query = query.Where("ad_contents.placement_id = ?", placementID)
	}

	query.Scan(&stats)

	// 汇总统计
	var totalViews, totalClicks int64
	for _, stat := range stats {
		totalViews += stat.ViewCount
		totalClicks += stat.ClickCount
	}

	avgClickRate := 0.0
	if totalViews > 0 {
		avgClickRate = math.Round(float64(totalClicks)/float64(totalViews)*10000) / 100
	}

	utils.Success(c, gin.H{
		"total_views":    totalViews,
		"total_clicks":   totalClicks,
		"avg_click_rate": avgClickRate,
		"ad_stats":       stats,
		"start_date":     startDate,
		"end_date":       endDate,
	})
}

// GetAdClickHistory 获取点击历史
func (s *AdService) GetAdClickHistory(c *gin.Context) {
	adID := c.Query("ad_id")
	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	var clicks []models.AdClick
	var total int64

	query := s.db.Model(&models.AdClick{}).Preload("Ad")

	if adID != "" {
		query = query.Where("ad_id = ?", adID)
	}

	query.Count(&total)
	query.Order("created_at desc").Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Find(&clicks)

	utils.Paginated(c, clicks, total, page, pageSize)
}

// parseDevice 解析设备类型
func parseDevice(userAgent string) string {
	if userAgent == "" {
		return "unknown"
	}
	// 简单判断
	ua := userAgent
	if len(ua) > 0 {
		// 检查常见移动设备标识
		mobileKeywords := []string{"Mobile", "Android", "iPhone", "iPad", "Windows Phone"}
		for _, keyword := range mobileKeywords {
			found := false
			for i := 0; i <= len(ua)-len(keyword); i++ {
				if ua[i:i+len(keyword)] == keyword {
					found = true
					break
				}
			}
			if found {
				return "mobile"
			}
		}
	}
	return "desktop"
}
