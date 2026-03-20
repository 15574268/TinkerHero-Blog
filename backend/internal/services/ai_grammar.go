package services

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/utils"
)

// GrammarService 语法检查服务
type GrammarService struct {
	aiService *AIService
}

func NewGrammarService(aiService *AIService) *GrammarService {
	return &GrammarService{aiService: aiService}
}

// GrammarError 语法错误
type GrammarError struct {
	Type       string `json:"type"`
	Message    string `json:"message"`
	Suggestion string `json:"suggestion"`
	Position   int    `json:"position"`
	Length     int    `json:"length"`
}

// CheckGrammar 检查语法
func (s *GrammarService) CheckGrammar(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
		Lang    string `json:"lang"` // zh, en
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	if req.Lang == "" {
		req.Lang = "zh"
	}

	errors := []GrammarError{}

	// 基础检查
	errors = append(errors, s.checkBasicGrammar(req.Content, req.Lang)...)

	// 使用AI进行高级检查
	aiErrors := s.checkWithAI(req.Content, req.Lang)
	errors = append(errors, aiErrors...)

	utils.Success(c, gin.H{
		"errors": errors,
		"count":  len(errors),
	})
}

// checkBasicGrammar 基础语法检查
func (s *GrammarService) checkBasicGrammar(content, lang string) []GrammarError {
	errors := []GrammarError{}

	switch lang {
	case "zh":
		// 中文语法检查
		// 1. 检查标点符号
		if strings.Contains(content, ",") {
			errors = append(errors, GrammarError{
				Type:       "标点符号",
				Message:    "使用了英文逗号",
				Suggestion: "建议使用中文逗号：，",
				Position:   strings.Index(content, ","),
				Length:     1,
			})
		}

		if strings.Contains(content, ".") && !regexp.MustCompile(`\d+\.\d+`).MatchString(content) {
			errors = append(errors, GrammarError{
				Type:       "标点符号",
				Message:    "使用了英文句号",
				Suggestion: "建议使用中文句号：。",
				Position:   strings.Index(content, "."),
				Length:     1,
			})
		}

		// 2. 检查空格
		if regexp.MustCompile(`[\u4e00-\u9fa5]\s+[\u4e00-\u9fa5]`).MatchString(content) {
			errors = append(errors, GrammarError{
				Type:       "空格",
				Message:    "中文之间有多余空格",
				Suggestion: "中文之间不需要空格",
				Position:   -1,
				Length:     0,
			})
		}

		// 3. 检查重复词语（Go regexp 不支持 \1 反向引用，改用循环检测相邻重复）
		twoOrMore := regexp.MustCompile(`[\u4e00-\u9fa5]{2,}`)
		words := twoOrMore.FindAllString(content, -1)
		for i := 0; i < len(words)-1; i++ {
			if words[i] == words[i+1] {
				errors = append(errors, GrammarError{
					Type:       "重复",
					Message:    fmt.Sprintf("发现重复词语: %s", words[i]),
					Suggestion: "删除重复词语",
					Position:   -1,
					Length:     len(words[i]) * 2,
				})
				break
			}
		}

	case "en":
		// 英文语法检查
		// 1. 检查句子首字母大写
		sentences := regexp.MustCompile(`[.!?]\s+`).Split(content, -1)
		for i, sentence := range sentences {
			if len(sentence) > 0 && sentence[0] >= 'a' && sentence[0] <= 'z' {
				errors = append(errors, GrammarError{
					Type:       "大小写",
					Message:    fmt.Sprintf("第%d句首字母未大写", i+1),
					Suggestion: "句子首字母应大写",
					Position:   -1,
					Length:     1,
				})
			}
		}

		// 2. 检查常见拼写错误
		commonMistakes := map[string]string{
			"recieve":    "receive",
			"occured":    "occurred",
			"seperate":   "separate",
			"definately": "definitely",
		}

		for wrong, correct := range commonMistakes {
			if strings.Contains(strings.ToLower(content), wrong) {
				errors = append(errors, GrammarError{
					Type:       "拼写",
					Message:    fmt.Sprintf("可能的拼写错误: %s", wrong),
					Suggestion: correct,
					Position:   strings.Index(strings.ToLower(content), wrong),
					Length:     len(wrong),
				})
			}
		}
	}

	return errors
}

// checkWithAI 使用AI检查语法
func (s *GrammarService) checkWithAI(content, lang string) []GrammarError {
	if s.aiService == nil {
		return []GrammarError{}
	}

	langLabel := map[string]string{"zh": "中文", "en": "英文"}[lang]
	if langLabel == "" {
		langLabel = "中文"
	}
	prompt := fmt.Sprintf("检查以下%s文本的语法与用词错误，按 JSON 数组格式输出，每项包含 error（错误原文或位置描述）、suggestion（修改建议）。只输出 JSON，不要其他说明。\n\n%s", langLabel, content)

	result, err := s.aiService.CallAI(prompt)
	if err != nil {
		return []GrammarError{}
	}

	// 解析AI返回的结果（简化处理）
	// 实际应该解析JSON格式的响应
	return []GrammarError{
		{
			Type:       "AI建议",
			Message:    "AI分析结果",
			Suggestion: result,
			Position:   -1,
			Length:     0,
		},
	}
}

// CheckSpelling 拼写检查
func (s *GrammarService) CheckSpelling(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
		Lang    string `json:"lang"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 这里可以集成专业的拼写检查库或API
	// 简化版：使用AI
	if s.aiService != nil {
		prompt := fmt.Sprintf("检查以下文本的拼写错误，列出错误词及修改建议。若为中文可检查错别字与用词。只输出修改建议列表或「未发现明显错误」。\n\n%s", req.Content)
		result, _ := s.aiService.CallAI(prompt)

		utils.Success(c, gin.H{
			"suggestions": result,
		})
		return
	}

	utils.Success(c, gin.H{
		"suggestions": "AI服务未配置",
	})
}
