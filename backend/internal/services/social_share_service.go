package services

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"gorm.io/gorm"
)

// SocialShareService 社交媒体分享服务
type SocialShareService struct {
	db *gorm.DB
}

func NewSocialShareService(db *gorm.DB) *SocialShareService {
	return &SocialShareService{db: db}
}

// 支持的分享平台配置（精简版）
// 只保留：微信、QQ、X、微博（复制链接在前端本地实现，不进入后台配置）
var platformConfigs = map[string]map[string]any{
	"wechat": {
		"name":    "微信",
		"icon":    "wechat",
		"color":   "#07C160",
		"support": []string{"qrcode"},
	},
	"qq": {
		"name":  "QQ",
		"icon":  "qq",
		"color": "#12B7F5",
		"url":   "https://connect.qq.com/widget/shareqq/index.html?url={url}&title={title}&desc={title}",
	},
	"x": {
		"name":  "X",
		"icon":  "x",
		"color": "#000000",
		"url":   "https://x.com/intent/tweet?url={url}&text={title}",
	},
	"weibo": {
		"name":  "微博",
		"icon":  "weibo",
		"color": "#E6162D",
		"url":   "https://service.weibo.com/share/share.php?url={url}&title={title}",
	},
}

// GetSharePlatforms 获取支持的分享平台列表
func (s *SocialShareService) GetSharePlatforms(c *gin.Context) {
	// 仅从数据库中读取「已启用」的平台，并与内置配置合并，保证后台开关真实生效
	var configs []models.SocialShareConfig
	s.db.Where("enabled = ?", true).Order("sort_order").Find(&configs)

	platforms := make([]map[string]any, 0)
	for _, cfg := range configs {
		config, ok := platformConfigs[cfg.Platform]
		if !ok {
			// 未在内置表中声明的平台，暂不支持
			continue
		}

		platform := map[string]any{
			"key":   cfg.Platform,
			"name":  config["name"],
			"icon":  config["icon"],
			"color": config["color"],
		}

		// 显示分享次数
		if cfg.ShowCount {
			platform["share_count"] = cfg.ShareCount
		}

		// 添加分享URL模板
		if urlTemplate, ok := config["url"]; ok {
			platform["url_template"] = urlTemplate
		}

		platforms = append(platforms, platform)
	}

	utils.Success(c, gin.H{"platforms": platforms})
}

