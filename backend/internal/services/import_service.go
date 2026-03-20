package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"mime/multipart"
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

// ImportService 文章导入服务
type ImportService struct {
	db *gorm.DB
}

// NewImportService 创建导入服务
func NewImportService(db *gorm.DB) *ImportService {
	return &ImportService{db: db}
}

// ImportRequest 导入请求
type ImportRequest struct {
	Files             []*multipart.FileHeader `form:"files" binding:"required"`
	CategoryID        *uint                   `form:"category_id"`
	DefaultStatus     string                  `form:"default_status"` // draft or published
	DetectFrontMatter bool                    `form:"detect_front_matter"`
}

// ImportResult 导入结果
type ImportResult struct {
	Success int            `json:"success"`
	Failed  int            `json:"failed"`
	Posts   []ImportedPost `json:"posts"`
	Errors  []ImportError  `json:"errors"`
}

// ImportedPost 导入的文章
type ImportedPost struct {
	Title  string `json:"title"`
	Slug   string `json:"slug"`
	Status string `json:"status"`
	PostID uint   `json:"post_id,omitempty"`
}

// ImportError 导入错误
type ImportError struct {
	Filename string `json:"filename"`
	Error    string `json:"error"`
}

// MarkdownFrontMatter Markdown 前置元数据
type MarkdownFrontMatter struct {
	Title      string   `yaml:"title" json:"title"`
	Slug       string   `yaml:"slug" json:"slug"`
	Date       string   `yaml:"date" json:"date"`
	Categories []string `yaml:"categories" json:"categories"`
	Tags       []string `yaml:"tags" json:"tags"`
	Draft      bool     `yaml:"draft" json:"draft"`
	Summary    string   `yaml:"summary" json:"summary"`
	CoverImage string   `yaml:"cover" json:"cover"`
}

// ImportPosts 批量导入文章
func (s *ImportService) ImportPosts(c *gin.Context) {
	userID := c.GetUint("user_id")

	form, err := c.MultipartForm()
	if err != nil {
		utils.BadRequest(c, "无效的表单数据")
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		utils.BadRequest(c, "请选择要导入的文件")
		return
	}

	categoryIDStr := c.PostForm("category_id")
	defaultStatus := c.PostForm("default_status")
	if defaultStatus == "" {
		defaultStatus = "draft"
	}

	var categoryID *uint
	if categoryIDStr != "" {
		var cid uint
		fmt.Sscanf(categoryIDStr, "%d", &cid)
		categoryID = &cid
	}

	result := ImportResult{}

	for _, file := range files {
		post, err := s.importFile(file, userID, categoryID, defaultStatus)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, ImportError{
				Filename: file.Filename,
				Error:    err.Error(),
			})
			continue
		}

		result.Success++
		result.Posts = append(result.Posts, ImportedPost{
			Title:  post.Title,
			Slug:   post.Slug,
			Status: string(post.Status),
			PostID: post.ID,
		})
	}

	logger.Info("批量导入文章完成", zap.Int("success", result.Success), zap.Int("failed", result.Failed))
	utils.Success(c, result)
}

