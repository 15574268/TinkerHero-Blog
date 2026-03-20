package services

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/cdn"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// 扩展名 -> MIME（用于校验）。新增扩展名时在此同步添加。
var extToMime = map[string]string{
	// 图片
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".ico":  "image/x-icon",
	".svg":  "image/svg+xml",
	".bmp":  "image/bmp",
	".tiff": "image/tiff",
	".tif":  "image/tiff",
	".avif": "image/avif",
	// 视频
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".ogv":  "video/ogg",
}

// mimeAliases 处理同一格式的多个 MIME 变体（如 ICO 有两种写法）
var mimeAliases = map[string]string{
	"image/vnd.microsoft.icon": "image/x-icon",
	"image/x-ico":              "image/x-icon",
}

type UploadService struct {
	db          *gorm.DB
	uploadDir   string
	maxFileSize int64
	getConfig   func(key string) string
}

// NewUploadService 创建上传服务；getConfig 优先（后台配置），为空则用 env
func NewUploadService(db *gorm.DB, getConfig func(key string) string) *UploadService {
	return &UploadService{
		db:        db,
		uploadDir: "./uploads",
		getConfig: getConfig,
	}
}

// getMaxFileSize 每次请求动态读取最大文件大小（后台改完立即生效）
func (s *UploadService) getMaxFileSize() int64 {
	maxMB := 0
	if s.getConfig != nil {
		if v := s.getConfig("upload_max_file_size_mb"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n >= 1 {
				maxMB = n
			}
		}
	}
	if maxMB < 1 {
		maxMB = utils.GetEnvInt("UPLOAD_MAX_FILE_SIZE_MB", 50)
	}
	if maxMB < 1 {
		maxMB = 50
	}
	return int64(maxMB) * 1024 * 1024
}

// buildAllowedSets 每次请求动态构建允许的扩展名和 MIME 集合（后台改完立即生效，无需重启）
func (s *UploadService) buildAllowedSets() (allowedExts map[string]bool, allowedMIMEs map[string]bool) {
	extList := ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.ogv"
	if s.getConfig != nil {
		if v := s.getConfig("upload_allowed_extensions"); v != "" {
			extList = v
		}
	}
	if extList == "" {
		if e := os.Getenv("UPLOAD_ALLOWED_EXTENSIONS"); e != "" {
			extList = e
		}
	}
	if extList == "" {
		extList = ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.ogv"
	}

	allowedExts = make(map[string]bool)
	allowedMIMEs = make(map[string]bool)
	allowedMIMEs["application/octet-stream"] = true // 部分浏览器对视频使用此 MIME

	for _, part := range strings.Split(extList, ",") {
		ext := strings.TrimSpace(strings.ToLower(part))
		if ext == "" {
			continue
		}
		if ext[0] != '.' {
			ext = "." + ext // 容错：用户忘记写点号
		}
		allowedExts[ext] = true
		if mime, ok := extToMime[ext]; ok {
			allowedMIMEs[mime] = true
		}
	}

	if len(allowedExts) == 0 {
		// 兜底默认值
		for _, ext := range []string{".jpg", ".jpeg", ".png", ".gif", ".webp"} {
			allowedExts[ext] = true
			allowedMIMEs[extToMime[ext]] = true
		}
	}
	return
}

// applyCDN 若后台开启 CDN 则返回 CDN 前缀后的 URL，否则返回原 URL
func (s *UploadService) applyCDN(urlPath string) string {
	if s.getConfig == nil {
		return cdn.GetCDNURL(urlPath)
	}
	if s.getConfig("upload_cdn_enabled") != "true" {
		return cdn.GetCDNURL(urlPath)
	}
	base := s.getConfig("upload_cdn_url")
	if base == "" {
		return cdn.GetCDNURL(urlPath)
	}
	base = strings.TrimSuffix(base, "/")
	if strings.HasPrefix(urlPath, "http") {
		return urlPath
	}
	return base + urlPath
}

