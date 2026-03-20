package services

import (
	"bufio"
	"bytes"
	"context"
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

// 共享的 HTTP 客户端
var sharedHTTPClient = &http.Client{Timeout: 180 * time.Second}

// AIProvider AI提供商接口
type AIProvider interface {
	Generate(prompt string) (string, error)
	GenerateStream(ctx context.Context, prompt string) (<-chan string, error)
	GetName() string
}

// MultiAIService 多AI服务（支持从后台配置读取 OpenAI API Key；getConfig 在运行时按请求读取，保存配置后无需重启）
type MultiAIService struct {
	providers       map[string]AIProvider
	defaultProvider string
	getConfig       func(key string) string
}

func NewMultiAIService(getConfig func(key string) string) *MultiAIService {
	service := &MultiAIService{
		providers: make(map[string]AIProvider),
		getConfig: getConfig,
	}
	service.refreshProviders()
	return service
}

// refreshProviders 根据当前 getConfig / 环境变量刷新 providers 映射（供启动时与可选定时刷新使用）
//
// 系统设置中只有一组共享 AI 配置（ai_provider + openai_api_key / openai_base_url / openai_model），
// 因此需要根据 ai_provider 的值创建对应类型的 Provider，并使用共享配置填充 key/base/model。
// 同时保留从环境变量注入独立 provider 的能力（互不覆盖）。
func (s *MultiAIService) refreshProviders() {
	s.providers = make(map[string]AIProvider)
	s.defaultProvider = ""

	// --- 1. 从系统设置 / 环境变量读取共享 AI 配置 ---
	configuredProvider := ""
	sharedKey := ""
	sharedBase := ""
	sharedModel := ""
	if s.getConfig != nil {
		configuredProvider = strings.TrimSpace(strings.ToLower(s.getConfig("ai_provider")))
		sharedKey = strings.TrimSpace(s.getConfig("openai_api_key"))
		sharedBase = strings.TrimSuffix(strings.TrimSpace(s.getConfig("openai_base_url")), "/")
		sharedModel = strings.TrimSpace(s.getConfig("openai_model"))
	}
	if sharedKey == "" {
		sharedKey = os.Getenv("OPENAI_API_KEY")
	}
	if sharedBase == "" {
		sharedBase = os.Getenv("OPENAI_BASE_URL")
	}
	if sharedModel == "" {
		sharedModel = utils.GetEnv("OPENAI_MODEL", "gpt-4o-mini")
	}

	// --- 2. 根据 ai_provider 创建对应 Provider（使用共享 key/base/model）---
	if sharedKey != "" {
		provName := configuredProvider
		if provName == "" {
			provName = "openai"
		}
		effectiveBase := sharedBase
		if effectiveBase == "" {
			if u, ok := providerBaseURLs[provName]; ok {
				effectiveBase = u
			}
		}
		switch provName {
		case "siliconflow":
			s.providers[provName] = NewSiliconflowProviderWithKeys(sharedKey, effectiveBase, sharedModel)
		case "deepseek":
			s.providers[provName] = NewDeepseekProviderWithKeys(sharedKey, effectiveBase, sharedModel)
		default:
			s.providers[provName] = NewOpenAIProviderWithKeys(sharedKey, effectiveBase, sharedModel)
		}
		s.defaultProvider = provName
	}

	// --- 3. 从独立环境变量注册额外 Provider（不覆盖已由共享配置创建的同名 Provider）---
	if _, exists := s.providers["siliconflow"]; !exists {
		if k := os.Getenv("SILICONFLOW_API_KEY"); k != "" {
			s.providers["siliconflow"] = NewSiliconflowProviderWithKeys(
				k, os.Getenv("SILICONFLOW_BASE_URL"), utils.GetEnv("SILICONFLOW_MODEL", ""),
			)
			if s.defaultProvider == "" {
				s.defaultProvider = "siliconflow"
			}
		}
	}
	if _, exists := s.providers["deepseek"]; !exists {
		if k := os.Getenv("DEEPSEEK_API_KEY"); k != "" {
			s.providers["deepseek"] = NewDeepseekProviderWithKeys(
				k, os.Getenv("DEEPSEEK_BASE_URL"), utils.GetEnv("DEEPSEEK_MODEL", ""),
			)
			if s.defaultProvider == "" {
				s.defaultProvider = "deepseek"
			}
		}
	}
	if _, exists := s.providers["claude"]; !exists {
		if apiKey := os.Getenv("ANTHROPIC_API_KEY"); apiKey != "" {
			s.providers["claude"] = NewClaudeProvider()
			if s.defaultProvider == "" {
				s.defaultProvider = "claude"
			}
		}
	}
	if _, exists := s.providers["wenxin"]; !exists {
		if apiKey := os.Getenv("WENXIN_API_KEY"); apiKey != "" {
			s.providers["wenxin"] = NewWenxinProvider()
			if s.defaultProvider == "" {
				s.defaultProvider = "wenxin"
			}
		}
	}
}

// OpenAI Provider
type OpenAIProvider struct {
	apiKey  string
	baseURL string
	model   string
}

func NewOpenAIProvider() *OpenAIProvider {
	return NewOpenAIProviderWithKeys(
		os.Getenv("OPENAI_API_KEY"),
		os.Getenv("OPENAI_BASE_URL"),
		utils.GetEnv("OPENAI_MODEL", "gpt-4o-mini"),
	)
}

// NewOpenAIProviderWithKeys 使用指定 key/url/model 创建（供 MultiAIService 从 getConfig 注入）
func NewOpenAIProviderWithKeys(apiKey, baseURL, model string) *OpenAIProvider {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "gpt-4o-mini"
	}
	return &OpenAIProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		model:   model,
	}
}

