package router

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/bootstrap"
	"github.com/tinkerhero/blog/backend/internal/middleware"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
)

// SetupRouter 设置路由
func SetupRouter(cfg *bootstrap.Config, svc *bootstrap.Services) *gin.Engine {
	r := gin.New()

	// Configure trusted proxies for accurate client IP detection
	trustedProxies := os.Getenv("TRUSTED_PROXIES")
	if trustedProxies != "" {
		r.SetTrustedProxies(strings.Split(trustedProxies, ","))
	} else {
		r.SetTrustedProxies(nil)
	}

	// 中间件（顺序重要）
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.LoggerMiddleware())
	r.Use(middleware.RecoveryMiddleware())
	r.Use(middleware.ErrorHandler())
	r.Use(middleware.APIRateLimitMiddleware(svc.SystemService.GetConfig)) // 全局 API 限流（后台可配）
	r.Use(middleware.IPBlacklistMiddleware(svc.SystemService.GetConfig, func(ip string) bool {
		return svc.SystemService.IsIPBlacklisted(ip)
	}))

	// CORS配置
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = cfg.CORSOrigins
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Type", "Authorization", "X-Request-ID", "X-Post-Password", "X-Refresh-Token"}
	corsConfig.AllowCredentials = true
	r.Use(cors.New(corsConfig))

	// Origin 校验：对状态变更请求验证 Origin/Referer 是否在白名单中
	r.Use(middleware.OriginCheckMiddleware(cfg.CORSOrigins))

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "timestamp": time.Now().Unix()})
	})

	// SEO：sitemap.xml 与 robots.txt（由系统配置开关控制）
	r.GET("/sitemap.xml", svc.SystemService.SitemapHandler)
	r.GET("/robots.txt", svc.SystemService.RobotsTxtHandler)

	// Static files: security headers + hotlink protection + CORS for canvas/poster
	r.Use(func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/uploads/") {
			c.Next()
			return
		}
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'")

		// 显式为 /uploads/ 响应添加 CORS，确保跨域页面（如海报生成）能加载图片
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			for _, o := range cfg.CORSOrigins {
				if strings.TrimSpace(o) == origin {
					c.Header("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}

		// 防盗链：有 Referer 时，必须来自允许的域名
		if referer := c.Request.Header.Get("Referer"); referer != "" {
			allowed := false
			for _, originAllowed := range cfg.CORSOrigins {
				o := strings.TrimRight(strings.TrimSpace(originAllowed), "/")
				if strings.HasPrefix(referer, o+"/") || referer == o {
					allowed = true
					break
				}
			}
			if !allowed {
				c.AbortWithStatus(403)
				return
			}
		}
		c.Next()
	})
	r.Static("/uploads", "./uploads")

	// API路由组
	api := r.Group("/api/v1")
	{
		// 认证路由
		registerAuthRoutes(api, svc)

		// 公开路由
		registerPublicRoutes(api, svc)

		// 认证路由
		registerAuthenticatedRoutes(api, svc)

		// 管理员路由
		registerAdminRoutes(api, svc)
	}

	return r
}

// registerAuthRoutes 注册认证路由
func registerAuthRoutes(api *gin.RouterGroup, svc *bootstrap.Services) {
	auth := api.Group("/auth")
	auth.Use(middleware.AuthRateLimitMiddleware(svc.SystemService.GetConfig))
	{
		auth.POST("/register", svc.UserService.Register)
		auth.POST("/login", svc.UserService.Login)
		auth.POST("/refresh-token", svc.UserService.RefreshToken)
		auth.POST("/logout", middleware.AuthMiddleware(), middleware.LogoutHandler())

		// OAuth
		auth.GET("/github/login", svc.OAuthService.GitHubLogin)
		auth.GET("/github/callback", svc.OAuthService.GitHubCallback)
		auth.GET("/google/login", svc.OAuthService.GoogleLogin)
		auth.GET("/google/callback", svc.OAuthService.GoogleCallback)
	}
}

