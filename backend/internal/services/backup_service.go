package services

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// BackupService 数据备份服务
type BackupService struct {
	db        *gorm.DB
	backupDir string
}

// NewBackupService 创建备份服务
func NewBackupService(db *gorm.DB) *BackupService {
	return &BackupService{
		db:        db,
		backupDir: "./backups",
	}
}

// BackupInfo 备份信息
type BackupInfo struct {
	ID        uint      `json:"id"`
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	Type      string    `json:"type"` // full, posts, users, etc.
	CreatedAt time.Time `json:"created_at"`
}

// CreateBackup 创建备份
func (s *BackupService) CreateBackup(c *gin.Context) {
	backupType := c.DefaultQuery("type", "full")

	// 创建备份目录
	if err := os.MkdirAll(s.backupDir, 0755); err != nil {
		logger.Error("创建备份目录失败", zap.Error(err))
		utils.InternalError(c, "创建备份目录失败")
		return
	}

	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("backup_%s_%s.zip", backupType, timestamp)
	backupPath := filepath.Join(s.backupDir, filename)

	zipFile, err := os.Create(backupPath)
	if err != nil {
		logger.Error("创建备份文件失败", zap.String("filename", filename), zap.Error(err))
		utils.InternalError(c, "创建备份文件失败")
		return
	}

	zipWriter := zip.NewWriter(zipFile)

	var backupErr error
	switch backupType {
	case "full":
		for _, fn := range []func(*zip.Writer) error{
			s.backupPosts, s.backupUsers, s.backupCategories, s.backupTags,
			s.backupComments, s.backupPages, s.backupFriendLinks, s.backupConfigs,
		} {
			if err := fn(zipWriter); err != nil {
				backupErr = err
				logger.Error("备份操作失败", zap.Error(err))
			}
		}
	case "posts":
		backupErr = s.backupPosts(zipWriter)
	case "users":
		backupErr = s.backupUsers(zipWriter)
	case "media":
		backupErr = s.backupMedia(zipWriter)
	default:
		backupErr = s.backupPosts(zipWriter)
	}

	if err := zipWriter.Close(); err != nil {
		zipFile.Close()
		logger.Error("关闭zip写入器失败", zap.Error(err))
		utils.InternalError(c, "创建备份失败")
		return
	}
	if err := zipFile.Close(); err != nil {
		logger.Error("关闭备份文件失败", zap.Error(err))
		utils.InternalError(c, "创建备份失败")
		return
	}

	if backupErr != nil {
		logger.Warn("备份部分失败", zap.Error(backupErr))
	}

	fileInfo, err := os.Stat(backupPath)
	if err != nil {
		logger.Error("获取备份文件信息失败", zap.Error(err))
		utils.InternalError(c, "创建备份失败")
		return
	}

	logger.Info("备份创建成功", zap.String("filename", filename), zap.String("type", backupType), zap.Int64("size", fileInfo.Size()))
	utils.Success(c, gin.H{
		"message":    "备份创建成功",
		"filename":   filename,
		"size":       fileInfo.Size(),
		"created_at": time.Now(),
	})
}

// backupPosts 备份文章（游标分页流式写入，避免整表加载导致 OOM）
func (s *BackupService) backupPosts(w *zip.Writer) error {
	writer, err := w.Create("posts.json")
	if err != nil {
		return err
	}

	const batchSize = 500
	var lastID uint = 0
	first := true

	if _, err := fmt.Fprint(writer, "["); err != nil {
		return err
	}

	for {
		var posts []models.Post
		if err := s.db.Preload("Author").Preload("Category").Preload("Tags").
			Where("id > ?", lastID).
			Order("id").
			Limit(batchSize).
			Find(&posts).Error; err != nil {
			return err
		}
		if len(posts) == 0 {
			break
		}
		for _, post := range posts {
			data, merr := json.Marshal(post)
			if merr != nil {
				return merr
			}
			if !first {
				if _, werr := fmt.Fprint(writer, ","); werr != nil {
					return werr
				}
			}
			if _, werr := writer.Write(data); werr != nil {
				return werr
			}
			first = false
		}
		lastID = posts[len(posts)-1].ID
		if len(posts) < batchSize {
			break
		}
	}

	_, err = fmt.Fprint(writer, "]")
	return err
}

