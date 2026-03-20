package middleware

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
)

var jwtSecret = []byte(getJWTSecret())
var rdb *redis.Client

// InitAuth 初始化认证模块（需要 Redis 客户端）
func InitAuth(redisClient *redis.Client) {
	rdb = redisClient
	logger.Info("Auth middleware initialized with Redis")
}

func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// 任何环境都必须配置 JWT_SECRET
		logger.Fatal("JWT_SECRET environment variable is required")
	}
	if len(secret) < 32 {
		logger.Fatal("JWT_SECRET must be at least 32 characters for security",
			zap.Int("current_length", len(secret)),
		)
	}
	logger.Info("JWT secret loaded", zap.Int("length", len(secret)))
	return secret
}

type Claims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	TokenID  string `json:"token_id"` // 用于 Token 黑名单
	jwt.RegisteredClaims
}

// AuthMiddleware JWT认证中间件
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		// 优先从 Authorization header 获取 token
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			// 提取token
			if len(authHeader) >= 7 && authHeader[:7] == "Bearer " {
				tokenString = authHeader[7:]
			}
		}

		// 如果 header 中没有，尝试从 Cookie 获取
		if tokenString == "" {
			cookieToken, err := c.Cookie("auth_token")
			if err == nil && cookieToken != "" {
				tokenString = cookieToken
			}
		}

		// 都没有则返回未授权
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未提供认证令牌"})
			c.Abort()
			return
		}

		claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		logger.Warn("JWT token parse failed",
			zap.String("path", c.Request.URL.Path),
			zap.Error(err),
		)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "无效的认证令牌"})
		c.Abort()
		return
	}
	if !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "令牌已过期或无效"})
		c.Abort()
		return
	}

	// 检查 Token 黑名单（fail-closed：Redis 异常时拒绝请求）
	if rdb != nil && claims.TokenID != "" {
		blacklisted, err := rdb.Exists(context.Background(), "token_blacklist:"+claims.TokenID).Result()
		if err != nil {
			logger.Error("检查Token黑名单失败，拒绝请求", zap.Error(err))
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "认证服务暂不可用，请稍后重试"})
			c.Abort()
			return
		}
		if blacklisted > 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "令牌已失效"})
			c.Abort()
			return
		}
	}

	// 将用户信息存入上下文
	c.Set("user_id", claims.UserID)
	c.Set("username", claims.Username)
	c.Set("role", claims.Role)
	c.Set("token_id", claims.TokenID)

	c.Next()
	}
}

// OptionalAuthMiddleware 可选 JWT 认证：有有效 token 时写入 user_id/role，无 token 或无效时不报错直接放行（用于如 GET /posts/:id 等需在后台编辑时跳过密码校验的场景）
func OptionalAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" && len(authHeader) >= 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		}
		if tokenString == "" {
			c.Next()
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			c.Next()
			return
		}
		if rdb != nil && claims.TokenID != "" {
			blacklisted, _ := rdb.Exists(context.Background(), "token_blacklist:"+claims.TokenID).Result()
			if blacklisted > 0 {
				c.Next()
				return
			}
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Set("token_id", claims.TokenID)
		c.Next()
	}
}

// AdminMiddleware 管理员权限中间件
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			c.Abort()
			return
		}

		roleStr, ok := role.(string)
		if !ok || roleStr != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// AuthorMiddleware 作者或管理员权限中间件
func AuthorMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			c.Abort()
			return
		}

		roleStr, ok := role.(string)
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			c.Abort()
			return
		}

		if roleStr != "admin" && roleStr != "author" {
			c.JSON(http.StatusForbidden, gin.H{"error": "权限不足"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// GenerateToken 生成JWT令牌
func GenerateToken(userID uint, username, role string) (string, error) {
	// 访问令牌2小时有效期
	b := make([]byte, 16)
	rand.Read(b)
	tokenID := fmt.Sprintf("%d_%x", userID, b)
	claims := Claims{
		UserID:   userID,
		Username: username,
		Role:     role,
		TokenID:  tokenID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(2 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "blog",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// GenerateRefreshToken 生成刷新令牌
func GenerateRefreshToken(userID uint) (string, string, error) {
	// 为刷新令牌生成唯一的 TokenID，用于黑名单机制
	b := make([]byte, 16)
	rand.Read(b)
	tokenID := fmt.Sprintf("refresh_%d_%x", userID, b)
	claims := jwt.RegisteredClaims{
		ID:        tokenID,
		Subject:   fmt.Sprintf("%d", userID),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)), // 7天
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		Issuer:    "blog-refresh",
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	return tokenString, tokenID, err
}

// ValidateRefreshToken 验证刷新令牌并返回用户ID
func ValidateRefreshToken(tokenString string) (uint, string, error) {
	claims := &jwt.RegisteredClaims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return 0, "", fmt.Errorf("invalid refresh token: %w", err)
	}
	if !token.Valid {
		return 0, "", fmt.Errorf("refresh token is invalid or expired")
	}

	// 验证签发者
	if claims.Issuer != "blog-refresh" {
		return 0, "", fmt.Errorf("invalid token issuer")
	}

	// 检查刷新令牌是否在黑名单中（fail-closed：Redis 异常时拒绝请求）
	if rdb != nil && claims.ID != "" {
		blacklisted, err := rdb.Exists(context.Background(), "token_blacklist:"+claims.ID).Result()
		if err != nil {
			logger.Error("检查刷新令牌黑名单失败，拒绝请求", zap.Error(err))
			return 0, "", fmt.Errorf("authentication service unavailable")
		}
		if blacklisted > 0 {
			return 0, "", fmt.Errorf("refresh token has been revoked")
		}
	}

	// 解析用户ID
	var userID uint
	if _, err := fmt.Sscanf(claims.Subject, "%d", &userID); err != nil {
		return 0, "", fmt.Errorf("invalid subject in token")
	}

	return userID, claims.ID, nil
}

// InvalidateToken 将 Token 失效（加入黑名单）
func InvalidateToken(tokenID string, expiresIn time.Duration) error {
	if rdb == nil {
		return fmt.Errorf("redis not initialized")
	}

	ctx := context.Background()
	return rdb.Set(ctx, "token_blacklist:"+tokenID, "1", expiresIn).Err()
}

// InvalidateAllUserTokens 使用户所有 Token 失效（可选实现）
// 通过在 Redis 中存储用户的 Token 版本号来实现
func InvalidateAllUserTokens(userID uint) error {
	if rdb == nil {
		return fmt.Errorf("redis not initialized")
	}

	ctx := context.Background()
	return rdb.Set(ctx, fmt.Sprintf("user_token_version:%d", userID), time.Now().UnixNano(), 0).Err()
}

// LogoutHandler 登出处理函数
func LogoutHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenID, exists := c.Get("token_id")
		if exists && tokenID != nil {
			if tid, ok := tokenID.(string); ok && tid != "" {
				if err := InvalidateToken(tid, 2*time.Hour); err != nil {
					logger.Warn("Token加入黑名单失败", zap.Error(err))
				}
			}
		}

		// 清除 HttpOnly Cookie
		c.SetCookie("auth_token", "", -1, "/", "", true, true)
		c.SetCookie("refresh_token", "", -1, "/", "", true, true)

		c.JSON(http.StatusOK, gin.H{"message": "登出成功"})
	}
}

// OwnerOrAdminMiddleware 资源所有权验证中间件
// 检查当前用户是否是资源所有者或管理员
// resourceIDGetter: 从上下文获取资源所有者ID的函数
func OwnerOrAdminMiddleware(resourceIDGetter func(c *gin.Context) (uint, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
			c.Abort()
			return
		}

		role, _ := c.Get("role")
		roleStr, _ := role.(string)

		// 管理员直接通过
		if roleStr == "admin" {
			c.Next()
			return
		}

		// 获取资源所有者ID
		ownerID, err := resourceIDGetter(c)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "资源不存在"})
			c.Abort()
			return
		}

		// 检查是否是所有者
		uid, ok := userID.(uint)
		if !ok || uid != ownerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "无权访问此资源"})
			c.Abort()
			return
		}

		c.Next()
	}
}
