package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/tinkerhero/blog/backend/pkg/logger"
)

// RequestIDMiddleware 为每个请求添加唯一ID
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" || len(requestID) > 64 || !isValidRequestID(requestID) {
			requestID = uuid.New().String()
		}

		// 存储到上下文
		c.Set(string(logger.RequestIDKey), requestID)

		// 设置响应头
		c.Header("X-Request-ID", requestID)
		
		c.Next()
	}
}

// GetRequestID 获取请求ID
func GetRequestID(c *gin.Context) string {
	if requestID, exists := c.Get(string(logger.RequestIDKey)); exists {
		if id, ok := requestID.(string); ok {
			return id
		}
	}
	return ""
}

func isValidRequestID(id string) bool {
	for _, c := range id {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}
