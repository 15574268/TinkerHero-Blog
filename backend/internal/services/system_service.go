package services

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type SystemService struct {
	db        *gorm.DB
	rdb       *redis.Client
	cache     map[string]string
	cacheLock sync.RWMutex
	notifySvc *NotificationService
}

// SetNotificationService 设置通知服务（循环依赖避免：bootstrap 中在两者都创建后再调用）
func (s *SystemService) SetNotificationService(svc *NotificationService) {
	s.notifySvc = svc
}

func NewSystemService(db *gorm.DB, rdb *redis.Client) *SystemService {
	s := &SystemService{
		db:    db,
		rdb:   rdb,
		cache: make(map[string]string),
	}
	// 初始化默认配置并加载到内存
	s.initDefaultConfigs()
	s.loadConfigsToMemory()
	return s
}

// initDefaultConfigs 初始化默认配置（用 Find 避免 First 无记录时打印 "record not found" 日志）
func (s *SystemService) initDefaultConfigs() {
	for _, config := range models.DefaultConfigs {
		var existing models.SiteConfig
		s.db.Where("\"key\" = ?", config.Key).Limit(1).Find(&existing)
		if existing.ID == 0 {
			s.db.Create(&config)
		}
	}
}

// loadConfigsToMemory 加载配置到内存
func (s *SystemService) loadConfigsToMemory() {
	var configs []models.SiteConfig
	s.db.Find(&configs)

	s.cacheLock.Lock()
	defer s.cacheLock.Unlock()

	for _, config := range configs {
		s.cache[config.Key] = config.Value
	}
}

// GetConfig 获取单个配置
func (s *SystemService) GetConfig(key string) string {
	s.cacheLock.RLock()
	defer s.cacheLock.RUnlock()
	return s.cache[key]
}

// SetConfig 程序化更新单个配置（写入 DB 并同步内存缓存）
func (s *SystemService) SetConfig(key, value string) error {
	if err := s.db.Model(&models.SiteConfig{}).Where("\"key\" = ?", key).Update("\"value\"", value).Error; err != nil {
		return err
	}
	s.cacheLock.Lock()
	s.cache[key] = value
	s.cacheLock.Unlock()
	return nil
}

// GetConfigBool 获取布尔配置
func (s *SystemService) GetConfigBool(key string) bool {
	return s.GetConfig(key) == "true"
}

// GetConfigInt 获取整数配置
func (s *SystemService) GetConfigInt(key string) int {
	var val int
	fmt.Sscanf(s.GetConfig(key), "%d", &val)
	return val
}

// GetAllConfigs 获取所有配置（管理员）
func (s *SystemService) GetAllConfigs(c *gin.Context) {
	var configs []models.SiteConfig
	// PostgreSQL 中 group 为保留字，需用双引号；MySQL 用反引号。当前项目用 PostgreSQL，故用 \"group\"
	s.db.Order("\"group\" asc, id asc").Find(&configs)

	// 按组分类
	result := make(map[string][]models.SiteConfig)
	for _, config := range configs {
		result[config.Group] = append(result[config.Group], config)
	}

	utils.Success(c, result)
}

// GetPublicConfigs 获取公开配置（前端）
func (s *SystemService) GetPublicConfigs(c *gin.Context) {
	// 只返回应用于前台的配置项（供前台展示与逻辑使用）
	publicKeys := []string{
		"site_name", "site_url", "site_description", "site_keywords",
		"site_logo", "site_slogan", "site_favicon", "site_footer", "site_icp", "site_public_security",
		"posts_per_page", "allow_comment",
		"enable_toc", "enable_reading_time", "code_highlight_theme",
		"seo_title_suffix",
		"theme_color", "site_announcement",
		"custom_css", "custom_head_html", "custom_footer_html",
		"default_post_status", "default_cover_image", "auto_save_interval_sec",
		"seo_google_verification", "seo_baidu_verification", "seo_bing_verification",
		"seo_auto_description",
		"enable_captcha_comment", "comment_need_audit", "excerpt_length",
	}

	s.cacheLock.RLock()
	defer s.cacheLock.RUnlock()

	result := make(map[string]string)
	for _, key := range publicKeys {
		result[key] = s.cache[key]
	}

	utils.Success(c, result)
}

