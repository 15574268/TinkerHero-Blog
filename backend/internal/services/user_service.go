package services

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/middleware"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// 登录失败记录
type loginAttempt struct {
	Count        int
	LastTry      time.Time
	LockedUntil  time.Time
}

var (
	loginAttempts    = make(map[string]*loginAttempt)
	loginMutex       sync.RWMutex
	maxLoginAttempts = 5   // 可由 initLoginConfig 从 env 覆盖
	lockoutDuration  = 15 * time.Minute
	stopLoginCleanup = make(chan struct{})
)

// 清理过期的登录失败记录；从环境变量读取登录限制
func init() {
	if n := utils.GetEnvInt("LOGIN_MAX_ATTEMPTS", 5); n >= 1 {
		maxLoginAttempts = n
	}
	if m := utils.GetEnvInt("LOGIN_LOCKOUT_MINUTES", 15); m >= 1 {
		lockoutDuration = time.Duration(m) * time.Minute
	}
	go startLoginCleanup()
}

// startLoginCleanup 启动登录失败记录清理 goroutine
func startLoginCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			cleanupLoginAttempts()
		case <-stopLoginCleanup:
			return
		}
	}
}

var stopLoginOnce sync.Once

// StopLoginCleanup 停止登录清理 goroutine（优雅关闭时调用）
func StopLoginCleanup() {
	stopLoginOnce.Do(func() {
		close(stopLoginCleanup)
	})
}

func cleanupLoginAttempts() {
	loginMutex.Lock()
	defer loginMutex.Unlock()
	now := time.Now()
	for key, attempt := range loginAttempts {
		if now.Sub(attempt.LastTry) > lockoutDuration*2 {
			delete(loginAttempts, key)
		}
	}
}

type UserService struct {
	db        *gorm.DB
	rdb       *redis.Client                // Redis 客户端，用于分布式登录失败计数；为 nil 时回退到进程内存
	getConfig func(key string) string // 优先从后台配置读取登录限制，为空则用 init 中的 env 兜底
}

func NewUserService(db *gorm.DB, rdb *redis.Client, getConfig func(key string) string) *UserService {
	return &UserService{db: db, rdb: rdb, getConfig: getConfig}
}

// Register 用户注册
func (s *UserService) Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误")
		return
	}

	if err := models.ValidatePasswordComplexity(req.Password); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var count int64
	if err := s.db.Model(&models.User{}).Where("username = ?", req.Username).Count(&count).Error; err != nil {
		utils.InternalError(c, "注册服务暂不可用")
		return
	}
	if count > 0 {
		utils.BadRequest(c, "用户名或邮箱已存在")
		return
	}

	if err := s.db.Model(&models.User{}).Where("email = ?", req.Email).Count(&count).Error; err != nil {
		utils.InternalError(c, "注册服务暂不可用")
		return
	}
	if count > 0 {
		utils.BadRequest(c, "用户名或邮箱已存在")
		return
	}

	// 创建用户
	user := models.User{
		Username: req.Username,
		Email:    req.Email,
		Nickname: req.Nickname,
		Role:     models.RoleReader,
	}

	if err := user.HashPassword(req.Password); err != nil {
		utils.InternalError(c, "密码加密失败")
		return
	}

	if err := s.db.Create(&user).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "Duplicate") || strings.Contains(err.Error(), "unique") {
			utils.BadRequest(c, "用户名或邮箱已存在")
			return
		}
		utils.InternalError(c, "创建用户失败")
		return
	}

	// 生成token
	token, err := middleware.GenerateToken(user.ID, user.Username, string(user.Role))
	if err != nil {
		utils.InternalError(c, "生成令牌失败")
		return
	}

	utils.Created(c, gin.H{
		"user":  user,
		"token": token,
	})
}