// registerPublicRoutes 注册公开路由
func registerPublicRoutes(api *gin.RouterGroup, svc *bootstrap.Services) {
	// 文章 - 注意：具体路径必须放在参数路径之前，避免路由冲突
	api.GET("/posts", svc.PostService.GetPosts)
	api.GET("/posts/trending", svc.RecommendationService.GetTrendingPosts)
	api.GET("/posts/:id", middleware.OptionalAuthMiddleware(), svc.PostService.GetPost)
	api.GET("/posts/:id/related", svc.RecommendationService.GetRelatedPosts)
	api.GET("/posts/:id/comments", svc.CommentService.GetPostComments)
	api.POST("/comments", middleware.StrictRateLimitMiddleware(), svc.CommentService.CreateComment)

	// 分类和标签
	api.GET("/categories", svc.CategoryService.GetAllCategories)
	api.GET("/tags", svc.TagService.GetAllTags)

	// 搜索
	if svc.SearchService != nil {
		api.GET("/search", svc.SearchService.Search)
		api.GET("/search/tag/:tag", svc.SearchService.SearchByTag)
		api.GET("/search/suggest", svc.SearchService.SearchSuggestion)
	}

	// 统计
	api.GET("/stats/popular", svc.StatService.GetPopularPosts)
	api.GET("/stats/recent", svc.StatService.GetRecentPosts)
	api.GET("/stats/category", svc.StatService.GetPostStatsByCategory)
	api.GET("/stats/monthly", svc.StatService.GetPostStatsByMonth)
	// 访问统计：每 IP 每分钟最多 30 次，防止刷量和暴力写库
	api.POST("/stats/visit", middleware.RateLimitMiddleware(30, time.Minute), svc.StatService.RecordVisit)

	// 页面
	api.GET("/pages", svc.PageService.GetAllPages)
	api.GET("/pages/:slug", svc.PageService.GetPageBySlug)

	// 友链
	api.GET("/links", svc.FriendLinkService.GetAllFriendLinks)

	// 归档
	api.GET("/archives", svc.ArchiveService.GetArchives)
	api.GET("/archives/year/:year", svc.ArchiveService.GetArchivesByYear)
	api.GET("/archives/stats", svc.ArchiveService.GetArchiveStats)

	// 系统配置
	api.GET("/configs", svc.SystemService.GetPublicConfigs)

	// Open API 发布（免登录，API Key 校验）
	open := api.Group("/open")
	open.Use(func(c *gin.Context) {
		if svc.OpenAPIService == nil {
			utils.InternalError(c, "服务未初始化")
			c.Abort()
			return
		}
		// CheckPublishAuth 会直接写出错误响应
		if !svc.OpenAPIService.CheckPublishAuth(c) {
			c.Abort()
			return
		}
		c.Next()
	})
	open.POST("/posts", svc.OpenAPIService.CreateAndPublishPost)
	open.POST("/categories", svc.CategoryService.CreateCategory)
	open.POST("/tags", svc.TagService.CreateTag)
	open.GET("/categories", svc.CategoryService.GetAllCategories)
	open.GET("/tags", svc.TagService.GetAllTags)

	// 验证码
	api.GET("/captcha", svc.CaptchaService.SimpleGenerateCaptcha)
	api.GET("/captcha/advanced", svc.CaptchaService.GenerateCaptcha)
	api.POST("/captcha/verify", svc.CaptchaService.VerifyCaptchaAPI)

	// 订阅
	api.POST("/subscribe", svc.SystemService.Subscribe)
	api.GET("/unsubscribe", svc.SystemService.Unsubscribe)

	// 预览
	api.GET("/preview/:token", svc.PreviewService.GetPreviewByToken)

	// 友链申请
	api.POST("/friend-links/apply", svc.FriendLinkApplyService.ApplyFriendLink)
	api.GET("/friend-links/apply/:id/status", svc.FriendLinkApplyService.GetApplyStatus)
	api.GET("/friend-links/apply/status", svc.FriendLinkApplyService.GetApplyStatusByURL)

	// 打赏（仅公开配置，前台直接展示二维码）
	api.GET("/donation/config", svc.DonationService.GetPublicDonationConfig)

	// 文章合集
	api.GET("/series", svc.SeriesService.GetPublishedSeries)
	api.GET("/series/:slug", svc.SeriesService.GetSeriesBySlug)

	// 模板
	api.GET("/templates", svc.TemplateService.GetTemplates)
	api.GET("/templates/:id", svc.TemplateService.GetTemplate)

	// 公告
	api.GET("/announcements", svc.AnnouncementService.GetActiveAnnouncements)

	// 资源
	api.GET("/resources", svc.ResourceService.GetResources)

	// 更新日志
	api.GET("/changelogs", svc.ChangelogService.GetPublishedChangelogs)

	// 里程碑
	api.GET("/milestones", svc.MilestoneService.GetMilestones)

	// 分析统计 - 公开接口（仅读取）
	api.GET("/analytics/stats", svc.AnalyticsService.GetAnalyticsStats)

	// SEO工具 - 公开接口
	api.GET("/seo/structured-data", svc.SEOMetadataService.GetStructuredData)

	// 社交分享 - 公开接口
	api.GET("/social/platforms", svc.SocialShareService.GetSharePlatforms)
	api.GET("/social/og-tags", svc.SocialShareService.GetOpenGraphTags)
	api.GET("/social/twitter-card", svc.SocialShareService.GetTwitterCardTags)
	api.POST("/social/share/record", middleware.RateLimitMiddleware(60, time.Minute), svc.SocialShareService.RecordShare)

	// 导航菜单 - 公开接口
	api.GET("/nav-menus", svc.NavMenuService.GetVisibleMenus)

	// 广告 - 公开接口
	api.GET("/ads/placements", svc.AdService.GetActivePlacements)
	api.GET("/ads/placement/:code", svc.AdService.GetPlacementByCode)
	api.POST("/ads/view", middleware.RateLimitMiddleware(120, time.Minute), svc.AdService.RecordAdView)
	api.POST("/ads/click", middleware.RateLimitMiddleware(60, time.Minute), svc.AdService.RecordAdClick)

	// 文章点赞 - 公开接口（无限点赞，仅计数）
	api.POST("/posts/:id/like", middleware.RateLimitMiddleware(30, time.Minute), svc.PostService.LikePost)

	// 文章多语言版本
	api.GET("/posts/:id/translations", svc.PostTranslationService.GetTranslations)
	api.GET("/posts/:id/translations/:lang", svc.PostTranslationService.GetTranslation)
}