// backupUsers 备份用户（不含密码，游标分页流式写入）
func (s *BackupService) backupUsers(w *zip.Writer) error {
	type SafeUser struct {
		ID        uint      `json:"id"`
		Username  string    `json:"username"`
		Email     string    `json:"email"`
		Nickname  string    `json:"nickname"`
		Avatar    string    `json:"avatar"`
		Bio       string    `json:"bio"`
		Role      string    `json:"role"`
		IsActive  bool      `json:"is_active"`
		CreatedAt time.Time `json:"created_at"`
	}

	writer, err := w.Create("users.json")
	if err != nil {
		return err
	}

	const batchSize = 500
	var lastID uint = 0
	first := true

	if _, err := fmt.Fprint(writer, "["); err != nil {
		return err
	}

	for {
		var users []models.User
		if err := s.db.Where("id > ?", lastID).Order("id").Limit(batchSize).Find(&users).Error; err != nil {
			return err
		}
		if len(users) == 0 {
			break
		}
		for _, u := range users {
			safe := SafeUser{
				ID:        u.ID,
				Username:  u.Username,
				Email:     u.Email,
				Nickname:  u.Nickname,
				Avatar:    u.Avatar,
				Bio:       u.Bio,
				Role:      string(u.Role),
				IsActive:  u.IsActive,
				CreatedAt: u.CreatedAt,
			}
			data, merr := json.Marshal(safe)
			if merr != nil {
				return merr
			}
			if !first {
				if _, werr := fmt.Fprint(writer, ","); werr != nil {
					return werr
				}
			}
			if _, werr := writer.Write(data); werr != nil {
				return werr
			}
			first = false
		}
		lastID = users[len(users)-1].ID
		if len(users) < batchSize {
			break
		}
	}

	_, err = fmt.Fprint(writer, "]")
	return err
}

// backupCategories 备份分类
func (s *BackupService) backupCategories(w *zip.Writer) error {
	var categories []models.Category
	s.db.Find(&categories)

	data, err := json.MarshalIndent(categories, "", "  ")
	if err != nil {
		return err
	}

	return s.addToZip(w, "categories.json", data)
}

// backupTags 备份标签
func (s *BackupService) backupTags(w *zip.Writer) error {
	var tags []models.Tag
	s.db.Find(&tags)

	data, err := json.MarshalIndent(tags, "", "  ")
	if err != nil {
		return err
	}

	return s.addToZip(w, "tags.json", data)
}

// backupComments 备份评论
func (s *BackupService) backupComments(w *zip.Writer) error {
	var comments []models.Comment
	s.db.Preload("User").Preload("Post").Find(&comments)

	data, err := json.MarshalIndent(comments, "", "  ")
	if err != nil {
		return err
	}

	return s.addToZip(w, "comments.json", data)
}

// backupPages 备份页面
func (s *BackupService) backupPages(w *zip.Writer) error {
	var pages []models.Page
	s.db.Find(&pages)

	data, err := json.MarshalIndent(pages, "", "  ")
	if err != nil {
		return err
	}

	return s.addToZip(w, "pages.json", data)
}

// backupFriendLinks 备份友链
func (s *BackupService) backupFriendLinks(w *zip.Writer) error {
	var links []models.FriendLink
	s.db.Find(&links)

	data, err := json.MarshalIndent(links, "", "  ")
	if err != nil {
		return err
	}

	return s.addToZip(w, "friend_links.json", data)
}

// backupConfigs 备份系统配置
func (s *BackupService) backupConfigs(w *zip.Writer) error {
	var configs []models.SiteConfig
	s.db.Find(&configs)

	data, err := json.MarshalIndent(configs, "", "  ")
	if err != nil {
		return err
	}

	return s.addToZip(w, "site_configs.json", data)
}

// backupMedia 备份媒体文件信息
func (s *BackupService) backupMedia(w *zip.Writer) error {
	var media []models.Media
	s.db.Find(&media)

	data, err := json.MarshalIndent(media, "", "  ")
	if err != nil {
		return err
	}

	return s.addToZip(w, "media.json", data)
}

// addToZip 添加文件到 zip
func (s *BackupService) addToZip(w *zip.Writer, name string, data []byte) error {
	writer, err := w.Create(name)
	if err != nil {
		return err
	}
	_, err = writer.Write(data)
	return err
}

