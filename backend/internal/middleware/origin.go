package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
)

// OriginCheckMiddleware validates that state-changing requests come from allowed origins.
// This provides CSRF protection for JWT-based APIs where traditional CSRF tokens are impractical.
func OriginCheckMiddleware(allowedOrigins []string) gin.HandlerFunc {
	allowedSet := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if u, err := url.Parse(strings.TrimSpace(o)); err == nil {
			allowedSet[strings.ToLower(u.Scheme+"://"+u.Host)] = true
		}
	}

	return func(c *gin.Context) {
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		origin := c.GetHeader("Origin")
		if origin == "" {
			referer := c.GetHeader("Referer")
			if referer != "" {
				if u, err := url.Parse(referer); err == nil {
					origin = u.Scheme + "://" + u.Host
				}
			}
		}

		// Allow requests with no Origin (e.g. server-to-server, curl, mobile apps)
		if origin == "" {
			c.Next()
			return
		}

		if !allowedSet[strings.ToLower(origin)] {
			logger.Warn("Origin check failed",
				zap.String("origin", origin),
				zap.String("path", c.Request.URL.Path),
				zap.String("method", c.Request.Method),
			)
			c.JSON(http.StatusForbidden, gin.H{"error": "请求来源不被允许"})
			c.Abort()
			return
		}

		c.Next()
	}
}
