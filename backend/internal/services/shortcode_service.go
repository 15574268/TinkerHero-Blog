package services

import (
	"encoding/json"
	"fmt"
	"html/template"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"gorm.io/gorm"
)

// ShortcodeService 短代码服务
type ShortcodeService struct {
	db          *gorm.DB
	shortcodes  map[string]ShortcodeHandler
	mu          sync.RWMutex
	galleryRepo *GalleryRepository
}

// ShortcodeHandler 短代码处理函数
type ShortcodeHandler func(attrs map[string]string, content string) template.HTML

// GalleryRepository 图库仓库接口
type GalleryRepository interface {
	GetGalleryImages(galleryID uint) ([]GalleryImage, error)
}

// GalleryImage 图库图片
type GalleryImage struct {
	ID        uint   `json:"id"`
	GalleryID uint   `json:"gallery_id"`
	URL       string `json:"url"`
	Thumbnail string `json:"thumbnail"`
	Alt       string `json:"alt"`
	SortOrder int    `json:"sort_order"`
}

// NewShortcodeService 创建短代码服务
func NewShortcodeService(db *gorm.DB) *ShortcodeService {
	s := &ShortcodeService{
		db:         db,
		shortcodes: make(map[string]ShortcodeHandler),
	}
	s.registerDefaultShortcodes()
	return s
}

// registerDefaultShortcodes 注册默认短代码
func (s *ShortcodeService) registerDefaultShortcodes() {
	// 代码高亮块
	s.Register("code", s.codeShortcode)
	// 警告/提示框
	s.Register("alert", s.alertShortcode)
	// 折叠面板
	s.Register("collapse", s.collapseShortcode)
	// 标签页
	s.Register("tabs", s.tabsShortcode)
	s.Register("tab", s.tabShortcode)
	// 图库
	s.Register("gallery", s.galleryShortcode)
	// 视频
	s.Register("video", s.videoShortcode)
	// 音频
	s.Register("audio", s.audioShortcode)
	// 引用块
	s.Register("quote", s.quoteShortcode)
	// 按钮
	s.Register("button", s.buttonShortcode)
	// 卡片
	s.Register("card", s.cardShortcode)
	// 时间线
	s.Register("timeline", s.timelineShortcode)
	s.Register("timeline-item", s.timelineItemShortcode)
	// 进度条
	s.Register("progress", s.progressShortcode)
	// 徽章
	s.Register("badge", s.badgeShortcode)
	// 目录
	s.Register("toc", s.tocShortcode)
	// 统计数字
	s.Register("counter", s.counterShortcode)
}

// Register 注册短代码
func (s *ShortcodeService) Register(name string, handler ShortcodeHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.shortcodes[name] = handler
}

var (
	shortcodeRegex     = regexp.MustCompile(`\[([a-zA-Z0-9_-]+)([^\]]*)\](?:([^\[]*)\[\/[a-zA-Z0-9_-]+\])?`)
	shortcodeNameRegex = regexp.MustCompile(`\[([a-zA-Z0-9_-]+)`)
)

// Parse 解析内容中的短代码
func (s *ShortcodeService) Parse(content string) template.HTML {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := shortcodeRegex.ReplaceAllStringFunc(content, func(match string) string {
		nameMatch := shortcodeNameRegex.FindStringSubmatch(match)
		if len(nameMatch) < 2 {
			return match
		}
		name := nameMatch[1]

		handler, ok := s.shortcodes[name]
		if !ok {
			return match
		}

		// 提取属性
		attrs := s.parseAttributes(match)

		// 提取内容
		contentMatch := regexp.MustCompile(`\[` + name + `[^\]]*\]([^\[]*)\[\/` + name + `\]`).FindStringSubmatch(match)
		content := ""
		if len(contentMatch) > 1 {
			content = contentMatch[1]
		}

		// 执行处理器
		return string(handler(attrs, content))
	})

	return template.HTML(result)
}

// parseAttributes 解析短代码属性
func (s *ShortcodeService) parseAttributes(shortcode string) map[string]string {
	attrs := make(map[string]string)

	// 匹配属性 attr="value" 或 attr='value' 或 attr=value
	re := regexp.MustCompile(`([a-zA-Z0-9_-]+)=["']?([^"'\]\s]+)["']?`)
	matches := re.FindAllStringSubmatch(shortcode, -1)

	for _, match := range matches {
		if len(match) >= 3 {
			attrs[match[1]] = match[2]
		}
	}

	return attrs
}

// ============ 内置短代码实现 ============

