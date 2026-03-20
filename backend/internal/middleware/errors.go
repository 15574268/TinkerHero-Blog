package middleware

import (
	"net/http"
	"os"
	"runtime/debug"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
)

// RecoveryMiddleware 错误恢复中间件
func RecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// 使用结构化日志记录错误
				logger.Error("服务器Panic恢复",
					zap.Any("error", err),
					zap.String("path", c.Request.URL.Path),
					zap.String("method", c.Request.Method),
					zap.String("client_ip", c.ClientIP()),
				)

				logger.Error("堆栈信息", zap.String("stack", string(debug.Stack())))
				errorMsg := "服务器内部错误"
				if os.Getenv("GIN_MODE") != "release" {
					errorMsg = "Panic recovered"
				}

				// 返回统一错误响应
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": errorMsg,
					"code":  500,
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}

// ErrorHandler 错误处理中间件
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// 检查是否有错误
		if len(c.Errors) > 0 {
			err := c.Errors.Last()

			// 根据错误类型返回不同的状态码
			status := http.StatusInternalServerError
			if err.Type == gin.ErrorTypeBind {
				status = http.StatusBadRequest
			}

			// 生产环境返回通用错误信息
			errorMsg := "服务器内部错误"
			if os.Getenv("GIN_MODE") != "release" {
				errorMsg = err.Error()
			} else if err.Type == gin.ErrorTypeBind {
				errorMsg = "请求参数格式错误"
			}

			logger.Warn("请求处理错误",
				zap.String("path", c.Request.URL.Path),
				zap.Int("status", status),
				zap.String("error", err.Error()),
			)

			if c.Writer.Written() {
				return
			}

			c.JSON(status, gin.H{
				"error": errorMsg,
				"code":  status,
			})
		}
	}
}
