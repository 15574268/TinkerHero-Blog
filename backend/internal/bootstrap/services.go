package bootstrap

import (
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/services"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Services 所有服务的容器
type Services struct {
	UserService              *services.UserService
	PostService              *services.PostService
	CategoryService          *services.CategoryService
	TagService               *services.TagService
	CommentService           *services.CommentService
	UploadService            *services.UploadService
	StatService              *services.StatService
	NotificationService      *services.NotificationService
	PageService              *services.PageService
	FriendLinkService        *services.FriendLinkService
	ArchiveService           *services.ArchiveService
	RecommendationService    *services.RecommendationService
	SearchService            *services.SearchService
	AIService                *services.AIService
	MultiAIService           *services.MultiAIService
	ImageService             *services.ImageGenerationService
	SEOService               *services.SEOService
	GrammarService           *services.GrammarService
	ModerationService        *services.ContentModerationService
	PostTranslationService   *services.PostTranslationService
	LocaleService            *services.LocaleService
	OAuthService             *services.OAuthService
	SystemService            *services.SystemService
	CaptchaService           *services.CaptchaService
	VersionService           *services.VersionService
	SchedulerService         *services.SchedulerService
	ImportService            *services.ImportService
	BackupService            *services.BackupService
	PreviewService           *services.PreviewService
	FriendLinkApplyService   *services.FriendLinkApplyService
	DonationService          *services.DonationService
	WatermarkService         *services.WatermarkService
	SeriesService            *services.SeriesService
	TemplateService          *services.TemplateService
	AnnouncementService      *services.AnnouncementService
	ResourceService          *services.ResourceService
	ChangelogService         *services.ChangelogService
	MilestoneService         *services.MilestoneService
	AnalyticsService         *services.AnalyticsService
	DeadLinkService          *services.DeadLinkService
	SEOMetadataService       *services.SEOMetadataService
	ShortcodeService         *services.ShortcodeService
	AutoLinkService          *services.AutoLinkService
	SocialShareService       *services.SocialShareService
	AdService                *services.AdService
	NavMenuService           *services.NavMenuService
	OpenAPIService           *services.OpenAPIService
}

// InitServices 初始化所有服务
func InitServices(db *gorm.DB, rdb *redis.Client, cfg *Config) *Services {
	svc := &Services{}

	// 系统服务（最先创建，供其他服务读后台配置）
	svc.SystemService = services.NewSystemService(db, rdb)
	getConfig := svc.SystemService.GetConfig

	// 核心服务（上传、用户使用 getConfig 优先读后台配置）
	svc.UserService = services.NewUserService(db, rdb, getConfig)
	svc.PostService = services.NewPostService(db, rdb, getConfig)
	svc.CategoryService = services.NewCategoryService(db, rdb)
	svc.TagService = services.NewTagService(db, rdb)
	svc.OpenAPIService = services.NewOpenAPIService(db, rdb, svc.SystemService)
	svc.CommentService = nil // 稍后创建（依赖 SystemService、CaptchaService、NotificationService）
	svc.UploadService = services.NewUploadService(db, getConfig)
	svc.StatService = services.NewStatService(db, rdb)

	// 通知服务（优先读后台邮件配置）
	svc.NotificationService = services.NewNotificationServiceWithConfig(
		db, getConfig,
		cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPFrom,
	)

	// 基础服务
	svc.PageService = services.NewPageService(db)
	svc.FriendLinkService = services.NewFriendLinkService(db)
	svc.ArchiveService = services.NewArchiveService(db)
	svc.RecommendationService = services.NewRecommendationService(db, rdb)

	// AI服务（优先使用系统设置中的 openai_api_key / openai_base_url / openai_model）
	svc.AIService = services.NewAIServiceWithConfig(getConfig)
	svc.MultiAIService = services.NewMultiAIService(getConfig)
	svc.ImageService = services.NewImageGenerationService(getConfig)
	svc.SEOService = services.NewSEOService(svc.AIService)
	svc.GrammarService = services.NewGrammarService(svc.AIService)
	svc.ModerationService = services.NewContentModerationService(svc.AIService)
	svc.PostTranslationService = services.NewPostTranslationService(db, svc.AIService)

	// OAuth服务
	svc.OAuthService = services.NewOAuthService(
		db,
		cfg.GitHubClientID,
		cfg.GitHubClientSecret,
		cfg.GoogleClientID,
		cfg.GoogleClientSecret,
	)

	// 其余系统服务
	svc.LocaleService = services.NewLocaleService()
	svc.CaptchaService = services.NewCaptchaService()
	svc.CommentService = services.NewCommentService(db, getConfig, svc.SystemService, svc.CaptchaService, svc.NotificationService)

	// 自动内链服务（依赖系统配置读写）
	svc.AutoLinkService = services.NewAutoLinkService(db)
	// 自动内链配置持久化（读取/写入系统配置）
	svc.AutoLinkService.SetConfigAccess(getConfig, svc.SystemService.SetConfig)

	// 注入跨服务依赖（避免循环依赖，在所有服务初始化完成后统一设置）
	svc.SystemService.SetNotificationService(svc.NotificationService)
	svc.PostService.SetSystemService(svc.SystemService)
	svc.PostService.SetAutoLinkService(svc.AutoLinkService)
	svc.VersionService = services.NewVersionService(db)
	svc.SchedulerService = services.NewSchedulerService(db, rdb)
	svc.SchedulerService.SetSystemService(svc.SystemService)
	svc.ImportService = services.NewImportService(db)
	svc.BackupService = services.NewBackupService(db)
	svc.PreviewService = services.NewPreviewService(db)
	svc.FriendLinkApplyService = services.NewFriendLinkApplyService(db, svc.NotificationService)
	svc.DonationService = services.NewDonationService(db)

	// 水印服务（优先读后台配置）
	svc.WatermarkService = services.NewWatermarkService(db, services.WatermarkConfig{
		Enabled:  cfg.WatermarkEnabled,
		Text:     cfg.WatermarkText,
		Position: cfg.WatermarkPosition,
		Opacity:  128,
		FontSize: 24,
	}, getConfig, svc.SystemService.SetConfig)

	// 博客增强服务
	svc.SeriesService = services.NewSeriesService(db)
	svc.TemplateService = services.NewTemplateService(db)
	svc.AnnouncementService = services.NewAnnouncementService(db)
	svc.ResourceService = services.NewResourceService(db)
	svc.ChangelogService = services.NewChangelogService(db)
	svc.MilestoneService = services.NewMilestoneService(db)
	svc.AnalyticsService = services.NewAnalyticsService(db)
	svc.DeadLinkService = services.NewDeadLinkService(db)
	svc.SEOMetadataService = services.NewSEOMetadataService(db)
	svc.ShortcodeService = services.NewShortcodeService(db)

	// 社交和广告服务
	svc.SocialShareService = services.NewSocialShareService(db)
	svc.AdService = services.NewAdService(db)

	// 导航菜单服务
	svc.NavMenuService = services.NewNavMenuService(db, rdb)

	// 搜索服务（可选）
	svc.SearchService = nil // 将在外部初始化

	return svc
}

// InitSearchService 初始化搜索服务
func InitSearchService(db *gorm.DB, esURL, esUser, esPassword string) *services.SearchService {
	searchService, err := services.NewSearchService(db, esURL, esUser, esPassword)
	if err != nil {
		logger.Error("Elasticsearch connection failed", zap.Error(err))
		return nil
	}
	if err := searchService.InitIndex(); err != nil {
		logger.Error("Elasticsearch index init failed", zap.Error(err))
		return nil
	}
	return searchService
}
