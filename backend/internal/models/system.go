package models

import (
	"time"

	"gorm.io/gorm"
)

// SiteConfig 系统配置
type SiteConfig struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Key         string         `json:"key" gorm:"unique;not null;size:50"`  // 配置键
	Value       string         `json:"value" gorm:"type:text"`               // 配置值
	Type        string         `json:"type" gorm:"size:20;default:'text'"`   // text, number, boolean, json, image
	Group       string         `json:"group" gorm:"size:30;default:'general'"` // 分组：general, seo, email, etc.
	Description string         `json:"description" gorm:"size:200"`          // 配置说明
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// SensitiveWord 敏感词
type SensitiveWord struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Word      string         `json:"word" gorm:"unique;not null;size:50"`
	Category  string         `json:"category" gorm:"size:30"` // 政治、色情、广告等
	Level     int            `json:"level" gorm:"default:1"`  // 1: 替换, 2: 审核, 3: 拦截
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// IPBlacklist IP黑名单
type IPBlacklist struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	IPAddress string         `json:"ip_address" gorm:"unique;not null;size:50"`
	Reason    string         `json:"reason" gorm:"size:200"`
	ExpiredAt *time.Time     `json:"expired_at"` // 过期时间，nil表示永久
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// Subscriber 邮件订阅者
type Subscriber struct {
	ID         uint           `json:"id" gorm:"primaryKey"`
	Email      string         `json:"email" gorm:"unique;not null;size:100"`
	IsActive   bool           `json:"is_active" gorm:"default:true"`
	Token      string         `json:"-" gorm:"unique;size:64"` // 取消订阅token
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `json:"-" gorm:"index"`
}

