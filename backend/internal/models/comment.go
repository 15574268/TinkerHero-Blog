package models

import (
	"time"

	"gorm.io/gorm"
)

type CommentStatus string

const (
	CommentPending  CommentStatus = "pending"
	CommentApproved CommentStatus = "approved"
	CommentRejected CommentStatus = "rejected"
)

type Comment struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	PostID    uint           `json:"post_id" gorm:"not null;index"`
	Post      Post           `json:"post,omitempty" gorm:"foreignKey:PostID"`
	UserID    *uint          `json:"user_id"` // 可为空（游客评论）
	User      *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	ParentID  *uint          `json:"parent_id" gorm:"index"` // 添加索引优化嵌套评论查询
	Parent    *Comment       `json:"parent,omitempty" gorm:"foreignKey:ParentID"`
	Replies   []Comment      `json:"replies,omitempty" gorm:"foreignKey:ParentID"`
	Author    string         `json:"author" gorm:"size:50"` // 游客名称
	Email     string         `json:"email" gorm:"size:100"` // 游客邮箱
	Website   string         `json:"website" gorm:"size:200"` // 游客网站（可选）
	Content   string         `json:"content" gorm:"not null;type:text"`
	Status    CommentStatus  `json:"status" gorm:"default:pending;index"`
	IPAddress string         `json:"-" gorm:"size:50"`
	UserAgent string         `json:"-" gorm:"size:500"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

type CreateCommentRequest struct {
	PostID    uint   `json:"post_id" binding:"required"`
	ParentID  *uint  `json:"parent_id"`
	Author    string `json:"author" binding:"max=50"`
	Email     string `json:"email" binding:"omitempty,email,max=100"`
	Website   string `json:"website" binding:"omitempty,url,max=200"`
	Content   string `json:"content" binding:"required,min=1,max=1000"`
	CaptchaID string `json:"captcha_id"`
	Captcha   string `json:"captcha"`
}

type UpdateCommentStatusRequest struct {
	Status CommentStatus `json:"status" binding:"oneof=pending approved rejected"`
}