// registerAuthenticatedRoutes 注册认证路由
func registerAuthenticatedRoutes(api *gin.RouterGroup, svc *bootstrap.Services) {
	authGroup := api.Group("")
	authGroup.Use(middleware.AuthMiddleware())
	{
		// 用户信息
		authGroup.GET("/profile", svc.UserService.GetProfile)
		authGroup.PUT("/profile", svc.UserService.UpdateProfile)
		authGroup.PUT("/password", svc.UserService.ChangePassword)
		authGroup.GET("/profile/comments", svc.UserService.GetMyComments)

		// 文章管理（需要 author 或 admin 权限）
		postGroup := authGroup.Group("")
		postGroup.Use(middleware.AuthorMiddleware())
		postGroup.POST("/posts", svc.PostService.CreatePost)
		postGroup.PUT("/posts/:id", svc.PostService.UpdatePost)
		postGroup.DELETE("/posts/:id", svc.PostService.DeletePost)

		// 版本管理
		authGroup.GET("/posts/:id/versions", svc.VersionService.GetVersions)
		authGroup.GET("/posts/:id/versions/:version", svc.VersionService.GetVersion)
		authGroup.GET("/posts/:id/versions/compare", svc.VersionService.CompareVersions)
		authGroup.DELETE("/posts/:id/versions/:version", svc.VersionService.DeleteVersion)
		authGroup.POST("/posts/:id/versions/restore/:version", svc.VersionService.RestoreVersion)
		authGroup.POST("/posts/:id/autosave", svc.VersionService.AutoSave)
		authGroup.GET("/posts/:id/autosave", svc.VersionService.GetAutoSave)

		// 预览链接
		authGroup.POST("/previews", svc.PreviewService.CreatePreviewLink)
		authGroup.GET("/posts/:id/previews", svc.PreviewService.GetPreviewLinks)
		authGroup.DELETE("/previews/:id", svc.PreviewService.DeletePreviewLink)

		// 上传
		authGroup.POST("/upload", svc.UploadService.UploadImage)
		authGroup.GET("/media", svc.UploadService.GetAllMedia)
		authGroup.DELETE("/media/:id", svc.UploadService.DeleteMedia)

		// 通知
		authGroup.GET("/notifications", svc.NotificationService.GetNotifications)
		authGroup.PUT("/notifications/:id/read", svc.NotificationService.MarkNotificationAsRead)
		authGroup.PUT("/notifications/read-all", svc.NotificationService.MarkAllNotificationsAsRead)
		authGroup.GET("/notifications/unread-count", svc.NotificationService.GetUnreadCount)

		// 评论管理
		authGroup.DELETE("/comments/:id", svc.CommentService.DeleteComment)

		// 友链申请（GetMyApplies 已移除，前台改用 URL 查询）

		// AI 接口（独立限流：每用户每分钟最多 20 次，可通过 AI_RATE_LIMIT_PER_MIN 覆盖）
		aiGroup := authGroup.Group("/ai")
		aiGroup.Use(middleware.AIRateLimitMiddleware())
		{
			aiGroup.POST("/generate-title", svc.AIService.GenerateTitle)
			aiGroup.POST("/generate-summary", svc.AIService.GenerateSummary)
			aiGroup.POST("/continue-writing", svc.AIService.ContinueWriting)
			aiGroup.POST("/polish-text", svc.AIService.PolishText)
			aiGroup.POST("/translate", svc.AIService.TranslateText)
			aiGroup.POST("/generate-outline", svc.AIService.GenerateOutline)
			aiGroup.POST("/generate-slug", svc.AIService.GenerateSlug)
			aiGroup.POST("/suggest-tags-category", svc.AIService.SuggestTagsAndCategory)
			aiGroup.POST("/suggest-comment-reply", svc.AIService.SuggestCommentReply)
			aiGroup.POST("/batch-generate", svc.AIService.BatchGenerate)
			aiGroup.GET("/providers", svc.MultiAIService.GetProviders)
			aiGroup.POST("/stream", svc.MultiAIService.Stream)
			aiGroup.GET("/models", svc.AIService.ListModels)
			aiGroup.POST("/image/generate", svc.ImageService.GenerateImage)
			aiGroup.POST("/image/enhance-prompt", svc.ImageService.EnhancePrompt)
			aiGroup.POST("/seo/analyze", svc.SEOService.AnalyzeSEO)
			aiGroup.POST("/seo/meta-tags", svc.SEOService.GenerateMetaTags)
			aiGroup.POST("/grammar/check", svc.GrammarService.CheckGrammar)
			aiGroup.POST("/grammar/spell", svc.GrammarService.CheckSpelling)
			aiGroup.POST("/moderation/check", svc.ModerationService.ModerateContent)
		}

		// 文章多语言版本管理
		authGroup.POST("/posts/:id/translations", svc.PostTranslationService.CreateTranslation)
		authGroup.POST("/posts/:id/translations/auto", svc.PostTranslationService.AutoTranslate)
		authGroup.PUT("/translations/:id", svc.PostTranslationService.UpdateTranslation)
		authGroup.DELETE("/translations/:id", svc.PostTranslationService.DeleteTranslation)

		// 分析统计 - 需要认证
		authGroup.POST("/analytics/behavior", svc.AnalyticsService.RecordReadingBehavior)

		// SEO工具 - 需要认证
		authGroup.POST("/seo/analyze", svc.SEOMetadataService.AnalyzeSEOMetadata)

		// 社交分享（管理接口保留）
		authGroup.POST("/social/share-url", svc.SocialShareService.GenerateShareURL)
	}
}