// codeShortcode 代码块
func (s *ShortcodeService) codeShortcode(attrs map[string]string, content string) template.HTML {
	lang := attrs["lang"]
	if lang == "" {
		lang = "plaintext"
	}
	title := attrs["title"]
	lineNumbers := attrs["lines"] != "false"
	highlight := attrs["highlight"] // 高亮行，如 "1,3-5"

	classes := []string{"code-block", "language-" + lang}
	if lineNumbers {
		classes = append(classes, "line-numbers")
	}

	html := fmt.Sprintf(`<div class="%s">`, strings.Join(classes, " "))
	if title != "" {
		html += fmt.Sprintf(`<div class="code-title">%s</div>`, title)
	}
	html += fmt.Sprintf(`<pre data-highlight="%s"><code class="language-%s">%s</code></pre></div>`,
		highlight, lang, template.HTMLEscapeString(content))

	return template.HTML(html)
}

// alertShortcode 警告/提示框
func (s *ShortcodeService) alertShortcode(attrs map[string]string, content string) template.HTML {
	alertType := attrs["type"]
	if alertType == "" {
		alertType = "info"
	}
	title := attrs["title"]
	icon := attrs["icon"]

	icons := map[string]string{
		"info":    "ℹ️",
		"warning": "⚠️",
		"success": "✅",
		"error":   "❌",
		"danger":  "💣",
	}
	if icon == "" {
		icon = icons[alertType]
	}

	html := fmt.Sprintf(`<div class="alert alert-%s">`, alertType)
	if icon != "" {
		html += fmt.Sprintf(`<span class="alert-icon">%s</span>`, icon)
	}
	if title != "" {
		html += fmt.Sprintf(`<div class="alert-title">%s</div>`, title)
	}
	html += fmt.Sprintf(`<div class="alert-content">%s</div></div>`, content)

	return template.HTML(html)
}

// collapseShortcode 折叠面板
func (s *ShortcodeService) collapseShortcode(attrs map[string]string, content string) template.HTML {
	title := attrs["title"]
	if title == "" {
		title = "展开/折叠"
	}
	open := attrs["open"] == "true"
	id := attrs["id"]
	if id == "" {
		id = fmt.Sprintf("collapse-%d", time.Now().UnixNano())
	}

	display := ""
	if open {
		display = " style=\"display:block\""
	}

	html := fmt.Sprintf(`
<div class="collapse-wrapper">
	<div class="collapse-header" onclick="toggleCollapse('%s')">
		<span class="collapse-title">%s</span>
		<span class="collapse-icon">%s</span>
	</div>
	<div class="collapse-content" id="%s"%s>
		%s
	</div>
</div>`, id, title, "▼", id, display, content)

	return template.HTML(html)
}

// tabsShortcode 标签页容器
func (s *ShortcodeService) tabsShortcode(attrs map[string]string, content string) template.HTML {
	id := attrs["id"]
	if id == "" {
		id = fmt.Sprintf("tabs-%d", time.Now().UnixNano())
	}

	return template.HTML(fmt.Sprintf(`
<div class="tabs-wrapper" id="%s">
	<div class="tabs-nav" role="tablist"></div>
	<div class="tabs-content">%s</div>
</div>`, id, content))
}

// tabShortcode 单个标签页
func (s *ShortcodeService) tabShortcode(attrs map[string]string, content string) template.HTML {
	title := attrs["title"]
	active := attrs["active"] == "true"
	id := fmt.Sprintf("tab-%d", time.Now().UnixNano())

	activeClass := ""
	if active {
		activeClass = " active"
	}

	return template.HTML(fmt.Sprintf(`
<div class="tab-pane%s" id="%s" data-title="%s">
	%s
</div>`, activeClass, id, title, content))
}

// galleryShortcode 图库
func (s *ShortcodeService) galleryShortcode(attrs map[string]string, content string) template.HTML {
	id := attrs["id"]
	columns := attrs["columns"]
	if columns == "" {
		columns = "3"
	}
	layout := attrs["layout"]
	if layout == "" {
		layout = "grid"
	}

	// 如果指定了图库ID，从数据库加载
	if id != "" {
		galleryID, _ := strconv.ParseUint(id, 10, 64)
		images, err := s.getGalleryImages(uint(galleryID))
		if err == nil && len(images) > 0 {
			return s.renderGalleryImages(images, columns, layout)
		}
	}

	// 否则解析内容中的图片
	images := s.parseGalleryContent(content)
	return s.renderGalleryImages(images, columns, layout)
}

