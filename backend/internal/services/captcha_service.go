package services

import (
	"bytes"
	cryptorand "crypto/rand"
	"encoding/base64"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"image"
	"image/color"
	"image/draw"

	"github.com/gin-gonic/gin"
	"github.com/golang/freetype"
	"github.com/golang/freetype/truetype"
	"github.com/tinkerhero/blog/backend/pkg/utils"
)

type CaptchaService struct {
	captchaStore map[string]*CaptchaInfo
	storeLock    sync.RWMutex
	stopCleanup  chan struct{}
}

type CaptchaInfo struct {
	Code      string
	ExpiresAt time.Time
}

func NewCaptchaService() *CaptchaService {
	s := &CaptchaService{
		captchaStore: make(map[string]*CaptchaInfo),
		stopCleanup:  make(chan struct{}),
	}
	// 定期清理过期验证码
	go s.cleanupExpired()
	return s
}

// Stop 停止清理 goroutine，防止资源泄漏
func (s *CaptchaService) Stop() {
	close(s.stopCleanup)
}

// cleanupExpired 定期清理过期验证码
func (s *CaptchaService) cleanupExpired() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.storeLock.Lock()
			now := time.Now()
			for key, info := range s.captchaStore {
				if now.After(info.ExpiresAt) {
					delete(s.captchaStore, key)
				}
			}
			s.storeLock.Unlock()
		case <-s.stopCleanup:
			return
		}
	}
}

// GenerateCaptcha 生成验证码（使用 SVG 方式，避免依赖外部字体文件）
func (s *CaptchaService) GenerateCaptcha(c *gin.Context) {
	s.SimpleGenerateCaptcha(c)
}

// VerifyCaptcha 验证验证码（atomic verify-and-delete to prevent reuse）
func (s *CaptchaService) VerifyCaptcha(captchaID, code string) bool {
	s.storeLock.Lock()
	defer s.storeLock.Unlock()

	info, exists := s.captchaStore[captchaID]
	if !exists {
		return false
	}

	if time.Now().After(info.ExpiresAt) {
		delete(s.captchaStore, captchaID)
		return false
	}

	if info.Code == code {
		delete(s.captchaStore, captchaID)
		return true
	}

	return false
}

// VerifyCaptchaAPI 验证验证码API
func (s *CaptchaService) VerifyCaptchaAPI(c *gin.Context) {
	var req struct {
		CaptchaID string `json:"captcha_id" binding:"required"`
		Code      string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	if s.VerifyCaptcha(req.CaptchaID, req.Code) {
		utils.Success(c, gin.H{"valid": true})
	} else {
		utils.Success(c, gin.H{"valid": false, "error": "验证码错误或已过期"})
	}
}

func generateRandomCode(length int) string {
	digits := "0123456789"
	code := make([]byte, length)
	// 使用 crypto/rand 替代 math/rand，更安全
	for i := range code {
		b := make([]byte, 1)
		cryptorand.Read(b)
		code[i] = digits[int(b[0])%len(digits)]
	}
	return string(code)
}

func generateCaptchaID() string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 32)
	// 使用 crypto/rand 替代 math/rand
	cryptorand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

