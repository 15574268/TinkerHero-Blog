package services

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
	"gorm.io/gorm"
)

// WatermarkService 图片水印服务
type WatermarkService struct {
	db        *gorm.DB
	mu        sync.RWMutex
	enabled   bool
	text      string
	position  string
	opacity   uint8
	fontSize  float64
	fontPath  string
	textColor color.Color
	getConfig func(key string) string      // 优先从后台配置读取
	setConfig func(key, value string) error // 写入后台配置（持久化到 DB）
}

// WatermarkConfig 水印配置（env 或默认）
type WatermarkConfig struct {
	Enabled  bool
	Text     string
	Position string
	Opacity  uint8
	FontSize float64
	FontPath string
}

// NewWatermarkService 创建水印服务；getConfig/setConfig 对接 SystemService
func NewWatermarkService(db *gorm.DB, config WatermarkConfig, getConfig func(key string) string, setConfig func(key, value string) error) *WatermarkService {
	return &WatermarkService{
		db:        db,
		enabled:   config.Enabled,
		text:      config.Text,
		position:  config.Position,
		opacity:   config.Opacity,
		fontSize:  config.FontSize,
		fontPath:  config.FontPath,
		textColor: color.RGBA{R: 255, G: 255, B: 255, A: config.Opacity},
		getConfig: getConfig,
		setConfig: setConfig,
	}
}

// ApplyWatermark 应用水印（优先从后台配置读取 watermark_enabled / watermark_text / watermark_position）
func (s *WatermarkService) ApplyWatermark(img image.Image, format string) (image.Image, error) {
	s.mu.RLock()
	enabled := s.enabled
	text := s.text
	position := s.position
	s.mu.RUnlock()
	if s.getConfig != nil {
		if v := s.getConfig("watermark_enabled"); v == "true" {
			enabled = true
		} else if v == "false" {
			enabled = false
		}
		if v := s.getConfig("watermark_text"); v != "" {
			text = v
		}
		if v := s.getConfig("watermark_position"); v != "" {
			position = v
		}
	}
	if !enabled {
		return img, nil
	}

	// 创建新画布
	bounds := img.Bounds()
	dst := image.NewRGBA(bounds)
	draw.Draw(dst, bounds, img, bounds.Min, draw.Src)

	// 使用 Go 自带的 basicfont 绘制文字水印（不依赖外部字体文件）
	s.drawBasicWatermark(dst, bounds, text, position)
	return dst, nil
}

// drawBasicWatermark 使用 basicfont 绘制文字水印
func (s *WatermarkService) drawBasicWatermark(dst *image.RGBA, bounds image.Rectangle, text, position string) {
	if text == "" {
		return
	}

	d := &font.Drawer{
		Dst:  dst,
		Src:  image.NewUniform(s.textColor),
		Face: basicfont.Face7x13,
	}

	// 计算文字宽高
	textWidth := d.MeasureString(text).Round()
	metrics := d.Face.Metrics()
	textHeight := metrics.Height.Round()

	margin := 20
	var x, y int

	switch position {
	case "top-left":
		x = bounds.Min.X + margin
		y = bounds.Min.Y + textHeight + margin
	case "top-right":
		x = bounds.Max.X - textWidth - margin
		y = bounds.Min.Y + textHeight + margin
	case "bottom-left":
		x = bounds.Min.X + margin
		y = bounds.Max.Y - margin
	case "center":
		x = (bounds.Min.X+bounds.Max.X)/2 - textWidth/2
		y = (bounds.Min.Y+bounds.Max.Y)/2 + textHeight/2
	default: // bottom-right
		x = bounds.Max.X - textWidth - margin
		y = bounds.Max.Y - margin
	}

	d.Dot = fixed.Point26_6{
		X: fixed.I(x),
		Y: fixed.I(y),
	}
	d.DrawString(text)
}

// addSimpleWatermarkWithPosition 保留旧接口以兼容调用者（现在委托给 drawBasicWatermark）
func (s *WatermarkService) addSimpleWatermarkWithPosition(dst *image.RGBA, img image.Image, position string) image.Image {
	s.drawBasicWatermark(dst, img.Bounds(), s.text, position)
	return dst
}

// blendColors 混合两个颜色
func blendColors(c1, c2 color.Color) color.Color {
	r1, g1, b1, _ := c1.RGBA()
	r2, g2, b2, a2 := c2.RGBA()

	alpha := float64(a2) / 65535.0
	invAlpha := 1.0 - alpha

	r := uint8((float64(r1)*invAlpha + float64(r2)*alpha) / 257)
	g := uint8((float64(g1)*invAlpha + float64(g2)*alpha) / 257)
	b := uint8((float64(b1)*invAlpha + float64(b2)*alpha) / 257)

	return color.RGBA{R: r, G: g, B: b, A: 255}
}

// ProcessImageWithWatermark 处理图片并添加水印
func (s *WatermarkService) ProcessImageWithWatermark(file io.Reader, contentType string) ([]byte, string, error) {
	// 解码图片
	var img image.Image
	var err error

	switch contentType {
	case "image/jpeg", "image/jpg":
		img, err = jpeg.Decode(file)
	case "image/png":
		img, err = png.Decode(file)
	default:
		// 尝试通用解码
		img, _, err = image.Decode(file)
	}

	if err != nil {
		return nil, "", fmt.Errorf("解码图片失败: %v", err)
	}

	// 应用水印
	watermarked, err := s.ApplyWatermark(img, contentType)
	if err != nil {
		return nil, "", err
	}

	// 编码回字节
	var buf bytes.Buffer
	switch contentType {
	case "image/png":
		err = png.Encode(&buf, watermarked)
	default:
		err = jpeg.Encode(&buf, watermarked, &jpeg.Options{Quality: 85})
	}

	if err != nil {
		return nil, "", fmt.Errorf("编码图片失败: %v", err)
	}

	return buf.Bytes(), contentType, nil
}

