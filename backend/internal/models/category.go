package models

import (
	"time"

	"gorm.io/gorm"
)

type Category struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Name        string         `json:"name" gorm:"index;not null;size:50"` // 添加索引优化按名称查询
	Slug        string         `json:"slug" gorm:"uniqueIndex;not null;size:50"`
	Description string         `json:"description" gorm:"size:200"`
	ParentID    *uint          `json:"parent_id" gorm:"index"` // 添加索引优化层级查询
	Parent      *Category      `json:"parent,omitempty" gorm:"foreignKey:ParentID"`
	Children    []Category     `json:"children,omitempty" gorm:"foreignKey:ParentID"`
	SortOrder   int            `json:"sort_order" gorm:"default:0"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

type Tag struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Name      string         `json:"name" gorm:"uniqueIndex;not null;size:30"` // 改为 uniqueIndex
	Slug      string         `json:"slug" gorm:"uniqueIndex;not null;size:30"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// PostTag 文章标签关联表
type PostTag struct {
	PostID uint `json:"post_id" gorm:"primaryKey"`
	TagID  uint `json:"tag_id" gorm:"primaryKey"`
}

type CreateCategoryRequest struct {
	Name        string `json:"name" binding:"required,max=50"`
	Slug        string `json:"slug" binding:"required,max=50"`
	Description string `json:"description" binding:"max=200"`
	ParentID    *uint  `json:"parent_id"`
	SortOrder   int    `json:"sort_order"`
}

type CreateTagRequest struct {
	Name string `json:"name" binding:"required,max=30"`
	Slug string `json:"slug" binding:"required,max=30"`
}