func generateCaptchaImage(code string, width, height int) image.Image {
	// 创建图片
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// 背景
	bgColor := color.RGBA{240, 240, 240, 255}
	draw.Draw(img, img.Bounds(), &image.Uniform{bgColor}, image.Point{}, draw.Src)

	// 添加干扰线
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	for i := 0; i < 5; i++ {
		x1 := r.Intn(width)
		y1 := r.Intn(height)
		x2 := r.Intn(width)
		y2 := r.Intn(height)
		lineColor := color.RGBA{uint8(r.Intn(200)), uint8(r.Intn(200)), uint8(r.Intn(200)), 255}
		drawLine(img, x1, y1, x2, y2, lineColor)
	}

	// 添加干扰点
	for i := 0; i < 100; i++ {
		x := r.Intn(width)
		y := r.Intn(height)
		img.Set(x, y, color.RGBA{uint8(r.Intn(255)), uint8(r.Intn(255)), uint8(r.Intn(255)), 255})
	}

	// 绘制文字
	freetypeCtx := freetype.NewContext()
	freetypeCtx.SetDPI(72)
	freetypeCtx.SetFont(createDefaultFont())
	freetypeCtx.SetFontSize(24)
	freetypeCtx.SetClip(img.Bounds())
	freetypeCtx.SetDst(img)
	freetypeCtx.SetSrc(image.Black)

	// 绘制每个字符
	charWidth := width / len(code)
	for i, char := range code {
		freetypeCtx.SetSrc(image.NewUniform(color.RGBA{
			uint8(50 + r.Intn(150)),
			uint8(50 + r.Intn(150)),
			uint8(50 + r.Intn(150)),
			255,
		}))
		pt := freetype.Pt(charWidth*i+10, height/2+8)
		freetypeCtx.DrawString(string(char), pt)
	}

	return img
}

func drawLine(img *image.RGBA, x1, y1, x2, y2 int, c color.Color) {
	dx := abs(x2 - x1)
	dy := abs(y2 - y1)
	sx, sy := 1, 1
	if x1 >= x2 {
		sx = -1
	}
	if y1 >= y2 {
		sy = -1
	}
	err := dx - dy

	for {
		img.Set(x1, y1, c)
		if x1 == x2 && y1 == y2 {
			break
		}
		e2 := err * 2
		if e2 > -dy {
			err -= dy
			x1 += sx
		}
		if e2 < dx {
			err += dx
			y1 += sy
		}
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func createDefaultFont() *truetype.Font {
	// 使用默认字体
	// 在实际使用中应该加载一个真实字体文件
	// 这里使用 Go 内置的字体渲染
	return nil
}

// 简单的字体绘制
func (s *CaptchaService) SimpleGenerateCaptcha(c *gin.Context) {
	code := generateRandomCode(4)
	captchaID := generateCaptchaID()

	s.storeLock.Lock()
	s.captchaStore[captchaID] = &CaptchaInfo{
		Code:      code,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	s.storeLock.Unlock()

	// 使用简单的 SVG 验证码
	svg := generateSVGCaptcha(code, 120, 40)

	utils.Success(c, gin.H{
		"captcha_id":  captchaID,
		"captcha_img": "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg)),
	})
}

func generateSVGCaptcha(code string, width, height int) string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	var svg bytes.Buffer
	svg.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d">`, width, height))
	svg.WriteString(fmt.Sprintf(`<rect width="100%%" height="100%%" fill="#f0f0f0"/>`))

	// 干扰线
	for i := 0; i < 5; i++ {
		svg.WriteString(fmt.Sprintf(`<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="rgba(%d,%d,%d,0.5)" stroke-width="1"/>`,
			r.Intn(width), r.Intn(height), r.Intn(width), r.Intn(height),
			r.Intn(200), r.Intn(200), r.Intn(200)))
	}

	// 干扰点
	for i := 0; i < 50; i++ {
		svg.WriteString(fmt.Sprintf(`<circle cx="%d" cy="%d" r="1" fill="rgba(%d,%d,%d,0.5)"/>`,
			r.Intn(width), r.Intn(height), r.Intn(200), r.Intn(200), r.Intn(200)))
	}

	// 文字
	charWidth := width / len(code)
	for i, char := range code {
		color := fmt.Sprintf("rgb(%d,%d,%d)", 50+r.Intn(150), 50+r.Intn(150), 50+r.Intn(150))
		rotate := -15 + r.Intn(30)
		y := 25 + r.Intn(10)
		svg.WriteString(fmt.Sprintf(`<text x="%d" y="%d" font-family="Arial" font-size="24" font-weight="bold" fill="%s" transform="rotate(%d %d %d)">%c</text>`,
			charWidth*i+10, y, color, rotate, charWidth*i+10, y, char))
	}

	svg.WriteString(`</svg>`)
	return svg.String()
}