// Login 用户登录
func (s *UserService) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查登录失败次数（Redis 分布式 / 进程内存兜底）
	loginKey := c.ClientIP()
	if locked, remaining := s.isLoginLocked(loginKey); locked {
		utils.TooManyRequests(c, int(remaining.Seconds()))
		return
	}

	var user models.User
	if err := s.db.Where("username = ? OR email = ?", req.Login, req.Login).First(&user).Error; err != nil {
		// Dummy bcrypt comparison to prevent timing-based user enumeration
		bcrypt.CompareHashAndPassword(
			[]byte("$2a$10$0000000000000000000000uAYClPc0.kHB5Sj6Nw4P0yfFVqFa2"),
			[]byte(req.Password),
		)
		s.recordLoginFailure(loginKey)
		utils.Unauthorized(c, "用户名或密码错误")
		return
	}

	if !user.IsActive {
		s.recordLoginFailure(loginKey)
		utils.Unauthorized(c, "用户名或密码错误")
		return
	}

	if !user.CheckPassword(req.Password) {
		s.recordLoginFailure(loginKey)
		utils.Unauthorized(c, "用户名或密码错误")
		return
	}

	// 登录成功，清除失败记录
	s.clearLoginFailure(loginKey)

	// 更新最后登录时间（忽略错误，不影响登录流程）
	now := time.Now()
	if err := s.db.Model(&user).Update("last_login_at", now).Error; err != nil {
		// 使用结构化日志
		logger.Warn("更新最后登录时间失败", zap.Uint("user_id", user.ID), zap.Error(err))
	}

	// 生成token
	token, err := middleware.GenerateToken(user.ID, user.Username, string(user.Role))
	if err != nil {
		utils.InternalError(c, "生成令牌失败")
		return
	}

	// 生成刷新令牌（用于前端刷新页面保持登录）
	refreshToken, _, err := middleware.GenerateRefreshToken(user.ID)
	if err != nil {
		utils.InternalError(c, "生成刷新令牌失败")
		return
	}

	secure := os.Getenv("GIN_MODE") == "release"
	// 15 分钟访问令牌 Cookie，与 JWT 有效期保持一致
	c.SetCookie("auth_token", token, 15*60, "/", "", secure, true)
	// 7 天刷新令牌 Cookie
	c.SetCookie("refresh_token", refreshToken, 7*24*3600, "/", "", secure, true)

	utils.Success(c, gin.H{
		"user":          user,
		"token":         token,
		"refresh_token": refreshToken,
	})
}

// RefreshToken 刷新访问令牌
func (s *UserService) RefreshToken(c *gin.Context) {
	// 从 Cookie 或 Header 获取刷新令牌
	var refreshToken string

	// 优先从 Cookie 获取
	cookieToken, err := c.Cookie("refresh_token")
	if err == nil && cookieToken != "" {
		refreshToken = cookieToken
	}

	// 如果 Cookie 中没有，尝试从 Header 获取
	if refreshToken == "" {
		authHeader := c.GetHeader("X-Refresh-Token")
		if authHeader != "" {
			refreshToken = authHeader
		}
	}

	if refreshToken == "" {
		c.JSON(401, gin.H{"error": "缺少刷新令牌"})
		return
	}

	// 验证刷新令牌，获取用户ID和旧的TokenID
	userID, oldTokenID, err := middleware.ValidateRefreshToken(refreshToken)
	if err != nil {
		c.JSON(401, gin.H{"error": "无效的刷新令牌"})
		return
	}

	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		utils.NotFound(c, "用户不存在")
		return
	}

	if !user.IsActive {
		c.JSON(403, gin.H{"error": "账户已被禁用"})
		return
	}

	// 将旧的刷新令牌加入黑名单（防止重复使用）
	if oldTokenID != "" {
		if err := middleware.InvalidateToken(oldTokenID, 7*24*time.Hour); err != nil {
			logger.Warn("旧刷新令牌加入黑名单失败", zap.Error(err))
		}
	}

	// 生成新的访问令牌
	newToken, err := middleware.GenerateToken(user.ID, user.Username, string(user.Role))
	if err != nil {
		utils.InternalError(c, "生成令牌失败")
		return
	}

	// 生成新的刷新令牌
	newRefreshToken, newTokenID, err := middleware.GenerateRefreshToken(user.ID)
	if err != nil {
		utils.InternalError(c, "生成刷新令牌失败")
		return
	}

	// 记录新的 TokenID 用于调试
	logger.Debug("刷新令牌成功",
		zap.Uint("user_id", user.ID),
		zap.String("old_token_id", oldTokenID),
		zap.String("new_token_id", newTokenID),
	)

	secure := os.Getenv("GIN_MODE") == "release"
	c.SetCookie("auth_token", newToken, 15*60, "/", "", secure, true)
	c.SetCookie("refresh_token", newRefreshToken, 7*24*3600, "/", "", secure, true)

	utils.Success(c, gin.H{
		"token":         newToken,
		"refresh_token": newRefreshToken,
	})
}

