package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
)

// wenxinTokenCache 缓存文心一言 access token（有效期通常 30 天）
type wenxinTokenCache struct {
	mu        sync.Mutex
	token     string
	expiresAt time.Time
}

type AIService struct {
	apiKey       string
	baseURL      string
	model        string
	httpClient   *http.Client
	getConfig    func(key string) string // 可选：从系统配置读取，优先于环境变量
	wenxinCache  wenxinTokenCache
}

func NewAIService() *AIService {
	return &AIService{
		apiKey:  os.Getenv("OPENAI_API_KEY"),
		baseURL: os.Getenv("OPENAI_BASE_URL"),
		model:   utils.GetEnv("OPENAI_MODEL", "gpt-4o-mini"),
		httpClient: &http.Client{
			Timeout: 180 * time.Second, // 大模型响应可能较慢，预留 3 分钟
		},
	}
}

// NewAIServiceWithConfig 使用系统配置 getter，优先使用 DB 中的配置（openai_api_key, openai_base_url, openai_model）
func NewAIServiceWithConfig(getConfig func(key string) string) *AIService {
	s := NewAIService()
	s.getConfig = getConfig
	return s
}

// AIRequest AI请求结构
type AIRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// AIResponse AI响应结构
type AIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// GenerateTitle 生成文章标题
func (s *AIService) GenerateTitle(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	prompt := fmt.Sprintf("根据以下文章内容生成 3 个吸引人的标题。要求：简洁、可包含核心关键词、适合 SEO；每行一个标题，不要序号或引号。\n\n%s", req.Content)

	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("生成标题失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{"titles": result})
}

// GenerateSummary 生成文章摘要
func (s *AIService) GenerateSummary(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 截取前1000字
	content := req.Content
	if len(content) > 1000 {
		content = content[:1000]
	}

	prompt := fmt.Sprintf("为以下文章生成一则 100–150 字的摘要。要求：概括核心观点、吸引读者点击，用完整句子表达，不要直接复制原文长句。只输出摘要正文，不要前缀说明。\n\n%s", content)

	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("生成摘要失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{"summary": result})
}

const maxAIContentBytes = 50_000 // 50 KB，防止超大请求消耗过多 AI token

// ContinueWriting 续写文章
func (s *AIService) ContinueWriting(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if len(req.Content) > maxAIContentBytes {
		utils.BadRequest(c, fmt.Sprintf("内容过长，最多支持 %d 字节", maxAIContentBytes))
		return
	}

	prompt := fmt.Sprintf("续写以下文章，保持语气与段落风格一致，续写 200–300 字。不要重复前文已写内容，只输出续写部分。\n\n%s", req.Content)

	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("续写文章失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{"continuation": result})
}

// PolishText 润色文章
func (s *AIService) PolishText(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if len(req.Content) > maxAIContentBytes {
		utils.BadRequest(c, fmt.Sprintf("内容过长，最多支持 %d 字节", maxAIContentBytes))
		return
	}

	prompt := fmt.Sprintf("润色以下文章，使表达更流畅、用语更专业，不改变事实与观点。只输出润色后的全文，不要说明或批注。\n\n%s", req.Content)

	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("润色文章失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{"polished": result})
}

// TranslateText 翻译文本
func (s *AIService) TranslateText(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
		Lang    string `json:"lang"` // en, zh
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if len(req.Content) > maxAIContentBytes {
		utils.BadRequest(c, fmt.Sprintf("内容过长，最多支持 %d 字节", maxAIContentBytes))
		return
	}

	var prompt string
	if req.Lang == "en" {
		prompt = fmt.Sprintf("将以下中文翻译成英文，译文需自然、符合英文习惯；技术术语可保留不译。只输出译文。\n\n%s", req.Content)
	} else {
		prompt = fmt.Sprintf("将以下英文翻译成中文，译文需自然、符合中文习惯；技术术语可保留不译。只输出译文。\n\n%s", req.Content)
	}

	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("翻译文本失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{"translation": result})
}

// GenerateOutline 生成文章大纲
func (s *AIService) GenerateOutline(c *gin.Context) {
	var req struct {
		Topic string `json:"topic" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	prompt := fmt.Sprintf("为主题「%s」生成一篇详细文章大纲。要求：3–5 个主要章节，每章下 2–3 个子要点；用「一、二、三」或「1. 2. 3.」标注章节，子要点换行缩进。只输出大纲，不要前言说明。", req.Topic)

	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("生成大纲失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{"outline": result})
}

// SuggestTagsAndCategoryRequest 标签与分类推荐请求
type SuggestTagsAndCategoryRequest struct {
	Title         string   `json:"title"`
	Content       string   `json:"content" binding:"required"`
	CategoryNames []string `json:"category_names"` // 可选：已有分类名，AI 尽量从中选
	TagNames      []string `json:"tag_names"`      // 可选：已有标签名，AI 尽量从中选
}

// SuggestTagsAndCategory 根据标题与正文推荐一个分类与若干标签
func (s *AIService) SuggestTagsAndCategory(c *gin.Context) {
	var req SuggestTagsAndCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	content := req.Content
	if len(content) > 2000 {
		content = content[:2000] + "..."
	}
	hint := ""
	if len(req.CategoryNames) > 0 || len(req.TagNames) > 0 {
		hint = "已知可选："
		if len(req.CategoryNames) > 0 {
			hint += "分类[" + strings.Join(req.CategoryNames, ",") + "]"
		}
		if len(req.TagNames) > 0 {
			hint += " 标签[" + strings.Join(req.TagNames, ",") + "]。优先从上述中选择；若无合适项可推荐新名称。"
		}
	}
	prompt := fmt.Sprintf("根据以下文章标题和正文，推荐一个分类与若干标签。%s\n严格只输出两行：第一行以「分类：」开头写一个分类名；第二行以「标签：」开头写多个标签，用中文或英文逗号分隔。不要任何解释、序号或其它内容。\n\n标题：%s\n\n正文：\n%s", hint, req.Title, content)
	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("推荐标签/分类失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}
	categoryName := ""
	tagStrs := []string{}
	for _, line := range strings.Split(strings.TrimSpace(result), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "分类：") {
			categoryName = strings.TrimSpace(strings.TrimPrefix(line, "分类："))
		} else if strings.HasPrefix(line, "标签：") {
			part := strings.TrimSpace(strings.TrimPrefix(line, "标签："))
			part = strings.ReplaceAll(part, "，", ",")
			for _, s := range strings.Split(part, ",") {
				if t := strings.TrimSpace(s); t != "" {
					tagStrs = append(tagStrs, t)
				}
			}
		}
	}
	utils.Success(c, gin.H{"category_name": categoryName, "tags": tagStrs})
}

// GenerateSlugRequest URL 别名生成请求
type GenerateSlugRequest struct {
	Title string `json:"title" binding:"required"`
}

// normalizeSlug 将 AI 返回的字符串规范化为 URL 可用的 slug
func normalizeSlug(raw string) string {
	slug := strings.ToLower(strings.TrimSpace(raw))
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.ReplaceAll(slug, "_", "-")
	var b strings.Builder
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
	}
	slug = strings.Trim(b.String(), "-")
	if slug == "" {
		return "post"
	}
	return slug
}

// GenerateSlug 根据文章标题生成 URL 友好的别名（小写、连字符、仅字母数字）
func (s *AIService) GenerateSlug(c *gin.Context) {
	var req GenerateSlugRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		utils.BadRequest(c, "标题不能为空")
		return
	}
	prompt := fmt.Sprintf("将以下文章标题转换为适合作为 URL 路径的英文别名（slug）。要求：仅输出一段小写英文，单词用连字符 - 分隔，无空格与特殊符号，长度控制在 3～8 个单词内。不要任何解释或引号。\n\n标题：%s", title)
	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("生成 URL 别名失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}
	utils.Success(c, gin.H{"slug": normalizeSlug(result)})
}

// BatchGenerateRequest 一键生成请求：勾选要生成的项，一次返回
type BatchGenerateRequest struct {
	Content       string   `json:"content"`
	Title         string   `json:"title"`
	CategoryNames []string `json:"category_names"`
	TagNames      []string `json:"tag_names"`
	Generate      []string `json:"generate" binding:"required"` // summary, title, slug, tags_category
}

// batchGenerateResult 单次请求后解析的 JSON 结构
type batchGenerateResult struct {
	Title        string   `json:"title"`
	Summary      string   `json:"summary"`
	Slug         string   `json:"slug"`
	CategoryName string   `json:"category_name"`
	Tags         []string `json:"tags"`
}

// BatchGenerate 根据勾选项一次性生成标题、摘要、URL 别名、分类与标签（单次请求，单次 token 消耗）
func (s *AIService) BatchGenerate(c *gin.Context) {
	var req BatchGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if len(req.Generate) == 0 {
		utils.BadRequest(c, "请至少选择一项要生成的内容")
		return
	}
	content := strings.TrimSpace(req.Content)
	title := strings.TrimSpace(req.Title)
	needContent := false
	for _, g := range req.Generate {
		switch g {
		case "summary", "title", "tags_category":
			needContent = true
		}
	}
	if needContent && content == "" {
		utils.BadRequest(c, "生成摘要、标题或分类与标签需要先填写正文")
		return
	}

	// 限制正文长度，控制单次请求 token
	if len(content) > 2500 {
		content = content[:2500] + "..."
	}

	// 构建「只生成勾选项」的 JSON 说明
	var fields []string
	if sliceContains(req.Generate, "title") {
		fields = append(fields, `"title": "一个简洁、含关键词的文章标题"`)
	}
	if sliceContains(req.Generate, "summary") {
		fields = append(fields, `"summary": "100-150字摘要，概括核心观点"`)
	}
	if sliceContains(req.Generate, "slug") && title != "" {
		fields = append(fields, `"slug": "英文小写、单词用连字符分隔、3-8个单词，无空格与特殊符号"`)
	}
	if sliceContains(req.Generate, "tags_category") {
		fields = append(fields, `"category_name": "一个分类名称"`, `"tags": ["标签1", "标签2"]`)
	}
	if len(fields) == 0 {
		utils.Success(c, gin.H{})
		return
	}

	hintOpt := ""
	if len(req.CategoryNames) > 0 || len(req.TagNames) > 0 {
		hintOpt = "。分类与标签请尽量从以下已有项中选择："
		if len(req.CategoryNames) > 0 {
			hintOpt += " 分类[" + strings.Join(req.CategoryNames, ",") + "]"
		}
		if len(req.TagNames) > 0 {
			hintOpt += " 标签[" + strings.Join(req.TagNames, ",") + "]"
		}
	}

	prompt := fmt.Sprintf(`你是博客写作助手。根据下面的「标题」和「正文」，生成以下内容。
请**仅输出一个 JSON 对象**，不要任何其他文字、解释或 markdown 代码块。不需要的字段可省略或留空字符串/空数组。
JSON 需包含且仅包含以下字段（按需生成）：
{ %s }
要求：title 简洁、适合 SEO；summary 概括核心、吸引点击；slug 仅英文小写连字符%s。

标题：%s

正文：
%s`, strings.Join(fields, ", "), hintOpt, title, content)

	result, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("一键生成失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	raw := extractJSONFromResponse(result)
	var parsed batchGenerateResult
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		logger.Error("一键生成解析 JSON 失败", zap.String("raw", raw), zap.Error(err))
		utils.InternalError(c, "AI 返回格式无法解析")
		return
	}

	out := make(map[string]interface{})
	if sliceContains(req.Generate, "title") && strings.TrimSpace(parsed.Title) != "" {
		out["title"] = strings.TrimSpace(parsed.Title)
	}
	if sliceContains(req.Generate, "summary") && strings.TrimSpace(parsed.Summary) != "" {
		out["summary"] = strings.TrimSpace(parsed.Summary)
	}
	if sliceContains(req.Generate, "slug") && title != "" && strings.TrimSpace(parsed.Slug) != "" {
		out["slug"] = normalizeSlug(parsed.Slug)
	}
	if sliceContains(req.Generate, "tags_category") {
		if strings.TrimSpace(parsed.CategoryName) != "" {
			out["category_name"] = strings.TrimSpace(parsed.CategoryName)
		}
		if len(parsed.Tags) > 0 {
			trimmed := make([]string, 0, len(parsed.Tags))
			for _, t := range parsed.Tags {
				if s := strings.TrimSpace(t); s != "" {
					trimmed = append(trimmed, s)
				}
			}
			if len(trimmed) > 0 {
				out["tags"] = trimmed
			}
		}
	}
	utils.Success(c, out)
}

// extractJSONFromResponse 从 AI 返回中提取 JSON（去除 markdown 代码块等）
func extractJSONFromResponse(s string) string {
	s = strings.TrimSpace(s)
	// 去掉 ```json ... ``` 或 ``` ... ```
	if idx := strings.Index(s, "```"); idx >= 0 {
		s = s[idx+3:]
		if strings.HasPrefix(strings.TrimLeft(s, " \t"), "json") {
			s = s[strings.Index(s, "json")+4:]
		}
		if end := strings.Index(s, "```"); end >= 0 {
			s = s[:end]
		}
	}
	s = strings.TrimSpace(s)
	return s
}

func sliceContains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

// SuggestCommentReplyRequest 评论建议回复请求
type SuggestCommentReplyRequest struct {
	CommentContent string `json:"comment_content" binding:"required"`
	PostTitle      string `json:"post_title"`
}

// SuggestCommentReply 根据评论内容生成站长建议回复
func (s *AIService) SuggestCommentReply(c *gin.Context) {
	var req SuggestCommentReplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}
	if len(req.CommentContent) > maxAIContentBytes {
		utils.BadRequest(c, fmt.Sprintf("内容过长，最多支持 %d 字节", maxAIContentBytes))
		return
	}
	ctx := ""
	if req.PostTitle != "" {
		ctx = "文章标题：" + req.PostTitle + "\n\n"
	}
	prompt := fmt.Sprintf("作为博客站长，针对以下读者评论写一条简短、友好的回复（2–5 句）。语气亲切，可感谢或简要回应观点，避免官方腔。%s只输出回复正文，不要「回复：」等前缀或引号。\n\n读者评论：\n%s", ctx, req.CommentContent)
	reply, err := s.CallAI(prompt)
	if err != nil {
		logger.Error("生成建议回复失败", zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}
	utils.Success(c, gin.H{"reply": strings.TrimSpace(reply)})
}

// 各厂商 OpenAI 兼容接口默认 Base URL（无末尾斜杠）
var providerBaseURLs = map[string]string{
	"openai":       "https://api.openai.com/v1",
	"dashscope":    "https://dashscope.aliyuncs.com/compatible-mode/v1", // 通义千问
	"zhipu":        "https://open.bigmodel.cn/api/paas/v4",               // 智谱 ChatGLM
	"moonshot":     "https://api.moonshot.cn/v1",                         // 月之暗面 Kimi
	"doubao":       "https://ark.cn-beijing.volces.com/api/v3",           // 豆包
	"siliconflow":  "https://api.siliconflow.cn/v1",                     // 硅基流动
	"deepseek":     "https://api.deepseek.com/v1",                       // DeepSeek 官方
}

// CallAI 调用AI API（公开方法）；根据 ai_provider 选择 OpenAI 兼容或文心接口
func (s *AIService) CallAI(prompt string) (string, error) {
	provider := "openai"
	apiKey := s.apiKey
	baseURL := s.baseURL
	model := s.model
	wenxinSecret := ""
	if s.getConfig != nil {
		if c := s.getConfig("ai_provider"); c != "" {
			provider = strings.ToLower(strings.TrimSpace(c))
		}
		if c := s.getConfig("openai_api_key"); c != "" {
			apiKey = c
		}
		if c := s.getConfig("openai_base_url"); c != "" {
			baseURL = strings.TrimSuffix(strings.TrimSpace(c), "/")
		}
		if c := s.getConfig("openai_model"); c != "" {
			model = strings.TrimSpace(c)
		}
		if c := s.getConfig("wenxin_api_secret"); c != "" {
			wenxinSecret = c
		}
	}
	if apiKey == "" {
		return "", fmt.Errorf("AI API key not configured")
	}

	if provider == "wenxin" {
		return s.callWenxin(apiKey, wenxinSecret, model, prompt)
	}

	// OpenAI 兼容接口
	if baseURL == "" {
		if u, ok := providerBaseURLs[provider]; ok {
			baseURL = u
		} else {
			baseURL = "https://api.openai.com/v1"
		}
	}
	if model == "" {
		model = "gpt-4o-mini"
	}

	reqBody := AIRequest{
		Model: model,
		Messages: []Message{
			{Role: "system", Content: "你是专业的博客写作助手，擅长标题、摘要、续写、润色与翻译。请严格按用户要求输出，不要添加「好的」「以下是」等前缀，不要用 markdown 代码块包裹答案，除非用户明确要求。"},
			{Role: "user", Content: prompt},
		},
		Stream: false,
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var aiResp AIResponse
	if err := json.Unmarshal(body, &aiResp); err != nil {
		return "", err
	}
	if aiResp.Error != nil {
		return "", fmt.Errorf("%s", aiResp.Error.Message)
	}
	if len(aiResp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}
	return strings.TrimSpace(aiResp.Choices[0].Message.Content), nil
}

// callWenxin 调用文心一言（需 API Key + Secret 换 token，再调 chat）
func (s *AIService) callWenxin(apiKey, secret, model, prompt string) (string, error) {
	if secret == "" {
		return "", fmt.Errorf("文心一言需配置 API Key 与 Secret（wenxin_api_secret）")
	}
	token, err := s.getWenxinAccessToken(apiKey, secret)
	if err != nil {
		return "", err
	}
	reqBody := map[string]any{
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}
	if model != "" {
		reqBody["model"] = model
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf("https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token=%s", token)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	var result struct {
		Result    string `json:"result"`
		ErrorCode int    `json:"error_code"`
		ErrorMsg  string `json:"error_msg"`
		Choices   []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if result.ErrorCode != 0 || result.ErrorMsg != "" {
		return "", fmt.Errorf("文心 API: %s", result.ErrorMsg)
	}
	if result.Result != "" {
		return strings.TrimSpace(result.Result), nil
	}
	if len(result.Choices) > 0 && result.Choices[0].Message.Content != "" {
		return strings.TrimSpace(result.Choices[0].Message.Content), nil
	}
	return "", fmt.Errorf("文心 API: empty response")
}

func (s *AIService) getWenxinAccessToken(apiKey, secret string) (string, error) {
	s.wenxinCache.mu.Lock()
	defer s.wenxinCache.mu.Unlock()

	// 缓存命中：提前 5 分钟刷新，避免临界竞态
	if s.wenxinCache.token != "" && time.Now().Before(s.wenxinCache.expiresAt.Add(-5*time.Minute)) {
		return s.wenxinCache.token, nil
	}

	reqBody := fmt.Sprintf("grant_type=client_credentials&client_id=%s&client_secret=%s", apiKey, secret)
	req, err := http.NewRequest("POST", "https://aip.baidubce.com/oauth/2.0/token", bytes.NewBufferString(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if result.Error != "" {
		return "", fmt.Errorf("文心 token: %s - %s", result.Error, result.ErrorDesc)
	}

	// 更新缓存（按 API 返回的 expires_in 设置，默认 30 天）
	ttl := time.Duration(result.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 30 * 24 * time.Hour
	}
	s.wenxinCache.token = result.AccessToken
	s.wenxinCache.expiresAt = time.Now().Add(ttl)

	return result.AccessToken, nil
}

// ListModels 从当前配置的厂商拉取可用模型列表（OpenAI 兼容 GET /models）
func (s *AIService) ListModels(c *gin.Context) {
	provider := "openai"
	apiKey := s.apiKey
	baseURL := s.baseURL
	if s.getConfig != nil {
		if v := s.getConfig("ai_provider"); v != "" {
			provider = strings.ToLower(strings.TrimSpace(v))
		}
		if v := s.getConfig("openai_api_key"); v != "" {
			apiKey = v
		}
		if v := s.getConfig("openai_base_url"); v != "" {
			baseURL = strings.TrimSuffix(strings.TrimSpace(v), "/")
		}
	}
	if apiKey == "" {
		utils.Success(c, gin.H{"models": []gin.H{}})
		return
	}

	// 文心一言无统一 list 接口，返回常用模型
	if provider == "wenxin" {
		utils.Success(c, gin.H{"models": []gin.H{
			{"id": "ernie-bot-turbo"},
			{"id": "ernie-bot"},
			{"id": "ernie-bot-4"},
		}})
		return
	}

	if baseURL == "" {
		if u, ok := providerBaseURLs[provider]; ok {
			baseURL = u
		} else {
			baseURL = "https://api.openai.com/v1"
		}
	}

	req, err := http.NewRequest("GET", baseURL+"/models", nil)
	if err != nil {
		utils.Success(c, gin.H{"models": []gin.H{}})
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		logger.Error("list models request failed", zap.String("provider", provider), zap.Error(err))
		utils.Success(c, gin.H{"models": []gin.H{}})
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		utils.Success(c, gin.H{"models": []gin.H{}})
		return
	}
	var list struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &list); err != nil {
		logger.Error("list models decode failed", zap.String("provider", provider), zap.Error(err))
		utils.Success(c, gin.H{"models": []gin.H{}})
		return
	}
	out := make([]gin.H, 0, len(list.Data))
	for _, m := range list.Data {
		if m.ID != "" {
			out = append(out, gin.H{"id": m.ID})
		}
	}
	utils.Success(c, gin.H{"models": out})
}