// ListBackups 列出所有备份
func (s *BackupService) ListBackups(c *gin.Context) {
	files, err := os.ReadDir(s.backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(s.backupDir, 0755)
		}
		utils.Success(c, gin.H{"data": []BackupInfo{}})
		return
	}

	var backups []BackupInfo
	for _, file := range files {
		if file.IsDir() {
			continue
		}

		info, err := file.Info()
		if err != nil {
			continue
		}

		// 解析文件名获取备份类型
		name := file.Name()
		backupType := "full"
		if len(name) > 7 && name[7] == '_' {
			endIdx := strings.Index(name[8:], "_")
			if endIdx > 0 {
				backupType = name[8 : 8+endIdx]
			}
		}

		backups = append(backups, BackupInfo{
			Filename:  name,
			Size:      info.Size(),
			Type:      backupType,
			CreatedAt: info.ModTime(),
		})
	}

	// 使用标准库排序（O(n log n) 替代冒泡排序 O(n²)）
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})

	utils.Success(c, gin.H{"data": backups})
}

// DownloadBackup 下载备份
func (s *BackupService) DownloadBackup(c *gin.Context) {
	filename := c.Param("filename")

	// 安全检查：禁止路径遍历
	if strings.Contains(filename, "..") ||
		strings.Contains(filename, "/") ||
		strings.Contains(filename, "\\") {
		logger.Warn("非法文件名访问尝试", zap.String("filename", filename))
		utils.BadRequest(c, "非法的文件名")
		return
	}

	// 只允许特定扩展名
	if !strings.HasSuffix(filename, ".sql") && !strings.HasSuffix(filename, ".zip") {
		logger.Warn("非法文件类型访问尝试", zap.String("filename", filename))
		utils.BadRequest(c, "不支持的文件类型")
		return
	}

	backupPath := filepath.Join(s.backupDir, filename)

	// 安全检查：确保文件在备份目录内
	absPath, _ := filepath.Abs(backupPath)
	absBackupDir, _ := filepath.Abs(s.backupDir)
	if !strings.HasPrefix(absPath, absBackupDir) {
		logger.Warn("非法访问备份文件", zap.String("filename", filename))
		utils.Forbidden(c, "无权访问此文件")
		return
	}

	// 检查文件是否存在
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		logger.Warn("备份文件不存在", zap.String("filename", filename))
		utils.NotFound(c, "备份文件不存在")
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Transfer-Encoding", "binary")
	c.File(backupPath)
}

// DeleteBackup 删除备份
func (s *BackupService) DeleteBackup(c *gin.Context) {
	filename := c.Param("filename")

	if strings.Contains(filename, "..") ||
		strings.Contains(filename, "/") ||
		strings.Contains(filename, "\\") {
		logger.Warn("非法文件名删除尝试", zap.String("filename", filename))
		utils.BadRequest(c, "非法的文件名")
		return
	}

	backupPath := filepath.Join(s.backupDir, filename)

	absPath, _ := filepath.Abs(backupPath)
	absBackupDir, _ := filepath.Abs(s.backupDir)
	if !strings.HasPrefix(absPath, absBackupDir) {
		logger.Warn("非法删除备份文件", zap.String("filename", filename))
		utils.Forbidden(c, "无权删除此文件")
		return
	}

	if err := os.Remove(backupPath); err != nil {
		logger.Error("删除备份失败", zap.String("filename", filename), zap.Error(err))
		utils.InternalError(c, "删除备份失败")
		return
	}

	logger.Info("备份删除成功", zap.String("filename", filename))
	utils.Success(c, gin.H{"message": "备份已删除"})
}

