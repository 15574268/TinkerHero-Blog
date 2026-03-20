package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
)

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	if n, err := strconv.Atoi(v); err == nil && n > 0 {
		return n
	}
	return fallback
}

// allLimiters tracks every RateLimiter created so they can be stopped on shutdown.
var (
	allLimiters   []*RateLimiter
	limitersMutex sync.Mutex
)

// StopAllRateLimiters stops cleanup goroutines for all rate limiters.
// Call during graceful shutdown.
func StopAllRateLimiters() {
	limitersMutex.Lock()
	defer limitersMutex.Unlock()
	for _, rl := range allLimiters {
		rl.Stop()
	}
	allLimiters = nil
}

// RateLimiter 请求限流器
type RateLimiter struct {
	requests map[string]*ClientInfo
	mu       sync.RWMutex
	rate     int
	window   time.Duration
	stopChan chan struct{}
	stopOnce sync.Once
	maxSize  int
	rdb      *redis.Client
}

// ClientInfo 客户端请求信息
type ClientInfo struct {
	count     int
	firstSeen time.Time
}

// NewRateLimiter 创建新的限流器
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	limiter := &RateLimiter{
		requests: make(map[string]*ClientInfo),
		rate:     rate,
		window:   window,
		stopChan: make(chan struct{}),
		maxSize:  100000,
	}

	go limiter.cleanupExpired()

	limitersMutex.Lock()
	allLimiters = append(allLimiters, limiter)
	limitersMutex.Unlock()

	return limiter
}

// NewRedisRateLimiter 创建基于 Redis 的分布式限流器
func NewRedisRateLimiter(rate int, window time.Duration, rdb *redis.Client) *RateLimiter {
	limiter := &RateLimiter{
		requests: make(map[string]*ClientInfo),
		rate:     rate,
		window:   window,
		stopChan: make(chan struct{}),
		maxSize:  100000,
		rdb:      rdb,
	}

	limitersMutex.Lock()
	allLimiters = append(allLimiters, limiter)
	limitersMutex.Unlock()

	return limiter
}

// Stop 停止限流器的清理goroutine（线程安全，可重复调用）
func (rl *RateLimiter) Stop() {
	rl.stopOnce.Do(func() {
		close(rl.stopChan)
	})
}

// Allow 检查是否允许请求
func (rl *RateLimiter) Allow(ip string) bool {
	if rl.rdb != nil {
		return rl.allowRedis(ip)
	}
	return rl.allowLocal(ip)
}

// allowRedis 使用 Redis 进行分布式限流
func (rl *RateLimiter) allowRedis(ip string) bool {
	ctx := context.Background()
	key := fmt.Sprintf("rate_limit:%s", ip)

	luaScript := redis.NewScript(`
		local count = redis.call('INCR', KEYS[1])
		if count == 1 then
			redis.call('EXPIRE', KEYS[1], ARGV[1])
		end
		return count
	`)
	result, err := luaScript.Run(ctx, rl.rdb, []string{key}, int(rl.window.Seconds())).Int64()
	if err != nil {
		logger.Warn("Redis限流检查失败，回退到本地限流", zap.Error(err))
		return rl.allowLocal(ip)
	}
	return result <= int64(rl.rate)
}

// allowLocal 本地内存限流
func (rl *RateLimiter) allowLocal(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	info, exists := rl.requests[ip]

	if !exists || now.Sub(info.firstSeen) > rl.window {
		if len(rl.requests) >= rl.maxSize {
			rl.evictOldest(now)
		}
		rl.requests[ip] = &ClientInfo{
			count:     1,
			firstSeen: now,
		}
		return true
	}

	if info.count >= rl.rate {
		return false
	}

	info.count++
	return true
}

// evictOldest 淘汰最旧的记录
func (rl *RateLimiter) evictOldest(now time.Time) {
	var oldestIP string
	var oldestTime = now

	for ip, info := range rl.requests {
		if info.firstSeen.Before(oldestTime) {
			oldestTime = info.firstSeen
			oldestIP = ip
		}
	}

	if oldestIP != "" {
		delete(rl.requests, oldestIP)
	}
}