// sitemapURL 与 urlSet 用于生成 sitemap XML
type sitemapURL struct {
	Loc     string `xml:"loc"`
	Lastmod string `xml:"lastmod,omitempty"`
}
type sitemapURLSet struct {
	XMLName xml.Name    `xml:"urlset"`
	NS      string      `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

// SitemapHandler 处理 GET /sitemap.xml，当 seo_sitemap_enabled 为 true 时返回文章 URL 列表
func (s *SystemService) SitemapHandler(c *gin.Context) {
	if s.GetConfig("seo_sitemap_enabled") != "true" {
		c.Status(http.StatusNotFound)
		return
	}
	baseURL := strings.TrimSuffix(s.GetConfig("site_url"), "/")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}

	urls := make([]sitemapURL, 0, 64)
	urls = append(urls, sitemapURL{Loc: baseURL + "/", Lastmod: time.Now().Format("2006-01-02")})

	var postIDs []struct {
		ID          uint
		PublishedAt *time.Time
	}
	err := s.db.Model(&models.Post{}).Select("id", "published_at").
		Where("status = ?", models.PostPublished).
		Order("published_at desc").
		Find(&postIDs).Error
	if err != nil {
		logger.Error("sitemap: 查询文章列表失败", zap.Error(err))
		// 仍返回 200 与仅首页的 sitemap，避免前台报 500
		c.Header("Content-Type", "application/xml; charset=utf-8")
		c.XML(http.StatusOK, sitemapURLSet{NS: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: urls})
		return
	}

	for _, p := range postIDs {
		lastmod := ""
		if p.PublishedAt != nil {
			lastmod = p.PublishedAt.Format("2006-01-02")
		}
		urls = append(urls, sitemapURL{Loc: fmt.Sprintf("%s/posts/%d", baseURL, p.ID), Lastmod: lastmod})
	}
	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.XML(http.StatusOK, sitemapURLSet{NS: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: urls})
}

// RobotsTxtHandler 处理 GET /robots.txt，返回 seo_robots_txt 或默认内容
func (s *SystemService) RobotsTxtHandler(c *gin.Context) {
	body := s.GetConfig("seo_robots_txt")
	if strings.TrimSpace(body) == "" {
		body = "User-agent: *\nAllow: /\n"
	}
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(http.StatusOK, body)
}

// UpdateConfig 更新配置
func (s *SystemService) UpdateConfig(c *gin.Context) {
	key := c.Param("key")

	var req struct {
		Value string `json:"value"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var config models.SiteConfig
	if err := s.db.Where("\"key\" = ?", key).First(&config).Error; err != nil {
		utils.NotFound(c, "配置项不存在")
		return
	}

	config.Value = req.Value
	if err := s.db.Save(&config).Error; err != nil {
		logger.Error("更新配置失败", zap.String("key", key), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}

	// 从 DB 重新加载配置到内存，确保 AI 等依赖 getConfig 的服务拿到最新值
	s.loadConfigsToMemory()

	// 更新 Redis 缓存
	ctx := context.Background()
	s.rdb.Del(ctx, "site_config:public")

	utils.Success(c, config)
}

// BatchUpdateConfigs 批量更新配置
func (s *SystemService) BatchUpdateConfigs(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	tx := s.db.Begin()
	for key, value := range req {
		if err := tx.Model(&models.SiteConfig{}).Where("\"key\" = ?", key).Update("\"value\"", value).Error; err != nil {
			tx.Rollback()
			logger.Error("批量更新配置失败", zap.String("key", key), zap.Error(err))
			utils.InternalError(c, "更新失败")
			return
		}
	}
	tx.Commit()

	// 从 DB 重新加载配置到内存，确保 AI 等依赖 getConfig 的服务拿到最新值（避免 key 或序列化不一致）
	s.loadConfigsToMemory()

	utils.SuccessWithMessage(c, "更新成功", nil)
}

// ==================== 敏感词管理 ====================

// GetSensitiveWords 获取敏感词列表
func (s *SystemService) GetSensitiveWords(c *gin.Context) {
	category := c.Query("category")
	page, pageSize := utils.GetPagination(c)

	query := s.db.Model(&models.SensitiveWord{})
	if category != "" {
		query = query.Where("category = ?", category)
	}

	var total int64
	query.Count(&total)

	var words []models.SensitiveWord
	query.Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Order("created_at desc").Find(&words)

	utils.Paginated(c, words, total, page, pageSize)
}

// CreateSensitiveWord 创建敏感词
func (s *SystemService) CreateSensitiveWord(c *gin.Context) {
	var req struct {
		Word     string `json:"word" binding:"required"`
		Category string `json:"category"`
		Level    int    `json:"level"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	word := models.SensitiveWord{
		Word:     req.Word,
		Category: req.Category,
		Level:    req.Level,
	}

	if err := s.db.Create(&word).Error; err != nil {
		logger.Error("创建敏感词失败", zap.String("word", req.Word), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	utils.Created(c, word)
}

// DeleteSensitiveWord 删除敏感词
func (s *SystemService) DeleteSensitiveWord(c *gin.Context) {
	id := c.Param("id")
	if err := s.db.Delete(&models.SensitiveWord{}, "id = ?", id).Error; err != nil {
		logger.Error("删除敏感词失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}
	utils.NoContent(c)
}

// CheckSensitiveContent 检查内容是否包含敏感词
func (s *SystemService) CheckSensitiveContent(content string) (bool, string) {
	var words []models.SensitiveWord
	s.db.Where("level >= ?", 2).Find(&words)

	for _, word := range words {
		if containsWord(content, word.Word) {
			return true, word.Word
		}
	}
	return false, ""
}

// FilterSensitiveContent 过滤敏感词
func (s *SystemService) FilterSensitiveContent(content string) string {
	var words []models.SensitiveWord
	s.db.Where("level = ?", 1).Find(&words)

	result := content
	for _, word := range words {
		result = replaceWord(result, word.Word)
	}
	return result
}

func containsWord(content, word string) bool {
	return strings.Contains(content, word)
}

func replaceWord(content, word string) string {
	replacement := strings.Repeat("*", len([]rune(word)))
	return strings.ReplaceAll(content, word, replacement)
}

// ==================== IP黑名单管理 ====================

// GetIPBlacklist 获取IP黑名单列表
func (s *SystemService) GetIPBlacklist(c *gin.Context) {
	page, pageSize := utils.GetPagination(c)

	var total int64
	s.db.Model(&models.IPBlacklist{}).Count(&total)

	var list []models.IPBlacklist
	s.db.Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Order("created_at desc").Find(&list)

	utils.Paginated(c, list, total, page, pageSize)
}

// AddToIPBlacklist 添加IP到黑名单
func (s *SystemService) AddToIPBlacklist(c *gin.Context) {
	var req struct {
		IPAddress string     `json:"ip_address" binding:"required"`
		Reason    string     `json:"reason"`
		ExpiredAt *time.Time `json:"expired_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	blacklist := models.IPBlacklist{
		IPAddress: req.IPAddress,
		Reason:    req.Reason,
		ExpiredAt: req.ExpiredAt,
	}

	if err := s.db.Create(&blacklist).Error; err != nil {
		logger.Error("添加IP黑名单失败", zap.String("ip", req.IPAddress), zap.Error(err))
		utils.InternalError(c, "添加失败")
		return
	}

	utils.Created(c, blacklist)
}

// RemoveFromIPBlacklist 从黑名单移除IP
func (s *SystemService) RemoveFromIPBlacklist(c *gin.Context) {
	id := c.Param("id")
	if err := s.db.Delete(&models.IPBlacklist{}, "id = ?", id).Error; err != nil {
		logger.Error("删除IP黑名单失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}
	utils.NoContent(c)
}

// IsIPBlacklisted 检查IP是否在黑名单中（用 Find+Limit 避免无记录时 GORM 打印 "record not found"）
func (s *SystemService) IsIPBlacklisted(ip string) bool {
	var blacklist models.IPBlacklist
	result := s.db.Where("ip_address = ?", ip).Limit(1).Find(&blacklist)
	if result.RowsAffected == 0 {
		return false
	}

	// 检查是否过期
	if blacklist.ExpiredAt != nil && time.Now().After(*blacklist.ExpiredAt) {
		s.db.Delete(&blacklist)
		return false
	}

	return true
}

// ==================== 邮件订阅管理 ====================

// GetSubscribers 获取订阅者列表
func (s *SystemService) GetSubscribers(c *gin.Context) {
	page, pageSize := utils.GetPagination(c)

	var total int64
	s.db.Model(&models.Subscriber{}).Where("is_active = ?", true).Count(&total)

	var subscribers []models.Subscriber
	s.db.Where("is_active = ?", true).
		Offset(utils.GetOffset(page, pageSize)).
		Limit(pageSize).
		Order("created_at desc").
		Find(&subscribers)

	utils.Paginated(c, subscribers, total, page, pageSize)
}

// Subscribe 订阅
func (s *SystemService) Subscribe(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查是否已订阅
	var existing models.Subscriber
	if err := s.db.Where("email = ?", req.Email).First(&existing).Error; err == nil {
		if existing.IsActive {
			// 返回 200 与 token，供前台弹窗提供「取消订阅」入口
			utils.Success(c, gin.H{"already_subscribed": true, "token": existing.Token})
			return
		}
		// 重新激活
		s.db.Model(&existing).Update("is_active", true)
		utils.SuccessWithMessage(c, "订阅成功", nil)
		return
	}

	subscriber := models.Subscriber{
		Email:    req.Email,
		IsActive: true,
		Token:    generateSubscribeToken(),
	}

	if err := s.db.Create(&subscriber).Error; err != nil {
		logger.Error("订阅失败", zap.String("email", req.Email), zap.Error(err))
		utils.InternalError(c, "订阅失败")
		return
	}

	utils.Created(c, gin.H{"message": "订阅成功"})
}

// Unsubscribe 取消订阅
func (s *SystemService) Unsubscribe(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		utils.BadRequest(c, "无效的链接")
		return
	}

	var subscriber models.Subscriber
	if err := s.db.Where("token = ?", token).First(&subscriber).Error; err != nil {
		utils.NotFound(c, "订阅不存在")
		return
	}

	s.db.Model(&subscriber).Update("is_active", false)
	utils.SuccessWithMessage(c, "已取消订阅", nil)
}

// NotifySubscribers 通知所有活跃订阅者有新文章发布
func (s *SystemService) NotifySubscribers(post *models.Post) error {
	if s.notifySvc == nil {
		return nil
	}

	var subscribers []models.Subscriber
	if err := s.db.Where("is_active = ?", true).Find(&subscribers).Error; err != nil || len(subscribers) == 0 {
		return err
	}

	siteURL := s.GetConfig("site_url")
	if siteURL == "" {
		siteURL = os.Getenv("FRONTEND_URL")
	}
	if siteURL == "" {
		siteURL = "http://localhost:3000"
	}

	siteName := s.GetConfig("site_name")
	if siteName == "" {
		siteName = "博客"
	}

	postURL := fmt.Sprintf("%s/posts/%d", siteURL, post.ID)

	for _, sub := range subscribers {
		sub := sub // capture loop variable
		unsubURL := fmt.Sprintf("%s/unsubscribe?token=%s", siteURL, sub.Token)

		subject := fmt.Sprintf("【%s】新文章：%s", siteName, post.Title)
		summary := post.Summary
		if summary == "" && len(post.Content) > 200 {
			summary = post.Content[:200] + "..."
		}
		body := fmt.Sprintf(`您好，

%s 发布了新文章：《%s》

%s

点击查看全文：%s

---
您收到此邮件是因为您订阅了 %s 的更新。
如需退订，请点击：%s
`, siteName, post.Title, summary, postURL, siteName, unsubURL)

		s.notifySvc.EnqueueEmail(sub.Email, subject, body)
	}

	return nil
}

func generateSubscribeToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", b)
}

// ==================== 批量操作 ====================

// BatchDeletePosts 批量删除文章
func (s *SystemService) BatchDeletePosts(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	tx := s.db.Begin()
	for _, id := range req.IDs {
		// 清理标签关联
		if err := tx.Exec("DELETE FROM post_tags WHERE post_id = ?", id).Error; err != nil {
			tx.Rollback()
			logger.Error("删除文章标签关联失败", zap.Uint("post_id", id), zap.Error(err))
			utils.InternalError(c, "删除失败")
			return
		}
		if err := tx.Where("post_id = ?", id).Delete(&models.Comment{}).Error; err != nil {
			tx.Rollback()
			logger.Error("删除文章评论失败", zap.Uint("post_id", id), zap.Error(err))
			utils.InternalError(c, "删除失败")
			return
		}
	}

	if err := tx.Where("id IN ?", req.IDs).Delete(&models.Post{}).Error; err != nil {
		tx.Rollback()
		logger.Error("批量删除文章失败", zap.Any("ids", req.IDs), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}
	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, fmt.Sprintf("成功删除 %d 篇文章", len(req.IDs)), nil)
}

// BatchUpdatePostStatus 批量更新文章状态
func (s *SystemService) BatchUpdatePostStatus(c *gin.Context) {
	var req struct {
		IDs    []uint          `json:"ids" binding:"required"`
		Status models.PostStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	if err := s.db.Model(&models.Post{}).Where("id IN ?", req.IDs).Update("status", req.Status).Error; err != nil {
		logger.Error("批量更新文章状态失败", zap.Any("ids", req.IDs), zap.Error(err))
		utils.InternalError(c, "更新失败")
		return
	}
	// 仅为尚未设置 published_at 的文章补充发布时间
	if req.Status == models.PostPublished {
		s.db.Model(&models.Post{}).Where("id IN ? AND published_at IS NULL", req.IDs).
			Update("published_at", time.Now())
	}

	utils.SuccessWithMessage(c, fmt.Sprintf("成功更新 %d 篇文章状态", len(req.IDs)), nil)
}

// BatchMoveCategory 批量移动文章分类
func (s *SystemService) BatchMoveCategory(c *gin.Context) {
	var req struct {
		IDs        []uint `json:"ids" binding:"required"`
		CategoryID *uint  `json:"category_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	if err := s.db.Model(&models.Post{}).Where("id IN ?", req.IDs).Update("category_id", req.CategoryID).Error; err != nil {
		logger.Error("批量移动文章分类失败", zap.Any("ids", req.IDs), zap.Error(err))
		utils.InternalError(c, "移动失败")
		return
	}

	utils.SuccessWithMessage(c, fmt.Sprintf("成功移动 %d 篇文章", len(req.IDs)), nil)
}

// BatchDeleteComments 批量删除评论
func (s *SystemService) BatchDeleteComments(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 查出要删除的评论，统计已审核数量并按文章分组
	var comments []models.Comment
	if err := s.db.Where("id IN ?", req.IDs).Find(&comments).Error; err != nil {
		utils.InternalError(c, "查询评论失败")
		return
	}
	approvedByPost := make(map[uint]int64)
	for _, c := range comments {
		if c.Status == models.CommentApproved {
			approvedByPost[c.PostID]++
		}
	}

	tx := s.db.Begin()
	// 删除子评论
	if err := tx.Where("parent_id IN ?", req.IDs).Delete(&models.Comment{}).Error; err != nil {
		tx.Rollback()
		utils.InternalError(c, "删除子评论失败")
		return
	}
	if err := tx.Where("id IN ?", req.IDs).Delete(&models.Comment{}).Error; err != nil {
		tx.Rollback()
		logger.Error("批量删除评论失败", zap.Any("ids", req.IDs), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}
	// 更新文章评论数
	for postID, count := range approvedByPost {
		tx.Model(&models.Post{}).Where("id = ?", postID).
			UpdateColumn("comment_count", gorm.Expr("GREATEST(comment_count - ?, 0)", count))
	}
	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, fmt.Sprintf("成功删除 %d 条评论", len(req.IDs)), nil)
}

// BatchApproveComments 批量审核评论
func (s *SystemService) BatchApproveComments(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 查出待审核的评论，统计需要增加计数的文章
	var pendingComments []models.Comment
	s.db.Where("id IN ? AND status != ?", req.IDs, models.CommentApproved).Find(&pendingComments)
	approveByPost := make(map[uint]int64)
	for _, c := range pendingComments {
		approveByPost[c.PostID]++
	}

	tx := s.db.Begin()
	if err := tx.Model(&models.Comment{}).Where("id IN ?", req.IDs).Update("status", models.CommentApproved).Error; err != nil {
		tx.Rollback()
		logger.Error("批量审核评论失败", zap.Any("ids", req.IDs), zap.Error(err))
		utils.InternalError(c, "审核失败")
		return
	}
	for postID, count := range approveByPost {
		tx.Model(&models.Post{}).Where("id = ?", postID).
			UpdateColumn("comment_count", gorm.Expr("comment_count + ?", count))
	}
	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "审核失败")
		return
	}

	utils.SuccessWithMessage(c, fmt.Sprintf("成功审核 %d 条评论", len(req.IDs)), nil)
}

// ExportData 导出数据
func (s *SystemService) ExportData(c *gin.Context) {
	dataType := c.Param("type")

	switch dataType {
	case "posts":
		var posts []models.Post
		s.db.Preload("Author").Preload("Category").Preload("Tags").Find(&posts)
		data, err := json.Marshal(posts)
		if err != nil {
			logger.Error("序列化数据失败", zap.Error(err))
			utils.InternalError(c, "数据导出失败")
			return
		}
		c.Data(200, "application/json", data)
	case "users":
		var users []models.User
		s.db.Find(&users)
		type SafeUser struct {
			ID        uint   `json:"id"`
			Username  string `json:"username"`
			Email     string `json:"email"`
			Nickname  string `json:"nickname"`
			Role      string `json:"role"`
			IsActive  bool   `json:"is_active"`
			CreatedAt any    `json:"created_at"`
		}
		safeUsers := make([]SafeUser, len(users))
		for i, u := range users {
			safeUsers[i] = SafeUser{
				ID: u.ID, Username: u.Username, Email: u.Email,
				Nickname: u.Nickname, Role: string(u.Role), IsActive: u.IsActive,
				CreatedAt: u.CreatedAt,
			}
		}
		data, err := json.Marshal(safeUsers)
		if err != nil {
			logger.Error("序列化数据失败", zap.Error(err))
			utils.InternalError(c, "数据导出失败")
			return
		}
		c.Data(200, "application/json", data)
	default:
		utils.BadRequest(c, "不支持的数据类型")
	}
}
