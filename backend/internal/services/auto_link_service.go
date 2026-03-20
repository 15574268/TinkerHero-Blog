package services

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// AutoLinkService 自动内链服务
type AutoLinkService struct {
	db         *gorm.DB
	keywords   []AutoLinkKeyword
	posts      []AutoLinkPost
	categories []AutoLinkCategory
	tags       []AutoLinkTag
	cacheMu    sync.RWMutex // 缓存读写锁，保护并发安全
	getConfig  func(key string) string
	setConfig  func(key, value string) error
}

// AutoLinkKeyword 自动内链关键词
type AutoLinkKeyword struct {
	ID       uint   `json:"id" gorm:"primaryKey"`
	Keyword  string `json:"keyword" gorm:"not null;size:100;uniqueIndex"`
	Link     string `json:"link" gorm:"not null;size:500"`
	Title    string `json:"title" gorm:"size:200"`
	Target   string `json:"target" gorm:"default:'_self';size:20"`
	Rel      string `json:"rel" gorm:"size:50"`
	Priority int    `json:"priority" gorm:"default:0"` // 优先级，高优先级先处理
	MaxCount int    `json:"max_count" gorm:"default:1"` // 每篇文章最多替换次数，0表示不限制
}

// AutoLinkPost 文章缓存
type AutoLinkPost struct {
	ID    uint
	Title string
	Slug  string
}

// AutoLinkCategory 分类缓存
type AutoLinkCategory struct {
	ID   uint
	Name string
	Slug string
}

// AutoLinkTag 标签缓存
type AutoLinkTag struct {
	ID   uint
	Name string
	Slug string
}

// AutoLinkConfig 自动内链配置
type AutoLinkConfig struct {
	Enabled           bool `json:"enabled"`
	LinkPosts         bool `json:"link_posts"`          // 自动链接文章标题
	LinkCategories    bool `json:"link_categories"`     // 自动链接分类名
	LinkTags          bool `json:"link_tags"`           // 自动链接标签名
	LinkKeywords      bool `json:"link_keywords"`       // 自动链接自定义关键词
	MaxLinksPerPost   int  `json:"max_links_per_post"`  // 每篇文章最大内链数
	MinKeywordLength  int  `json:"min_keyword_length"`  // 最小关键词长度
	ExcludeHeadings   bool `json:"exclude_headings"`    // 排除标题中的链接
	ExcludeCodeBlocks bool `json:"exclude_code_blocks"` // 排除代码块中的链接
	ExcludeLinks      bool `json:"exclude_links"`       // 排除已有链接
}

// NewAutoLinkService 创建自动内链服务
func NewAutoLinkService(db *gorm.DB) *AutoLinkService {
	if err := db.AutoMigrate(&AutoLinkKeyword{}); err != nil {
		logger.Error("auto_link_keywords 表迁移失败", zap.Error(err))
	}
	s := &AutoLinkService{
		db: db,
	}
	s.loadCache()
	return s
}

// SetConfigAccess 注入系统配置读写函数（用于持久化全局配置）
func (s *AutoLinkService) SetConfigAccess(get func(key string) string, set func(key, value string) error) {
	s.getConfig = get
	s.setConfig = set
}

const autoLinkConfigKey = "auto_link_config"

func defaultAutoLinkConfig() AutoLinkConfig {
	return AutoLinkConfig{
		Enabled:           true,
		LinkPosts:         true,
		LinkCategories:    true,
		LinkTags:          true,
		LinkKeywords:      true,
		MaxLinksPerPost:   5,
		MinKeywordLength:  2,
		ExcludeHeadings:   true,
		ExcludeCodeBlocks: true,
		ExcludeLinks:      true,
	}
}

// GetConfig 返回持久化的自动内链配置（不存在则返回默认配置）
func (s *AutoLinkService) GetConfig() AutoLinkConfig {
	if s.getConfig == nil {
		return defaultAutoLinkConfig()
	}
	raw := strings.TrimSpace(s.getConfig(autoLinkConfigKey))
	if raw == "" {
		return defaultAutoLinkConfig()
	}
	var cfg AutoLinkConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return defaultAutoLinkConfig()
	}
	return cfg
}