// UploadImage 上传图片
func (s *UploadService) UploadImage(c *gin.Context) {
	userID := c.GetUint("user_id")

	// 每次请求动态读取配置，后台修改后无需重启即生效
	allowedExts, allowedMIMEs := s.buildAllowedSets()
	maxFileSize := s.getMaxFileSize()

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		utils.BadRequest(c, "请选择文件")
		return
	}
	defer file.Close()

	// 检查文件大小
	if header.Size > maxFileSize {
		utils.BadRequest(c, "文件大小超过限制")
		return
	}

	// 先验证扩展名白名单（提前失败，减少不必要的 IO）
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExts[ext] {
		utils.BadRequest(c, fmt.Sprintf("不支持的文件扩展名 %s，请在后台设置中添加", ext))
		return
	}

	// 读取文件魔数，检测真实 MIME 类型
	buff := make([]byte, 512)
	if _, err = file.Read(buff); err != nil {
		utils.BadRequest(c, "读取文件失败")
		return
	}
	if _, err := file.Seek(0, 0); err != nil {
		utils.InternalError(c, "文件读取错误")
		return
	}

	contentType := http.DetectContentType(buff)
	// 统一 MIME 别名（如 ICO 有多种写法）
	if canonical, ok := mimeAliases[contentType]; ok {
		contentType = canonical
	}

	// MIME 校验：如果扩展名在白名单内但操作系统/浏览器报了未知 MIME，
	// 则信任扩展名白名单（SVG、ICO 等在某些环境下会被识别为 text/xml 或 application/octet-stream）
	if !allowedMIMEs[contentType] {
		// 查扩展名对应的期望 MIME，若匹配则放行
		if expected, ok := extToMime[ext]; !ok || expected != contentType {
			// 对于扩展名已在白名单、但无 extToMime 记录的格式，信任扩展名
			if _, hasMimeMapping := extToMime[ext]; hasMimeMapping {
				utils.BadRequest(c, fmt.Sprintf("文件内容与扩展名不符（检测到 %s）", contentType))
				return
			}
		}
	}
	
	filename := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), utils.GenerateRandomString(8), ext)
	yearMonth := time.Now().Format("2006/01")
	relativePath := filepath.Join(yearMonth, filename)
	absolutePath := filepath.Join(s.uploadDir, relativePath)

	// 创建目录
	dir := filepath.Dir(absolutePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		logger.Error("创建目录失败", zap.String("path", dir), zap.Error(err))
		utils.InternalError(c, "创建目录失败")
		return
	}

	// 创建文件
	dst, err := os.Create(absolutePath)
	if err != nil {
		logger.Error("创建文件失败", zap.String("path", absolutePath), zap.Error(err))
		utils.InternalError(c, "创建文件失败")
		return
	}
	defer dst.Close()

	// 复制文件
	if _, err := io.Copy(dst, file); err != nil {
		logger.Error("保存文件失败", zap.String("path", absolutePath), zap.Error(err))
		utils.InternalError(c, "保存文件失败")
		return
	}

	// Determine media type from extension
	fileType := models.MediaTypeImage
	switch ext {
	case ".mp4", ".webm", ".ogv":
		fileType = models.MediaTypeVideo
		if contentType == "application/octet-stream" {
			switch ext {
			case ".mp4":
				contentType = "video/mp4"
			case ".webm":
				contentType = "video/webm"
			case ".ogv":
				contentType = "video/ogg"
			}
		}
	}

	media := models.Media{
		UserID:       userID,
		Filename:     filename,
		OriginalName: header.Filename,
		FileType:     fileType,
		MimeType:     contentType,
		Size:         header.Size,
		URL:          fmt.Sprintf("/uploads/%s", relativePath),
	}

	if err := s.db.Create(&media).Error; err != nil {
		logger.Error("保存记录失败", zap.String("filename", filename), zap.Error(err))
		utils.InternalError(c, "保存记录失败")
		return
	}

	utils.Success(c, gin.H{
		"id":       media.ID,
		"url":      s.applyCDN(media.URL),
		"filename": filename,
	})
}

// GetAllMedia 获取所有媒体文件
func (s *UploadService) GetAllMedia(c *gin.Context) {
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	query := s.db.Model(&models.Media{})

	// 非管理员只能查看自己的文件
	if role != "admin" {
		query = query.Where("user_id = ?", userID)
	}

	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	var total int64
	query.Count(&total)

	var media []models.Media
	query = query.Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Order("created_at desc")

	if err := query.Find(&media).Error; err != nil {
		logger.Error("获取媒体列表失败", zap.Error(err))
		utils.InternalError(c, "获取媒体列表失败")
		return
	}
	for i := range media {
		media[i].URL = s.applyCDN(media[i].URL)
	}
	utils.Paginated(c, media, total, page, pageSize)
}

// DeleteMedia 删除媒体文件
func (s *UploadService) DeleteMedia(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	var media models.Media
	if err := s.db.First(&media, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "文件不存在")
		return
	}

	// 权限检查
	if media.UserID != userID && role != "admin" {
		utils.Forbidden(c, "权限不足")
		return
	}

	// Delete DB record first
	if err := s.db.Delete(&media).Error; err != nil {
		logger.Error("删除记录失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除记录失败")
		return
	}

	// Then delete the physical file
	relativePath := strings.TrimPrefix(media.URL, "/uploads/")
	if !strings.Contains(relativePath, "..") {
		absolutePath := filepath.Join(s.uploadDir, relativePath)
		if err := os.Remove(absolutePath); err != nil && !os.IsNotExist(err) {
			logger.Warn("删除物理文件失败", zap.String("path", absolutePath), zap.Error(err))
		}
	}

	utils.NoContent(c)
}