// 预定义的系统配置项（仅保留已接入应用的项）
// 应用范围：前台 = 公开站；后台 = 管理端；后端 = 服务端逻辑
var DefaultConfigs = []SiteConfig{
	// ===== 基本设置 [前台] =====
	{Key: "site_name", Value: "我的博客", Type: "text", Group: "general", Description: "网站名称（应用于前台）"},
	{Key: "site_url", Value: "", Type: "text", Group: "general", Description: "网站地址（应用于前台，如 RSS、分享链接）"},
	{Key: "site_description", Value: "一个现代化的博客系统", Type: "text", Group: "general", Description: "网站描述（应用于前台 SEO）"},
	{Key: "site_keywords", Value: "博客,技术,分享", Type: "text", Group: "general", Description: "网站关键词（应用于前台 SEO，逗号分隔）"},
	{Key: "site_logo", Value: "", Type: "image", Group: "general", Description: "网站 Logo（应用于前台页头）"},
	{Key: "site_slogan", Value: "TINKER HERO", Type: "text", Group: "general", Description: "网站副标题（显示在页头网站名称下方）"},
	{Key: "site_favicon", Value: "/favicon.ico", Type: "image", Group: "general", Description: "网站图标（应用于前台浏览器标签）"},
	{Key: "site_footer", Value: "© 2024 我的博客. All rights reserved.", Type: "text", Group: "general", Description: "页脚文字（应用于前台）"},
	{Key: "site_icp", Value: "", Type: "text", Group: "general", Description: "ICP 备案号（应用于前台页脚）"},
	{Key: "site_public_security", Value: "", Type: "text", Group: "general", Description: "公安备案号（应用于前台页脚）"},

	// ===== 内容设置 [前台] =====
	{Key: "posts_per_page", Value: "10", Type: "number", Group: "content", Description: "每页文章数（应用于前台列表）"},
	{Key: "allow_comment", Value: "true", Type: "boolean", Group: "content", Description: "允许评论（应用于前台文章页评论区）"},
	{Key: "enable_toc", Value: "true", Type: "boolean", Group: "content", Description: "文章页显示目录（应用于前台）"},
	{Key: "enable_reading_time", Value: "true", Type: "boolean", Group: "content", Description: "显示预计阅读时长（应用于前台）"},
	{Key: "code_highlight_theme", Value: "github-dark", Type: "text", Group: "content", Description: "代码高亮主题（应用于前台文章代码块）"},

	// ===== SEO 设置 [前台] =====
	{Key: "seo_title_suffix", Value: " - 我的博客", Type: "text", Group: "seo", Description: "SEO 标题后缀（应用于前台页面 title）"},

	// ===== 外观设置 [前台] =====
	{Key: "theme_color", Value: "#3b82f6", Type: "text", Group: "appearance", Description: "主题色（应用于前台）"},
	{Key: "site_announcement", Value: "", Type: "text", Group: "appearance", Description: "全站公告（应用于前台顶部，留空关闭）"},
	{Key: "custom_css", Value: "", Type: "textarea", Group: "appearance", Description: "自定义 CSS（应用于前台）"},
	{Key: "custom_head_html", Value: "", Type: "textarea", Group: "appearance", Description: "自定义 head 代码（应用于前台，如统计）"},
	{Key: "custom_footer_html", Value: "", Type: "textarea", Group: "appearance", Description: "自定义页脚 HTML（应用于前台）"},

	// ===== AI 配置 [后端] =====
	{Key: "ai_provider", Value: "openai", Type: "text", Group: "ai", Description: "AI 服务商：openai/dashscope/zhipu/moonshot/doubao/wenxin/siliconflow/deepseek"},
	{Key: "image_provider", Value: "", Type: "text", Group: "ai", Description: "图片生成专用服务商（留空则复用 ai_provider）"},
	{Key: "image_model", Value: "", Type: "text", Group: "ai", Description: "图片生成模型（留空用厂商默认：openai=dall-e-3 / siliconflow=Kwai-Kolors/Kolors / zhipu=cogview-3-plus）"},
	{Key: "openai_api_key", Value: "", Type: "password", Group: "ai", Description: "API Key（OpenAI/通义/智谱/月之暗面/豆包 填此；文心填 API Key）"},
	{Key: "openai_base_url", Value: "", Type: "text", Group: "ai", Description: "自定义 API 地址（仅 openai 时可选，留空用官方或各厂商默认）"},
	{Key: "openai_model", Value: "gpt-4o-mini", Type: "text", Group: "ai", Description: "模型名称（随服务商不同而不同）"},
	{Key: "wenxin_api_secret", Value: "", Type: "password", Group: "ai", Description: "文心一言 Secret（仅当 AI 服务商为 wenxin 时必填）"},

	// ===== 邮件配置 [后端] =====
	{Key: "smtp_host", Value: "smtp.gmail.com", Type: "text", Group: "email", Description: "SMTP 服务器地址（应用于后端邮件通知）"},
	{Key: "smtp_port", Value: "587", Type: "text", Group: "email", Description: "SMTP 端口（应用于后端）"},
	{Key: "smtp_user", Value: "", Type: "text", Group: "email", Description: "SMTP 登录用户名"},
	{Key: "smtp_from", Value: "noreply@blog.com", Type: "text", Group: "email", Description: "发件人邮箱地址"},
	{Key: "smtp_password", Value: "", Type: "password", Group: "email", Description: "SMTP 密码或授权码"},

	// ===== 上传与媒体 [后端] =====
	{Key: "upload_max_file_size_mb", Value: "50", Type: "number", Group: "upload", Description: "单文件最大体积（MB），应用于后台上传"},
	{Key: "upload_allowed_extensions", Value: ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.ogv", Type: "text", Group: "upload", Description: "允许的扩展名（逗号分隔，如 .jpg,.png）"},
	{Key: "upload_cdn_enabled", Value: "false", Type: "boolean", Group: "upload", Description: "是否将媒体 URL 替换为 CDN 地址"},
	{Key: "upload_cdn_url", Value: "", Type: "text", Group: "upload", Description: "CDN 基础 URL（如 https://cdn.example.com，末尾勿加 /）"},
	{Key: "watermark_enabled", Value: "false", Type: "boolean", Group: "upload", Description: "上传图片是否添加水印"},
	{Key: "watermark_text", Value: "折腾侠", Type: "text", Group: "upload", Description: "水印文字"},
	{Key: "watermark_position", Value: "bottom-right", Type: "text", Group: "upload", Description: "水印位置（如 bottom-right）"},

	// ===== 安全设置 [后端] =====
	{Key: "api_rate_limit_per_min", Value: "100", Type: "number", Group: "security", Description: "全局限流：每分钟每 IP 请求数"},
	{Key: "auth_rate_limit_per_min", Value: "5", Type: "number", Group: "security", Description: "认证接口限流：每分钟每 IP 请求数"},
	{Key: "login_max_attempts", Value: "5", Type: "number", Group: "security", Description: "登录失败最大次数，超过后锁定"},
	{Key: "login_lockout_minutes", Value: "15", Type: "number", Group: "security", Description: "登录锁定时长（分钟）"},
	{Key: "enable_rate_limit", Value: "true", Type: "boolean", Group: "security", Description: "是否启用全局限流"},
	{Key: "enable_captcha_comment", Value: "false", Type: "boolean", Group: "security", Description: "评论是否需验证码"},
	{Key: "enable_ip_blacklist", Value: "false", Type: "boolean", Group: "security", Description: "是否启用 IP 黑名单"},
	{Key: "enable_sensitive_filter", Value: "false", Type: "boolean", Group: "security", Description: "评论是否启用敏感词过滤"},

	// ===== 内容（原「都没有」项，仅后台） =====
	{Key: "comment_need_audit", Value: "true", Type: "boolean", Group: "content", Description: "评论是否需要审核（否则直接通过）"},
	{Key: "excerpt_length", Value: "150", Type: "number", Group: "content", Description: "列表摘要长度（字，无 summary 时从正文截取）"},
	{Key: "default_post_status", Value: "draft", Type: "text", Group: "content", Description: "新建文章默认状态（draft/published）"},
	{Key: "auto_save_interval_sec", Value: "60", Type: "number", Group: "content", Description: "自动保存间隔（秒），前台写作页使用"},

	// ===== 外观（原「都没有」项） =====
	{Key: "default_cover_image", Value: "", Type: "image", Group: "appearance", Description: "文章无封面时的默认图 URL（应用于前台）"},

	// ===== SEO（原「都没有」项，仅后台/前台） =====
	{Key: "seo_google_verification", Value: "", Type: "text", Group: "seo", Description: "Google 站长验证 meta content"},
	{Key: "seo_baidu_verification", Value: "", Type: "text", Group: "seo", Description: "百度站长验证 meta content"},
	{Key: "seo_bing_verification", Value: "", Type: "text", Group: "seo", Description: "Bing 站长验证 meta content"},
	{Key: "seo_sitemap_enabled", Value: "true", Type: "boolean", Group: "seo", Description: "是否提供 /sitemap.xml"},
	{Key: "seo_robots_txt", Value: "", Type: "textarea", Group: "seo", Description: "robots.txt 内容（留空使用默认 Allow: /）"},
	{Key: "seo_auto_description", Value: "true", Type: "boolean", Group: "seo", Description: "文章无描述时是否用摘要作为 meta description（应用于前台）"},

	// ===== 自动内链 [后端] =====
	{Key: "auto_link_config", Value: "", Type: "json", Group: "content", Description: "自动内链配置（JSON，后端用于文章正文处理）"},

	// ===== API 发布（Open API）[后端] =====
	{Key: "api_publish_enabled", Value: "false", Type: "boolean", Group: "openapi", Description: "是否启用 API 发布（免登录，使用 API Key 校验）"},
	{Key: "api_publish_key", Value: "", Type: "password", Group: "openapi", Description: "API 发布 Key（请求需携带 X-API-Key）"},
}