func (s *ShortcodeService) getGalleryImages(galleryID uint) ([]GalleryImage, error) {
	var images []GalleryImage
	err := s.db.Where("gallery_id = ?", galleryID).Order("sort_order").Find(&images).Error
	return images, err
}

func (s *ShortcodeService) parseGalleryContent(content string) []GalleryImage {
	var images []GalleryImage
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "![](") || strings.HasPrefix(line, "<img") {
			images = append(images, GalleryImage{
				URL:       line,
				SortOrder: i,
			})
		}
	}
	return images
}

func (s *ShortcodeService) renderGalleryImages(images []GalleryImage, columns, layout string) template.HTML {
	var html strings.Builder
	html.WriteString(fmt.Sprintf(`<div class="gallery gallery-%s" style="--columns: %s">`, layout, columns))

	for _, img := range images {
		html.WriteString(fmt.Sprintf(`
		<div class="gallery-item">
			<img src="%s" alt="%s" loading="lazy">
		</div>`, img.URL, img.Alt))
	}

	html.WriteString("</div>")
	return template.HTML(html.String())
}

// videoShortcode 视频
func (s *ShortcodeService) videoShortcode(attrs map[string]string, content string) template.HTML {
	src := attrs["src"]
	poster := attrs["poster"]
	autoplay := attrs["autoplay"] == "true"
	loop := attrs["loop"] == "true"
	muted := attrs["muted"] == "true"
	controls := attrs["controls"] != "false"
	width := attrs["width"]

	style := ""
	if width != "" {
		style = fmt.Sprintf("width: %s", width)
	}

	attrs_str := ""
	if autoplay {
		attrs_str += " autoplay"
	}
	if loop {
		attrs_str += " loop"
	}
	if muted {
		attrs_str += " muted"
	}
	if controls {
		attrs_str += " controls"
	}

	return template.HTML(fmt.Sprintf(`
<div class="video-wrapper" style="%s">
	<video src="%s" poster="%s"%s></video>
</div>`, style, src, poster, attrs_str))
}

// audioShortcode 音频
func (s *ShortcodeService) audioShortcode(attrs map[string]string, content string) template.HTML {
	src := attrs["src"]
	autoplay := attrs["autoplay"] == "true"
	loop := attrs["loop"] == "true"
	controls := attrs["controls"] != "false"

	attrs_str := ""
	if autoplay {
		attrs_str += " autoplay"
	}
	if loop {
		attrs_str += " loop"
	}
	if controls {
		attrs_str += " controls"
	}

	return template.HTML(fmt.Sprintf(`
<div class="audio-wrapper">
	<audio src="%s"%s></audio>
</div>`, src, attrs_str))
}

// quoteShortcode 引用块
func (s *ShortcodeService) quoteShortcode(attrs map[string]string, content string) template.HTML {
	author := attrs["author"]
	source := attrs["source"]
	style := attrs["style"]

	classes := "quote-block"
	if style != "" {
		classes += " quote-" + style
	}

	html := fmt.Sprintf(`<blockquote class="%s"><p>%s</p>`, classes, content)
	if author != "" {
		if source != "" {
			html += fmt.Sprintf(`<footer>——<cite><a href="%s">%s</a></cite></footer>`, source, author)
		} else {
			html += fmt.Sprintf(`<footer>——<cite>%s</cite></footer>`, author)
		}
	}
	html += "</blockquote>"

	return template.HTML(html)
}

// buttonShortcode 按钮
func (s *ShortcodeService) buttonShortcode(attrs map[string]string, content string) template.HTML {
	href := attrs["href"]
	target := attrs["target"]
	if target == "" {
		target = "_self"
	}
	style := attrs["style"]
	size := attrs["size"]
	icon := attrs["icon"]
	block := attrs["block"] == "true"

	classes := []string{"btn"}
	if style != "" {
		classes = append(classes, "btn-"+style)
	}
	if size != "" {
		classes = append(classes, "btn-"+size)
	}
	if block {
		classes = append(classes, "btn-block")
	}

	html := fmt.Sprintf(`<a href="%s" target="%s" class="%s">`, href, target, strings.Join(classes, " "))
	if icon != "" {
		html += fmt.Sprintf(`<span class="btn-icon">%s</span>`, icon)
	}
	html += content + "</a>"

	return template.HTML(html)
}