// importFile 导入单个文件
func (s *ImportService) importFile(file *multipart.FileHeader, userID uint, categoryID *uint, defaultStatus string) (*models.Post, error) {
	dotIdx := strings.LastIndex(file.Filename, ".")
	if dotIdx < 0 {
		return nil, fmt.Errorf("文件缺少扩展名: %s", file.Filename)
	}
	ext := strings.ToLower(file.Filename[dotIdx:])

	f, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("无法打开文件")
	}
	defer f.Close()

	const maxImportSize = 10 << 20 // 10 MB
	content, err := io.ReadAll(io.LimitReader(f, maxImportSize+1))
	if err != nil {
		return nil, fmt.Errorf("读取文件失败")
	}
	if len(content) > maxImportSize {
		return nil, fmt.Errorf("文件过大，最大支持 10MB")
	}

	var title, slug, contentStr, summary string
	var tags []string
	status := models.PostStatus(defaultStatus)

	switch ext {
	case ".md", ".markdown":
		title, slug, contentStr, summary, tags, status = s.parseMarkdown(content, defaultStatus)
	case ".html", ".htm":
		title, slug, contentStr, summary = s.parseHTML(content)
	case ".json":
		title, slug, contentStr, summary, tags, status = s.parseJSON(content)
	default:
		return nil, fmt.Errorf("不支持的文件格式: %s", ext)
	}

	if title == "" {
		title = strings.TrimSuffix(file.Filename, ext)
	}

	if slug == "" {
		slug = s.generateSlug(title)
	}

	// 检查 slug 唯一性
	var existing models.Post
	if err := s.db.Where("slug = ?", slug).First(&existing).Error; err == nil {
		slug = fmt.Sprintf("%s-%d", slug, time.Now().Unix())
	}

	post := &models.Post{
		Title:      title,
		Slug:       slug,
		Content:    contentStr,
		Summary:    summary,
		AuthorID:   userID,
		CategoryID: categoryID,
		Status:     status,
	}

	if status == models.PostPublished {
		now := time.Now()
		post.PublishedAt = &now
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Create(post).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建文章失败: %v", err)
	}

	// 处理标签
	if len(tags) > 0 {
		for _, tagName := range tags {
			var tag models.Tag
			if err := tx.Where("name = ?", tagName).FirstOrCreate(&tag, models.Tag{
				Name: tagName,
				Slug: s.generateSlug(tagName),
			}).Error; err == nil {
				tx.Model(post).Association("Tags").Append(&tag)
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("提交事务失败")
	}

	return post, nil
}

// parseMarkdown 解析 Markdown 文件
func (s *ImportService) parseMarkdown(content []byte, defaultStatus string) (title, slug, contentStr, summary string, tags []string, status models.PostStatus) {
	str := string(content)
	status = models.PostStatus(defaultStatus)

	// 检测 YAML Front Matter
	if strings.HasPrefix(str, "---") {
		endIdx := strings.Index(str[4:], "---")
		if endIdx > 0 {
			frontMatter := str[4 : endIdx+4]
			contentStr = strings.TrimSpace(str[endIdx+7:])

			// 解析 YAML
			title = s.extractYAMLField(frontMatter, "title")
			slug = s.extractYAMLField(frontMatter, "slug")
			summary = s.extractYAMLField(frontMatter, "summary")

			dateStr := s.extractYAMLField(frontMatter, "date")
			if dateStr != "" && defaultStatus == "published" {
				// 解析日期设置发布时间
			}

			draftStr := s.extractYAMLField(frontMatter, "draft")
			if draftStr == "true" {
				status = models.PostDraft
			}

			// 解析标签
			tagsStr := s.extractYAMLField(frontMatter, "tags")
			if tagsStr != "" {
				tags = s.parseYAMLArray(tagsStr)
			}

			return
		}
	}

	// 没有 Front Matter，从内容提取标题
	contentStr = str
	lines := strings.Split(str, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if t, ok := strings.CutPrefix(line, "# "); ok {
			title = t
			break
		}
	}

	return
}

// parseHTML 解析 HTML 文件
func (s *ImportService) parseHTML(content []byte) (title, slug, contentStr, summary string) {
	str := string(content)

	// 提取 title 标签
	titleRegex := regexp.MustCompile(`<title[^>]*>([^<]+)</title>`)
	if matches := titleRegex.FindStringSubmatch(str); len(matches) > 1 {
		title = html.UnescapeString(matches[1])
	}

	// 提取 meta description
	descRegex := regexp.MustCompile(`<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']`)
	if matches := descRegex.FindStringSubmatch(str); len(matches) > 1 {
		summary = html.UnescapeString(matches[1])
	}

	// 提取 body 内容
	bodyRegex := regexp.MustCompile(`<body[^>]*>([\s\S]*)</body>`)
	if matches := bodyRegex.FindStringSubmatch(str); len(matches) > 1 {
		contentStr = matches[1]
	} else {
		contentStr = str
	}

	slug = s.generateSlug(title)

	return
}

// parseJSON 解析 JSON 文件
func (s *ImportService) parseJSON(content []byte) (title, slug, contentStr, summary string, tags []string, status models.PostStatus) {
	var data struct {
		Title   string   `json:"title"`
		Slug    string   `json:"slug"`
		Content string   `json:"content"`
		Summary string   `json:"summary"`
		Tags    []string `json:"tags"`
		Status  string   `json:"status"`
	}

	if err := json.Unmarshal(content, &data); err != nil {
		return
	}

	title = data.Title
	slug = data.Slug
	contentStr = data.Content
	summary = data.Summary
	tags = data.Tags
	validStatuses := map[string]bool{
		string(models.PostDraft):     true,
		string(models.PostPublished): true,
		string(models.PostScheduled): true,
	}
	if data.Status != "" && validStatuses[data.Status] {
		status = models.PostStatus(data.Status)
	} else {
		status = models.PostDraft
	}

	return
}

// extractYAMLField 从 YAML 字符串中提取字段值
func (s *ImportService) extractYAMLField(yaml, field string) string {
	// 简单的 YAML 解析，支持 "key: value" 和 "key: \"value\"" 格式
	regex := regexp.MustCompile(fmt.Sprintf(`%s:\s*["']?([^"'\n]+)["']?`, field))
	if matches := regex.FindStringSubmatch(yaml); len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	return ""
}

// parseYAMLArray 解析 YAML 数组
func (s *ImportService) parseYAMLArray(str string) []string {
	// 简单解析 [tag1, tag2] 格式
	str = strings.TrimSpace(str)
	if strings.HasPrefix(str, "[") && strings.HasSuffix(str, "]") {
		str = str[1 : len(str)-1]
		items := strings.Split(str, ",")
		result := make([]string, 0, len(items))
		for _, item := range items {
			item = strings.TrimSpace(strings.Trim(item, `"'`))
			if item != "" {
				result = append(result, item)
			}
		}
		return result
	}
	return nil
}

// generateSlug 生成 URL 别名
func (s *ImportService) generateSlug(title string) string {
	// 简单的 slug 生成
	slug := strings.ToLower(title)
	slug = regexp.MustCompile(`[^a-z0-9\u4e00-\u9fa5]+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")

	// 如果是中文标题，使用时间戳
	if len(slug) > 50 || regexp.MustCompile(`^[\u4e00-\u9fa5-]+$`).MatchString(slug) {
		slug = fmt.Sprintf("post-%d", time.Now().Unix())
	}

	return slug
}

// ExportPosts 导出文章
func (s *ImportService) ExportPosts(c *gin.Context) {
	format := c.DefaultQuery("format", "markdown")

	var posts []models.Post
	query := s.db.Model(&models.Post{}).
		Preload("Author").
		Preload("Category").
		Preload("Tags")

	// 支持筛选
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if categoryID := c.Query("category_id"); categoryID != "" {
		query = query.Where("category_id = ?", categoryID)
	}

	if err := query.Find(&posts).Error; err != nil {
		logger.Error("获取文章失败", zap.Error(err))
		utils.InternalError(c, "获取文章失败")
		return
	}

	switch format {
	case "json":
		s.exportAsJSON(c, posts)
	case "html":
		s.exportAsHTML(c, posts)
	default:
		s.exportAsMarkdown(c, posts)
	}
}

// exportAsMarkdown 导出为 Markdown
func (s *ImportService) exportAsMarkdown(c *gin.Context, posts []models.Post) {
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", "attachment; filename=posts-markdown.zip")

	// 简化版：返回 JSON 格式的 Markdown 列表
	var result []map[string]any
	for _, post := range posts {
		tags := make([]string, 0)
		for _, tag := range post.Tags {
			tags = append(tags, tag.Name)
		}

		frontMatter := fmt.Sprintf(`---
title: %q
slug: %q
date: %q
categories:
  - %q
tags:
%s
draft: %v
summary: %q
---

`, post.Title, post.Slug, post.CreatedAt.Format("2006-01-02"),
			post.Category.Name, "  - "+strings.Join(tags, "\n  - "),
			post.Status == models.PostDraft, post.Summary)

		result = append(result, map[string]any{
			"filename": post.Slug + ".md",
			"content":  frontMatter + post.Content,
		})
	}

	utils.Success(c, result)
}

// exportAsJSON 导出为 JSON
func (s *ImportService) exportAsJSON(c *gin.Context, posts []models.Post) {
	c.Header("Content-Disposition", "attachment; filename=posts.json")
	utils.Success(c, posts)
}

// exportAsHTML 导出为 HTML
func (s *ImportService) exportAsHTML(c *gin.Context, posts []models.Post) {
	c.Header("Content-Disposition", "attachment; filename=posts.html")

	var buffer bytes.Buffer
	buffer.WriteString("<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n<title>Exported Posts</title>\n</head>\n<body>\n")

	for _, post := range posts {
		buffer.WriteString(fmt.Sprintf("<article>\n<h1>%s</h1>\n", post.Title))
		buffer.WriteString(fmt.Sprintf("<time>%s</time>\n", post.CreatedAt.Format("2006-01-02")))
		buffer.WriteString(fmt.Sprintf("<div class=\"content\">\n%s\n</div>\n", post.Content))
		buffer.WriteString("</article>\n<hr/>\n")
	}

	buffer.WriteString("</body>\n</html>")
	c.Data(200, "text/html; charset=utf-8", buffer.Bytes())
}