// UpdateConfig 更新并持久化自动内链配置
func (s *AutoLinkService) UpdateConfig(c *gin.Context) {
	if s.setConfig == nil {
		utils.InternalError(c, "配置服务未初始化")
		return
	}
	var req AutoLinkConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	data, err := json.Marshal(req)
	if err != nil {
		utils.BadRequest(c, "JSON格式错误")
		return
	}
	if err := s.setConfig(autoLinkConfigKey, string(data)); err != nil {
		logger.Error("保存自动内链配置失败", zap.Error(err))
		utils.InternalError(c, "保存失败")
		return
	}
	utils.Success(c, req)
}

// GetConfigAPI 获取自动内链配置（管理端）
func (s *AutoLinkService) GetConfigAPI(c *gin.Context) {
	utils.Success(c, s.GetConfig())
}

// loadCache 加载缓存数据
func (s *AutoLinkService) loadCache() {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()

	// 加载文章
	s.db.Model(&models.Post{}).Select("id, title, slug").Find(&s.posts)

	// 加载分类
	s.db.Model(&models.Category{}).Select("id, name, slug").Find(&s.categories)

	// 加载标签
	s.db.Model(&models.Tag{}).Select("id, name, slug").Find(&s.tags)

	// 加载自定义关键词
	s.db.Order("priority desc, keyword").Find(&s.keywords)
}

// RefreshCache 刷新缓存
func (s *AutoLinkService) RefreshCache() {
	s.loadCache()
}

// getCacheData 安全获取缓存数据
func (s *AutoLinkService) getCacheData() ([]AutoLinkKeyword, []AutoLinkPost, []AutoLinkCategory, []AutoLinkTag) {
	s.cacheMu.RLock()
	defer s.cacheMu.RUnlock()

	// 返回副本以避免外部修改
	keywords := make([]AutoLinkKeyword, len(s.keywords))
	copy(keywords, s.keywords)

	posts := make([]AutoLinkPost, len(s.posts))
	copy(posts, s.posts)

	categories := make([]AutoLinkCategory, len(s.categories))
	copy(categories, s.categories)

	tags := make([]AutoLinkTag, len(s.tags))
	copy(tags, s.tags)

	return keywords, posts, categories, tags
}

// ProcessContent 处理内容，添加自动内链
func (s *AutoLinkService) ProcessContent(content string, config AutoLinkConfig, currentPostID uint) string {
	if !config.Enabled {
		return content
	}

	// 安全获取缓存数据
	keywords, posts, categories, tags := s.getCacheData()

	// 保护特殊区域
	protected := s.protectSpecialAreas(content, config)

	// 按优先级处理链接
	linkCount := 0
	usedKeywords := make(map[string]int) // 记录每个关键词的使用次数

	// 1. 先处理自定义关键词（优先级最高）
	if config.LinkKeywords {
		for i := range keywords {
			if linkCount >= config.MaxLinksPerPost && config.MaxLinksPerPost > 0 {
				break
			}

			keyword := &keywords[i]
			if len(keyword.Keyword) < config.MinKeywordLength {
				continue
			}

			count := usedKeywords[keyword.Keyword]
			if keyword.MaxCount > 0 && count >= keyword.MaxCount {
				continue
			}

			protected.content = s.addLink(protected.content, keyword.Keyword, keyword.Link, keyword.Title, keyword.Target, keyword.Rel, &linkCount, config.MaxLinksPerPost)
			usedKeywords[keyword.Keyword]++
		}
	}

	// 2. 处理文章标题链接
	if config.LinkPosts {
		for _, post := range posts {
			if linkCount >= config.MaxLinksPerPost && config.MaxLinksPerPost > 0 {
				break
			}
			if post.ID == currentPostID {
				continue // 不链接自己
			}
			if len(post.Title) < config.MinKeywordLength {
				continue
			}

			link := "/posts/" + post.Slug
			protected.content = s.addLink(protected.content, post.Title, link, post.Title, "_self", "", &linkCount, config.MaxLinksPerPost)
		}
	}

	// 3. 处理分类链接
	if config.LinkCategories {
		for _, cat := range categories {
			if linkCount >= config.MaxLinksPerPost && config.MaxLinksPerPost > 0 {
				break
			}
			if len(cat.Name) < config.MinKeywordLength {
				continue
			}

			link := "/categories/" + cat.Slug
			protected.content = s.addLink(protected.content, cat.Name, link, cat.Name, "_self", "", &linkCount, config.MaxLinksPerPost)
		}
	}

	// 4. 处理标签链接
	if config.LinkTags {
		for _, tag := range tags {
			if linkCount >= config.MaxLinksPerPost && config.MaxLinksPerPost > 0 {
				break
			}
			if len(tag.Name) < config.MinKeywordLength {
				continue
			}

			link := "/tags/" + tag.Slug
			protected.content = s.addLink(protected.content, tag.Name, link, tag.Name, "_self", "nofollow", &linkCount, config.MaxLinksPerPost)
		}
	}

	// 恢复特殊区域
	return s.restoreSpecialAreas(protected)
}