// registerAdminRoutes 注册管理员路由
func registerAdminRoutes(api *gin.RouterGroup, svc *bootstrap.Services) {
	adminGroup := api.Group("/admin")
	adminGroup.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware())
	{
		// 用户管理
		adminGroup.GET("/users", svc.UserService.GetAllUsers)
		adminGroup.PUT("/users/:id/role", svc.UserService.UpdateUserRole)
		adminGroup.PUT("/users/:id/status", svc.UserService.UpdateUserStatus)
		adminGroup.DELETE("/users/:id", svc.UserService.DeleteUser)

		// 分类管理
		adminGroup.POST("/categories", svc.CategoryService.CreateCategory)
		adminGroup.PUT("/categories/:id", svc.CategoryService.UpdateCategory)
		adminGroup.DELETE("/categories/:id", svc.CategoryService.DeleteCategory)

		// 标签管理
		adminGroup.POST("/tags", svc.TagService.CreateTag)
		adminGroup.PUT("/tags/:id", svc.TagService.UpdateTag)
		adminGroup.DELETE("/tags/:id", svc.TagService.DeleteTag)

		// 评论管理
		adminGroup.GET("/comments", svc.CommentService.GetAllComments)
		adminGroup.PUT("/comments/:id/status", svc.CommentService.UpdateCommentStatus)

		// 访问统计
		adminGroup.GET("/stats/visits", svc.StatService.GetVisitStats)
		adminGroup.GET("/dashboard/stats", svc.StatService.GetDashboardStats)

		// 页面管理
		adminGroup.POST("/pages", svc.PageService.CreatePage)
		adminGroup.PUT("/pages/:id", svc.PageService.UpdatePage)
		adminGroup.DELETE("/pages/:id", svc.PageService.DeletePage)

		// 友链管理
		adminGroup.GET("/links", svc.FriendLinkService.GetAllFriendLinksAdmin)
		adminGroup.POST("/links", svc.FriendLinkService.CreateFriendLink)
		adminGroup.PUT("/links/:id", svc.FriendLinkService.UpdateFriendLink)
		adminGroup.DELETE("/links/:id", svc.FriendLinkService.DeleteFriendLink)

		// 语言包管理（/export、/import 须在 /:lang 前注册，避免被 :lang 匹配）
		adminGroup.GET("/locales", svc.LocaleService.GetAllLocales)
		adminGroup.GET("/locales/export", svc.LocaleService.ExportLocales)
		adminGroup.POST("/locales/import", svc.LocaleService.ImportLocales)
		adminGroup.GET("/locales/:lang", svc.LocaleService.GetLocale)
		adminGroup.POST("/locales", svc.LocaleService.CreateLocale)
		adminGroup.PUT("/locales/:lang", svc.LocaleService.UpdateLocale)
		adminGroup.DELETE("/locales/:lang", svc.LocaleService.DeleteLocale)

		// 系统配置管理
		adminGroup.GET("/system/configs", svc.SystemService.GetAllConfigs)
		adminGroup.PUT("/system/configs/:key", svc.SystemService.UpdateConfig)
		adminGroup.POST("/system/configs/batch", svc.SystemService.BatchUpdateConfigs)

		// 敏感词管理
		adminGroup.GET("/sensitive-words", svc.SystemService.GetSensitiveWords)
		adminGroup.POST("/sensitive-words", svc.SystemService.CreateSensitiveWord)
		adminGroup.DELETE("/sensitive-words/:id", svc.SystemService.DeleteSensitiveWord)

		// IP黑名单管理
		adminGroup.GET("/ip-blacklist", svc.SystemService.GetIPBlacklist)
		adminGroup.POST("/ip-blacklist", svc.SystemService.AddToIPBlacklist)
		adminGroup.DELETE("/ip-blacklist/:id", svc.SystemService.RemoveFromIPBlacklist)

		// 订阅者管理
		adminGroup.GET("/subscribers", svc.SystemService.GetSubscribers)

		// 批量操作
		adminGroup.POST("/posts/batch/delete", svc.SystemService.BatchDeletePosts)
		adminGroup.POST("/posts/batch/status", svc.SystemService.BatchUpdatePostStatus)
		adminGroup.POST("/posts/batch/move", svc.SystemService.BatchMoveCategory)
		adminGroup.POST("/comments/batch/delete", svc.SystemService.BatchDeleteComments)
		adminGroup.POST("/comments/batch/approve", svc.SystemService.BatchApproveComments)

		// 数据导出
		adminGroup.GET("/export/:type", svc.SystemService.ExportData)

		// 定时发布管理
		adminGroup.GET("/scheduled-posts", svc.SchedulerService.GetScheduledPosts)
		adminGroup.POST("/posts/:id/schedule", handleSchedulePost(svc))
		adminGroup.DELETE("/posts/:id/schedule", handleCancelSchedule(svc))

		// 文章导入导出
		adminGroup.POST("/posts/import", svc.ImportService.ImportPosts)
		adminGroup.GET("/posts/export", svc.ImportService.ExportPosts)

		// 数据备份
		adminGroup.POST("/backups", svc.BackupService.CreateBackup)
		adminGroup.GET("/backups", svc.BackupService.ListBackups)
		adminGroup.GET("/backups/:filename", svc.BackupService.DownloadBackup)
		adminGroup.DELETE("/backups/:filename", svc.BackupService.DeleteBackup)
		adminGroup.POST("/backups/:filename/restore", svc.BackupService.RestoreBackup)

		// 友链申请管理
		adminGroup.GET("/friend-link-applies", svc.FriendLinkApplyService.GetApplies)
		adminGroup.PUT("/friend-link-applies/:id", svc.FriendLinkApplyService.HandleApply)
		adminGroup.DELETE("/friend-link-applies/:id", svc.FriendLinkApplyService.DeleteApply)

		// 水印配置
		adminGroup.GET("/watermark", svc.WatermarkService.GetWatermarkConfig)
		adminGroup.PUT("/watermark", svc.WatermarkService.UpdateWatermarkConfig)
		adminGroup.POST("/upload/watermark", svc.WatermarkService.UploadWithWatermark)

		// 打赏配置
		adminGroup.GET("/donation/config", svc.DonationService.GetDonationConfig)
		adminGroup.PUT("/donation/config", svc.DonationService.UpdateDonationConfig)

		// 文章合集管理
		adminGroup.GET("/series", svc.SeriesService.GetSeriesList)
		adminGroup.GET("/series/:id", svc.SeriesService.GetSeriesByID)
		adminGroup.POST("/series", svc.SeriesService.CreateSeries)
		adminGroup.PUT("/series/:id", svc.SeriesService.UpdateSeries)
		adminGroup.DELETE("/series/:id", svc.SeriesService.DeleteSeries)
		adminGroup.POST("/series/:id/posts", svc.SeriesService.AddPostToSeries)
		adminGroup.DELETE("/series/:id/posts/:post_id", svc.SeriesService.RemovePostFromSeries)
		adminGroup.PUT("/series/:id/reorder", svc.SeriesService.ReorderSeriesPosts)

		// 文章模板管理
		adminGroup.POST("/templates", svc.TemplateService.CreateTemplate)
		adminGroup.PUT("/templates/:id", svc.TemplateService.UpdateTemplate)
		adminGroup.DELETE("/templates/:id", svc.TemplateService.DeleteTemplate)

		// 公告管理
		adminGroup.POST("/announcements", svc.AnnouncementService.CreateAnnouncement)
		adminGroup.PUT("/announcements/:id", svc.AnnouncementService.UpdateAnnouncement)
		adminGroup.DELETE("/announcements/:id", svc.AnnouncementService.DeleteAnnouncement)

		// 资源/书单管理
		adminGroup.POST("/resources", svc.ResourceService.CreateResource)
		adminGroup.PUT("/resources/:id", svc.ResourceService.UpdateResource)
		adminGroup.DELETE("/resources/:id", svc.ResourceService.DeleteResource)

		// 更新日志管理
		adminGroup.GET("/changelogs", svc.ChangelogService.GetChangelogs)
		adminGroup.POST("/changelogs", svc.ChangelogService.CreateChangelog)
		adminGroup.PUT("/changelogs/:id", svc.ChangelogService.UpdateChangelog)
		adminGroup.DELETE("/changelogs/:id", svc.ChangelogService.DeleteChangelog)

		// 里程碑管理
		adminGroup.POST("/milestones", svc.MilestoneService.CreateMilestone)
		adminGroup.PUT("/milestones/:id", svc.MilestoneService.UpdateMilestone)
		adminGroup.DELETE("/milestones/:id", svc.MilestoneService.DeleteMilestone)

		// 分析统计管理
		adminGroup.GET("/analytics/stats", svc.AnalyticsService.GetAnalyticsStats)

		// 死链检测
		adminGroup.POST("/dead-links/check", svc.DeadLinkService.CheckDeadLinks)
		adminGroup.GET("/dead-links", svc.DeadLinkService.GetDeadLinks)
		adminGroup.PUT("/dead-links/:id/fix", svc.DeadLinkService.FixDeadLink)

		// 社交分享管理
		adminGroup.GET("/social/configs", svc.SocialShareService.GetShareConfigs)
		adminGroup.PUT("/social/configs/:id", svc.SocialShareService.UpdateShareConfig)
		adminGroup.GET("/social/history", svc.SocialShareService.GetShareHistory)

		// 广告位管理
		adminGroup.GET("/ads/placements", svc.AdService.GetPlacements)
		adminGroup.POST("/ads/placements", svc.AdService.CreatePlacement)
		adminGroup.PUT("/ads/placements/:id", svc.AdService.UpdatePlacement)
		adminGroup.DELETE("/ads/placements/:id", svc.AdService.DeletePlacement)
		adminGroup.GET("/ads", svc.AdService.GetAds)
		adminGroup.GET("/ads/:id", svc.AdService.GetAd)
		adminGroup.POST("/ads", svc.AdService.CreateAd)
		adminGroup.PUT("/ads/:id", svc.AdService.UpdateAd)
		adminGroup.DELETE("/ads/:id", svc.AdService.DeleteAd)
		adminGroup.GET("/ads/stats", svc.AdService.GetAdStats)
		adminGroup.GET("/ads/clicks", svc.AdService.GetAdClickHistory)

		// 短代码管理
		adminGroup.GET("/shortcodes", svc.ShortcodeService.GetShortcodes)
		adminGroup.POST("/shortcodes/parse", svc.ShortcodeService.ParseContent)
		adminGroup.POST("/shortcodes/preview", svc.ShortcodeService.PreviewShortcode)
		adminGroup.POST("/shortcodes/custom", svc.ShortcodeService.RegisterCustomShortcode)
		adminGroup.GET("/shortcodes/export", svc.ShortcodeService.ExportShortcodes)

		// 自动内链管理
		adminGroup.GET("/auto-links/config", svc.AutoLinkService.GetConfigAPI)
		adminGroup.PUT("/auto-links/config", svc.AutoLinkService.UpdateConfig)
		adminGroup.GET("/auto-links/keywords", svc.AutoLinkService.GetKeywords)
		adminGroup.POST("/auto-links/keywords", svc.AutoLinkService.CreateKeyword)
		adminGroup.PUT("/auto-links/keywords/:id", svc.AutoLinkService.UpdateKeyword)
		adminGroup.DELETE("/auto-links/keywords/:id", svc.AutoLinkService.DeleteKeyword)
		adminGroup.POST("/auto-links/keywords/batch", svc.AutoLinkService.BatchImportKeywords)
		adminGroup.POST("/auto-links/preview", svc.AutoLinkService.Preview)
		adminGroup.GET("/auto-links/stats", svc.AutoLinkService.GetStats)
		adminGroup.GET("/auto-links/suggest", svc.AutoLinkService.SuggestKeywords)
		adminGroup.GET("/auto-links/export", svc.AutoLinkService.ExportKeywords)

		// 导航菜单管理
		adminGroup.GET("/nav-menus", svc.NavMenuService.GetAllMenus)
		adminGroup.POST("/nav-menus", svc.NavMenuService.CreateMenu)
		adminGroup.PUT("/nav-menus/:id", svc.NavMenuService.UpdateMenu)
		adminGroup.DELETE("/nav-menus/:id", svc.NavMenuService.DeleteMenu)
		adminGroup.POST("/nav-menus/sort", svc.NavMenuService.SortMenus)

		// 文章管理（后台列表，支持草稿/过滤）
		adminGroup.GET("/posts", svc.PostService.GetAdminPosts)
	}
}