func (p *OpenAIProvider) GetName() string {
	return "OpenAI GPT"
}

func (p *OpenAIProvider) Generate(prompt string) (string, error) {
	reqBody := map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一个专业的博客写作助手。"},
			{"role": "user", "content": prompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	baseURL := p.baseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	req, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if result.Error.Message != "" {
		return "", fmt.Errorf("API error: %s", result.Error.Message)
	}

	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("no response")
}

func (p *OpenAIProvider) GenerateStream(ctx context.Context, prompt string) (<-chan string, error) {
	ch := make(chan string, 32)
	reqBody := map[string]any{
		"model": p.model,
		"stream": true,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一个专业的博客写作助手。请先给出「思考过程」再给出「最终结果」，格式严格为：\n思考过程:\n（你的分析）\n\n最终结果:\n（你的输出）"},
			{"role": "user", "content": prompt},
		},
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	baseURL := p.baseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	go func() {
		defer close(ch)
		resp, err := sharedHTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			logger.Error("OpenAI stream request failed", zap.Error(err))
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return
		}
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			if ctx.Err() != nil {
				return
			}
			line := strings.TrimSpace(scanner.Text())
			if line == "" || !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}
			var event struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}
			if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
				select {
				case ch <- event.Choices[0].Delta.Content:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}

// 硅基流动 Provider（OpenAI 兼容协议）
type SiliconflowProvider struct {
	apiKey  string
	baseURL string
	model   string
}

func NewSiliconflowProvider() *SiliconflowProvider {
	return NewSiliconflowProviderWithKeys(
		os.Getenv("SILICONFLOW_API_KEY"),
		os.Getenv("SILICONFLOW_BASE_URL"),
		utils.GetEnv("SILICONFLOW_MODEL", ""),
	)
}

func NewSiliconflowProviderWithKeys(apiKey, baseURL, model string) *SiliconflowProvider {
	if baseURL == "" {
		baseURL = "https://api.siliconflow.cn/v1"
	}
	// 硅基流动必须传有效 model，否则易导致流式立即结束或 4xx
	if strings.TrimSpace(model) == "" {
		model = "Qwen/Qwen2.5-72B-Instruct"
	}
	return &SiliconflowProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		model:   model,
	}
}

func (p *SiliconflowProvider) GetName() string {
	return "硅基流动 (SiliconFlow)"
}

