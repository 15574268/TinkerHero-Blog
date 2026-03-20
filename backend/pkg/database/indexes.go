package database

import (
	"fmt"

	"gorm.io/gorm"
)

// CreateIndexes 创建数据库索引
func CreateIndexes(db *gorm.DB) error {
	indexes := []string{
		// 用户表索引
		"CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
		"CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
		"CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",

		// 文章表索引
		"CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id)",
		"CREATE INDEX IF NOT EXISTS idx_posts_category_id ON posts(category_id)",
		"CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)",
		"CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)",
		"CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at)",
		"CREATE INDEX IF NOT EXISTS idx_posts_is_top ON posts(is_top)",

		// 复合索引：状态+创建时间（用于列表查询）
		"CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at DESC)",

		// 复合索引：作者+状态
		"CREATE INDEX IF NOT EXISTS idx_posts_author_status ON posts(author_id, status)",

		// 评论表索引
		"CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status)",
		"CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at)",

		// 复合索引：文章+状态
		"CREATE INDEX IF NOT EXISTS idx_comments_post_status ON comments(post_id, status)",

		// 媒体表索引
		"CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at)",

		// 访问日志索引
		"CREATE INDEX IF NOT EXISTS idx_visitor_logs_post_id ON visitor_logs(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_visitor_logs_created_at ON visitor_logs(created_at)",

		// 点赞表索引
		"CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)",
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_unique ON likes(post_id, COALESCE(user_id, 0), ip_address)",

		// 收藏表索引
		"CREATE INDEX IF NOT EXISTS idx_favorites_post_id ON favorites(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id)",
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique ON favorites(post_id, user_id)",

		// 文章标签关联表索引
		"CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id ON post_tags(tag_id)",
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_post_tags_unique ON post_tags(post_id, tag_id)",

		// 通知表索引
		"CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)",
		"CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)",

		// 分类表索引
		"CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)",
		"CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)",

		// 标签表索引
		"CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)",

		// 文章版本历史索引
		"CREATE INDEX IF NOT EXISTS idx_post_versions_post_id ON post_versions(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_post_versions_version ON post_versions(post_id, version DESC)",
	}

	for _, sql := range indexes {
		if err := db.Exec(sql).Error; err != nil {
			return fmt.Errorf("failed to create index: %w", err)
		}
	}

	return nil
}

// AnalyzeTable 分析表（更新统计信息）
func AnalyzeTable(db *gorm.DB) error {
	tables := []string{"users", "posts", "comments", "media", "visitor_logs"}
	for _, table := range tables {
		if err := db.Exec("ANALYZE " + table).Error; err != nil {
			return fmt.Errorf("failed to analyze table %s: %w", table, err)
		}
	}
	return nil
}