// cleanupExpired 定期清理过期的客户端记录
func (rl *RateLimiter) cleanupExpired() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for ip, info := range rl.requests {
				if now.Sub(info.firstSeen) > rl.window {
					delete(rl.requests, ip)
				}
			}
			rl.mu.Unlock()
		case <-rl.stopChan:
			return
		}
	}
}

// RateLimitMiddleware 创建请求限流中间件
func RateLimitMiddleware(rate int, window time.Duration) gin.HandlerFunc {
	limiter := NewRateLimiter(rate, window)

	return func(c *gin.Context) {
		ip := c.ClientIP()

		if !limiter.Allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "请求过于频繁，请稍后再试",
				"retry_after": int(window.Seconds()),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// AuthRateLimitMiddleware 认证接口专用限流；getConfig 优先读 auth_rate_limit_per_min，为空则用 env
func AuthRateLimitMiddleware(getConfig func(key string) string) gin.HandlerFunc {
	defaultPerMin := 5
	if os.Getenv("GIN_MODE") != "release" {
		defaultPerMin = 60
	}
	perMin := defaultPerMin
	if getConfig != nil {
		if v := getConfig("auth_rate_limit_per_min"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				perMin = n
			}
		}
	}
	if perMin <= 0 {
		perMin = envInt("AUTH_RATE_LIMIT_PER_MIN", defaultPerMin)
	}
	return RateLimitMiddleware(perMin, time.Minute)
}

// APIRateLimitMiddleware 全局限流；enable_rate_limit 为 false 时关闭；getConfig 优先读 api_rate_limit_per_min
func APIRateLimitMiddleware(getConfig func(key string) string) gin.HandlerFunc {
	perMin := 100
	if getConfig != nil {
		if v := getConfig("enable_rate_limit"); v == "false" {
			return func(c *gin.Context) { c.Next() }
		}
		if v := getConfig("api_rate_limit_per_min"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				perMin = n
			}
		}
	}
	if perMin <= 0 {
		perMin = envInt("API_RATE_LIMIT_PER_MIN", 100)
	}
	return RateLimitMiddleware(perMin, time.Minute)
}

// StrictRateLimitMiddleware 严格限流（用于密码重置等敏感操作）
func StrictRateLimitMiddleware() gin.HandlerFunc {
	return RateLimitMiddleware(3, time.Hour)
}

// AIRateLimitMiddleware AI 接口专用限流；默认每用户每分钟 20 次，可通过环境变量 AI_RATE_LIMIT_PER_MIN 覆盖
func AIRateLimitMiddleware() gin.HandlerFunc {
	perMin := envInt("AI_RATE_LIMIT_PER_MIN", 20)
	limiter := NewRateLimiter(perMin, time.Minute)

	return func(c *gin.Context) {
		// 使用认证用户 ID 作为限流 key，比 IP 更精准
		key := c.ClientIP()
		if uid := c.GetString("username"); uid != "" {
			key = "user:" + uid
		}
		if !limiter.Allow(key) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "AI 请求过于频繁，请稍后再试",
				"retry_after": 60,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// LoginRateLimitMiddleware 登录限流中间件（IP + 用户名双重限流）
func LoginRateLimitMiddleware() gin.HandlerFunc {
	ipLimiter := NewRateLimiter(10, time.Minute)
	usernameLimiter := NewRateLimiter(5, time.Minute)

	return func(c *gin.Context) {
		ip := c.ClientIP()

		if !ipLimiter.Allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "请求过于频繁，请稍后再试",
				"retry_after": 60,
			})
			c.Abort()
			return
		}

		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.Next()
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		var req struct {
			Username string `json:"username"`
		}
		if err := json.Unmarshal(bodyBytes, &req); err != nil || req.Username == "" {
			c.Next()
			return
		}

		if !usernameLimiter.Allow(req.Username) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "登录尝试过于频繁，请稍后再试",
				"retry_after": 60,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