// UploadWithWatermark 上传带水印的图片
func (s *WatermarkService) UploadWithWatermark(c *gin.Context) {
	enabled := s.enabled
	if s.getConfig != nil {
		if v := s.getConfig("watermark_enabled"); v == "true" {
			enabled = true
		} else if v == "false" {
			enabled = false
		}
	}
	if !enabled {
		utils.BadRequest(c, "水印功能未启用")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		utils.BadRequest(c, "请选择文件")
		return
	}
	defer file.Close()

	// 检测内容类型
	buffer := make([]byte, 512)
	file.Read(buffer)
	contentType := strings.Split(header.Header.Get("Content-Type"), ";")[0]
	if contentType == "" {
		contentType = "image/jpeg"
	}

	// 重置文件读取位置
	file.Seek(0, 0)

	// 处理水印
	data, _, err := s.ProcessImageWithWatermark(file, contentType)
	if err != nil {
		logger.Error("处理水印失败", zap.String("filename", header.Filename), zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	// 保存文件
	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%d_%s%s", time.Now().UnixNano(), "wm", ext)
	savePath := filepath.Join("./uploads/watermarked", filename)

	// 创建目录
	if err := os.MkdirAll(filepath.Dir(savePath), 0755); err != nil {
		logger.Error("创建目录失败", zap.String("path", filepath.Dir(savePath)), zap.Error(err))
		utils.InternalError(c, "创建目录失败")
		return
	}

	// 写入文件
	if err := os.WriteFile(savePath, data, 0644); err != nil {
		logger.Error("保存文件失败", zap.String("savePath", savePath), zap.Error(err))
		utils.InternalError(c, "保存文件失败")
		return
	}

	// 写入媒体库（media 表），这样媒体库可以选择到带水印的图片
	if s.db != nil {
		userID := c.GetUint("user_id")
		media := models.Media{
			UserID:       userID,
			Filename:     filename,
			OriginalName: header.Filename,
			FileType:     models.MediaTypeImage,
			MimeType:     contentType,
			Size:         int64(len(data)),
			URL:          "/uploads/watermarked/" + filename,
		}
		if err := s.db.Create(&media).Error; err != nil {
			// 不影响上传成功（文件已落盘），只记录错误
			logger.Error("保存水印媒体记录失败", zap.String("filename", filename), zap.Error(err))
		}
	}

	logger.Info("水印添加成功", zap.String("filename", filename))
	utils.Success(c, gin.H{
		"url":      "/uploads/watermarked/" + filename,
		"filename": filename,
		"message":  "水印添加成功",
	})
}

// GetWatermarkConfig 获取水印配置（优先从 DB 读取，与 ApplyWatermark 保持一致）
func (s *WatermarkService) GetWatermarkConfig(c *gin.Context) {
	s.mu.RLock()
	enabled := s.enabled
	text := s.text
	position := s.position
	opacity := s.opacity
	fontSize := s.fontSize
	s.mu.RUnlock()

	if s.getConfig != nil {
		if v := s.getConfig("watermark_enabled"); v == "true" {
			enabled = true
		} else if v == "false" {
			enabled = false
		}
		if v := s.getConfig("watermark_text"); v != "" {
			text = v
		}
		if v := s.getConfig("watermark_position"); v != "" {
			position = v
		}
	}

	utils.Success(c, gin.H{
		"enabled":   enabled,
		"text":      text,
		"position":  position,
		"opacity":   opacity,
		"font_size": fontSize,
	})
}

// UpdateWatermarkConfig 更新水印配置（管理员），持久化到 DB
func (s *WatermarkService) UpdateWatermarkConfig(c *gin.Context) {
	var req struct {
		Enabled  *bool   `json:"enabled"`
		Text     string  `json:"text"`
		Position string  `json:"position"`
		Opacity  uint8   `json:"opacity"`
		FontSize float64 `json:"font_size"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	s.mu.Lock()

	if req.Enabled != nil {
		s.enabled = *req.Enabled
	}
	if req.Text != "" {
		s.text = req.Text
	}
	if req.Position != "" {
		s.position = req.Position
	}
	if req.Opacity > 0 {
		s.opacity = req.Opacity
		s.textColor = color.RGBA{R: 255, G: 255, B: 255, A: req.Opacity}
	}
	if req.FontSize > 0 {
		s.fontSize = req.FontSize
	}

	enabled := s.enabled
	text := s.text
	position := s.position
	opacity := s.opacity
	fontSize := s.fontSize
	s.mu.Unlock()

	// 持久化到 DB
	if s.setConfig != nil {
		if req.Enabled != nil {
			if err := s.setConfig("watermark_enabled", fmt.Sprintf("%t", enabled)); err != nil {
				logger.Error("持久化水印 enabled 失败", zap.Error(err))
			}
		}
		if req.Text != "" {
			if err := s.setConfig("watermark_text", text); err != nil {
				logger.Error("持久化水印 text 失败", zap.Error(err))
			}
		}
		if req.Position != "" {
			if err := s.setConfig("watermark_position", position); err != nil {
				logger.Error("持久化水印 position 失败", zap.Error(err))
			}
		}
	}

	logger.Info("水印配置更新成功", zap.Bool("enabled", enabled), zap.String("text", text), zap.String("position", position))
	utils.Success(c, gin.H{
		"enabled":   enabled,
		"text":      text,
		"position":  position,
		"opacity":   opacity,
		"font_size": fontSize,
	})
}
