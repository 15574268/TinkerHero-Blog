package services

import (
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"gorm.io/gorm"
)

type ArchiveService struct {
	db *gorm.DB
}

func NewArchiveService(db *gorm.DB) *ArchiveService {
	return &ArchiveService{db: db}
}

// ArchiveItem 归档项
type ArchiveItem struct {
	Year  int           `json:"year"`
	Month int           `json:"month"`
	Count int           `json:"count"`
	Posts []models.Post `json:"posts"`
}

// GetArchives 获取归档列表
func (s *ArchiveService) GetArchives(c *gin.Context) {
	var archives []ArchiveItem

	// 获取所有已发布文章，按年月分组
	var posts []models.Post
	s.db.Where("status = ?", models.PostPublished).
		Order("published_at desc").
		Preload("Author").
		Preload("Category").
		Preload("Tags").
		Find(&posts)

	// 按年月分组
	archiveMap := make(map[string][]models.Post)
	for _, post := range posts {
		if post.PublishedAt != nil {
			key := post.PublishedAt.Format("2006-01")
			archiveMap[key] = append(archiveMap[key], post)
		}
	}

	// 转换为列表
	for key, posts := range archiveMap {
		t, _ := time.Parse("2006-01", key)
		archives = append(archives, ArchiveItem{
			Year:  t.Year(),
			Month: int(t.Month()),
			Count: len(posts),
			Posts: posts,
		})
	}

	// 使用 sort.Slice 进行排序 O(n log n)
	sort.Slice(archives, func(i, j int) bool {
		if archives[i].Year != archives[j].Year {
			return archives[i].Year > archives[j].Year
		}
		return archives[i].Month > archives[j].Month
	})

	utils.Success(c, archives)
}

// GetArchivesByYear 按年份获取归档
func (s *ArchiveService) GetArchivesByYear(c *gin.Context) {
	year := c.Param("year")

	var posts []models.Post
	s.db.Where("status = ? AND EXTRACT(YEAR FROM published_at) = ?", models.PostPublished, year).
		Order("published_at desc").
		Preload("Author").
		Preload("Category").
		Preload("Tags").
		Find(&posts)

	utils.Success(c, gin.H{
		"year":  year,
		"posts": posts,
		"count": len(posts),
	})
}

// GetArchiveStats 获取归档统计
func (s *ArchiveService) GetArchiveStats(c *gin.Context) {
	var stats []struct {
		Year  int `json:"year"`
		Count int `json:"count"`
	}

	s.db.Table("posts").
		Select("EXTRACT(YEAR FROM published_at) as year, COUNT(*) as count").
		Where("status = ?", models.PostPublished).
		Where("published_at IS NOT NULL").
		Group("year").
		Order("year desc").
		Scan(&stats)

	utils.Success(c, stats)
}