// protectedContent 保护的内容结构
type protectedContent struct {
	content    string
	codeBlocks []string
	links      []string
	headings   []string
	shortcodes []string
}

// protectSpecialAreas 保护特殊区域
func (s *AutoLinkService) protectSpecialAreas(content string, config AutoLinkConfig) *protectedContent {
	p := &protectedContent{
		content: content,
	}

	if config.ExcludeCodeBlocks {
		var fencedBlocks []string
		p.content, fencedBlocks = s.protectPattern(p.content, "```", "```", "___CODE_BLOCK_%d___")
		var inlineBlocks []string
		p.content, inlineBlocks = s.protectPattern(p.content, "`", "`", "___INLINE_CODE_%d___")
		p.codeBlocks = append(fencedBlocks, inlineBlocks...)
	}

	// 保护已有链接
	if config.ExcludeLinks {
		linkPattern := regexp.MustCompile(`<a\s[^>]*>.*?<\/a>`)
		p.links = make([]string, 0)
		matches := linkPattern.FindAllString(p.content, -1)
		for i, match := range matches {
			placeholder := s.formatPlaceholder("___LINK_%d___", i)
			p.content = strings.Replace(p.content, match, placeholder, 1)
			p.links = append(p.links, match)
		}
	}

	// 保护标题
	if config.ExcludeHeadings {
		headingPattern := regexp.MustCompile(`<h[1-6][^>]*>.*?<\/h[1-6]>`)
		p.headings = make([]string, 0)
		matches := headingPattern.FindAllString(p.content, -1)
		for i, match := range matches {
			placeholder := s.formatPlaceholder("___HEADING_%d___", i)
			p.content = strings.Replace(p.content, match, placeholder, 1)
			p.headings = append(p.headings, match)
		}
	}

	// 保护短代码
	shortcodePattern := regexp.MustCompile(`\[[a-zA-Z0-9_-]+[^\]]*\](?:[^\[]*\[\/[a-zA-Z0-9_-]+\])?`)
	p.shortcodes = make([]string, 0)
	matches := shortcodePattern.FindAllString(p.content, -1)
	for i, match := range matches {
		placeholder := s.formatPlaceholder("___SHORTCODE_%d___", i)
		p.content = strings.Replace(p.content, match, placeholder, 1)
		p.shortcodes = append(p.shortcodes, match)
	}

	return p
}

// protectPattern 保护特定模式
func (s *AutoLinkService) protectPattern(content, start, end, placeholder string) (string, []string) {
	blocks := make([]string, 0)
	result := content

	pattern := regexp.MustCompile(regexp.QuoteMeta(start) + `[\s\S]*?` + regexp.QuoteMeta(end))
	matches := pattern.FindAllString(result, -1)

	for i, match := range matches {
		ph := s.formatPlaceholder(placeholder, i)
		result = strings.Replace(result, match, ph, 1)
		blocks = append(blocks, match)
	}

	return result, blocks
}

