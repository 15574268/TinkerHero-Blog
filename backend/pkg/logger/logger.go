package logger

import (
	"context"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	logger     *zap.Logger
	sugar      *zap.SugaredLogger
	initOnce   sync.Once
)

// Config 日志配置
type Config struct {
	Level      string // debug, info, warn, error
	Encoding   string // json, console
	OutputPath string // stdout, file path
}

// Init 初始化日志
func Init(cfg Config) {
	initOnce.Do(func() {
		level := getLevel(cfg.Level)
		encoder := getEncoder(cfg.Encoding)
		writer := getWriter(cfg.OutputPath)

		core := zapcore.NewCore(encoder, writer, level)
		logger = zap.New(core, zap.AddCaller(), zap.AddCallerSkip(1))
		sugar = logger.Sugar()
	})
}

// InitDefault 使用默认配置初始化
func InitDefault() {
	Init(Config{
		Level:      "info",
		Encoding:   "console",
		OutputPath: "stdout",
	})
}

func getLevel(level string) zapcore.Level {
	switch level {
	case "debug":
		return zapcore.DebugLevel
	case "info":
		return zapcore.InfoLevel
	case "warn":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

func getEncoder(encoding string) zapcore.Encoder {
	encoderConfig := zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		FunctionKey:    zapcore.OmitKey,
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.CapitalColorLevelEncoder,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.SecondsDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	if encoding == "json" {
		encoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder
		return zapcore.NewJSONEncoder(encoderConfig)
	}
	return zapcore.NewConsoleEncoder(encoderConfig)
}

func getWriter(outputPath string) zapcore.WriteSyncer {
	if outputPath == "" || outputPath == "stdout" {
		return zapcore.AddSync(os.Stdout)
	}
	// 文件输出
	file, err := os.OpenFile(outputPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		// 降级到 stdout
		return zapcore.AddSync(os.Stdout)
	}
	return zapcore.AddSync(file)
}

// GetLogger 获取 zap logger
func GetLogger() *zap.Logger {
	if logger == nil {
		InitDefault()
	}
	return logger
}

// GetSugar 获取 sugared logger
func GetSugar() *zap.SugaredLogger {
	if sugar == nil {
		InitDefault()
	}
	return sugar
}

// Sync 刷新日志缓冲
func Sync() error {
	if logger != nil {
		return logger.Sync()
	}
	return nil
}

// Context keys
type ctxKey string

const (
	RequestIDKey ctxKey = "request_id"
	UserIDKey    ctxKey = "user_id"
)

// WithContext 返回带有上下文信息的日志
func WithContext(ctx context.Context) *zap.Logger {
	l := GetLogger()
	
	if requestID, ok := ctx.Value(RequestIDKey).(string); ok {
		l = l.With(zap.String("request_id", requestID))
	}
	if userID, ok := ctx.Value(UserIDKey).(uint); ok {
		l = l.With(zap.Uint("user_id", userID))
	}
	
	return l
}

// Debug 调试日志
func Debug(msg string, fields ...zap.Field) {
	GetLogger().Debug(msg, fields...)
}

// Info 信息日志
func Info(msg string, fields ...zap.Field) {
	GetLogger().Info(msg, fields...)
}

// Warn 警告日志
func Warn(msg string, fields ...zap.Field) {
	GetLogger().Warn(msg, fields...)
}

// Error 错误日志
func Error(msg string, fields ...zap.Field) {
	GetLogger().Error(msg, fields...)
}

// Fatal 致命错误日志
func Fatal(msg string, fields ...zap.Field) {
	GetLogger().Fatal(msg, fields...)
}

// Debugf 格式化调试日志
func Debugf(template string, args ...any) {
	GetSugar().Debugf(template, args...)
}

// Infof 格式化信息日志
func Infof(template string, args ...any) {
	GetSugar().Infof(template, args...)
}

// Warnf 格式化警告日志
func Warnf(template string, args ...any) {
	GetSugar().Warnf(template, args...)
}

// Errorf 格式化错误日志
func Errorf(template string, args ...any) {
	GetSugar().Errorf(template, args...)
}

// Fatalf 格式化致命错误日志
func Fatalf(template string, args ...any) {
	GetSugar().Fatalf(template, args...)
}

// RequestLogger 记录请求日志
func RequestLogger(c *gin.Context, statusCode int, latency time.Duration) {
	fields := []zap.Field{
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.String("query", c.Request.URL.RawQuery),
		zap.Int("status", statusCode),
		zap.Duration("latency", latency),
		zap.String("client_ip", c.ClientIP()),
		zap.String("user_agent", c.GetHeader("User-Agent")),
	}

	if requestID := c.GetString(string(RequestIDKey)); requestID != "" {
		fields = append(fields, zap.String("request_id", requestID))
	}

	if userID := c.GetUint("user_id"); userID != 0 {
		fields = append(fields, zap.Uint("user_id", userID))
	}

	if statusCode >= 500 {
		Error("Server error", fields...)
	} else if statusCode >= 400 {
		Warn("Client error", fields...)
	} else {
		Info("Request", fields...)
	}
}
