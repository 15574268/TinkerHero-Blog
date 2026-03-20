package bootstrap

import (
	"log"
	"strings"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/config"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/cdn"
	"github.com/tinkerhero/blog/backend/pkg/database"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"gorm.io/gorm"
)

// Config 应用配置
type Config struct {
	LogLevel           string
	LogOutput          string
	ESURL              string
	ESUser             string
	ESPassword         string
	CORSOrigins        []string
	SMTPHost           string
	SMTPPort           string
	SMTPUser           string
	SMTPPass           string
	SMTPFrom           string
	Port               string
	GitHubClientID     string
	GitHubClientSecret string
	GoogleClientID     string
	GoogleClientSecret string
	WatermarkEnabled   bool
	WatermarkText      string
	WatermarkPosition  string
}

// LoadConfig 加载配置
func LoadConfig() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	return &Config{
		LogLevel:           utils.GetEnv("LOG_LEVEL", "info"),
		LogOutput:          utils.GetEnv("LOG_OUTPUT", "stdout"),
		ESURL:              utils.GetEnv("ES_URL", "http://localhost:9200"),
		ESUser:             utils.GetEnv("ES_USER", ""),
		ESPassword:         utils.GetEnv("ES_PASSWORD", ""),
		CORSOrigins:        splitAndTrim(utils.GetEnv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3200"), ","),
		SMTPHost:           utils.GetEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:           utils.GetEnv("SMTP_PORT", "587"),
		SMTPUser:           utils.GetEnv("SMTP_USER", ""),
		SMTPPass:           utils.GetEnv("SMTP_PASS", ""),
		SMTPFrom:           utils.GetEnv("SMTP_FROM", "noreply@blog.com"),
		Port:               utils.GetEnv("PORT", "8080"),
		GitHubClientID:     utils.GetEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: utils.GetEnv("GITHUB_CLIENT_SECRET", ""),
		GoogleClientID:     utils.GetEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: utils.GetEnv("GOOGLE_CLIENT_SECRET", ""),
		WatermarkEnabled:   utils.GetEnv("WATERMARK_ENABLED", "false") == "true",
		WatermarkText:      utils.GetEnv("WATERMARK_TEXT", "折腾侠"),
		WatermarkPosition:  utils.GetEnv("WATERMARK_POSITION", "bottom-right"),
	}
}

// InitLogger 初始化日志
func InitLogger(cfg *Config) {
	logger.Init(logger.Config{
		Level:      cfg.LogLevel,
		Encoding:   "console",
		OutputPath: cfg.LogOutput,
	})
}

// InitDatabase 初始化数据库
func InitDatabase() (*gorm.DB, error) {
	db, err := config.InitDB()
	if err != nil {
		return nil, err
	}

	// 自动迁移
	if err := models.AutoMigrate(db); err != nil {
		return nil, err
	}

	// 创建索引
	if err := database.CreateIndexes(db); err != nil {
		logger.Warnf("Failed to create indexes: %v", err)
	}

	// 分析表
	if err := database.AnalyzeTable(db); err != nil {
		logger.Warnf("Failed to analyze tables: %v", err)
	}

	return db, nil
}

// InitRedis 初始化并返回Redis客户端
func InitRedis() *redis.Client {
	client, err := config.InitRedis()
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	logger.Info("Redis initialized and connected")
	return client
}

// InitCDN 初始化CDN
func InitCDN() {
	cdn.InitCDN()
}

func splitAndTrim(s, sep string) []string {
	parts := strings.Split(s, sep)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