// restoreSpecialAreas 恢复特殊区域
func (s *AutoLinkService) restoreSpecialAreas(p *protectedContent) string {
	result := p.content

	// 恢复短代码
	for i, shortcode := range p.shortcodes {
		placeholder := s.formatPlaceholder("___SHORTCODE_%d___", i)
		result = strings.Replace(result, placeholder, shortcode, 1)
	}

	// 恢复标题
	for i, heading := range p.headings {
		placeholder := s.formatPlaceholder("___HEADING_%d___", i)
		result = strings.Replace(result, placeholder, heading, 1)
	}

	// 恢复链接
	for i, link := range p.links {
		placeholder := s.formatPlaceholder("___LINK_%d___", i)
		result = strings.Replace(result, placeholder, link, 1)
	}

	for i, code := range p.codeBlocks {
		placeholder := s.formatPlaceholder("___CODE_BLOCK_%d___", i)
		if strings.Contains(result, placeholder) {
			result = strings.Replace(result, placeholder, code, 1)
			continue
		}
		placeholder = s.formatPlaceholder("___INLINE_CODE_%d___", i)
		result = strings.Replace(result, placeholder, code, 1)
	}

	return result
}

// addLink 添加链接
func (s *AutoLinkService) addLink(content, keyword, link, title, target, rel string, linkCount *int, maxLinks int) string {
	if *linkCount >= maxLinks && maxLinks > 0 {
		return content
	}

	// 创建正则表达式，匹配关键词（不区分大小写，全词匹配）
	pattern := regexp.MustCompile(`(?i)(?P<prefix>^|[^\w])` + regexp.QuoteMeta(keyword) + `(?P<suffix>$|[^\w])`)

	// 替换第一个匹配
	replaced := false
	result := pattern.ReplaceAllStringFunc(content, func(match string) string {
		if replaced {
			return match
		}
		replaced = true
		*linkCount++

		// 提取前后字符
		parts := pattern.FindStringSubmatch(match)
		prefix := ""
		suffix := ""
		if len(parts) >= 3 {
			prefix = parts[1]
			suffix = parts[2]
		}

		// 构建链接
		linkHTML := s.buildLink(keyword, link, title, target, rel)
		return prefix + linkHTML + suffix
	})

	return result
}

// buildLink 构建链接HTML
func (s *AutoLinkService) buildLink(text, href, title, target, rel string) string {
	var attrs []string

	attrs = append(attrs, `href="`+href+`"`)

	if title != "" {
		attrs = append(attrs, `title="`+title+`"`)
	}

	if target != "" && target != "_self" {
		attrs = append(attrs, `target="`+target+`"`)
	}

	if rel != "" {
		attrs = append(attrs, `rel="`+rel+`"`)
	} else if target == "_blank" {
		attrs = append(attrs, `rel="noopener noreferrer"`)
	}

	attrs = append(attrs, `class="auto-link"`)

	return `<a ` + strings.Join(attrs, " ") + `>` + text + `</a>`
}

// formatPlaceholder 格式化占位符
func (s *AutoLinkService) formatPlaceholder(tmpl string, index int) string {
	return strings.Replace(tmpl, "%d", fmt.Sprintf("%d", index), 1)
}

// ============ 关键词管理 ============

// GetKeywords 获取所有关键词
func (s *AutoLinkService) GetKeywords(c *gin.Context) {
	var keywords []AutoLinkKeyword
	s.db.Order("priority desc, keyword").Find(&keywords)
	utils.Success(c, keywords)
}

