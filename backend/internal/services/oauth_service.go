package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/middleware"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// state 存储结构
type stateInfo struct {
	State     string
	Provider  string
	CreatedAt time.Time
}

var (
	stateStore = make(map[string]stateInfo)
	stateMutex sync.RWMutex
	// 共享的 HTTP 客户端，带超时设置
	httpClient = &http.Client{Timeout: 30 * time.Second}
	// ticker 停止信号
	stopCleanup = make(chan struct{})
)

func init() {
	// 定期清理过期的 state
	go startStateCleanup()
}

// startStateCleanup 启动状态清理 goroutine
func startStateCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			cleanupExpiredStates()
		case <-stopCleanup:
			return
		}
	}
}

var stopCleanupOnce sync.Once

// StopStateCleanup 停止状态清理 goroutine（优雅关闭时调用）
func StopStateCleanup() {
	stopCleanupOnce.Do(func() {
		close(stopCleanup)
	})
}

func cleanupExpiredStates() {
	stateMutex.Lock()
	defer stateMutex.Unlock()
	now := time.Now()
	for k, v := range stateStore {
		if now.Sub(v.CreatedAt) > 10*time.Minute {
			delete(stateStore, k)
		}
	}
}

type OAuthService struct {
	db                 *gorm.DB
	githubClientID     string
	githubClientSecret string
	googleClientID     string
	googleClientSecret string
}

func NewOAuthService(db *gorm.DB, githubClientID, githubClientSecret, googleClientID, googleClientSecret string) *OAuthService {
	return &OAuthService{
		db:                 db,
		githubClientID:     githubClientID,
		githubClientSecret: githubClientSecret,
		googleClientID:     googleClientID,
		googleClientSecret: googleClientSecret,
	}
}

const maxStateStoreSize = 10000

