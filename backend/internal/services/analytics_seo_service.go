package services

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// AnalyticsService 统计分析服务
type AnalyticsService struct {
	db *gorm.DB
}

func NewAnalyticsService(db *gorm.DB) *AnalyticsService {
	return &AnalyticsService{db: db}
}

// RecordReadingBehavior 记录阅读行为
func (s *AnalyticsService) RecordReadingBehavior(c *gin.Context) {
	var req struct {
		PostID      int    `json:"post_id" binding:"required"`
		VisitorID   string `json:"visitor_id" binding:"required"`
		SessionID   string `json:"session_id" binding:"required"`
		TimeOnPage  int    `json:"time_on_page"`
		ScrollDepth int    `json:"scroll_depth"`
		IsBounce    bool   `json:"is_bounce"`
		Exited      bool   `json:"exited"` // 是否离开页面
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	ipAddress := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")
	referrer := c.GetHeader("Referer")

	// 解析设备信息
	device, browser, os := parseUserAgent(userAgent)

	// 查找或创建行为记录
	var behavior models.ReadingBehavior
	result := s.db.Where("session_id = ? AND post_id = ?", req.SessionID, req.PostID).First(&behavior)

	if result.Error == gorm.ErrRecordNotFound {
		// 创建新记录
		behavior = models.ReadingBehavior{
			PostID:      uint(req.PostID),
			VisitorID:   req.VisitorID,
			SessionID:   req.SessionID,
			IPAddress:   ipAddress,
			UserAgent:   userAgent,
			Referrer:    referrer,
			Device:      device,
			Browser:     browser,
			OS:          os,
			TimeOnPage:  req.TimeOnPage,
			ScrollDepth: req.ScrollDepth,
			IsBounce:    req.IsBounce,
			EnteredAt:   time.Now(),
		}
		s.db.Create(&behavior)
	} else {
		// 更新记录
		updates := map[string]any{
			"time_on_page":  req.TimeOnPage,
			"scroll_depth":  req.ScrollDepth,
			"is_bounce":     req.IsBounce,
		}
		if req.Exited {
			now := time.Now()
			updates["exited_at"] = now
		}
		s.db.Model(&behavior).Updates(updates)
	}

	utils.Success(c, gin.H{"message": "记录成功"})
}

// GetAnalyticsStats 获取详细统计数据
func (s *AnalyticsService) GetAnalyticsStats(c *gin.Context) {
	startDate := c.DefaultQuery("start_date", time.Now().AddDate(0, 0, -30).Format("2006-01-02"))
	endDate := c.DefaultQuery("end_date", time.Now().Format("2006-01-02"))

	stats := struct {
		TotalViews     int64         `json:"total_views"`
		UniqueVisitors int64         `json:"unique_visitors"`
		AvgTimeOnPage  float64       `json:"avg_time_on_page"`
		AvgScrollDepth float64       `json:"avg_scroll_depth"`
		BounceRate     float64       `json:"bounce_rate"`
		DeviceStats    []DeviceStat  `json:"device_stats"`
		BrowserStats   []BrowserStat `json:"browser_stats"`
		OSStats        []OSStat      `json:"os_stats"`
		CountryStats   []CountryStat `json:"country_stats"`
		ReferrerStats  []ReferrerStat `json:"referrer_stats"`
		DailyViews     []DailyView   `json:"daily_views"`
		TopPosts       []TopPost     `json:"top_posts"`
	}{}

	// 总浏览量
	s.db.Model(&models.ReadingBehavior{}).
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Count(&stats.TotalViews)

	// 独立访客
	s.db.Model(&models.ReadingBehavior{}).
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Distinct("visitor_id").Count(&stats.UniqueVisitors)

	// 平均停留时间
	s.db.Model(&models.ReadingBehavior{}).
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Select("COALESCE(AVG(time_on_page), 0)").Scan(&stats.AvgTimeOnPage)

	// 平均滚动深度
	s.db.Model(&models.ReadingBehavior{}).
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Select("COALESCE(AVG(scroll_depth), 0)").Scan(&stats.AvgScrollDepth)

	// 跳出率
	var totalSessions int64
	var bounceSessions int64
	s.db.Model(&models.ReadingBehavior{}).
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Count(&totalSessions)
	s.db.Model(&models.ReadingBehavior{}).
		Where("DATE(created_at) BETWEEN ? AND ? AND is_bounce = ?", startDate, endDate, true).
		Count(&bounceSessions)
	if totalSessions > 0 {
		stats.BounceRate = float64(bounceSessions) / float64(totalSessions) * 100
	}

	// 设备统计
	s.db.Model(&models.ReadingBehavior{}).
		Select("device, COUNT(*) as count").
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Group("device").Scan(&stats.DeviceStats)

	// 浏览器统计
	s.db.Model(&models.ReadingBehavior{}).
		Select("browser, COUNT(*) as count").
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Group("browser").Scan(&stats.BrowserStats)

	// 操作系统统计
	s.db.Model(&models.ReadingBehavior{}).
		Select("os, COUNT(*) as count").
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Group("os").Scan(&stats.OSStats)

	// 国家/地区统计
	s.db.Model(&models.ReadingBehavior{}).
		Select("country, COUNT(*) as count").
		Where("DATE(created_at) BETWEEN ? AND ? AND country != ''", startDate, endDate).
		Group("country").Order("count desc").Limit(10).Scan(&stats.CountryStats)

	// 来源统计
	s.db.Model(&models.ReadingBehavior{}).
		Select("referrer, COUNT(*) as count").
		Where("DATE(created_at) BETWEEN ? AND ? AND referrer != ''", startDate, endDate).
		Group("referrer").Order("count desc").Limit(10).Scan(&stats.ReferrerStats)

	// 每日浏览量
	s.db.Model(&models.ReadingBehavior{}).
		Select("DATE(created_at) as date, COUNT(*) as views").
		Where("DATE(created_at) BETWEEN ? AND ?", startDate, endDate).
		Group("DATE(created_at)").Order("date").Scan(&stats.DailyViews)

	// 热门文章
	s.db.Table("reading_behaviors").
		Select("post_id, posts.title, COUNT(*) as views").
		Joins("LEFT JOIN posts ON posts.id = reading_behaviors.post_id").
		Where("DATE(reading_behaviors.created_at) BETWEEN ? AND ?", startDate, endDate).
		Group("post_id, posts.title").Order("views desc").Limit(10).
		Scan(&stats.TopPosts)

	utils.Success(c, stats)
}

type DeviceStat struct {
	Device string `json:"device"`
	Count  int64  `json:"count"`
}

type BrowserStat struct {
	Browser string `json:"browser"`
	Count   int64  `json:"count"`
}

type OSStat struct {
	OS    string `json:"os"`
	Count int64  `json:"count"`
}

type CountryStat struct {
	Country string `json:"country"`
	Count   int64  `json:"count"`
}

type ReferrerStat struct {
	Referrer string `json:"referrer"`
	Count    int64  `json:"count"`
}

type DailyView struct {
	Date  string `json:"date"`
	Views int64  `json:"views"`
}

type TopPost struct {
	PostID uint   `json:"post_id"`
	Title  string `json:"title"`
	Views  int64  `json:"views"`
}

// DeadLinkService 死链检测服务
type DeadLinkService struct {
	db *gorm.DB
}

func NewDeadLinkService(db *gorm.DB) *DeadLinkService {
	return &DeadLinkService{db: db}
}

// CheckDeadLinks 检测死链
func (s *DeadLinkService) CheckDeadLinks(c *gin.Context) {
	// 获取所有文章和页面中的链接
	var posts []models.Post
	s.db.Where("status = ?", "published").Find(&posts)

	var deadLinks []models.DeadLink

	for _, post := range posts {
		links := extractLinks(post.Content)
		for _, link := range links {
			if isDeadLink(link) {
				deadLinks = append(deadLinks, models.DeadLink{
					URL:        link,
					SourceType: "post",
					SourceID:   post.ID,
					CheckedAt:  time.Now(),
				})
			}
		}
	}

	// 保存检测结果
	for _, dl := range deadLinks {
		s.db.FirstOrCreate(&dl, models.DeadLink{
			URL:        dl.URL,
			SourceType: dl.SourceType,
			SourceID:   dl.SourceID,
		})
	}

	utils.Success(c, gin.H{
		"message":     "检测完成",
		"dead_links":  deadLinks,
		"total_found": len(deadLinks),
	})
}

// GetDeadLinks 获取死链列表
func (s *DeadLinkService) GetDeadLinks(c *gin.Context) {
	fixed := c.Query("fixed")

	query := s.db.Model(&models.DeadLink{})
	switch fixed {
	case "true":
		query = query.Where("is_fixed = ?", true)
	case "false":
		query = query.Where("is_fixed = ?", false)
	}

	var deadLinks []models.DeadLink
	query.Order("checked_at desc").Find(&deadLinks)

	utils.Success(c, deadLinks)
}

// FixDeadLink 标记死链已修复
func (s *DeadLinkService) FixDeadLink(c *gin.Context) {
	id := c.Param("id")

	now := time.Now()
	if err := s.db.Model(&models.DeadLink{}).Where("id = ?", id).Updates(map[string]any{
		"is_fixed": true,
		"fixed_at": now,
	}).Error; err != nil {
		logger.Error("更新死链状态失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	utils.Success(c, gin.H{"message": "已标记为已修复"})
}

// SEOMetadataService SEO 元数据服务
type SEOMetadataService struct {
	db *gorm.DB
}

func NewSEOMetadataService(db *gorm.DB) *SEOMetadataService {
	return &SEOMetadataService{db: db}
}

// GetStructuredData 生成结构化数据
func (s *SEOMetadataService) GetStructuredData(c *gin.Context) {
	postID := c.Query("post_id")

	if postID != "" {
		// 文章结构化数据
		var post models.Post
		if err := s.db.Preload("Author").Preload("Category").First(&post, "id = ?", postID).Error; err != nil {
			logger.Warn("文章不存在", zap.String("post_id", postID))
			utils.NotFound(c, "文章不存在")
			return
		}

		structuredData := map[string]any{
			"@context":      "https://schema.org",
			"@type":         "Article",
			"headline":      post.Title,
			"description":   post.Summary,
			"image":         post.CoverImage,
			"datePublished": post.PublishedAt,
			"dateModified":  post.UpdatedAt,
			"author": map[string]any{
				"@type": "Person",
				"name":  post.Author.Username,
			},
			"publisher": map[string]any{
				"@type": "Organization",
				"name":  "高性能博客",
				"logo": map[string]any{
					"@type": "ImageObject",
					"url":   "https://example.com/logo.png",
				},
			},
		}

		utils.Success(c, structuredData)
		return
	}

	// 网站整体结构化数据
	structuredData := map[string]any{
		"@context": "https://schema.org",
		"@type":    "WebSite",
		"name":     "高性能博客",
		"url":      "https://example.com",
		"potentialAction": map[string]any{
			"@type":       "SearchAction",
			"target":      "https://example.com/search?q={search_term_string}",
			"query-input": "required name=search_term_string",
		},
	}

	utils.Success(c, structuredData)
}

// AnalyzeSEOMetadata 分析文章 SEO 元数据
func (s *SEOMetadataService) AnalyzeSEOMetadata(c *gin.Context) {
	var req struct {
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
		Summary string `json:"summary"`
		Slug    string `json:"slug"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	score := 100
	issues := []string{}
	suggestions := []string{}

	// 标题检查
	if len(req.Title) < 10 {
		score -= 10
		issues = append(issues, "标题太短，建议至少10个字符")
	}
	if len(req.Title) > 60 {
		score -= 5
		issues = append(issues, "标题太长，建议不超过60个字符")
	}

	// 内容检查
	if len(req.Content) < 300 {
		score -= 20
		issues = append(issues, "内容太短，建议至少300个字符")
	}

	// 关键词密度
	words := len(req.Content)
	if words > 0 {
		// 简单检查标题关键词是否在内容中出现
		titleWords := strings.Fields(strings.ToLower(req.Title))
		contentLower := strings.ToLower(req.Content)
		foundCount := 0
		for _, word := range titleWords {
			if len(word) > 1 && strings.Contains(contentLower, word) {
				foundCount++
			}
		}
		if foundCount < len(titleWords)/2 {
			score -= 10
			suggestions = append(suggestions, "标题关键词在内容中出现次数较少")
		}
	}

	// 摘要检查
	if req.Summary == "" {
		score -= 10
		issues = append(issues, "缺少文章摘要")
	} else if len(req.Summary) > 160 {
		score -= 5
		issues = append(issues, "摘要太长，建议不超过160个字符")
	}

	// Slug 检查
	if req.Slug == "" {
		score -= 5
		issues = append(issues, "缺少 URL 别名")
	} else if len(req.Slug) > 100 {
		score -= 3
		issues = append(issues, "URL 别名太长")
	}

	// 确保分数在0-100之间
	if score < 0 {
		score = 0
	}

	utils.Success(c, gin.H{
		"score":       score,
		"issues":      issues,
		"suggestions": suggestions,
		"grade":       getSEOGGrade(score),
	})
}

func getSEOGGrade(score int) string {
	if score >= 90 {
		return "A"
	} else if score >= 80 {
		return "B"
	} else if score >= 70 {
		return "C"
	} else if score >= 60 {
		return "D"
	}
	return "F"
}

// 辅助函数
func parseUserAgent(userAgent string) (device, browser, os string) {
	ua := strings.ToLower(userAgent)

	// 设备判断
	if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") {
		device = "mobile"
	} else if strings.Contains(ua, "tablet") || strings.Contains(ua, "ipad") {
		device = "tablet"
	} else {
		device = "desktop"
	}

	// 浏览器判断
	browsers := []struct {
		name string
		keys []string
	}{
		{"Chrome", []string{"chrome", "crios"}},
		{"Safari", []string{"safari", "iphone", "ipad"}},
		{"Firefox", []string{"firefox", "fxios"}},
		{"Edge", []string{"edge", "edg"}},
		{"Opera", []string{"opera", "opr"}},
		{"IE", []string{"msie", "trident"}},
	}
	for _, b := range browsers {
		for _, key := range b.keys {
			if strings.Contains(ua, key) {
				browser = b.name
				break
			}
		}
		if browser != "" {
			break
		}
	}

	// 操作系统判断
	osList := []struct {
		name string
		keys []string
	}{
		{"Windows", []string{"windows"}},
		{"macOS", []string{"mac os", "macos"}},
		{"Linux", []string{"linux"}},
		{"Android", []string{"android"}},
		{"iOS", []string{"iphone", "ipad"}},
	}
	for _, o := range osList {
		for _, key := range o.keys {
			if strings.Contains(ua, key) {
				os = o.name
				break
			}
		}
		if os != "" {
			break
		}
	}

	return
}

func extractLinks(content string) []string {
	re := regexp.MustCompile(`https?://[^\s\)]+`)
	return re.FindAllString(content, -1)
}

func isDeadLink(url string) bool {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Head(url)
	if err != nil {
		return true
	}
	defer resp.Body.Close()

	return resp.StatusCode >= 400
}
