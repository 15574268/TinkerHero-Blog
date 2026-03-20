package models

import (
	"time"

	"gorm.io/gorm"
)

// PostVersion 文章版本历史
type PostVersion struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	PostID    uint           `json:"post_id" gorm:"not null;index"`
	Post      Post           `json:"post,omitempty" gorm:"foreignKey:PostID"`
	Title     string         `json:"title" gorm:"not null"`
	Content   string         `json:"content" gorm:"type:text"`
	Summary   string         `json:"summary"`
	EditorID  uint           `json:"editor_id" gorm:"not null"`
	Editor    User           `json:"editor,omitempty" gorm:"foreignKey:EditorID"`
	Version   int            `json:"version" gorm:"not null"`
	ChangeLog string         `json:"change_log" gorm:"type:text"` // 变更说明
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}
