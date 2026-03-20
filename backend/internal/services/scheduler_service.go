package services

import (
	"context"
	"fmt"
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

// SchedulerService 定时任务调度服务
type SchedulerService struct {
	db       *gorm.DB
	rdb      *redis.Client
	systemSvc *SystemService
	running  bool
	mu       sync.Mutex
	stopOnce sync.Once
	stopChan chan struct{}
}

// NewSchedulerService 创建调度服务
func NewSchedulerService(db *gorm.DB, rdb *redis.Client) *SchedulerService {
	return &SchedulerService{
		db:       db,
		rdb:      rdb,
		stopChan: make(chan struct{}),
	}
}

// SetSystemService 注入系统服务（用于定时发布后通知订阅者）
func (s *SchedulerService) SetSystemService(svc *SystemService) {
	s.systemSvc = svc
}

// Start 启动调度服务
func (s *SchedulerService) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return
	}
	s.running = true

	go s.runScheduledPublish()
	go s.runIPBlacklistCleanup()
	go s.runPreviewLinkCleanup()

	logger.Info("Scheduler service started")
}

// Stop 停止调度服务
func (s *SchedulerService) Stop() {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		s.running = false
		s.mu.Unlock()
		close(s.stopChan)
		logger.Info("Scheduler service stopped")
	})
}

// runScheduledPublish 定时发布检查（每分钟检查一次）
func (s *SchedulerService) runScheduledPublish() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.checkScheduledPosts()
		}
	}
}

// checkScheduledPosts 检查待发布的定时文章
func (s *SchedulerService) checkScheduledPosts() {
	ctx := context.Background()
	
	// 使用 Redis 分布式锁，避免多实例重复执行
	lockKey := "scheduler:publish:lock"
	locked, err := s.rdb.SetNX(ctx, lockKey, "1", 30*time.Second).Result()
	if err != nil || !locked {
		return
	}
	defer s.rdb.Del(ctx, lockKey)

	// 查找需要发布的文章
	var posts []models.Post
	now := time.Now()
	
	// 查询状态为 scheduled 且发布时间已到的文章
	if err := s.db.Where("status = ? AND published_at IS NOT NULL AND published_at <= ?", 
		"scheduled", now).Find(&posts).Error; err != nil {
		logger.Error("Failed to query scheduled posts", zap.Error(err))
		return
	}

	for _, post := range posts {
		// 只更新状态，保留原始的 published_at
		if err := s.db.Model(&post).Update("status", models.PostPublished).Error; err != nil {
			logger.Error("Failed to publish post", zap.Uint("post_id", post.ID), zap.Error(err))
			continue
		}

		logger.Info("Auto published post", zap.Uint("post_id", post.ID), zap.String("title", post.Title))

		// 定时发布同样通知订阅者
		// 捕获循环变量，避免异步时读取到错误的 post
		if s.systemSvc != nil {
			p := post
			go func() {
				if err := s.systemSvc.NotifySubscribers(&p); err != nil {
					logger.Warn("订阅者通知发送失败", zap.Uint("post_id", p.ID), zap.Error(err))
				}
			}()
		}

		// 清除缓存
		s.rdb.Del(ctx, fmt.Sprintf("post:%d", post.ID))
		s.invalidatePostsCache(ctx)
	}
}

// runIPBlacklistCleanup IP黑名单过期清理（每小时检查一次）
func (s *SchedulerService) runIPBlacklistCleanup() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.cleanupExpiredIPBlacklist()
		}
	}
}

// cleanupExpiredIPBlacklist 清理过期的IP黑名单
func (s *SchedulerService) cleanupExpiredIPBlacklist() {
	now := time.Now()
	
	result := s.db.Where("expired_at IS NOT NULL AND expired_at < ?", now).
		Delete(&models.IPBlacklist{})
	
	if result.RowsAffected > 0 {
		logger.Info("Cleaned up expired IP blacklist entries", zap.Int64("count", result.RowsAffected))
	}
}

// runPreviewLinkCleanup 草稿预览链接清理（每小时检查一次）
func (s *SchedulerService) runPreviewLinkCleanup() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.cleanupExpiredPreviewLinks()
		}
	}
}

// cleanupExpiredPreviewLinks 清理过期的预览链接
func (s *SchedulerService) cleanupExpiredPreviewLinks() {
	now := time.Now()
	
	result := s.db.Where("expired_at < ?", now).Delete(&models.PostPreview{})
	
	if result.RowsAffected > 0 {
		logger.Info("Cleaned up expired preview links", zap.Int64("count", result.RowsAffected))
	}
}

// invalidatePostsCache 使文章列表缓存失效
func (s *SchedulerService) invalidatePostsCache(ctx context.Context) {
	iter := s.rdb.Scan(ctx, 0, "posts:*", 0).Iterator()
	for iter.Next(ctx) {
		s.rdb.Del(ctx, iter.Val())
	}
}

// SchedulePost 调度文章发布
func (s *SchedulerService) SchedulePost(postID uint, publishAt time.Time) error {
	return s.db.Model(&models.Post{}).Where("id = ?", postID).Updates(map[string]any{
		"status":       "scheduled",
		"published_at": publishAt,
	}).Error
}

// CancelSchedule 取消定时发布
func (s *SchedulerService) CancelSchedule(postID uint) error {
	return s.db.Model(&models.Post{}).Where("id = ?", postID).Updates(map[string]any{
		"status":       models.PostDraft,
		"published_at": nil,
	}).Error
}

// GetScheduledPosts 获取待发布的定时文章
func (s *SchedulerService) GetScheduledPosts(c *gin.Context) {
	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	var posts []models.Post
	var total int64

	query := s.db.Model(&models.Post{}).Where("status = ?", "scheduled")
	query.Count(&total)

	query = query.Preload("Author").
		Preload("Category").
		Order("published_at asc").
		Offset(utils.GetOffset(page, pageSize)).
		Limit(pageSize)

	if err := query.Find(&posts).Error; err != nil {
		logger.Error("获取定时文章失败", zap.Error(err))
		utils.InternalError(c, "获取定时文章失败")
		return
	}

	utils.Paginated(c, posts, total, page, pageSize)
}