// handleSchedulePost 处理定时发布
func handleSchedulePost(svc *bootstrap.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		postID := c.Param("id")
		var req struct {
			PublishAt time.Time `json:"publish_at" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		var postIDUint uint
		if _, err := fmt.Sscanf(postID, "%d", &postIDUint); err != nil {
			c.JSON(400, gin.H{"error": "无效的文章ID"})
			return
		}
		if err := svc.SchedulerService.SchedulePost(postIDUint, req.PublishAt); err != nil {
			logger.Error("调度发布失败", zap.Error(err))
			c.JSON(500, gin.H{"error": "调度失败"})
			return
		}
		c.JSON(200, gin.H{"message": "已设置定时发布"})
	}
}

// handleCancelSchedule 处理取消定时发布
func handleCancelSchedule(svc *bootstrap.Services) gin.HandlerFunc {
	return func(c *gin.Context) {
		postID := c.Param("id")
		var postIDUint uint
		if _, err := fmt.Sscanf(postID, "%d", &postIDUint); err != nil {
			c.JSON(400, gin.H{"error": "无效的文章ID"})
			return
		}
		if err := svc.SchedulerService.CancelSchedule(postIDUint); err != nil {
			logger.Error("取消调度失败", zap.Error(err))
			c.JSON(500, gin.H{"error": "取消失败"})
			return
		}
		c.JSON(200, gin.H{"message": "已取消定时发布"})
	}
}
