package utils

import (
	"html"
	"regexp"
	"strings"
)

// 预编译正则表达式，提高性能
var (
	scriptTagRe    = regexp.MustCompile(`(?is)<script[^>]*>[\s\S]*?</script>`)
	iframeTagRe    = regexp.MustCompile(`(?is)<iframe[^>]*>[\s\S]*?</iframe>`)
	javascriptRe   = regexp.MustCompile(`(?i)javascript\s*:`)
	vbscriptRe     = regexp.MustCompile(`(?i)vbscript\s*:`)
	dataURIRe      = regexp.MustCompile(`(?i)data\s*:[^,]*text/html`)
	eventHandlerRe = regexp.MustCompile(`(?i)\s+on\w+\s*=`)
	htmlTagRe      = regexp.MustCompile(`<[^>]*>`)
	objectTagRe    = regexp.MustCompile(`(?is)<object[^>]*>[\s\S]*?</object>`)
	embedTagRe     = regexp.MustCompile(`(?is)<embed[^>]*>[\s\S]*?</embed>`)
	svgTagRe       = regexp.MustCompile(`(?is)<svg[^>]*>[\s\S]*?</svg>`)
	styleTagRe     = regexp.MustCompile(`(?is)<style[^>]*>[\s\S]*?</style>`)
	linkTagRe      = regexp.MustCompile(`(?is)<link[^>]*>`)
	baseTagRe      = regexp.MustCompile(`(?is)<base[^>]*>`)
	metaRefreshRe  = regexp.MustCompile(`(?is)<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>`)
)

// SanitizeHTML 清理 HTML 内容，防止 XSS
func SanitizeHTML(content string) string {
	// 转义 HTML 特殊字符
	escaped := html.EscapeString(content)
	return escaped
}

// SanitizeComment 清理评论内容
func SanitizeComment(content string) string {
	// 先转义 HTML，再移除危险内容（避免标签拼接绕过）
	content = html.EscapeString(content)

	// 移除危险 URI 协议
	content = javascriptRe.ReplaceAllString(content, "")
	content = vbscriptRe.ReplaceAllString(content, "")
	content = dataURIRe.ReplaceAllString(content, "")

	return strings.TrimSpace(content)
}

// StripTags 移除所有 HTML 标签
func StripTags(content string) string {
	return htmlTagRe.ReplaceAllString(content, "")
}

// TruncateText 截断文本
func TruncateText(text string, maxLen int) string {
	if len([]rune(text)) <= maxLen {
		return text
	}
	runes := []rune(text)
	return string(runes[:maxLen]) + "..."
}