// loginLimiterConfig 从配置读取登录限制参数
func (s *UserService) loginLimiterConfig() (maxAttempts int, lockout time.Duration) {
	maxAttempts = maxLoginAttempts
	lockout = lockoutDuration
	if s.getConfig != nil {
		if v := s.getConfig("login_max_attempts"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n >= 1 {
				maxAttempts = n
			}
		}
		if v := s.getConfig("login_lockout_minutes"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n >= 1 {
				lockout = time.Duration(n) * time.Minute
			}
		}
	}
	return
}

// isLoginLocked 检查指定 key 是否处于登录锁定状态
func (s *UserService) isLoginLocked(key string) (locked bool, remaining time.Duration) {
	if s.rdb != nil {
		ttl, err := s.rdb.TTL(context.Background(), "login_locked:"+key).Result()
		if err == nil && ttl > 0 {
			return true, ttl
		}
		return false, 0
	}
	// 回退：进程内存
	loginMutex.RLock()
	defer loginMutex.RUnlock()
	attempt, exists := loginAttempts[key]
	if exists && !attempt.LockedUntil.IsZero() && time.Now().Before(attempt.LockedUntil) {
		return true, time.Until(attempt.LockedUntil).Round(time.Second)
	}
	return false, 0
}

// recordLoginFailure 记录登录失败；Redis 可用时写 Redis，否则写进程内存
func (s *UserService) recordLoginFailure(key string) {
	maxAttempts, lockout := s.loginLimiterConfig()

	if s.rdb != nil {
		ctx := context.Background()
		countKey := "login_fail:" + key
		count, _ := s.rdb.Incr(ctx, countKey).Result()
		s.rdb.Expire(ctx, countKey, lockout*2)
		if int(count) >= maxAttempts {
			s.rdb.Set(ctx, "login_locked:"+key, 1, lockout)
		}
		return
	}
	// 回退：进程内存
	loginMutex.Lock()
	defer loginMutex.Unlock()
	attempt, exists := loginAttempts[key]
	if !exists {
		attempt = &loginAttempt{}
		loginAttempts[key] = attempt
	}
	attempt.Count++
	attempt.LastTry = time.Now()
	if attempt.Count >= maxAttempts {
		attempt.LockedUntil = time.Now().Add(lockout)
	}
}

// clearLoginFailure 登录成功后清除失败记录
func (s *UserService) clearLoginFailure(key string) {
	if s.rdb != nil {
		ctx := context.Background()
		s.rdb.Del(ctx, "login_fail:"+key, "login_locked:"+key)
		return
	}
	loginMutex.Lock()
	defer loginMutex.Unlock()
	delete(loginAttempts, key)
}

// GetProfile 获取用户信息
func (s *UserService) GetProfile(c *gin.Context) {
	userID := c.GetUint("user_id")

	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		utils.NotFound(c, "用户不存在")
		return
	}

	utils.Success(c, user)
}

// UpdateProfile 更新用户信息
func (s *UserService) UpdateProfile(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req models.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误")
		return
	}

	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		utils.NotFound(c, "用户不存在")
		return
	}

	updates := map[string]any{}
	if req.Nickname != nil {
		updates["nickname"] = *req.Nickname
	}
	if req.Avatar != nil {
		updates["avatar"] = *req.Avatar
	}
	if req.Bio != nil {
		updates["bio"] = *req.Bio
	}
	if req.Website != nil {
		updates["website"] = *req.Website
	}

	if err := s.db.Model(&user).Updates(updates).Error; err != nil {
		utils.InternalError(c, "更新失败")
		return
	}

	if err := s.db.First(&user, "id = ?", user.ID).Error; err != nil {
		logger.Warn("reload user after update failed", zap.Uint("user_id", user.ID), zap.Error(err))
	}

	utils.Success(c, user)
}

// ChangePassword 修改密码
func (s *UserService) ChangePassword(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误")
		return
	}

	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		utils.NotFound(c, "用户不存在")
		return
	}

	// 验证旧密码
	if !user.CheckPassword(req.OldPassword) {
		utils.BadRequest(c, "旧密码错误")
		return
	}

	// 验证新密码复杂度
	if err := models.ValidatePasswordComplexity(req.NewPassword); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 更新密码
	if err := user.HashPassword(req.NewPassword); err != nil {
		utils.InternalError(c, "密码加密失败")
		return
	}

	if err := s.db.Model(&user).Update("password_hash", user.PasswordHash).Error; err != nil {
		utils.InternalError(c, "更新密码失败")
		return
	}

	if err := middleware.InvalidateAllUserTokens(user.ID); err != nil {
		logger.Warn("Failed to invalidate tokens after password change",
			zap.Uint("user_id", user.ID), zap.Error(err))
	}

	utils.Success(c, gin.H{"message": "密码修改成功"})
}