// GitHub OAuth 登录
func (s *OAuthService) GitHubLogin(c *gin.Context) {
	state, err := generateState()
	if err != nil {
		logger.Error("生成 OAuth state 失败", zap.Error(err))
		utils.InternalError(c, "服务器错误")
		return
	}

	// 存储 state（容量超限时拒绝，防止 DoS 内存耗尽）
	stateMutex.Lock()
	if len(stateStore) >= maxStateStoreSize {
		stateMutex.Unlock()
		logger.Warn("OAuth stateStore 超出容量上限，拒绝新的登录请求")
		utils.TooManyRequests(c, 60)
		return
	}
	stateStore[state] = stateInfo{
		State:     state,
		Provider:  "github",
		CreatedAt: time.Now(),
	}
	stateMutex.Unlock()

	// 构建GitHub OAuth URL
	params := url.Values{}
	params.Set("client_id", s.githubClientID)
	params.Set("redirect_uri", fmt.Sprintf("%s/api/v1/auth/github/callback", getBaseURL(c)))
	params.Set("scope", "user:email")
	params.Set("state", state)

	authURL := "https://github.com/login/oauth/authorize?" + params.Encode()
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

// GitHub OAuth 回调
func (s *OAuthService) GitHubCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")

	if code == "" {
		utils.BadRequest(c, "无效的授权码")
		return
	}

	stateMutex.Lock()
	info, exists := stateStore[state]
	if exists {
		delete(stateStore, state)
	}
	stateMutex.Unlock()

	if !exists || info.Provider != "github" {
		logger.Warn("无效的state参数", zap.String("state", state))
		utils.BadRequest(c, "无效的 state 参数")
		return
	}

	if time.Since(info.CreatedAt) > 10*time.Minute {
		utils.BadRequest(c, "授权已过期，请重试")
		return
	}

	// 获取访问令牌
	tokenURL := "https://github.com/login/oauth/access_token"
	data := url.Values{}
	data.Set("client_id", s.githubClientID)
	data.Set("client_secret", s.githubClientSecret)
	data.Set("code", code)
	data.Set("redirect_uri", fmt.Sprintf("%s/api/v1/auth/github/callback", getBaseURL(c)))

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		logger.Error("创建请求失败", zap.Error(err))
		utils.InternalError(c, "创建请求失败")
		return
	}
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		logger.Error("获取访问令牌失败", zap.Error(err))
		utils.InternalError(c, "获取访问令牌失败")
		return
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		logger.Error("解析令牌响应失败", zap.Error(err))
		utils.InternalError(c, "解析令牌响应失败")
		return
	}
	if tokenResp.Error != "" {
		logger.Warn("GitHub OAuth错误", zap.String("error", tokenResp.Error))
		utils.BadRequest(c, tokenResp.Error)
		return
	}

	// 获取用户信息
	userReq, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		logger.Error("创建用户信息请求失败", zap.Error(err))
		utils.InternalError(c, "创建用户信息请求失败")
		return
	}
	userReq.Header.Set("Authorization", fmt.Sprintf("token %s", tokenResp.AccessToken))

	userResp, err := httpClient.Do(userReq)
	if err != nil {
		logger.Error("获取用户信息失败", zap.Error(err))
		utils.InternalError(c, "获取用户信息失败")
		return
	}
	defer userResp.Body.Close()

	var githubUser struct {
		ID        int    `json:"id"`
		Login     string `json:"login"`
		Email     string `json:"email"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&githubUser); err != nil {
		logger.Error("解析用户信息失败", zap.Error(err))
		utils.InternalError(c, "解析用户信息失败")
		return
	}

	email := githubUser.Email
	if email == "" {
		email = fmt.Sprintf("%d@github.com", githubUser.ID)
	}
	// FirstOrCreate 保证并发安全：两个回调同时到来时，只有一个会成功创建
	user := models.User{
		Username: githubUser.Login,
		Email:    email,
		Nickname: githubUser.Name,
		Avatar:   githubUser.AvatarURL,
		Role:     models.RoleReader,
		IsActive: true,
	}
	result := s.db.Where("email = ?", email).FirstOrCreate(&user)
	if result.Error != nil {
		logger.Error("查找或创建用户失败", zap.String("email", email), zap.Error(result.Error))
		utils.InternalError(c, "服务器错误")
		return
	}
	if result.RowsAffected > 0 {
		logger.Info("GitHub OAuth创建新用户", zap.String("username", user.Username))
	}

	// 生成JWT令牌
	token, err := middleware.GenerateToken(user.ID, user.Username, string(user.Role))
	if err != nil {
		logger.Error("生成令牌失败", zap.Error(err))
		utils.InternalError(c, "生成令牌失败")
		return
	}

	logger.Info("GitHub OAuth登录成功", zap.String("username", user.Username))

	// 通过 HttpOnly Cookie 传递 token，前端通过 /api/v1/profile 验证登录状态
	setAuthCookies(c, user.ID, token)
	c.Redirect(http.StatusTemporaryRedirect, fmt.Sprintf("%s/auth/callback", getFrontendURL(c)))
}

// Google OAuth 登录
func (s *OAuthService) GoogleLogin(c *gin.Context) {
	state, err := generateState()
	if err != nil {
		logger.Error("生成 OAuth state 失败", zap.Error(err))
		utils.InternalError(c, "服务器错误")
		return
	}

	// 存储 state（容量超限时拒绝，防止 DoS 内存耗尽）
	stateMutex.Lock()
	if len(stateStore) >= maxStateStoreSize {
		stateMutex.Unlock()
		logger.Warn("OAuth stateStore 超出容量上限，拒绝新的登录请求")
		utils.TooManyRequests(c, 60)
		return
	}
	stateStore[state] = stateInfo{
		State:     state,
		Provider:  "google",
		CreatedAt: time.Now(),
	}
	stateMutex.Unlock()

	params := url.Values{}
	params.Set("client_id", s.googleClientID)
	params.Set("redirect_uri", fmt.Sprintf("%s/api/v1/auth/google/callback", getBaseURL(c)))
	params.Set("response_type", "code")
	params.Set("scope", "email profile")
	params.Set("state", state)

	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

// Google OAuth 回调
func (s *OAuthService) GoogleCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")

	if code == "" {
		utils.BadRequest(c, "无效的授权码")
		return
	}

	stateMutex.Lock()
	info, exists := stateStore[state]
	if exists {
		delete(stateStore, state)
	}
	stateMutex.Unlock()

	if !exists || info.Provider != "google" {
		logger.Warn("无效的state参数", zap.String("state", state))
		utils.BadRequest(c, "无效的 state 参数")
		return
	}

	if time.Since(info.CreatedAt) > 10*time.Minute {
		utils.BadRequest(c, "授权已过期，请重试")
		return
	}

	tokenURL := "https://oauth2.googleapis.com/token"
	data := url.Values{}
	data.Set("client_id", s.googleClientID)
	data.Set("client_secret", s.googleClientSecret)
	data.Set("code", code)
	data.Set("grant_type", "authorization_code")
	data.Set("redirect_uri", fmt.Sprintf("%s/api/v1/auth/google/callback", getBaseURL(c)))

	resp, err := httpClient.PostForm(tokenURL, data)
	if err != nil {
		logger.Error("获取访问令牌失败", zap.Error(err))
		utils.InternalError(c, "获取访问令牌失败")
		return
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		logger.Error("解析令牌响应失败", zap.Error(err))
		utils.InternalError(c, "解析令牌响应失败")
		return
	}
	if tokenResp.Error != "" {
		logger.Warn("Google OAuth错误", zap.String("error", tokenResp.Error))
		utils.BadRequest(c, tokenResp.Error)
		return
	}

	// 获取用户信息
	userReq, err := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		logger.Error("创建用户信息请求失败", zap.Error(err))
		utils.InternalError(c, "创建用户信息请求失败")
		return
	}
	userReq.Header.Set("Authorization", fmt.Sprintf("%s %s", tokenResp.TokenType, tokenResp.AccessToken))

	userResp, err := httpClient.Do(userReq)
	if err != nil {
		logger.Error("获取用户信息失败", zap.Error(err))
		utils.InternalError(c, "获取用户信息失败")
		return
	}
	defer userResp.Body.Close()

	var googleUser struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&googleUser); err != nil {
		logger.Error("解析用户信息失败", zap.Error(err))
		utils.InternalError(c, "解析用户信息失败")
		return
	}

	// 查找或创建用户（FirstOrCreate 保证并发安全）
	username := strings.Split(googleUser.Email, "@")[0]
	user := models.User{
		Username: username,
		Email:    googleUser.Email,
		Nickname: googleUser.Name,
		Avatar:   googleUser.Picture,
		Role:     models.RoleReader,
		IsActive: true,
	}
	result := s.db.Where("email = ?", googleUser.Email).FirstOrCreate(&user)
	if result.Error != nil {
		logger.Error("查找或创建用户失败", zap.String("email", googleUser.Email), zap.Error(result.Error))
		utils.InternalError(c, "服务器错误")
		return
	}
	if result.RowsAffected > 0 {
		logger.Info("Google OAuth创建新用户", zap.String("username", user.Username))
	}

	// 生成JWT令牌
	token, err := middleware.GenerateToken(user.ID, user.Username, string(user.Role))
	if err != nil {
		logger.Error("生成令牌失败", zap.Error(err))
		utils.InternalError(c, "生成令牌失败")
		return
	}

	logger.Info("Google OAuth登录成功", zap.String("username", user.Username))

	// 通过 HttpOnly Cookie 传递 token，前端通过 /api/v1/profile 验证登录状态
	setAuthCookies(c, user.ID, token)
	c.Redirect(http.StatusTemporaryRedirect, fmt.Sprintf("%s/auth/callback", getFrontendURL(c)))
}

// 辅助函数
func generateState() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("生成 OAuth state 随机数失败: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

func getBaseURL(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	// 优先从请求头获取（支持反向代理）
	if proto := c.GetHeader("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	}
	return fmt.Sprintf("%s://%s", scheme, c.Request.Host)
}

func getFrontendURL(c *gin.Context) string {
	if frontendURL := os.Getenv("FRONTEND_URL"); frontendURL != "" {
		return frontendURL
	}
	return "http://localhost:3000"
}

// setAuthCookies 设置安全的 HttpOnly Cookie（auth_token + refresh_token）。
// auth_token 过期时间与 JWT 本身一致（15 分钟），避免 Cookie 有效但 Token 已过期的混乱体验；
// refresh_token 7 天，与普通登录流程保持一致。
func setAuthCookies(c *gin.Context, userID uint, token string) {
	secure := os.Getenv("GIN_MODE") == "release"
	c.SetCookie("auth_token", token, 15*60, "/", "", secure, true)

	refreshToken, _, err := middleware.GenerateRefreshToken(userID)
	if err == nil {
		c.SetCookie("refresh_token", refreshToken, 7*24*3600, "/", "", secure, true)
	}
}

// GetTokenFromCookie 从 Cookie 获取 token
func GetTokenFromCookie(c *gin.Context) string {
	token, _ := c.Cookie("auth_token")
	return token
}