// CreateKeyword 创建关键词
func (s *AutoLinkService) CreateKeyword(c *gin.Context) {
	var keyword AutoLinkKeyword
	if err := c.ShouldBindJSON(&keyword); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	if err := s.db.Create(&keyword).Error; err != nil {
		logger.Error("创建关键词失败", zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	s.loadCache()
	logger.Info("关键词创建成功", zap.Uint("id", keyword.ID), zap.String("keyword", keyword.Keyword))
	utils.Success(c, keyword)
}

// UpdateKeyword 更新关键词
func (s *AutoLinkService) UpdateKeyword(c *gin.Context) {
	id := c.Param("id")
	var keyword AutoLinkKeyword
	if err := s.db.First(&keyword, "id = ?", id).Error; err != nil {
		logger.Warn("关键词不存在", zap.String("id", id))
		utils.NotFound(c, "关键词不存在")
		return
	}

	var req AutoLinkKeyword
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	s.db.Model(&keyword).Updates(req)
	s.loadCache()
	logger.Info("关键词更新成功", zap.Uint("id", keyword.ID))
	utils.Success(c, keyword)
}

// DeleteKeyword 删除关键词
func (s *AutoLinkService) DeleteKeyword(c *gin.Context) {
	id := c.Param("id")
	if err := s.db.Delete(&AutoLinkKeyword{}, id).Error; err != nil {
		logger.Error("删除关键词失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	s.loadCache()
	logger.Info("关键词删除成功", zap.String("id", id))
	utils.Success(c, gin.H{"message": "删除成功"})
}

// BatchImportKeywords 批量导入关键词
func (s *AutoLinkService) BatchImportKeywords(c *gin.Context) {
	var keywords []AutoLinkKeyword
	if err := c.ShouldBindJSON(&keywords); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 批量插入
	if err := s.db.Create(&keywords).Error; err != nil {
		logger.Error("批量导入关键词失败", zap.Int("count", len(keywords)), zap.Error(err))
		utils.InternalError(c, "导入失败")
		return
	}

	s.loadCache()
	logger.Info("批量导入关键词成功", zap.Int("count", len(keywords)))
	utils.Success(c, gin.H{
		"message": "导入成功",
		"count":   len(keywords),
	})
}

// Preview 预览自动内链效果
func (s *AutoLinkService) Preview(c *gin.Context) {
	var req struct {
		Content       string         `json:"content" binding:"required"`
		Config        AutoLinkConfig `json:"config"`
		CurrentPostID uint           `json:"current_post_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	result := s.ProcessContent(req.Content, req.Config, req.CurrentPostID)

	// 统计添加的链接数
	addedLinks := strings.Count(result, `class="auto-link"`)

	utils.Success(c, gin.H{
		"original":    req.Content,
		"processed":   result,
		"added_links": addedLinks,
	})
}

// GetStats 获取统计信息
func (s *AutoLinkService) GetStats(c *gin.Context) {
	var keywordCount int64
	s.db.Model(&AutoLinkKeyword{}).Count(&keywordCount)

	// 安全获取缓存数据
	_, posts, categories, tags := s.getCacheData()

	utils.Success(c, gin.H{
		"keyword_count":  keywordCount,
		"post_count":     len(posts),
		"category_count": len(categories),
		"tag_count":      len(tags),
	})
}

// SuggestKeywords 智能推荐关键词
func (s *AutoLinkService) SuggestKeywords(c *gin.Context) {
	// 分析文章标题，提取高频词汇作为建议关键词
	type WordFreq struct {
		Word  string `json:"word"`
		Count int    `json:"count"`
	}

	// 安全获取缓存数据
	_, posts, _, _ := s.getCacheData()

	wordCount := make(map[string]int)
	for _, post := range posts {
		words := s.extractWords(post.Title)
		for _, word := range words {
			if len(word) >= 2 { // 至少2个字符
				wordCount[word]++
			}
		}
	}

	// 转换并排序
	var suggestions []WordFreq
	for word, count := range wordCount {
		if count >= 2 { // 至少出现2次
			suggestions = append(suggestions, WordFreq{
				Word:  word,
				Count: count,
			})
		}
	}

	sort.Slice(suggestions, func(i, j int) bool {
		return suggestions[i].Count > suggestions[j].Count
	})

	// 限制返回数量
	if len(suggestions) > 50 {
		suggestions = suggestions[:50]
	}

	utils.Success(c, suggestions)
}

// extractWords 从标题中提取词汇
func (s *AutoLinkService) extractWords(title string) []string {
	// 简单的分词：按空格和标点符号分割
	separators := regexp.MustCompile(`[\s\-_:：，。！？、""''（）【】《》]+`)
	words := separators.Split(title, -1)

	result := make([]string, 0)
	for _, word := range words {
		word = strings.TrimSpace(word)
		if word != "" {
			result = append(result, word)
		}
	}

	return result
}

// ExportKeywords 导出关键词
func (s *AutoLinkService) ExportKeywords(c *gin.Context) {
	var keywords []AutoLinkKeyword
	s.db.Order("priority desc, keyword").Find(&keywords)

	utils.Success(c, keywords)
}
