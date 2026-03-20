package services

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/utils"
)

// ContentModerationService 内容审核服务
type ContentModerationService struct {
	aiService *AIService
}

func NewContentModerationService(aiService *AIService) *ContentModerationService {
	return &ContentModerationService{aiService: aiService}
}

// ModerationResult 审核结果
type ModerationResult struct {
	Category    string  `json:"category"`
	Confidence  float64 `json:"confidence"`
	IsViolation bool    `json:"is_violation"`
	Description string  `json:"description"`
}

// ModerationResponse 审核响应
type ModerationResponse struct {
	IsSafe      bool               `json:"is_safe"`
	Results     []ModerationResult `json:"results"`
	Suggestions []string           `json:"suggestions"`
}

// ModerateContent 审核内容
func (s *ContentModerationService) ModerateContent(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
		Type    string `json:"type"` // post, comment, title
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	if req.Type == "" {
		req.Type = "post"
	}

	results := []ModerationResult{}
	suggestions := []string{}
	isSafe := true

	// 1. 敏感词检测
	sensitiveResult := s.checkSensitiveWords(req.Content)
	results = append(results, sensitiveResult)
	if sensitiveResult.IsViolation {
		isSafe = false
		suggestions = append(suggestions, "内容包含敏感词汇，请修改")
	}

	// 2. 广告检测
	adResult := s.checkAdvertisement(req.Content)
	results = append(results, adResult)
	if adResult.IsViolation {
		suggestions = append(suggestions, "内容可能包含广告信息")
	}

	// 3. 垃圾内容检测
	spamResult := s.checkSpam(req.Content)
	results = append(results, spamResult)
	if spamResult.IsViolation {
		isSafe = false
		suggestions = append(suggestions, "内容可能被识别为垃圾信息")
	}

	// 4. 使用AI进行深度审核
	if s.aiService != nil {
		aiResult := s.moderateWithAI(req.Content)
		results = append(results, aiResult)
		if aiResult.IsViolation {
			isSafe = false
			suggestions = append(suggestions, aiResult.Description)
		}
	}

	utils.Success(c, ModerationResponse{
		IsSafe:      isSafe,
		Results:     results,
		Suggestions: suggestions,
	})
}

// checkSensitiveWords 检查敏感词
func (s *ContentModerationService) checkSensitiveWords(content string) ModerationResult {
	// 敏感词列表（示例，实际应该从数据库或配置文件加载）
	sensitiveWords := []string{
		"敏感词1", "敏感词2", "违禁词",
	}

	for _, word := range sensitiveWords {
		if strings.Contains(content, word) {
			return ModerationResult{
				Category:    "敏感词",
				Confidence:  0.95,
				IsViolation: true,
				Description: fmt.Sprintf("检测到敏感词: %s", word),
			}
		}
	}

	return ModerationResult{
		Category:    "敏感词",
		Confidence:  0.99,
		IsViolation: false,
		Description: "未检测到敏感词",
	}
}

// checkAdvertisement 检查广告
func (s *ContentModerationService) checkAdvertisement(content string) ModerationResult {
	// 广告特征检测
	adPatterns := []string{
		"加微信", "加QQ", "联系方式", "点击链接",
		"限时优惠", "免费领取", "扫码关注",
	}

	violationCount := 0
	for _, pattern := range adPatterns {
		if strings.Contains(content, pattern) {
			violationCount++
		}
	}

	confidence := float64(violationCount) / float64(len(adPatterns))
	isViolation := violationCount >= 2

	return ModerationResult{
		Category:    "广告",
		Confidence:  confidence,
		IsViolation: isViolation,
		Description: fmt.Sprintf("检测到%d个广告特征", violationCount),
	}
}

// checkSpam 检查垃圾内容
func (s *ContentModerationService) checkSpam(content string) ModerationResult {
	// 垃圾内容特征
	isSpam := false
	confidence := 0.0

	// 1. 内容过短
	if len([]rune(content)) < 10 {
		isSpam = true
		confidence = 0.8
	}

	// 2. 重复内容
	if hasHighRepetition(content) {
		isSpam = true
		confidence = 0.9
	}

	// 3. 大量链接
	linkCount := strings.Count(content, "http")
	if linkCount > 3 {
		isSpam = true
		confidence = 0.85
	}

	return ModerationResult{
		Category:    "垃圾内容",
		Confidence:  confidence,
		IsViolation: isSpam,
		Description: "垃圾内容检测",
	}
}

// moderateWithAI 使用AI审核
func (s *ContentModerationService) moderateWithAI(content string) ModerationResult {
	prompt := fmt.Sprintf(`分析以下内容是否包含不当信息（暴力、色情、诋毁、违法等）。仅输出一个 JSON 对象，不要其他文字，格式如下：
{"is_violation": true或false, "confidence": 0-1之间小数, "category": "分类", "description": "简短说明"}

待分析内容：
%s`, content)

	result, err := s.aiService.CallAI(prompt)
	if err != nil {
		return ModerationResult{
			Category:    "AI审核",
			Confidence:  0.0,
			IsViolation: false,
			Description: "AI审核失败",
		}
	}

	// 解析AI响应（简化处理）
	isViolation := strings.Contains(result, "is_violation\": true")

	return ModerationResult{
		Category:    "AI审核",
		Confidence:  0.9,
		IsViolation: isViolation,
		Description: result,
	}
}

// hasHighRepetition 检测重复内容
func hasHighRepetition(content string) bool {
	// 检测重复字符
	charCount := make(map[rune]int)
	for _, char := range content {
		charCount[char]++
		if charCount[char] > len([]rune(content))/3 {
			return true
		}
	}
	return false
}
