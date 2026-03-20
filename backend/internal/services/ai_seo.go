package services

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/utils"
)

// SEOService SEO优化服务
type SEOService struct {
	aiService *AIService
}

func NewSEOService(aiService *AIService) *SEOService {
	return &SEOService{aiService: aiService}
}

// AnalyzeSEORequest SEO分析请求
type AnalyzeSEORequest struct {
	Title   string `json:"title" binding:"required"`
	Content string `json:"content" binding:"required"`
}

// SEOSuggestion SEO建议
type SEOSuggestion struct {
	Category string   `json:"category"`
	Issue    string   `json:"issue"`
	Score    int      `json:"score"`
	Tips     []string `json:"tips"`
}

// AnalyzeSEO 分析文章SEO
func (s *SEOService) AnalyzeSEO(c *gin.Context) {
	var req AnalyzeSEORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	suggestions := []SEOSuggestion{}
	totalScore := 100

	// 1. 标题分析
	titleSuggestions := s.analyzeTitle(req.Title)
	suggestions = append(suggestions, titleSuggestions...)
	for _, s := range titleSuggestions {
		totalScore -= (100 - s.Score)
	}

	// 2. 内容长度分析
	lengthSuggestion := s.analyzeContentLength(req.Content)
	suggestions = append(suggestions, lengthSuggestion)
	if lengthSuggestion.Score < 100 {
		totalScore -= (100 - lengthSuggestion.Score)
	}

	// 3. 关键词分析
	keywordSuggestions := s.analyzeKeywords(req.Title, req.Content)
	suggestions = append(suggestions, keywordSuggestions...)

	// 4. 可读性分析
	readabilitySuggestion := s.analyzeReadability(req.Content)
	suggestions = append(suggestions, readabilitySuggestion)

	// 5. 链接分析
	linkSuggestion := s.analyzeLinks(req.Content)
	suggestions = append(suggestions, linkSuggestion)

	if totalScore < 0 {
		totalScore = 0
	}

	utils.Success(c, gin.H{
		"score":       totalScore,
		"suggestions": suggestions,
	})
}

// analyzeTitle 分析标题
func (s *SEOService) analyzeTitle(title string) []SEOSuggestion {
	suggestions := []SEOSuggestion{}

	// 标题长度
	if len(title) < 30 {
		suggestions = append(suggestions, SEOSuggestion{
			Category: "标题",
			Issue:    "标题过短",
			Score:    70,
			Tips:     []string{"建议标题长度在30-60个字符之间", "添加更多描述性词汇"},
		})
	} else if len(title) > 60 {
		suggestions = append(suggestions, SEOSuggestion{
			Category: "标题",
			Issue:    "标题过长",
			Score:    80,
			Tips:     []string{"标题可能被搜索引擎截断", "建议控制在60个字符以内"},
		})
	} else {
		suggestions = append(suggestions, SEOSuggestion{
			Category: "标题",
			Issue:    "标题长度适中",
			Score:    100,
			Tips:     []string{"标题长度良好"},
		})
	}

	// 标题吸引力
	// 可以调用AI分析标题吸引力

	return suggestions
}

// analyzeContentLength 分析内容长度
func (s *SEOService) analyzeContentLength(content string) SEOSuggestion {
	wordCount := len([]rune(content))

	if wordCount < 300 {
		return SEOSuggestion{
			Category: "内容长度",
			Issue:    fmt.Sprintf("内容过短（%d字）", wordCount),
			Score:    60,
			Tips:     []string{"建议文章至少300字以上", "搜索引擎偏好长内容"},
		}
	} else if wordCount < 1000 {
		return SEOSuggestion{
			Category: "内容长度",
			Issue:    fmt.Sprintf("内容长度适中（%d字）", wordCount),
			Score:    85,
			Tips:     []string{"建议扩展到1000字以上效果更好"},
		}
	} else {
		return SEOSuggestion{
			Category: "内容长度",
			Issue:    fmt.Sprintf("内容长度良好（%d字）", wordCount),
			Score:    100,
			Tips:     []string{"内容长度适合SEO"},
		}
	}
}

// analyzeKeywords 分析关键词
func (s *SEOService) analyzeKeywords(title, content string) []SEOSuggestion {
	suggestions := []SEOSuggestion{}

	// 提取标题中的关键词
	titleWords := strings.Fields(title)
	if len(titleWords) == 0 {
		return suggestions
	}

	// 检查关键词在内容中的密度
	densityTips := []string{}
	for _, word := range titleWords {
		count := strings.Count(content, word)
		density := float64(count) / float64(len([]rune(content))) * 100
		if density > 3 {
			densityTips = append(densityTips, fmt.Sprintf("关键词'%s'密度过高(%.2f%%)，可能被视为关键词堆砌", word, density))
		}
	}

	if len(densityTips) > 0 {
		suggestions = append(suggestions, SEOSuggestion{
			Category: "关键词",
			Issue:    "关键词密度问题",
			Score:    75,
			Tips:     densityTips,
		})
	}

	return suggestions
}

// analyzeReadability 分析可读性
func (s *SEOService) analyzeReadability(content string) SEOSuggestion {
	// 段落分析
	paragraphs := strings.Split(content, "\n\n")
	avgParagraphLength := len([]rune(content)) / max(len(paragraphs), 1)

	tips := []string{}

	if avgParagraphLength > 200 {
		tips = append(tips, "段落过长，建议分段以提高可读性")
	}

	// 使用小标题
	hasSubheading := strings.Contains(content, "##") || strings.Contains(content, "<h2")
	if !hasSubheading && len([]rune(content)) > 500 {
		tips = append(tips, "长文章建议添加小标题(H2/H3)")
	}

	score := 100
	if len(tips) > 0 {
		score = 80
	}

	return SEOSuggestion{
		Category: "可读性",
		Issue:    "内容结构分析",
		Score:    score,
		Tips:     tips,
	}
}

// analyzeLinks 分析链接
func (s *SEOService) analyzeLinks(content string) SEOSuggestion {
	// 检查外部链接
	externalLinkPattern := regexp.MustCompile(`https?://[^\s]+`)
	links := externalLinkPattern.FindAllString(content, -1)

	tips := []string{}

	if len(links) == 0 {
		tips = append(tips, "建议添加相关的外部链接")
	} else {
		tips = append(tips, fmt.Sprintf("发现%d个外部链接", len(links)))
	}

	score := 90
	if len(links) == 0 {
		score = 70
	}

	return SEOSuggestion{
		Category: "链接",
		Issue:    "链接分析",
		Score:    score,
		Tips:     tips,
	}
}

// GenerateMetaTags 生成Meta标签建议
func (s *SEOService) GenerateMetaTags(c *gin.Context) {
	var req struct {
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 生成描述
	description := req.Content
	if len([]rune(description)) > 160 {
		description = string([]rune(description)[:160])
	}

	// 提取关键词
	// 简化版：提取标题中的词作为关键词
	keywords := strings.Join(strings.Fields(req.Title), ", ")

	utils.Success(c, gin.H{
		"meta": gin.H{
			"title":          req.Title,
			"description":    description,
			"keywords":       keywords,
			"og_title":       req.Title,
			"og_description": description,
		},
	})
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
