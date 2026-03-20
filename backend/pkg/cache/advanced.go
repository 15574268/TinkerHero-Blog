package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type CacheService struct {
	rdb *redis.Client
}

func NewCacheService(rdb *redis.Client) *CacheService {
	return &CacheService{rdb: rdb}
}

// Set 设置缓存
func (s *CacheService) Set(ctx context.Context, key string, value any, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, key, data, expiration).Err()
}

// Get 获取缓存
func (s *CacheService) Get(ctx context.Context, key string, dest any) error {
	data, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(data), dest)
}

// Delete 删除缓存
func (s *CacheService) Delete(ctx context.Context, keys ...string) error {
	return s.rdb.Del(ctx, keys...).Err()
}

// DeleteByPattern 根据模式删除缓存
func (s *CacheService) DeleteByPattern(ctx context.Context, pattern string) error {
	iter := s.rdb.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		if err := s.rdb.Del(ctx, iter.Val()).Err(); err != nil {
			return err
		}
	}
	return iter.Err()
}

// CacheAside 缓存旁路模式
func (s *CacheService) CacheAside(ctx context.Context, key string, dest any, 
	expiration time.Duration, fetchFunc func() (any, error)) error {
	
	// 尝试从缓存获取
	err := s.Get(ctx, key, dest)
	if err == nil {
		return nil // 缓存命中
	}

	// 缓存未命中，从数据源获取
	data, err := fetchFunc()
	if err != nil {
		return err
	}

	// 写入缓存
	if err := s.Set(ctx, key, data, expiration); err != nil {
		// 缓存写入失败不影响业务
	}

	// 将数据写入dest
	dataBytes, _ := json.Marshal(data)
	return json.Unmarshal(dataBytes, dest)
}

// GetOrSet 获取或设置缓存
func (s *CacheService) GetOrSet(ctx context.Context, key string, fetchFunc func() (any, error), 
	expiration time.Duration) (any, error) {
	
	var result any
	err := s.CacheAside(ctx, key, &result, expiration, fetchFunc)
	return result, err
}
