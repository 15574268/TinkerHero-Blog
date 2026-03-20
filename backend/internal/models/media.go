package models

import (
	"time"

	"gorm.io/gorm"
)

type MediaType string

const (
	MediaTypeImage  MediaType = "image"
	MediaTypeVideo  MediaType = "video"
	MediaTypeFile   MediaType = "file"
)

type Media struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	UserID      uint           `json:"user_id" gorm:"not null;index"`
	User        User           `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Filename    string         `json:"filename" gorm:"not null;size:255"`
	OriginalName string        `json:"original_name" gorm:"not null;size:255"`
	FileType    MediaType      `json:"file_type" gorm:"not null"`
	MimeType    string         `json:"mime_type" gorm:"not null;size:100"`
	Size        int64          `json:"size"` // bytes
	Width       int            `json:"width"`  // 图片宽度
	Height      int            `json:"height"` // 图片高度
	URL         string         `json:"url" gorm:"not null;size:500"`
	Thumbnail   string         `json:"thumbnail" gorm:"size:500"`
	Alt         string         `json:"alt" gorm:"size:200"`
	Description string         `json:"description" gorm:"size:500"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}