// cardShortcode 卡片
func (s *ShortcodeService) cardShortcode(attrs map[string]string, content string) template.HTML {
	title := attrs["title"]
	image := attrs["image"]
	footer := attrs["footer"]
	href := attrs["href"]

	html := `<div class="card">`
	if href != "" {
		html = fmt.Sprintf(`<a href="%s" class="card card-link">`, href)
	}
	if image != "" {
		html += fmt.Sprintf(`<div class="card-image"><img src="%s" alt="%s"></div>`, image, title)
	}
	if title != "" {
		html += fmt.Sprintf(`<div class="card-header"><h3 class="card-title">%s</h3></div>`, title)
	}
	html += fmt.Sprintf(`<div class="card-body">%s</div>`, content)
	if footer != "" {
		html += fmt.Sprintf(`<div class="card-footer">%s</div>`, footer)
	}
	html += "</div>"

	return template.HTML(html)
}

// timelineShortcode 时间线容器
func (s *ShortcodeService) timelineShortcode(attrs map[string]string, content string) template.HTML {
	return template.HTML(fmt.Sprintf(`<div class="timeline">%s</div>`, content))
}

// timelineItemShortcode 时间线项
func (s *ShortcodeService) timelineItemShortcode(attrs map[string]string, content string) template.HTML {
	time_str := attrs["time"]
	title := attrs["title"]
	icon := attrs["icon"]
	color := attrs["color"]

	html := `<div class="timeline-item"`
	if color != "" {
		html += fmt.Sprintf(` style="--timeline-color: %s"`, color)
	}
	html += ">"
	if icon != "" {
		html += fmt.Sprintf(`<div class="timeline-icon">%s</div>`, icon)
	} else {
		html += `<div class="timeline-dot"></div>`
	}
	html += `<div class="timeline-content">`
	if time_str != "" {
		html += fmt.Sprintf(`<div class="timeline-time">%s</div>`, time_str)
	}
	if title != "" {
		html += fmt.Sprintf(`<h4 class="timeline-title">%s</h4>`, title)
	}
	html += fmt.Sprintf(`<div class="timeline-body">%s</div></div></div>`, content)

	return template.HTML(html)
}

// progressShortcode 进度条
func (s *ShortcodeService) progressShortcode(attrs map[string]string, content string) template.HTML {
	value := attrs["value"]
	max := attrs["max"]
	if max == "" {
		max = "100"
	}
	label := attrs["label"]
	style := attrs["style"]
	striped := attrs["striped"] == "true"
	animated := attrs["animated"] == "true"

	classes := []string{"progress-bar"}
	if style != "" {
		classes = append(classes, "progress-"+style)
	}
	if striped {
		classes = append(classes, "progress-striped")
	}
	if animated {
		classes = append(classes, "progress-animated")
	}

	return template.HTML(fmt.Sprintf(`
<div class="progress-wrapper">
	%s
	<div class="progress">
		<div class="%s" style="width: %s%%" aria-valuenow="%s" aria-valuemin="0" aria-valuemax="%s"></div>
	</div>
	<span class="progress-value">%s%%</span>
</div>`, label, strings.Join(classes, " "), value, value, max, value))
}

// badgeShortcode 徽章
func (s *ShortcodeService) badgeShortcode(attrs map[string]string, content string) template.HTML {
	style := attrs["style"]
	pill := attrs["pill"] == "true"

	classes := []string{"badge"}
	if style != "" {
		classes = append(classes, "badge-"+style)
	}
	if pill {
		classes = append(classes, "badge-pill")
	}

	return template.HTML(fmt.Sprintf(`<span class="%s">%s</span>`, strings.Join(classes, " "), content))
}

// tocShortcode 目录
func (s *ShortcodeService) tocShortcode(attrs map[string]string, content string) template.HTML {
	depth := attrs["depth"]
	if depth == "" {
		depth = "3"
	}
	ordered := attrs["ordered"] == "true"

	listStyle := "ul"
	if ordered {
		listStyle = "ol"
	}

	return template.HTML(fmt.Sprintf(`
<nav class="toc" data-depth="%s">
	<div class="toc-title">目录</div>
	<%s class="toc-list"></%s>
</nav>`, depth, listStyle, listStyle))
}

// counterShortcode 计数器
func (s *ShortcodeService) counterShortcode(attrs map[string]string, content string) template.HTML {
	value := attrs["value"]
	prefix := attrs["prefix"]
	suffix := attrs["suffix"]
	label := attrs["label"]
	icon := attrs["icon"]

	return template.HTML(fmt.Sprintf(`
<div class="counter">
	%s
	<div class="counter-value">
		<span class="prefix">%s</span>
		<span class="number" data-target="%s">0</span>
		<span class="suffix">%s</span>
	</div>
	%s
</div>`, icon, prefix, value, suffix, label))
}

