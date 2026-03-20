package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// IPBlacklistMiddleware 当 enable_ip_blacklist 为 true 时，拒绝黑名单 IP
func IPBlacklistMiddleware(getConfig func(key string) string, isBlacklisted func(ip string) bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if getConfig != nil && getConfig("enable_ip_blacklist") != "true" {
			c.Next()
			return
		}
		if isBlacklisted == nil {
			c.Next()
			return
		}
		ip := c.ClientIP()
		if isBlacklisted(ip) {
			c.JSON(http.StatusForbidden, gin.H{"error": "访问被拒绝"})
			c.Abort()
			return
		}
		c.Next()
	}
}
