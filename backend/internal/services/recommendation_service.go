package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type RecommendationService struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewRecommendationService(db *gorm.DB, rdb *redis.Client) *RecommendationService {
	return &RecommendationService{db: db, rdb: rdb}
}

// GetRelatedPosts 获取相关文章推荐
func (s *RecommendationService) GetRelatedPosts(c *gin.Context) {
	postID := c.Param("id")
	limit := 5
	if l := c.Query("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}

	ctx := context.Background()
	cacheKey := "related_posts:" + postID

	// 尝试从缓存获取
	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Data(200, "application/json", []byte(cached))
		return
	}

	// 获取当前文章（预加载 Tags 避免 N+1 查询）
	var currentPost models.Post
	if err := s.db.Preload("Tags").First(&currentPost, "id = ?", postID).Error; err != nil {
		logger.Warn("文章不存在", zap.String("post_id", postID))
		utils.NotFound(c, "文章不存在")
		return
	}

	var relatedPosts []models.Post

	// 1. 同标签的文章
	if len(currentPost.Tags) > 0 {
		tagIDs := make([]uint, len(currentPost.Tags))
		for i, tag := range currentPost.Tags {
			tagIDs[i] = tag.ID
		}

		s.db.Joins("JOIN post_tags ON post_tags.post_id = posts.id").
			Where("post_tags.tag_id IN ? AND posts.id != ? AND posts.status = ?",
				tagIDs, postID, models.PostPublished).
			Group("posts.id").
			Order("COUNT(post_tags.tag_id) DESC, posts.view_count DESC").
			Limit(limit).
			Preload("Author").
			Preload("Category").
			Find(&relatedPosts)
	}

	// 2. 如果标签相关文章不足，补充同分类的文章
	if len(relatedPosts) < limit && currentPost.CategoryID != nil {
		var categoryPosts []models.Post
		s.db.Where("category_id = ? AND id != ? AND status = ?",
			currentPost.CategoryID, postID, models.PostPublished).
			Order("view_count desc").
			Limit(limit - len(relatedPosts)).
			Preload("Author").
			Preload("Category").
			Find(&categoryPosts)
		relatedPosts = append(relatedPosts, categoryPosts...)
	}

	// 3. 如果还不够，补充热门文章
	if len(relatedPosts) < limit {
		var hotPosts []models.Post
		excludeIDs := []uint{currentPost.ID}
		for _, p := range relatedPosts {
			excludeIDs = append(excludeIDs, p.ID)
		}

		s.db.Where("id NOT IN ? AND status = ?", excludeIDs, models.PostPublished).
			Order("view_count desc").
			Limit(limit - len(relatedPosts)).
			Preload("Author").
			Preload("Category").
			Find(&hotPosts)
		relatedPosts = append(relatedPosts, hotPosts...)
	}

	// 缓存结果（10分钟）
	if data, err := json.Marshal(relatedPosts); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 10*time.Minute)
	}

	utils.Success(c, relatedPosts)
}

// GetTrendingPosts 获取趋势文章
func (s *RecommendationService) GetTrendingPosts(c *gin.Context) {
	ctx := context.Background()
	cacheKey := "trending_posts"

	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Data(200, "application/json", []byte(cached))
		return
	}

	// 计算热度得分 = 浏览量* 1 + 点赞数* 5 + 评论数* 3
	var posts []models.Post
	s.db.Where("status = ? AND created_at > ?",
		models.PostPublished,
		time.Now().AddDate(0, 0, -30)). // 最近30天
		Order("(view_count + like_count * 5 + comment_count * 3) DESC").
		Limit(10).
		Preload("Author").
		Preload("Category").
		Find(&posts)

	if data, err := json.Marshal(posts); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 1*time.Hour)
	}

	utils.Success(c, posts)
}