// GetAllUsers 获取所有用户（管理员）
func (s *UserService) GetAllUsers(c *gin.Context) {
	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	var total int64
	if err := s.db.Model(&models.User{}).Count(&total).Error; err != nil {
		logger.Error("获取用户总数失败", zap.Error(err))
		utils.InternalError(c, "获取用户列表失败")
		return
	}

	var users []models.User
	if err := s.db.Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Order("created_at desc").Find(&users).Error; err != nil {
		logger.Error("获取用户列表失败", zap.Error(err))
		utils.InternalError(c, "获取用户列表失败")
		return
	}

	utils.Success(c, utils.NewPaginatedResult(users, total, page, pageSize).ToMap())
}

// UpdateUserRole 更新用户角色（管理员）
func (s *UserService) UpdateUserRole(c *gin.Context) {
	parsedID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户ID")
		return
	}

	var req struct {
		Role models.UserRole `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误")
		return
	}

	validRoles := map[string]bool{"admin": true, "author": true, "reader": true}
	if !validRoles[string(req.Role)] {
		utils.BadRequest(c, "无效的角色")
		return
	}

	var user models.User
	if err := s.db.First(&user, "id = ?", parsedID).Error; err != nil {
		utils.NotFound(c, "用户不存在")
		return
	}

	if err := s.db.Model(&user).Update("role", req.Role).Error; err != nil {
		utils.InternalError(c, "更新角色失败")
		return
	}

	utils.Success(c, gin.H{"message": "更新成功"})
}

// UpdateUserStatus 更新用户状态（管理员）- 禁用/启用
func (s *UserService) UpdateUserStatus(c *gin.Context) {
	parsedID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户ID")
		return
	}
	currentUserID := c.GetUint("user_id")

	if currentUserID == uint(parsedID) {
		utils.BadRequest(c, "不能修改自己的状态")
		return
	}

	var req struct {
		IsActive *bool `json:"is_active" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数格式错误，is_active 为必填项")
		return
	}

	var user models.User
	if err := s.db.First(&user, "id = ?", parsedID).Error; err != nil {
		utils.NotFound(c, "用户不存在")
		return
	}

	if user.Role == models.RoleAdmin && !*req.IsActive {
		utils.BadRequest(c, "不能禁用管理员账户")
		return
	}

	if err := s.db.Model(&user).Update("is_active", *req.IsActive).Error; err != nil {
		utils.InternalError(c, "更新状态失败")
		return
	}

	action := "启用"
	if !*req.IsActive {
		action = "禁用"
	}
	utils.Success(c, gin.H{"message": fmt.Sprintf("已%s用户", action)})
}

// DeleteUser 删除用户（管理员）
func (s *UserService) DeleteUser(c *gin.Context) {
	parsedID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户ID")
		return
	}
	currentUserID := c.GetUint("user_id")

	if currentUserID == uint(parsedID) {
		utils.BadRequest(c, "不能删除自己的账户")
		return
	}

	var user models.User
	if err := s.db.First(&user, "id = ?", parsedID).Error; err != nil {
		utils.NotFound(c, "用户不存在")
		return
	}

	// 不能删除管理员
	if user.Role == models.RoleAdmin {
		utils.BadRequest(c, "不能删除管理员账户")
		return
	}

	// 软删除用户
	if err := s.db.Delete(&user).Error; err != nil {
		utils.InternalError(c, "删除用户失败")
		return
	}

	utils.Success(c, gin.H{"message": "删除成功"})
}

// GetMyComments 获取我的评论
func (s *UserService) GetMyComments(c *gin.Context) {
	userID := c.GetUint("user_id")
	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	var total int64
	s.db.Model(&models.Comment{}).Where("user_id = ?", userID).Count(&total)

	var comments []models.Comment
	s.db.Where("user_id = ?", userID).
		Preload("Post").
		Offset(utils.GetOffset(page, pageSize)).
		Limit(pageSize).
		Order("created_at desc").
		Find(&comments)

	utils.Success(c, utils.NewPaginatedResult(comments, total, page, pageSize).ToMap())
}
