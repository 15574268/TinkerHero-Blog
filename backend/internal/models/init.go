package models

import (
	"time"

	"gorm.io/gorm"
)

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&User{},
		&Post{},
		&Category{},
		&Tag{},
		&PostTag{},
		&Comment{},
		&Media{},
		&Page{},
		&FriendLink{},
		&Notification{},
		&VisitorLog{},
		&PostVersion{},
		&PostTranslation{},
		&SiteConfig{},
		&SensitiveWord{},
		&IPBlacklist{},
		&Subscriber{},
		&PostPreview{},
		&FriendLinkApply{},
		&DonationConfig{},
		// 博客增强模型
		&Series{},
		&SeriesPost{},
		&PostTemplate{},
		&Announcement{},
		&Resource{},
		&Changelog{},
		&Milestone{},
		&DeadLink{},
		&ReadingBehavior{},
		// 社交分享和广告
		&SocialShare{},
		&SocialShareConfig{},
		&AdPlacement{},
		&AdContent{},
		&AdClick{},
		&NavMenu{},
	)
}

// Page 自定义页面（关于、友链等）
type Page struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Title     string         `json:"title" gorm:"not null;size:100"`
	Slug      string         `json:"slug" gorm:"unique;not null;size:100"`
	Content   string         `json:"content" gorm:"type:text"`
	Status    PostStatus     `json:"status" gorm:"default:draft"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// FriendLink 友情链接
type FriendLink struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Name      string         `json:"name" gorm:"not null;size:50"`
	URL       string         `json:"url" gorm:"not null;size:200"`
	Logo      string         `json:"logo" gorm:"size:200"`
	Desc      string         `json:"desc" gorm:"size:200"`
	Status    bool           `json:"status" gorm:"default:true"`
	SortOrder int            `json:"sort_order" gorm:"default:0"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// Notification 通知
type Notification struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    *uint          `json:"user_id"`
	Type      string         `json:"type" gorm:"not null;size:20"` // comment, like, system
	Title     string         `json:"title" gorm:"not null;size:100"`
	Content   string         `json:"content" gorm:"type:text"`
	IsRead    bool           `json:"is_read" gorm:"default:false"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// NavMenu 导航菜单
type NavMenu struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	ParentID  *uint     `json:"parent_id" gorm:"index"`
	Label     string    `json:"label" gorm:"not null;size:50"`
	LinkType  string    `json:"link_type" gorm:"size:20;not null;default:page"`
	LinkValue string    `json:"link_value" gorm:"size:200"`
	Icon      string    `json:"icon" gorm:"size:50"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	IsVisible bool      `json:"is_visible" gorm:"default:true"`
	OpenNew   bool      `json:"open_new" gorm:"default:false"`
	Children  []NavMenu `json:"children,omitempty" gorm:"foreignKey:ParentID"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// VisitorLog 访问日志
type VisitorLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	PostID    *uint     `json:"post_id" gorm:"index"` // 添加索引优化统计查询
	IPAddress string    `json:"-" gorm:"size:50"`
	UserAgent string    `json:"-" gorm:"size:500"`
	Referer   string    `json:"-" gorm:"size:500"`
	Path      string    `json:"path" gorm:"size:200"`
	CreatedAt time.Time `json:"created_at"`
}