// GenerateShareURL 生成分享链接
func (s *SocialShareService) GenerateShareURL(c *gin.Context) {
	var req struct {
		Platform string `json:"platform" binding:"required"`
		URL      string `json:"url" binding:"required"`
		Title    string `json:"title"`
		Image    string `json:"image"`
		Via      string `json:"via"`
		Hashtags string `json:"hashtags"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// URL编码
	encodedURL := url.QueryEscape(req.URL)
	encodedTitle := url.QueryEscape(req.Title)
	encodedImage := url.QueryEscape(req.Image)

	// 获取平台配置
	platformConfig, exists := platformConfigs[req.Platform]
	if !exists {
		utils.BadRequest(c, "不支持的平台")
		return
	}

	// 微信特殊处理 - 返回二维码URL
	if req.Platform == "wechat" {
		qrcodeURL := fmt.Sprintf("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=%s", encodedURL)
		utils.Success(c, gin.H{
			"type":       "qrcode",
			"qrcode_url": qrcodeURL,
			"share_url":  req.URL,
		})
		return
	}

	// 复制链接
	if req.Platform == "copy" {
		utils.Success(c, gin.H{
			"type":      "copy",
			"copy_text": req.URL,
		})
		return
	}

	// 生成分享链接
	shareURLTemplate, ok := platformConfig["url"].(string)
	if !ok {
		utils.BadRequest(c, "平台配置错误")
		return
	}

	// 替换占位符
	shareURL := shareURLTemplate
	shareURL = replacePlaceholder(shareURL, "{url}", encodedURL)
	shareURL = replacePlaceholder(shareURL, "{title}", encodedTitle)
	shareURL = replacePlaceholder(shareURL, "{pic}", encodedImage)
	shareURL = replacePlaceholder(shareURL, "{via}", url.QueryEscape(req.Via))
	shareURL = replacePlaceholder(shareURL, "{hashtags}", url.QueryEscape(req.Hashtags))

	utils.Success(c, gin.H{
		"type":      "redirect",
		"share_url": shareURL,
	})
}

// replacePlaceholder 替换占位符
func replacePlaceholder(template, placeholder, value string) string {
	return strings.ReplaceAll(template, placeholder, value)
}

// RecordShare 记录分享行为
func (s *SocialShareService) RecordShare(c *gin.Context) {
	var req struct {
		PostID   uint   `json:"post_id" binding:"required"`
		Platform string `json:"platform" binding:"required"`
		ShareURL string `json:"share_url"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 记录分享行为
	share := models.SocialShare{
		PostID:    req.PostID,
		Platform:  req.Platform,
		ShareURL:  req.ShareURL,
		IPAddress: c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
		Referrer:  c.GetHeader("Referer"),
	}

	s.db.Create(&share)

	// 更新平台分享计数
	s.db.Model(&models.SocialShareConfig{}).
		Where("platform = ?", req.Platform).
		UpdateColumn("share_count", gorm.Expr("share_count + 1"))

	utils.SuccessWithMessage(c, "记录成功", nil)
}

// GetShareStats 获取分享统计
func (s *SocialShareService) GetShareStats(c *gin.Context) {
	postID := c.Query("post_id")

	// 按平台统计
	type PlatformStats struct {
		Platform string `json:"platform"`
		Count    int64  `json:"count"`
	}

	var platformStats []PlatformStats
	query := s.db.Model(&models.SocialShare{}).
		Select("platform, count(*) as count").
		Group("platform")

	if postID != "" {
		query = query.Where("post_id = ?", postID)
	}

	query.Scan(&platformStats)

	// 总分享数
	var total int64
	for _, stat := range platformStats {
		total += stat.Count
	}

	utils.Success(c, gin.H{
		"total":          total,
		"platform_stats": platformStats,
	})
}

// defaultSharePlatforms 默认社交平台配置（表为空时写入，供后台管理）
var defaultSharePlatforms = []struct {
	Platform string
	Order   int
}{
	{"wechat", 0},
	{"weibo", 1},
	{"x", 2},
	{"qq", 3},
}

// ensureDefaultShareConfigs 若表中无记录则插入默认平台配置，保证后台有可配置项
func (s *SocialShareService) ensureDefaultShareConfigs() {
	var count int64
	if err := s.db.Model(&models.SocialShareConfig{}).Count(&count).Error; err != nil || count > 0 {
		return
	}
	for _, p := range defaultSharePlatforms {
		cfg := models.SocialShareConfig{
			Platform:  p.Platform,
			Enabled:   true,
			ShowCount: true,
			SortOrder: p.Order,
		}
		s.db.Create(&cfg)
	}
}

// GetShareConfigs 获取分享配置列表（管理员）
func (s *SocialShareService) GetShareConfigs(c *gin.Context) {
	s.ensureDefaultShareConfigs()
	var configs []models.SocialShareConfig
	s.db.Order("sort_order").Find(&configs)
	utils.Success(c, configs)
}

// UpdateShareConfig 更新分享配置（管理员）
func (s *SocialShareService) UpdateShareConfig(c *gin.Context) {
	id := c.Param("id")

	var config models.SocialShareConfig
	if err := s.db.First(&config, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "配置不存在")
		return
	}

	// 只允许更新部分字段，并且允许布尔值从 true 改为 false
	var req struct {
		Enabled        *bool  `json:"enabled"`
		AppID          string `json:"app_id"`
		RedirectURI    string `json:"redirect_uri"`
		DefaultHashtags string `json:"default_hashtags"`
		DefaultVia     string `json:"default_via"`
		ShowCount      *bool  `json:"show_count"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if req.AppID != "" || config.AppID != "" {
		updates["app_id"] = req.AppID
	}
	if req.RedirectURI != "" || config.RedirectURI != "" {
		updates["redirect_uri"] = req.RedirectURI
	}
	if req.DefaultHashtags != "" || config.DefaultHashtags != "" {
		updates["default_hashtags"] = req.DefaultHashtags
	}
	if req.DefaultVia != "" || config.DefaultVia != "" {
		updates["default_via"] = req.DefaultVia
	}
	if req.ShowCount != nil {
		updates["show_count"] = *req.ShowCount
	}

	if len(updates) > 0 {
		if err := s.db.Model(&config).Updates(updates).Error; err != nil {
			utils.InternalError(c, err.Error())
			return
		}
	}

	utils.Success(c, config)
}

// GetShareHistory 获取分享历史（管理员）
func (s *SocialShareService) GetShareHistory(c *gin.Context) {
	postID := c.Query("post_id")
	platform := c.Query("platform")
	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	var shares []models.SocialShare
	var total int64

	query := s.db.Model(&models.SocialShare{}).Preload("Post")

	if postID != "" {
		query = query.Where("post_id = ?", postID)
	}
	if platform != "" {
		query = query.Where("platform = ?", platform)
	}

	query.Count(&total)
	query.Order("created_at desc").Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Find(&shares)

	utils.Paginated(c, shares, total, page, pageSize)
}

// GetOpenGraphTags 生成 Open Graph 标签
func (s *SocialShareService) GetOpenGraphTags(c *gin.Context) {
	postID := c.Query("post_id")
	pageURL := c.Query("url")

	if postID != "" {
		// 文章 Open Graph
		var post models.Post
		if err := s.db.Preload("Author").Preload("Category").First(&post, "id = ?", postID).Error; err != nil {
			utils.NotFound(c, "文章不存在")
			return
		}

		ogTags := map[string]string{
			"og:type":               "article",
			"og:title":              post.Title,
			"og:description":        post.Summary,
			"og:image":              post.CoverImage,
			"og:url":                pageURL,
			"article:modified_time": post.UpdatedAt.Format(time.RFC3339),
			"article:author":        post.Author.Username,
		}
		if post.PublishedAt != nil {
			ogTags["article:published_time"] = post.PublishedAt.Format(time.RFC3339)
		}
		if post.Category != nil {
			ogTags["article:section"] = post.Category.Name
		}

		utils.Success(c, ogTags)
		return
	}

	// 网站整体 Open Graph
	ogTags := map[string]string{
		"og:type":        "website",
		"og:title":       "折腾侠 TinkerHero",
		"og:description": "基于 Go + Next.js 构建的现代化折腾侠",
		"og:url":         pageURL,
	}

	utils.Success(c, ogTags)
}

// GetTwitterCardTags 生成 Twitter Card 标签
func (s *SocialShareService) GetTwitterCardTags(c *gin.Context) {
	postID := c.Query("post_id")

	if postID != "" {
		var post models.Post
		if err := s.db.First(&post, "id = ?", postID).Error; err != nil {
			utils.NotFound(c, "文章不存在")
			return
		}

		cardTags := map[string]string{
			"twitter:card":        "summary_large_image",
			"twitter:title":       post.Title,
			"twitter:description": post.Summary,
			"twitter:image":       post.CoverImage,
		}

		utils.Success(c, cardTags)
		return
	}

	cardTags := map[string]string{
		"twitter:card":        "summary",
		"twitter:title":       "折腾侠 TinkerHero",
		"twitter:description": "基于 Go + Next.js 构建的现代化折腾侠",
	}

	utils.Success(c, cardTags)
}
