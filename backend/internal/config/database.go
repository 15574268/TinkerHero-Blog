package config

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func InitDB() (*gorm.DB, error) {
	sslMode := utils.GetEnv("DB_SSLMODE", "disable")
	if os.Getenv("GIN_MODE") == "release" && sslMode == "disable" {
		log.Println("WARNING: SSL is disabled in production environment. Consider enabling DB_SSLMODE=require")
	}

	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		utils.GetEnv("DB_HOST", "localhost"),
		utils.GetEnv("DB_USER", "postgres"),
		utils.GetEnv("DB_PASSWORD", "postgres"),
		utils.GetEnv("DB_NAME", "blog"),
		utils.GetEnv("DB_PORT", "5432"),
		sslMode,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxIdleConns(utils.GetEnvInt("DB_MAX_IDLE_CONNS", 10))
	sqlDB.SetMaxOpenConns(utils.GetEnvInt("DB_MAX_OPEN_CONNS", 100))
	sqlDB.SetConnMaxLifetime(utils.GetEnvDuration("DB_CONN_MAX_LIFETIME", time.Hour))

	return db, nil
}

func InitRedis() (*redis.Client, error) {
	dialTimeout := utils.GetEnvDuration("REDIS_DIAL_TIMEOUT", 5*time.Second)
	readTimeout := utils.GetEnvDuration("REDIS_READ_TIMEOUT", 3*time.Second)
	writeTimeout := utils.GetEnvDuration("REDIS_WRITE_TIMEOUT", 3*time.Second)

	client := redis.NewClient(&redis.Options{
		Addr:         utils.GetEnv("REDIS_ADDR", "localhost:6379"),
		Password:     utils.GetEnv("REDIS_PASSWORD", ""),
		DB:           utils.GetEnvInt("REDIS_DB", 0),
		DialTimeout:  dialTimeout,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		PoolSize:     utils.GetEnvInt("REDIS_POOL_SIZE", 10),
		MinIdleConns: utils.GetEnvInt("REDIS_MIN_IDLE_CONNS", 5),
	})

	ctx, cancel := context.WithTimeout(context.Background(), dialTimeout)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	return client, nil
}
