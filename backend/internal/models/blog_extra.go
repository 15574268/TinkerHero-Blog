package models

import (
	"time"

	"gorm.io/gorm"
)

// Series 文章合集/专栏
type Series struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Title       string         `json:"title" gorm:"not null;size:100"`
	Slug        string         `json:"slug" gorm:"unique;not null;size:100"`
	Description string         `json:"description" gorm:"size:500"`
	CoverImage  string         `json:"cover_image" gorm:"size:500"`
	AuthorID    uint           `json:"author_id" gorm:"not null;index"`
	Author      User           `json:"author,omitempty" gorm:"foreignKey:AuthorID"`
	Posts       []SeriesPost   `json:"posts,omitempty" gorm:"foreignKey:SeriesID"`
	PostCount   int            `json:"post_count" gorm:"default:0"`
	ViewCount   int            `json:"view_count" gorm:"default:0"`
	Status      string         `json:"status" gorm:"default:'draft';size:20"` // draft, published
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// SeriesPost 合集文章关联
type SeriesPost struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	SeriesID  uint      `json:"series_id" gorm:"not null;index"`
	Series    Series    `json:"series,omitempty" gorm:"foreignKey:SeriesID"`
	PostID    uint      `json:"post_id" gorm:"not null;index"`
	Post      Post      `json:"post,omitempty" gorm:"foreignKey:PostID"`
	SortOrder int       `json:"sort_order" gorm:"default:0"` // 文章在合集中的顺序
	CreatedAt time.Time `json:"created_at"`
}

// PostTemplate 文章模板
type PostTemplate struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Name        string         `json:"name" gorm:"not null;size:50"`
	Description string         `json:"description" gorm:"size:200"`
	Category    string         `json:"category" gorm:"size:30"` // tutorial, review, news, tech
	Content     string         `json:"content" gorm:"type:text"` // 模板内容，包含占位符
	IsDefault   bool           `json:"is_default" gorm:"default:false"`
	AuthorID    uint           `json:"author_id" gorm:"index"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// Announcement 公告
type Announcement struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Title     string         `json:"title" gorm:"not null;size:100"`
	Content   string         `json:"content" gorm:"type:text"`
	Type      string         `json:"type" gorm:"default:'info';size:20"` // info, warning, success, error
	Link      string         `json:"link" gorm:"size:200"` // 可选链接
	StartTime *time.Time     `json:"start_time"` // 显示开始时间
	EndTime   *time.Time     `json:"end_time"`   // 显示结束时间
	IsActive  bool           `json:"is_active" gorm:"default:true"`
	SortOrder int            `json:"sort_order" gorm:"default:0"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// Resource 资源/书单
type Resource struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Title       string         `json:"title" gorm:"not null;size:100"`
	Description string         `json:"description" gorm:"size:500"`
	URL         string         `json:"url" gorm:"size:200"`
	CoverImage  string         `json:"cover_image" gorm:"size:500"`
	Category    string         `json:"category" gorm:"size:30"` // book, tool, website, course
	Tags        string         `json:"tags" gorm:"size:200"` // 逗号分隔的标签
	Rating      float64        `json:"rating" gorm:"default:0"` // 评分 0-5
	IsRecommended bool         `json:"is_recommended" gorm:"default:false"`
	SortOrder   int            `json:"sort_order" gorm:"default:0"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// Changelog 更新日志
type Changelog struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Version     string         `json:"version" gorm:"uniqueIndex;not null;size:20"` // 添加唯一索引
	Title       string         `json:"title" gorm:"not null;size:100"`
	Content     string         `json:"content" gorm:"type:text"` // Markdown 格式
	Type        string         `json:"type" gorm:"default:'release';size:20;index"` // 添加索引
	PublishedAt time.Time      `json:"published_at" gorm:"index"` // 添加索引
	IsPublished bool           `json:"is_published" gorm:"default:false;index"` // 添加索引
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// Milestone 里程碑/成就
type Milestone struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Title       string         `json:"title" gorm:"not null;size:100"`
	Description string         `json:"description" gorm:"size:500"`
	Icon        string         `json:"icon" gorm:"size:50"` // emoji 或图标名
	Type        string         `json:"type" gorm:"size:20"` // posts, views, comments, subscribers, years
	Value       int            `json:"value"` // 达成值
	AchievedAt  *time.Time     `json:"achieved_at"` // 达成时间
	IsAchieved  bool           `json:"is_achieved" gorm:"default:false"`
	SortOrder   int            `json:"sort_order" gorm:"default:0"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// DeadLink 死链记录
type DeadLink struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	URL         string         `json:"url" gorm:"not null;size:500"`
	SourceType  string         `json:"source_type" gorm:"size:20"` // post, page, comment
	SourceID    uint           `json:"source_id"`
	StatusCode  int            `json:"status_code"` // HTTP 状态码
	ErrorMsg    string         `json:"error_msg" gorm:"size:500"`
	IsFixed     bool           `json:"is_fixed" gorm:"default:false"`
	CheckedAt   time.Time      `json:"checked_at"`
	FixedAt     *time.Time     `json:"fixed_at"`
	CreatedAt   time.Time      `json:"created_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// ReadingBehavior 阅读行为记录
type ReadingBehavior struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	PostID       uint      `json:"post_id" gorm:"not null;index"`
	VisitorID    string    `json:"visitor_id" gorm:"size:64;index"` // 访客标识
	SessionID    string    `json:"session_id" gorm:"size:64;index"` // 会话ID
	IPAddress    string    `json:"ip_address" gorm:"size:50"`
	UserAgent    string    `json:"user_agent" gorm:"size:500"`
	Referrer     string    `json:"referrer" gorm:"size:500"` // 来源
	Device       string    `json:"device" gorm:"size:20"` // mobile, tablet, desktop
	Browser      string    `json:"browser" gorm:"size:50"`
	OS           string    `json:"os" gorm:"size:50"`
	Country      string    `json:"country" gorm:"size:50"`
	Region       string    `json:"region" gorm:"size:50"` // 省份/市
	City         string    `json:"city" gorm:"size:50"`
	TimeOnPage   int       `json:"time_on_page"` // 停留时间(秒)
	ScrollDepth  int       `json:"scroll_depth"` // 滚动深度(百分比)
	IsBounce     bool      `json:"is_bounce"` // 是否跳出
	EnteredAt    time.Time `json:"entered_at"` // 进入时间
	ExitedAt     *time.Time `json:"exited_at"` // 离开时间
	CreatedAt    time.Time `json:"created_at"`
}

// TableName 方法
func (Series) TableName() string       { return "series" }
func (SeriesPost) TableName() string   { return "series_posts" }
func (PostTemplate) TableName() string { return "post_templates" }
func (Announcement) TableName() string { return "announcements" }
func (Resource) TableName() string     { return "resources" }
func (Changelog) TableName() string    { return "changelogs" }
func (Milestone) TableName() string    { return "milestones" }
func (DeadLink) TableName() string     { return "dead_links" }
func (ReadingBehavior) TableName() string { return "reading_behaviors" }
