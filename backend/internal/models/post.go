package models

import (
	"time"

	"gorm.io/gorm"
)

type PostStatus string

const (
	PostDraft     PostStatus = "draft"
	PostPublished PostStatus = "published"
	PostScheduled PostStatus = "scheduled" // 定时发布
)

type Post struct {
	ID           uint           `json:"id" gorm:"primaryKey"`
	Title        string         `json:"title" gorm:"not null;size:200"`
	Slug         string         `json:"slug" gorm:"uniqueIndex;not null;size:200"` // 改为 uniqueIndex
	Content      string         `json:"content" gorm:"type:text"`
	Summary      string         `json:"summary" gorm:"size:500"`
	CoverImage   string         `json:"cover_image" gorm:"size:500"`
	AuthorID     uint           `json:"author_id" gorm:"not null;index"`
	Author       User           `json:"author,omitempty" gorm:"foreignKey:AuthorID"`
	CategoryID   *uint          `json:"category_id" gorm:"index"` // 添加索引优化按分类查询
	Category     *Category      `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	Tags         []Tag          `json:"tags,omitempty" gorm:"many2many:post_tags;"`
	ViewCount    int            `json:"view_count" gorm:"default:0"`
	LikeCount    int            `json:"like_count" gorm:"default:0"`
	CommentCount int            `json:"comment_count" gorm:"default:0"`
	Status       PostStatus     `json:"status" gorm:"default:draft;index"`
	IsTop        bool           `json:"is_top" gorm:"default:false;index"` // 添加索引优化置顶查询
	AllowComment bool           `json:"allow_comment" gorm:"default:true"`
	Password     string         `json:"-" gorm:"size:100"` // 文章访问密码（为空表示公开）
	PasswordHint string         `json:"password_hint,omitempty" gorm:"size:100"` // 密码提示
	PublishedAt  *time.Time     `json:"published_at" gorm:"index"` // 添加索引优化定时发布查询
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

type CreatePostRequest struct {
	Title        string     `json:"title" binding:"required,max=200"`
	Slug         string     `json:"slug" binding:"required,max=200"`
	Content      string     `json:"content" binding:"required"`
	Summary      string     `json:"summary" binding:"max=500"`
	CoverImage   string     `json:"cover_image" binding:"max=500"`
	CategoryID   *uint      `json:"category_id"`
	TagIDs       []uint     `json:"tag_ids"`
	Status       PostStatus `json:"status" binding:"oneof=draft published scheduled"`
	IsTop        bool       `json:"is_top"`
	AllowComment bool       `json:"allow_comment"`
	Password     string     `json:"password" binding:"max=100"`      // 文章密码
	PasswordHint string     `json:"password_hint" binding:"max=100"` // 密码提示
	PublishedAt  *time.Time `json:"published_at"`                    // 定时发布时间
}

type UpdatePostRequest struct {
	Title        string     `json:"title" binding:"max=200"`
	Content      string     `json:"content"`
	Summary      *string    `json:"summary" binding:"omitempty,max=500"`
	CoverImage   *string    `json:"cover_image" binding:"omitempty,max=500"`
	CategoryID   *uint      `json:"category_id"`
	TagIDs       []uint     `json:"tag_ids"`
	Status       PostStatus `json:"status" binding:"omitempty,oneof=draft published scheduled"`
	IsTop        *bool      `json:"is_top"`
	AllowComment *bool      `json:"allow_comment"`
	Password     *string    `json:"password" binding:"omitempty,max=100"`
	PasswordHint *string    `json:"password_hint" binding:"omitempty,max=100"`
	PublishedAt  *time.Time `json:"published_at"`
}