// ============ HTTP Handlers ============

// ParseContent API: 解析短代码
func (s *ShortcodeService) ParseContent(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	result := s.Parse(req.Content)
	utils.Success(c, gin.H{
		"html": result,
	})
}

// GetShortcodes API: 获取可用短代码列表
func (s *ShortcodeService) GetShortcodes(c *gin.Context) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	shortcodes := make([]map[string]any, 0)
	for name, handler := range s.shortcodes {
		// 这里可以添加每个短代码的文档信息
		shortcodes = append(shortcodes, map[string]any{
			"name":        name,
			"description": getShortcodeDescription(name),
			"example":     getShortcodeExample(name),
		})
		_ = handler // 使用 handler 避免未使用警告
	}
	utils.Success(c, shortcodes)
}

// 辅助函数
func getShortcodeDescription(name string) string {
	descriptions := map[string]string{
		"code":         "代码高亮块，支持多种语言",
		"alert":        "警告/提示框，支持 info/warning/success/error 类型",
		"collapse":     "折叠面板，可展开/折叠内容",
		"tabs":         "标签页容器",
		"tab":          "单个标签页",
		"gallery":      "图片画廊，支持网格/瀑布流布局",
		"video":        "视频播放器",
		"audio":        "音频播放器",
		"quote":        "引用块",
		"button":       "按钮",
		"card":         "卡片",
		"timeline":     "时间线容器",
		"timeline-item": "时间线项",
		"progress":     "进度条",
		"badge":        "徽章",
		"toc":          "目录",
		"counter":      "计数器动画",
	}
	return descriptions[name]
}

func getShortcodeExample(name string) string {
	examples := map[string]string{
		"code":         `[code lang="go" title="示例"]fmt.Println("Hello")[/code]`,
		"alert":        `[alert type="warning" title="注意"]这是一个警告[/alert]`,
		"collapse":     `[collapse title="点击展开"]隐藏内容[/collapse]`,
		"tabs":         `[tabs][tab title="标签1"]内容1[/tab][tab title="标签2"]内容2[/tab][/tabs]`,
		"gallery":      `[gallery columns="4"]图片列表[/gallery]`,
		"video":        `[video src="video.mp4" poster="poster.jpg"]`,
		"quote":        `[quote author="作者" source="来源"]引用内容[/quote]`,
		"button":       `[button href="url" style="primary"]按钮文字[/button]`,
		"card":         `[card title="标题" image="img.jpg"]内容[/card]`,
		"timeline":     `[timeline][timeline-item time="2024-01-01"]事件[/timeline-item][/timeline]`,
		"progress":     `[progress value="75"]`,
		"badge":        `[badge style="success"]新[/badge]`,
		"toc":          `[toc depth="3"]`,
		"counter":      `[counter value="1000" suffix="+"]用户[/counter]`,
	}
	return examples[name]
}

// RegisterCustomShortcode 注册自定义短代码
func (s *ShortcodeService) RegisterCustomShortcode(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Template    string `json:"template" binding:"required"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	handler := func(attrs map[string]string, content string) template.HTML {
		tmpl := req.Template
		for key, value := range attrs {
			tmpl = strings.ReplaceAll(tmpl, "{{"+key+"}}", template.HTMLEscapeString(value))
		}
		tmpl = strings.ReplaceAll(tmpl, "{{content}}", template.HTMLEscapeString(content))
		return template.HTML(tmpl)
	}

	s.mu.Lock()
	s.shortcodes[req.Name] = handler
	s.mu.Unlock()

	utils.Success(c, gin.H{
		"message":     "短代码注册成功",
		"name":        req.Name,
		"description": req.Description,
	})
}

// PreviewShortcode API: 预览短代码效果
func (s *ShortcodeService) PreviewShortcode(c *gin.Context) {
	var req struct {
		Shortcode string `json:"shortcode" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	result := s.Parse(req.Shortcode)
	utils.Success(c, gin.H{
		"html": result,
	})
}

// ExportShortcodes 导出短代码配置
func (s *ShortcodeService) ExportShortcodes(c *gin.Context) {
	shortcodes := make([]map[string]any, 0)
	for name := range s.shortcodes {
		shortcodes = append(shortcodes, map[string]any{
			"name":        name,
			"description": getShortcodeDescription(name),
			"example":     getShortcodeExample(name),
		})
	}

	data, _ := json.MarshalIndent(shortcodes, "", "  ")
	c.Data(200, "application/json", data)
}
