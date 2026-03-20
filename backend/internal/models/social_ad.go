package models

import (
	"time"

	"gorm.io/gorm"
)

// SocialShare 社交媒体分享记录
type SocialShare struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	PostID      uint      `json:"post_id" gorm:"not null;index"`
	Post        *Post     `json:"post,omitempty" gorm:"foreignKey:PostID"`
	Platform    string    `json:"platform" gorm:"not null;size:20;index"` // wechat, weibo, twitter, facebook, linkedin, copy
	ShareURL    string    `json:"share_url" gorm:"size:500"`
	IPAddress   string    `json:"-" gorm:"size:50"`
	UserAgent   string    `json:"-" gorm:"size:500"`
	Referrer    string    `json:"-" gorm:"size:500"`
	CreatedAt   time.Time `json:"created_at"`
}

// SocialShareConfig 社交媒体分享配置
type SocialShareConfig struct {
	ID                   uint   `json:"id" gorm:"primaryKey"`
	Platform             string `json:"platform" gorm:"unique;not null;size:20"` // wechat, weibo, twitter, facebook, linkedin
	Enabled              bool   `json:"enabled" gorm:"default:true"`
	AppID                string `json:"app_id" gorm:"size:100"`     // 第三方应用ID
	AppSecret            string `json:"-" gorm:"size:200"`          // 第三方应用密钥（不返回前端）
	RedirectURI          string `json:"redirect_uri" gorm:"size:500"` // 回调地址
	DefaultHashtags      string `json:"default_hashtags" gorm:"size:200"` // 默认标签，逗号分隔
	DefaultVia           string `json:"default_via" gorm:"size:50"`   // 默认来源账号
	ShareCount           int64  `json:"share_count" gorm:"default:0"` // 分享计数
	ShowCount            bool   `json:"show_count" gorm:"default:true"` // 是否显示分享数
	SortOrder            int    `json:"sort_order" gorm:"default:0"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// AdPlacement 广告位
type AdPlacement struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Name        string         `json:"name" gorm:"not null;size:50"`        // 广告位名称
	Code        string         `json:"code" gorm:"unique;not null;size:50"` // 广告位代码，如 home_top, post_bottom
	Description string         `json:"description" gorm:"size:200"`
	Location    string         `json:"location" gorm:"not null;size:30"` // home_top, home_sidebar, post_top, post_bottom, post_sidebar, page_top, page_bottom
	Type        string         `json:"type" gorm:"not null;size:20"`     // image, code, adsense
	Width       int            `json:"width"`                            // 建议宽度
	Height      int            `json:"height"`                           // 建议高度
	IsActive    bool           `json:"is_active" gorm:"default:true"`
	SortOrder   int            `json:"sort_order" gorm:"default:0"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
	Ads         []AdContent    `json:"ads,omitempty" gorm:"foreignKey:PlacementID"`
}

// AdContent 广告内容
type AdContent struct {
	ID           uint           `json:"id" gorm:"primaryKey"`
	PlacementID  uint           `json:"placement_id" gorm:"not null;index"`
	Placement    *AdPlacement   `json:"placement,omitempty" gorm:"foreignKey:PlacementID"`
	Title        string         `json:"title" gorm:"size:100"`
	ImageURL     string         `json:"image_url" gorm:"size:500"`
	LinkURL      string         `json:"link_url" gorm:"size:500"`
	HTMLCode     string         `json:"html_code" gorm:"type:text"`    // 自定义HTML代码
	AdSenseCode  string         `json:"adsense_code" gorm:"type:text"` // AdSense代码
	Type         string         `json:"type" gorm:"size:20"`           // image, code, adsense
	StartDate    *time.Time     `json:"start_date"`                    // 投放开始时间
	EndDate      *time.Time     `json:"end_date"`                      // 投放结束时间
	ViewCount    int64          `json:"view_count" gorm:"default:0"`   // 展示次数
	ClickCount   int64          `json:"click_count" gorm:"default:0"`  // 点击次数
	ClickRate    float64        `json:"click_rate" gorm:"default:0"`   // 点击率
	Priority     int            `json:"priority" gorm:"default:0"`     // 优先级，高的优先展示
	IsActive     bool           `json:"is_active" gorm:"default:true"`
	DeviceTarget string         `json:"device_target" gorm:"size:20"` // all, desktop, mobile
	SortOrder    int            `json:"sort_order" gorm:"default:0"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

// AdClick 广告点击记录
type AdClick struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	AdID       uint      `json:"ad_id" gorm:"not null;index"`
	Ad         *AdContent `json:"ad,omitempty" gorm:"foreignKey:AdID"`
	IPAddress  string    `json:"-" gorm:"size:50"`
	UserAgent  string    `json:"-" gorm:"size:500"`
	Referrer   string    `json:"referrer" gorm:"size:500"`
	Device     string    `json:"device" gorm:"size:20"` // desktop, mobile, tablet
	CreatedAt  time.Time `json:"created_at"`
}

// TableName 方法
func (SocialShare) TableName() string       { return "social_shares" }
func (SocialShareConfig) TableName() string { return "social_share_configs" }
func (AdPlacement) TableName() string       { return "ad_placements" }
func (AdContent) TableName() string         { return "ad_contents" }
func (AdClick) TableName() string           { return "ad_clicks" }
