package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"gorm.io/gorm"
)

type StatService struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewStatService(db *gorm.DB, rdb *redis.Client) *StatService {
	return &StatService{db: db, rdb: rdb}
}

// GetDashboardStats 获取仪表盘统计（带缓存）
func (s *StatService) GetDashboardStats(c *gin.Context) {
	ctx := context.Background()
	cacheKey := "stats:dashboard"

	// 尝试从缓存获取
	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Header("X-Cache", "HIT")
		c.Data(200, "application/json", []byte(cached))
		return
	}

	var stats struct {
		TotalPosts     int64 `json:"total_posts"`
		PublishedPosts int64 `json:"published_posts"`
		DraftPosts     int64 `json:"draft_posts"`
		TotalUsers     int64 `json:"total_users"`
		TotalComments  int64 `json:"total_comments"`
		TotalViews     int64 `json:"total_views"`
		TodayViews     int64 `json:"today_views"`
	}

	// 使用单个查询获取文章统计
	s.db.Raw(`
		SELECT 
			COUNT(*) as total_posts,
			SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as published_posts,
			SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as draft_posts,
			COALESCE(SUM(view_count), 0) as total_views
		FROM posts
		WHERE deleted_at IS NULL
	`, models.PostPublished, models.PostDraft).Scan(&stats)

	// 用户统计
	s.db.Model(&models.User{}).Count(&stats.TotalUsers)

	// 评论统计
	s.db.Model(&models.Comment{}).Count(&stats.TotalComments)

	// 今日浏览量
	today := time.Now().Format("2006-01-02")
	s.db.Model(&models.VisitorLog{}).Where("DATE(created_at) = ?", today).Count(&stats.TodayViews)

	// 写入缓存（5分钟）- 缓存完整的 API 响应格式
	wrapped := utils.APIResponse{Success: true, Data: stats}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 5*time.Minute)
	}

	utils.Success(c, stats)
}

// GetPopularPosts 获取热门文章（带缓存）
func (s *StatService) GetPopularPosts(c *gin.Context) {
	ctx := context.Background()
	limit := 10
	if l := c.Query("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if limit > 100 {
		limit = 100
	}
	cacheKey := fmt.Sprintf("stats:popular:%d", limit)

	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Data(200, "application/json", []byte(cached))
		return
	}

	var posts []models.Post
	s.db.Where("status = ?", models.PostPublished).
		Order("view_count desc").
		Limit(limit).
		Find(&posts)

	wrapped := utils.APIResponse{Success: true, Data: posts}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 10*time.Minute)
	}

	utils.Success(c, posts)
}

// GetRecentPosts 获取最新文章（带缓存）
func (s *StatService) GetRecentPosts(c *gin.Context) {
	ctx := context.Background()
	limit := 10
	if l := c.Query("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if limit > 100 {
		limit = 100
	}
	cacheKey := fmt.Sprintf("stats:recent:%d", limit)

	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Data(200, "application/json", []byte(cached))
		return
	}

	var posts []models.Post
	s.db.Where("status = ?", models.PostPublished).
		Order("created_at desc").
		Limit(limit).
		Find(&posts)

	wrapped := utils.APIResponse{Success: true, Data: posts}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 5*time.Minute)
	}

	utils.Success(c, posts)
}

// GetPostStatsByCategory 按分类统计文章
func (s *StatService) GetPostStatsByCategory(c *gin.Context) {
	var stats []struct {
		CategoryName string `json:"category_name"`
		PostCount    int64  `json:"post_count"`
	}

	s.db.Table("categories").
		Select("categories.name as category_name, COUNT(posts.id) as post_count").
		Joins("LEFT JOIN posts ON posts.category_id = categories.id AND posts.status = ?", models.PostPublished).
		Group("categories.id").
		Order("post_count desc").
		Find(&stats)

	utils.Success(c, stats)
}

// GetPostStatsByMonth 按月份统计文章
func (s *StatService) GetPostStatsByMonth(c *gin.Context) {
	var stats []struct {
		Month     string `json:"month"`
		PostCount int64  `json:"post_count"`
	}

	s.db.Table("posts").
		Select("TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as post_count").
		Where("status = ? AND deleted_at IS NULL", models.PostPublished).
		Group("month").
		Order("month desc").
		Limit(12).
		Find(&stats)

	utils.Success(c, stats)
}

// RecordVisit 记录访问日志
func (s *StatService) RecordVisit(c *gin.Context) {
	postIDStr := c.Query("post_id")
	var postID *uint
	if postIDStr != "" {
		var id uint
		fmt.Sscanf(postIDStr, "%d", &id)
		postID = &id
	}

	log := models.VisitorLog{
		PostID:    postID,
		IPAddress: c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
		Referer:   c.GetHeader("Referer"),
		Path:      c.Request.URL.Path,
	}

	s.db.Create(&log)

	utils.Success(c, gin.H{"success": true})
}

// GetVisitStats 获取访问统计（按日汇总 PV，支持 days 参数）
func (s *StatService) GetVisitStats(c *gin.Context) {
	days := 7
	if d := c.Query("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	if days <= 0 || days > 365 {
		days = 7
	}

	var stats []struct {
		Date       string `json:"date"`
		VisitCount int64  `json:"visit_count"`
	}

	// 使用 Raw 兼容 PostgreSQL（(created_at)::date）与 MySQL（DATE(created_at)）
	since := time.Now().AddDate(0, 0, -days)
	switch s.db.Dialector.Name() {
	case "postgres":
		s.db.Raw(
			`SELECT (created_at)::date::text AS date, COUNT(*) AS visit_count
			 FROM visitor_logs WHERE created_at >= ?
			 GROUP BY (created_at)::date ORDER BY date ASC`,
			since,
		).Scan(&stats)
	default:
		s.db.Raw(
			`SELECT DATE(created_at) AS date, COUNT(*) AS visit_count
			 FROM visitor_logs WHERE created_at >= ?
			 GROUP BY DATE(created_at) ORDER BY date ASC`,
			since,
		).Scan(&stats)
	}

	utils.Success(c, stats)
}
