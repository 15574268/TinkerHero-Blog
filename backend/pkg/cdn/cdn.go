package cdn

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

type CDNConfig struct {
	Enabled   bool
	BaseURL   string
	Provider  string // aliyun, tencent, qiniu, custom
}

var cdnConfig *CDNConfig

func InitCDN() {
	cdnConfig = &CDNConfig{
		Enabled:  os.Getenv("CDN_ENABLED") == "true",
		BaseURL:  os.Getenv("CDN_BASE_URL"),
		Provider: os.Getenv("CDN_PROVIDER"),
	}
}

// GetCDNURL 获取CDN URL
func GetCDNURL(originalURL string) string {
	if cdnConfig == nil || !cdnConfig.Enabled || cdnConfig.BaseURL == "" {
		return originalURL
	}

	// 如果已经是完整URL，替换域名
	if strings.HasPrefix(originalURL, "http://") || strings.HasPrefix(originalURL, "https://") {
		parsedURL, err := url.Parse(originalURL)
		if err == nil {
			parsedURL.Host = cdnConfig.BaseURL
			return parsedURL.String()
		}
	}

	// 如果是相对路径，添加CDN域名
	if strings.HasPrefix(originalURL, "/uploads/") {
		return fmt.Sprintf("%s%s", cdnConfig.BaseURL, originalURL)
	}

	return originalURL
}

// PurgeCDNCache 刷新CDN缓存（API调用）
func PurgeCDNCache(urls []string) error {
	if cdnConfig == nil || !cdnConfig.Enabled {
		return nil
	}

	// 根据不同的CDN提供商实现刷新逻辑
	switch cdnConfig.Provider {
	case "aliyun":
		return purgeAliyunCDN(urls)
	case "tencent":
		return purgeTencentCDN(urls)
	case "qiniu":
		return purgeQiniuCDN(urls)
	default:
		return nil
	}
}

// 各CDN提供商的具体实现
// TODO: 实现各CDN提供商的刷新API
func purgeAliyunCDN(_ []string) error {
	// 实现阿里云CDN刷新API
	// https://help.aliyun.com/document_detail/91164.html
	return nil
}

func purgeTencentCDN(_ []string) error {
	// 实现腾讯云CDN刷新API
	// https://cloud.tencent.com/document/product/228/3946
	return nil
}

func purgeQiniuCDN(_ []string) error {
	// 实现七牛CDN刷新API
	// https://developer.qiniu.com/fusion/kb/1329/how-to-refresh-cache
	return nil
}