func (p *SiliconflowProvider) Generate(prompt string) (string, error) {
	reqBody := map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一个专业的博客写作助手。"},
			{"role": "user", "content": prompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	baseURL := p.baseURL
	if baseURL == "" {
		baseURL = "https://api.siliconflow.cn/v1"
	}
	req, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if result.Error.Message != "" {
		return "", fmt.Errorf("API error: %s", result.Error.Message)
	}

	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("no response")
}

func (p *SiliconflowProvider) GenerateStream(ctx context.Context, prompt string) (<-chan string, error) {
	ch := make(chan string, 32)
	reqBody := map[string]any{
		"model":  p.model,
		"stream": true,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一个专业的博客写作助手。请先给出「思考过程」再给出「最终结果」，格式严格为：\n思考过程:\n（你的分析）\n\n最终结果:\n（你的输出）"},
			{"role": "user", "content": prompt},
		},
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	baseURL := p.baseURL
	if baseURL == "" {
		baseURL = "https://api.siliconflow.cn/v1"
	}
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Accept", "text/event-stream")

	go func() {
		defer close(ch)
		resp, err := sharedHTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			logger.Error("SiliconFlow stream request failed", zap.Error(err))
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			logger.Error("SiliconFlow stream non-200", zap.Int("status", resp.StatusCode), zap.String("body", string(body)))
			return
		}
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			if ctx.Err() != nil {
				return
			}
			line := strings.TrimSpace(scanner.Text())
			if line == "" || !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}
			var event struct {
				Choices []struct {
					Delta struct {
						Content          string `json:"content"`
						ReasoningContent string `json:"reasoning_content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}
			if len(event.Choices) == 0 {
				continue
			}
			delta := event.Choices[0].Delta
			// 硅基流动：先推送 reasoning_content（思考），再推送 content（正文），与文档一致
			if delta.ReasoningContent != "" {
				select {
				case ch <- delta.ReasoningContent:
				case <-ctx.Done():
					return
				}
			}
			if delta.Content != "" {
				select {
				case ch <- delta.Content:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}

// DeepSeek Provider（OpenAI 兼容协议）
type DeepseekProvider struct {
	apiKey  string
	baseURL string
	model   string
}

func NewDeepseekProvider() *DeepseekProvider {
	return NewDeepseekProviderWithKeys(
		os.Getenv("DEEPSEEK_API_KEY"),
		os.Getenv("DEEPSEEK_BASE_URL"),
		utils.GetEnv("DEEPSEEK_MODEL", ""),
	)
}

func NewDeepseekProviderWithKeys(apiKey, baseURL, model string) *DeepseekProvider {
	if baseURL == "" {
		baseURL = "https://api.deepseek.com/v1"
	}
	return &DeepseekProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		model:   model,
	}
}

func (p *DeepseekProvider) GetName() string {
	return "DeepSeek"
}

func (p *DeepseekProvider) Generate(prompt string) (string, error) {
	reqBody := map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一个专业的博客写作助手。"},
			{"role": "user", "content": prompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	baseURL := p.baseURL
	if baseURL == "" {
		baseURL = "https://api.deepseek.com/v1"
	}
	req, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if result.Error.Message != "" {
		return "", fmt.Errorf("API error: %s", result.Error.Message)
	}

	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("no response")
}

func (p *DeepseekProvider) GenerateStream(ctx context.Context, prompt string) (<-chan string, error) {
	ch := make(chan string, 32)
	reqBody := map[string]any{
		"model":  p.model,
		"stream": true,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一个专业的博客写作助手。请先给出「思考过程」再给出「最终结果」，格式严格为：\n思考过程:\n（你的分析）\n\n最终结果:\n（你的输出）"},
			{"role": "user", "content": prompt},
		},
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	baseURL := p.baseURL
	if baseURL == "" {
		baseURL = "https://api.deepseek.com/v1"
	}
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	go func() {
		defer close(ch)
		resp, err := sharedHTTPClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			logger.Error("DeepSeek stream request failed", zap.Error(err))
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return
		}
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			if ctx.Err() != nil {
				return
			}
			line := strings.TrimSpace(scanner.Text())
			if line == "" || !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}
			var event struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}
			if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
				select {
				case ch <- event.Choices[0].Delta.Content:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}

// Claude Provider
type ClaudeProvider struct {
	apiKey  string
	baseURL string
	model   string
}

func NewClaudeProvider() *ClaudeProvider {
	return &ClaudeProvider{
		apiKey:  os.Getenv("ANTHROPIC_API_KEY"),
		baseURL: utils.GetEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1"),
		model:   utils.GetEnv("ANTHROPIC_MODEL", "claude-3-opus-20240229"),
	}
}

func (p *ClaudeProvider) GetName() string {
	return "Claude"
}

func (p *ClaudeProvider) Generate(prompt string) (string, error) {
	reqBody := map[string]any{
		"model":      p.model,
		"max_tokens": 4096,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", p.baseURL+"/messages", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if result.Error.Message != "" {
		return "", fmt.Errorf("API error: %s", result.Error.Message)
	}

	if len(result.Content) > 0 {
		return result.Content[0].Text, nil
	}
	return "", fmt.Errorf("no response")
}

func (p *ClaudeProvider) GenerateStream(ctx context.Context, prompt string) (<-chan string, error) {
	ch := make(chan string, 1)
	go func() {
		defer close(ch)
		result, err := p.Generate(prompt)
		if err != nil {
			logger.Error("Claude stream error", zap.Error(err))
			return
		}
		select {
		case ch <- result:
		case <-ctx.Done():
		}
	}()
	return ch, nil
}

// 文心一言 Provider
type WenxinProvider struct {
	apiKey      string
	secretKey   string
	accessToken string
	tokenExpiry time.Time
	tokenMutex  sync.RWMutex
}

func NewWenxinProvider() *WenxinProvider {
	return &WenxinProvider{
		apiKey:    os.Getenv("WENXIN_API_KEY"),
		secretKey: os.Getenv("WENXIN_SECRET_KEY"),
	}
}

func (p *WenxinProvider) GetName() string {
	return "文心一言"
}

func (p *WenxinProvider) getAccessToken() error {
	// 先尝试读锁检查 token 是否有效
	p.tokenMutex.RLock()
	if p.accessToken != "" && time.Now().Before(p.tokenExpiry) {
		p.tokenMutex.RUnlock()
		return nil
	}
	p.tokenMutex.RUnlock()

	// 获取写锁获取新 token
	p.tokenMutex.Lock()
	defer p.tokenMutex.Unlock()

	// 双重检查，防止多个 goroutine 同时获取 token
	if p.accessToken != "" && time.Now().Before(p.tokenExpiry) {
		return nil
	}

	// 使用 POST 请求获取 token（更安全，不在 URL 中暴露密钥）
	reqBody := fmt.Sprintf("grant_type=client_credentials&client_id=%s&client_secret=%s", p.apiKey, p.secretKey)
	req, err := http.NewRequest("POST", "https://aip.baidubce.com/oauth/2.0/token", bytes.NewBufferString(reqBody))
	if err != nil {
		return fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("request token failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode token response: %w", err)
	}

	if result.Error != "" {
		return fmt.Errorf("token error: %s - %s", result.Error, result.ErrorDesc)
	}

	p.accessToken = result.AccessToken
	// 提前 5 分钟过期，避免边界情况
	p.tokenExpiry = time.Now().Add(time.Duration(result.ExpiresIn-300) * time.Second)
	return nil
}

func (p *WenxinProvider) Generate(prompt string) (string, error) {
	if err := p.getAccessToken(); err != nil {
		return "", err
	}

	p.tokenMutex.RLock()
	token := p.accessToken
	p.tokenMutex.RUnlock()

	reqBody := map[string]any{
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token=%s", token)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Result string `json:"result"`
		Error  struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if result.Error.Code != 0 {
		return "", fmt.Errorf("API error %d: %s", result.Error.Code, result.Error.Message)
	}

	return result.Result, nil
}

func (p *WenxinProvider) GenerateStream(ctx context.Context, prompt string) (<-chan string, error) {
	ch := make(chan string, 1)
	go func() {
		defer close(ch)
		result, err := p.Generate(prompt)
		if err != nil {
			logger.Error("Wenxin stream error", zap.Error(err))
			return
		}
		select {
		case ch <- result:
		case <-ctx.Done():
		}
	}()
	return ch, nil
}

// GenerateWithProvider 使用指定提供商生成内容
func (s *MultiAIService) GenerateWithProvider(provider string, prompt string) (string, error) {
	if provider == "" {
		provider = s.defaultProvider
	}

	p, exists := s.providers[provider]
	if !exists {
		return "", fmt.Errorf("provider %s not found", provider)
	}

	return p.Generate(prompt)
}

// StreamWithProvider 流式生成，返回内容 channel；ctx 取消时停止
func (s *MultiAIService) StreamWithProvider(ctx context.Context, provider string, prompt string) (<-chan string, error) {
	if s.getConfig != nil {
		s.refreshProviders()
	}
	// 空字符串使用默认提供商
	if provider == "" {
		provider = s.defaultProvider
	}
	p, exists := s.providers[provider]
	if !exists {
		// 若配置了未知的 ai_provider，则回退到默认提供商，避免直接 500
		if provider != "" {
			logger.Warn("unknown ai_provider, fallback to default", zap.String("provider", provider), zap.String("default", s.defaultProvider))
			provider = s.defaultProvider
			p, exists = s.providers[provider]
		}
		if !exists {
			return nil, fmt.Errorf("no available AI provider (requested=%s)", provider)
		}
	}
	return p.GenerateStream(ctx, prompt)
}

// GetProviders 获取所有可用提供商（按当前配置解析，保存后台配置后无需重启即可反映）
func (s *MultiAIService) GetProviders(c *gin.Context) {
	if s.getConfig != nil {
		s.refreshProviders()
	}
	providers := make([]map[string]string, 0)
	for key, p := range s.providers {
		providers = append(providers, map[string]string{
			"id":   key,
			"name": p.GetName(),
		})
	}
	utils.Success(c, gin.H{
		"providers": providers,
		"default":   s.defaultProvider,
	})
}

