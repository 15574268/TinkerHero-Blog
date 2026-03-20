package services

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type CategoryService struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewCategoryService(db *gorm.DB, rdb *redis.Client) *CategoryService {
	return &CategoryService{db: db, rdb: rdb}
}

// GetAllCategories 获取所有分类
func (s *CategoryService) GetAllCategories(c *gin.Context) {
	ctx := context.Background()
	cacheKey := "categories:all"

	// 尝试从缓存获取
	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Data(200, "application/json", []byte(cached))
		return
	}

	var categories []models.Category
	if err := s.db.Order("sort_order asc, created_at asc").Find(&categories).Error; err != nil {
		logger.Error("获取分类失败", zap.Error(err))
		utils.InternalError(c, "获取分类失败")
		return
	}

	// 构建树形结构
	categoryTree := s.buildTree(categories, nil)

	// 写入缓存（30分钟）- 缓存完整的 API 响应格式
	wrapped := utils.APIResponse{Success: true, Data: categoryTree}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 30*time.Minute)
	}

	utils.Success(c, categoryTree)
}

func (s *CategoryService) buildTree(categories []models.Category, parentID *uint) []models.Category {
	var tree []models.Category
	for _, cat := range categories {
		if (parentID == nil && cat.ParentID == nil) || (parentID != nil && cat.ParentID != nil && *cat.ParentID == *parentID) {
			cat.Children = s.buildTree(categories, &cat.ID)
			tree = append(tree, cat)
		}
	}
	return tree
}

// CreateCategory 创建分类
func (s *CategoryService) CreateCategory(c *gin.Context) {
	var req models.CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 验证 slug 唯一性
	var existingCategory models.Category
	if err := s.db.Where("slug = ?", req.Slug).First(&existingCategory).Error; err == nil {
		utils.BadRequest(c, "URL别名已存在")
		return
	}

	// 验证父分类是否存在
	if req.ParentID != nil {
		var parent models.Category
		if err := s.db.First(&parent, *req.ParentID).Error; err != nil {
			utils.BadRequest(c, "父分类不存在")
			return
		}
	}

	category := models.Category{
		Name:        req.Name,
		Slug:        req.Slug,
		Description: req.Description,
		ParentID:    req.ParentID,
		SortOrder:   req.SortOrder,
	}

	if err := s.db.Create(&category).Error; err != nil {
		logger.Error("创建分类失败", zap.String("slug", req.Slug), zap.Error(err))
		utils.InternalError(c, "创建分类失败")
		return
	}

	// 清除缓存
	s.rdb.Del(context.Background(), "categories:all")

	utils.Created(c, category)
}

// UpdateCategory 更新分类
func (s *CategoryService) UpdateCategory(c *gin.Context) {
	id := c.Param("id")

	var category models.Category
	if err := s.db.First(&category, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "分类不存在")
		return
	}

	var req models.CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var existingCount int64
	s.db.Model(&models.Category{}).Where("slug = ? AND id != ?", req.Slug, category.ID).Count(&existingCount)
	if existingCount > 0 {
		utils.BadRequest(c, "分类别名已存在")
		return
	}

	updates := map[string]any{
		"name":        req.Name,
		"slug":        req.Slug,
		"description": req.Description,
		"parent_id":   req.ParentID,
		"sort_order":  req.SortOrder,
	}

	if err := s.db.Model(&category).Updates(updates).Error; err != nil {
		logger.Error("更新分类失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新分类失败")
		return
	}

	s.db.First(&category, category.ID)

	s.rdb.Del(context.Background(), "categories:all")

	utils.Success(c, category)
}

// DeleteCategory 删除分类
func (s *CategoryService) DeleteCategory(c *gin.Context) {
	id := c.Param("id")

	// 检查是否有子分类
	var count int64
	s.db.Model(&models.Category{}).Where("parent_id = ?", id).Count(&count)
	if count > 0 {
		utils.BadRequest(c, "该分类下还有子分类，无法删除")
		return
	}

	// 检查是否有文章
	s.db.Model(&models.Post{}).Where("category_id = ?", id).Count(&count)
	if count > 0 {
		utils.BadRequest(c, "该分类下还有文章，无法删除")
		return
	}

	if err := s.db.Delete(&models.Category{}, "id = ?", id).Error; err != nil {
		logger.Error("删除分类失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除分类失败")
		return
	}

	s.rdb.Del(context.Background(), "categories:all")

	utils.NoContent(c)
}

// TagService 标签服务
type TagService struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewTagService(db *gorm.DB, rdb *redis.Client) *TagService {
	return &TagService{db: db, rdb: rdb}
}

// GetAllTags 获取所有标签
func (s *TagService) GetAllTags(c *gin.Context) {
	ctx := context.Background()
	cacheKey := "tags:all"

	cached, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		c.Data(200, "application/json", []byte(cached))
		return
	}

	var tags []models.Tag
	if err := s.db.Order("name asc").Find(&tags).Error; err != nil {
		logger.Error("获取标签失败", zap.Error(err))
		utils.InternalError(c, "获取标签失败")
		return
	}

	// 写入缓存（30分钟）- 缓存完整的 API 响应格式
	wrapped := utils.APIResponse{Success: true, Data: tags}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, cacheKey, string(data), 30*time.Minute)
	}

	utils.Success(c, tags)
}

// CreateTag 创建标签
func (s *TagService) CreateTag(c *gin.Context) {
	var req models.CreateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 验证 slug 唯一性
	var existingTag models.Tag
	if err := s.db.Where("slug = ?", req.Slug).First(&existingTag).Error; err == nil {
		utils.BadRequest(c, "URL别名已存在")
		return
	}

	tag := models.Tag{
		Name: req.Name,
		Slug: req.Slug,
	}

	if err := s.db.Create(&tag).Error; err != nil {
		logger.Error("创建标签失败", zap.String("slug", req.Slug), zap.Error(err))
		utils.InternalError(c, "创建标签失败")
		return
	}

	s.rdb.Del(context.Background(), "tags:all")

	utils.Created(c, tag)
}

// DeleteTag 删除标签
func (s *TagService) DeleteTag(c *gin.Context) {
	id := c.Param("id")

	// 检查是否有关联文章
	var count int64
	s.db.Table("post_tags").Where("tag_id = ?", id).Count(&count)
	if count > 0 {
		utils.BadRequest(c, "该标签下还有文章，无法删除")
		return
	}

	if err := s.db.Delete(&models.Tag{}, "id = ?", id).Error; err != nil {
		logger.Error("删除标签失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除标签失败")
		return
	}

	s.rdb.Del(context.Background(), "tags:all")

	utils.NoContent(c)
}

// UpdateTag 更新标签
func (s *TagService) UpdateTag(c *gin.Context) {
	id := c.Param("id")

	var tag models.Tag
	if err := s.db.First(&tag, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "标签不存在")
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
		Slug string `json:"slug" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查 slug 是否已被其他标签使用
	var existingTag models.Tag
	if err := s.db.Where("slug = ? AND id != ?", req.Slug, id).First(&existingTag).Error; err == nil {
		utils.BadRequest(c, "URL别名已存在")
		return
	}

	updates := map[string]any{
		"name": req.Name,
		"slug": req.Slug,
	}

	if err := s.db.Model(&tag).Updates(updates).Error; err != nil {
		logger.Error("更新标签失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新标签失败")
		return
	}

	s.rdb.Del(context.Background(), "tags:all")

	s.db.First(&tag, "id = ?", tag.ID)
	utils.Success(c, tag)
}
