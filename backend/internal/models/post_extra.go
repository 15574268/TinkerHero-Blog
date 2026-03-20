package models

import (
	"time"

	"gorm.io/gorm"
)

// PostPreview 草稿预览链接
type PostPreview struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	PostID    uint           `json:"post_id" gorm:"not null;index"`
	Post      *Post          `json:"post,omitempty" gorm:"foreignKey:PostID"`
	Token     string         `json:"token" gorm:"unique;not null;size:64"` // 随机访问令牌
	CreatedBy uint           `json:"created_by" gorm:"not null"`           // 创建者ID
	ExpiredAt time.Time      `json:"expired_at"`                           // 过期时间
	ViewCount int            `json:"view_count" gorm:"default:0"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// TableName 指定表名
func (PostPreview) TableName() string {
	return "post_previews"
}

// FriendLinkApply 友链申请
type FriendLinkApply struct {
	ID          uint              `json:"id" gorm:"primaryKey"`
	Name        string            `json:"name" gorm:"not null;size:50"`
	URL         string            `json:"url" gorm:"not null;size:200"`
	Logo        string            `json:"logo" gorm:"size:200"`
	Description string            `json:"description" gorm:"size:200"`
	Email       string            `json:"email" gorm:"size:100"` // 申请人邮箱
	Status      FriendLinkStatus  `json:"status" gorm:"default:pending"` // pending, approved, rejected
	Reason      string            `json:"reason" gorm:"size:200"` // 拒绝原因
	AppliedBy   *uint             `json:"applied_by"` // 申请人用户ID（如果是注册用户）
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
	DeletedAt   gorm.DeletedAt    `json:"-" gorm:"index"`
}

// FriendLinkStatus 友链状态
type FriendLinkStatus string

const (
	LinkStatusPending  FriendLinkStatus = "pending"  // 待审核
	LinkStatusApproved FriendLinkStatus = "approved" // 已通过
	LinkStatusRejected FriendLinkStatus = "rejected" // 已拒绝
)

// TableName 指定表名
func (FriendLinkApply) TableName() string {
	return "friend_link_applies"
}

// CreatePreviewRequest 创建预览链接请求
type CreatePreviewRequest struct {
	PostID    uint      `json:"post_id" binding:"required"`
	ExpiresIn int       `json:"expires_in"` // 过期时间（小时），默认24小时
}

// ApplyFriendLinkRequest 友链申请请求
type ApplyFriendLinkRequest struct {
	Name        string `json:"name" binding:"required,max=50"`
	URL         string `json:"url" binding:"required,url,max=200"`
	Logo        string `json:"logo" binding:"max=200"`
	Description string `json:"description" binding:"max=200"`
	Email       string `json:"email" binding:"required,email,max=100"`
}

// HandleApplyRequest 处理友链申请请求
type HandleApplyRequest struct {
	Status FriendLinkStatus `json:"status" binding:"oneof=approved rejected"`
	Reason string           `json:"reason"` // 拒绝原因
}
