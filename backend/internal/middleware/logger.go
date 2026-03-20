package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
)

// LoggerMiddleware 结构化日志中间件
func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		username := "anonymous"
		if uname, exists := c.Get("username"); exists {
			if name, ok := uname.(string); ok {
				username = name
			}
		}

		fields := []zap.Field{
			zap.Int("status", status),
			zap.Duration("latency", latency),
			zap.String("client_ip", c.ClientIP()),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.String("user", username),
		}

		if status >= 500 {
			logger.Error("Request", fields...)
		} else if status >= 400 {
			logger.Warn("Request", fields...)
		} else {
			logger.Info("Request", fields...)
		}
	}
}
