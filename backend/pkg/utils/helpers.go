package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
)

// singleflight 防止缓存击穿
var (
	sfGroup = &singleflightGroup{
		mu:    sync.Mutex{},
		calls: make(map[string]*call),
	}
)

type call struct {
	wg  sync.WaitGroup
	val any
	err error
}

type singleflightGroup struct {
	mu    sync.Mutex
	calls map[string]*call
}

// PaginationConfig 分页配置
type PaginationConfig struct {
	DefaultPage     int
	DefaultPageSize int
	MaxPage         int
	MaxPageSize     int
}

// DefaultPaginationConfig 默认分页配置
var DefaultPaginationConfig = PaginationConfig{
	DefaultPage:     1,
	DefaultPageSize: 20,
	MaxPage:         10000,
	MaxPageSize:     100,
}

// GetPagination 从请求中获取分页参数
func GetPagination(c *gin.Context) (page, pageSize int) {
	return GetPaginationWithConfig(c, DefaultPaginationConfig)
}

// GetPaginationWithConfig 使用自定义配置获取分页参数
func GetPaginationWithConfig(c *gin.Context, cfg PaginationConfig) (page, pageSize int) {
	page = cfg.DefaultPage
	pageSize = cfg.DefaultPageSize

	if p := c.Query("page"); p != "" {
		if _, err := fmt.Sscanf(p, "%d", &page); err == nil {
			if page < 1 {
				page = 1
			} else if page > cfg.MaxPage {
				page = cfg.MaxPage
			}
		}
	}

	if ps := c.Query("page_size"); ps != "" {
		if _, err := fmt.Sscanf(ps, "%d", &pageSize); err == nil {
			if pageSize < 1 {
				pageSize = cfg.DefaultPageSize
			} else if pageSize > cfg.MaxPageSize {
				pageSize = cfg.MaxPageSize
			}
		}
	}

	return
}

// GetOffset 计算偏移量
func GetOffset(page, pageSize int) int {
	return (page - 1) * pageSize
}

// PaginatedResult 分页结果
type PaginatedResult struct {
	Data     any
	Total    int64
	Page     int
	PageSize int
}

// NewPaginatedResult 创建分页结果
func NewPaginatedResult(data any, total int64, page, pageSize int) *PaginatedResult {
	return &PaginatedResult{
		Data:     data,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}
}

// ToMap 转换为响应 map
func (r *PaginatedResult) ToMap() map[string]any {
	return map[string]any{
		"data":      r.Data,
		"total":     r.Total,
		"page":      r.Page,
		"page_size": r.PageSize,
	}
}

// CacheWithRedis Redis 缓存辅助函数（带 singleflight 防止缓存击穿）
func CacheWithRedis(ctx context.Context, rdb *redis.Client, key string, ttl time.Duration, fetchFn func() (any, error)) (any, error) {
	// 尝试从缓存获取
	cached, err := rdb.Get(ctx, key).Result()
	if err == nil {
		var result any
		if err := json.Unmarshal([]byte(cached), &result); err == nil {
			logger.Debug("Cache hit", zap.String("key", key))
			return result, nil
		}
	}

	// 使用 singleflight 防止缓存击穿
	sfGroup.mu.Lock()
	if c, ok := sfGroup.calls[key]; ok {
		sfGroup.mu.Unlock()
		c.wg.Wait()
		return c.val, c.err
	}

	c := new(call)
	c.wg.Add(1)
	sfGroup.calls[key] = c
	sfGroup.mu.Unlock()

	// Ensure wg.Done is called even if panic occurs
	defer c.wg.Done()

	// 获取数据
	data, err := fetchFn()

	// 写入缓存（忽略错误，不影响主流程）
	if err == nil {
		if jsonData, marshalErr := json.Marshal(data); marshalErr == nil {
			if setErr := rdb.Set(ctx, key, string(jsonData), ttl).Err(); setErr != nil {
				logger.Warn("Failed to cache data",
					zap.String("key", key),
					zap.Error(setErr),
				)
			}
		}
	}

	// 保存结果并通知等待者
	c.val = data
	c.err = err

	// 清理 singleflight 记录
	sfGroup.mu.Lock()
	delete(sfGroup.calls, key)
	sfGroup.mu.Unlock()

	return data, err
}

// ParseInt 解析字符串到整数
func ParseInt(s string, result *uint) {
	const maxUint = ^uint(0)
	for _, c := range s {
		if c < '0' || c > '9' {
			return
		}
		digit := uint(c - '0')
		if *result > (maxUint-digit)/10 {
			return // overflow, stop parsing
		}
		*result = *result*10 + digit
	}
}

// InvalidateCache 使缓存失效
func InvalidateCache(ctx context.Context, rdb *redis.Client, patterns ...string) error {
	for _, pattern := range patterns {
		// 使用 SCAN 替代 KEYS 以提高性能
		var cursor uint64
		for {
			keys, nextCursor, err := rdb.Scan(ctx, cursor, pattern, 100).Result()
			if err != nil {
				return fmt.Errorf("failed to scan keys for pattern %s: %w", pattern, err)
			}
			
			if len(keys) > 0 {
				if err := rdb.Del(ctx, keys...).Err(); err != nil {
					return fmt.Errorf("failed to delete keys: %w", err)
				}
				logger.Debug("Invalidated cache keys", 
					zap.Strings("keys", keys),
				)
			}
			
			cursor = nextCursor
			if cursor == 0 {
				break
			}
		}
	}
	return nil
}