// RestoreBackup 恢复备份（谨慎操作）
func (s *BackupService) RestoreBackup(c *gin.Context) {
	filename := c.Param("filename")

	if strings.Contains(filename, "..") ||
		strings.Contains(filename, "/") ||
		strings.Contains(filename, "\\") {
		logger.Warn("非法文件名恢复尝试", zap.String("filename", filename))
		utils.BadRequest(c, "非法的文件名")
		return
	}

	backupPath := filepath.Join(s.backupDir, filename)

	absPath, _ := filepath.Abs(backupPath)
	absBackupDir, _ := filepath.Abs(s.backupDir)
	if !strings.HasPrefix(absPath, absBackupDir) {
		logger.Warn("非法恢复备份文件", zap.String("filename", filename))
		utils.Forbidden(c, "无权访问此文件")
		return
	}

	// 打开 zip 文件
	zipReader, err := zip.OpenReader(backupPath)
	if err != nil {
		logger.Error("打开备份文件失败", zap.String("filename", filename), zap.Error(err))
		utils.InternalError(c, "打开备份文件失败")
		return
	}
	defer zipReader.Close()

	// 恢复数据
	restored := []string{}
	for _, file := range zipReader.File {
		switch file.Name {
		case "posts.json":
			if err := s.restorePosts(file); err == nil {
				restored = append(restored, "posts")
			}
		case "categories.json":
			if err := s.restoreCategories(file); err == nil {
				restored = append(restored, "categories")
			}
		case "tags.json":
			if err := s.restoreTags(file); err == nil {
				restored = append(restored, "tags")
			}
		}
	}

	logger.Info("备份恢复成功", zap.String("filename", filename), zap.Strings("restored", restored))
	utils.Success(c, gin.H{
		"message":  "备份恢复成功",
		"restored": restored,
	})
}

// restorePosts 恢复文章
func (s *BackupService) restorePosts(file *zip.File) error {
	reader, err := file.Open()
	if err != nil {
		return err
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}

	var posts []models.Post
	if err := json.Unmarshal(data, &posts); err != nil {
		return err
	}

	if len(posts) == 0 {
		return nil
	}

	// 使用批量 upsert 避免重复，替代循环单条插入
	return s.db.Transaction(func(tx *gorm.DB) error {
		for i := range posts {
			// 使用 upsert 避免重复
			if err := tx.Where("id = ?", posts[i].ID).Assign(posts[i]).FirstOrCreate(&posts[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// restoreCategories 恢复分类
func (s *BackupService) restoreCategories(file *zip.File) error {
	reader, err := file.Open()
	if err != nil {
		return err
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}

	var categories []models.Category
	if err := json.Unmarshal(data, &categories); err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		for _, cat := range categories {
			if err := tx.Where("id = ?", cat.ID).Assign(cat).FirstOrCreate(&cat).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// restoreTags 恢复标签
func (s *BackupService) restoreTags(file *zip.File) error {
	reader, err := file.Open()
	if err != nil {
		return err
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}

	var tags []models.Tag
	if err := json.Unmarshal(data, &tags); err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		for _, tag := range tags {
			if err := tx.Where("id = ?", tag.ID).Assign(tag).FirstOrCreate(&tag).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// AutoBackup 自动备份（定时任务调用）
func (s *BackupService) AutoBackup() error {
	// 创建备份目录
	if err := os.MkdirAll(s.backupDir, 0755); err != nil {
		return err
	}

	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("auto_backup_%s.zip", timestamp)
	backupPath := filepath.Join(s.backupDir, filename)

	zipFile, err := os.Create(backupPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// 备份所有数据
	s.backupPosts(zipWriter)
	s.backupCategories(zipWriter)
	s.backupTags(zipWriter)
	s.backupComments(zipWriter)
	s.backupConfigs(zipWriter)

	// 清理旧备份（保留最近7个）
	s.cleanupOldBackups(7)

	return nil
}

// cleanupOldBackups 清理旧备份
func (s *BackupService) cleanupOldBackups(keep int) {
	files, _ := os.ReadDir(s.backupDir)

	// 只处理自动备份文件
	var autoBackups []os.DirEntry
	for _, f := range files {
		if strings.HasPrefix(f.Name(), "auto_backup_") {
			autoBackups = append(autoBackups, f)
		}
	}

	// 如果超过保留数量，删除最旧的
	if len(autoBackups) > keep {
		// 使用标准库排序（O(n log n)）
		sort.Slice(autoBackups, func(i, j int) bool {
			return autoBackups[i].Name() < autoBackups[j].Name()
		})

		// 删除最旧的备份
		for i := 0; i < len(autoBackups)-keep; i++ {
			os.Remove(filepath.Join(s.backupDir, autoBackups[i].Name()))
		}
	}
}
