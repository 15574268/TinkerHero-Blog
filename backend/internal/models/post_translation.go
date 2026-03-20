package models

import (
	"time"

	"gorm.io/gorm"
)

// PostTranslation 文章多语言版本
type PostTranslation struct {
	ID           uint           `json:"id" gorm:"primaryKey"`
	PostID       uint           `json:"post_id" gorm:"not null;uniqueIndex:idx_post_language"`
	Post         Post           `json:"post,omitempty" gorm:"foreignKey:PostID"`
	Language     string         `json:"language" gorm:"not null;size:10;uniqueIndex:idx_post_language"` // PostID+Language 联合唯一索引
	Title        string         `json:"title" gorm:"not null"`
	Content      string         `json:"content" gorm:"type:text"`
	Summary      string         `json:"summary"`
	IsAutoTranslated bool       `json:"is_auto_translated" gorm:"default:false"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

// TableName 设置表名
func (PostTranslation) TableName() string {
	return "post_translations"
}
