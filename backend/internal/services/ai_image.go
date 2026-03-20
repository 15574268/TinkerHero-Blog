package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
)

// ImageGenerationService AI图片生成服务（支持从后台配置读取 API Key / BaseURL / Model）
type ImageGenerationService struct {
	getConfig func(key string) string
}

func NewImageGenerationService(getConfig func(key string) string) *ImageGenerationService {
	return &ImageGenerationService{getConfig: getConfig}
}

// imageConfig 每次请求动态读取配置，与文字 AI 使用相同的配置键，后台改完立即生效
type imageConfig struct {
	provider string
	apiKey   string
	baseURL  string
	model    string
}

// providerDefaultImageModels 各厂商图片生成的默认模型
// 图片模型与文字模型完全不同，不能复用 openai_model
var providerDefaultImageModels = map[string]string{
	"openai":      "dall-e-3",
	"siliconflow": "Kwai-Kolors/Kolors",
	"zhipu":       "cogview-3-plus",
}

func (s *ImageGenerationService) resolveConfig() imageConfig {
	cfg := imageConfig{
		provider: utils.GetEnv("IMAGE_PROVIDER", utils.GetEnv("AI_PROVIDER", "openai")),
		apiKey:   os.Getenv("OPENAI_API_KEY"),
		baseURL:  os.Getenv("OPENAI_BASE_URL"),
		model:    utils.GetEnv("IMAGE_MODEL", ""),
	}
	if s.getConfig == nil {
		// 无配置时按厂商取默认图片模型
		if cfg.model == "" {
			cfg.model = providerDefaultImageModels[cfg.provider]
			if cfg.model == "" {
				cfg.model = "dall-e-3"
			}
		}
		return cfg
	}
	// 优先使用后台配置的主 AI 厂商设置（与文字 AI 共用 ai_provider / openai_* 配置键）
	if v := s.getConfig("ai_provider"); v != "" {
		cfg.provider = strings.ToLower(strings.TrimSpace(v))
	}
	// image_provider 可单独覆盖（专门为图片生成指定厂商）
	if v := s.getConfig("image_provider"); v != "" {
		cfg.provider = strings.ToLower(strings.TrimSpace(v))
	}
	if v := s.getConfig("openai_api_key"); v != "" {
		cfg.apiKey = v
	}
	if v := s.getConfig("openai_base_url"); v != "" {
		cfg.baseURL = strings.TrimSuffix(strings.TrimSpace(v), "/")
	}
	// image_model 专用配置键；未配置则用厂商默认图片模型
	// 注意：不回退到 openai_model，因为文字模型与图片模型完全不同
	if v := s.getConfig("image_model"); v != "" {
		cfg.model = strings.TrimSpace(v)
	} else {
		cfg.model = providerDefaultImageModels[cfg.provider]
		if cfg.model == "" {
			cfg.model = "dall-e-3"
		}
	}
	return cfg
}

// GenerateImageRequest 图片生成请求
type GenerateImageRequest struct {
	Prompt  string `json:"prompt" binding:"required"`
	Size    string `json:"size"`    // 256x256, 512x512, 1024x1024
	N       int    `json:"n"`       // 生成数量
	Quality string `json:"quality"` // standard, hd
	Style   string `json:"style"`   // natural, vivid
}

// GenerateImage 生成图片
func (s *ImageGenerationService) GenerateImage(c *gin.Context) {
	var req GenerateImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 默认值
	if req.Size == "" {
		req.Size = "1024x1024"
	}
	if req.N == 0 {
		req.N = 1
	}
	if req.Quality == "" {
		req.Quality = "standard"
	}

	cfg := s.resolveConfig()
	if cfg.apiKey == "" && cfg.provider != "stability" {
		utils.InternalError(c, "AI 图片生成未配置 API Key，请在后台「系统设置」中配置 openai_api_key")
		return
	}

	var imageURLs []string
	var err error
	switch cfg.provider {
	case "stability":
		imageURLs, err = s.generateWithStability(req)
	case "siliconflow":
		imageURLs, err = s.generateWithSiliconFlow(req, cfg)
	default:
		// 其余所有厂商（openai / deepseek / zhipu / moonshot / 自定义中转等）均走 OpenAI 兼容接口
		imageURLs, err = s.generateWithOpenAI(req, cfg)
	}

	if err != nil {
		logger.Error("生成图片失败", zap.String("prompt", req.Prompt), zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{
		"images": imageURLs,
		"count":  len(imageURLs),
	})
}

// generateWithOpenAI 使用 OpenAI 兼容接口生成图片（model / baseURL 均从配置动态读取）
func (s *ImageGenerationService) generateWithOpenAI(req GenerateImageRequest, cfg imageConfig) ([]string, error) {
	baseURL := cfg.baseURL
	if baseURL == "" {
		// 复用与文字 AI 相同的预设地址表（siliconflow / deepseek / zhipu 等均已内置）
		if u, ok := providerBaseURLs[cfg.provider]; ok {
			baseURL = u
		} else {
			baseURL = "https://api.openai.com/v1"
		}
	}
	model := cfg.model
	if model == "" {
		model = "dall-e-3"
	}
	apiKey := cfg.apiKey
	reqBody := map[string]any{
		"model":   model,
		"prompt":  req.Prompt,
		"n":       req.N,
		"size":    req.Size,
		"quality": req.Quality,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("序列化请求失败: %w", err)
	}
	httpReq, err := http.NewRequest("POST", baseURL+"/images/generations", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("构建请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求 AI 服务失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// HTTP 层面报错，直接把原始响应体作为错误信息返回，方便排查
	if resp.StatusCode >= 400 {
		// 尝试从标准 error 字段里提取可读信息
		var errBody struct {
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
			Message string `json:"message"` // 部分厂商直接用 message 字段
		}
		if jsonErr := json.Unmarshal(body, &errBody); jsonErr == nil {
			if errBody.Error != nil && errBody.Error.Message != "" {
				return nil, fmt.Errorf("AI 服务返回错误(%d): %s", resp.StatusCode, errBody.Error.Message)
			}
			if errBody.Message != "" {
				return nil, fmt.Errorf("AI 服务返回错误(%d): %s", resp.StatusCode, errBody.Message)
			}
		}
		return nil, fmt.Errorf("AI 服务返回错误(%d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"` // 部分厂商（如 SiliconFlow flux）返回 base64
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("解析 AI 响应失败: %w，原始响应: %s", err, string(body))
	}

	if result.Error != nil {
		return nil, fmt.Errorf(result.Error.Message)
	}

	var urls []string
	for _, img := range result.Data {
		if img.URL != "" {
			urls = append(urls, img.URL)
		} else if img.B64JSON != "" {
			// base64 格式直接拼 data URI，前端可以直接用 <img src="data:...">
			urls = append(urls, "data:image/png;base64,"+img.B64JSON)
		}
	}

	if len(urls) == 0 {
		return nil, fmt.Errorf("AI 服务响应成功但未返回图片，原始响应: %s", string(body))
	}

	return urls, nil
}

// generateWithSiliconFlow 使用硅基流动生成图片
// 文档：https://docs.siliconflow.cn/cn/api-reference/images/images-generations
// 响应格式为 {"images":[{"url":"..."}]}，与 OpenAI 的 {"data":[{"url":"..."}]} 不同
func (s *ImageGenerationService) generateWithSiliconFlow(req GenerateImageRequest, cfg imageConfig) ([]string, error) {
	baseURL := cfg.baseURL
	if baseURL == "" {
		baseURL = providerBaseURLs["siliconflow"] // https://api.siliconflow.cn/v1
	}
	model := cfg.model
	if model == "" {
		model = "Kwai-Kolors/Kolors"
	}

	// SiliconFlow 使用 image_size（而非 size）和 batch_size（而非 n）
	imageSize := req.Size
	if imageSize == "" {
		imageSize = "1024x1024"
	}
	batchSize := req.N
	if batchSize == 0 {
		batchSize = 1
	}

	reqBody := map[string]any{
		"model":               model,
		"prompt":              req.Prompt,
		"image_size":          imageSize,
		"batch_size":          batchSize,
		"num_inference_steps": 20,
		"guidance_scale":      7.5,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("序列化请求失败: %w", err)
	}
	httpReq, err := http.NewRequest("POST", baseURL+"/images/generations", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("构建请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.apiKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求硅基流动失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		var errBody struct {
			Message string `json:"message"`
			Code    int    `json:"code"`
		}
		if jsonErr := json.Unmarshal(body, &errBody); jsonErr == nil && errBody.Message != "" {
			return nil, fmt.Errorf("硅基流动返回错误(%d): %s", resp.StatusCode, errBody.Message)
		}
		return nil, fmt.Errorf("硅基流动返回错误(%d): %s", resp.StatusCode, string(body))
	}

	// SiliconFlow 响应：{"images":[{"url":"..."}],"timings":{"inference":...},"seed":...}
	var result struct {
		Images []struct {
			URL string `json:"url"`
		} `json:"images"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("解析硅基流动响应失败: %w，原始响应: %s", err, string(body))
	}

	var urls []string
	for _, img := range result.Images {
		if img.URL != "" {
			urls = append(urls, img.URL)
		}
	}
	if len(urls) == 0 {
		return nil, fmt.Errorf("硅基流动未返回图片，原始响应: %s", string(body))
	}
	return urls, nil
}

// generateWithStability 使用Stability AI生成图片
func (s *ImageGenerationService) generateWithStability(req GenerateImageRequest) ([]string, error) {
	apiKey := os.Getenv("STABILITY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("Stability API key not configured")
	}

	reqBody := map[string]any{
		"text_prompts": []map[string]any{
			{"text": req.Prompt, "weight": 1},
		},
		"cfg_scale": 7,
		"height":    1024,
		"width":     1024,
		"samples":   req.N,
		"steps":     30,
	}

	jsonData, _ := json.Marshal(reqBody)
	httpReq, _ := http.NewRequest("POST", "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", bytes.NewBuffer(jsonData))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Artifacts []struct {
			Base64       string `json:"base64"`
			Seed         uint32 `json:"seed"`
			FinishReason string `json:"finishReason"`
		} `json:"artifacts"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// 将base64图片保存并返回URL
	// 这里简化处理，实际应该上传到存储服务
	urls := make([]string, len(result.Artifacts))
	for i := range result.Artifacts {
		urls[i] = fmt.Sprintf("data:image/png;base64,%s", result.Artifacts[i].Base64)
	}

	return urls, nil
}

// EnhancePrompt 增强图片提示词
func (s *ImageGenerationService) EnhancePrompt(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 使用 AI 增强提示词（优先使用后台配置的 API Key）
	var aiService *AIService
	if s.getConfig != nil {
		aiService = NewAIServiceWithConfig(s.getConfig)
	} else {
		aiService = NewAIService()
	}
	enhancedPrompt, err := aiService.CallAI(
		fmt.Sprintf("将以下图片描述优化为一段英文的 AI 绘图提示词。要求：保留用户意图，补充风格、光线、构图、画质等细节（如 realistic, 4k, soft lighting）；输出仅一段英文，不要编号或解释。\n\n用户描述：\n%s", req.Prompt))

	if err != nil {
		logger.Error("增强提示词失败", zap.String("prompt", req.Prompt), zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	utils.Success(c, gin.H{
		"original_prompt": req.Prompt,
		"enhanced_prompt": enhancedPrompt,
	})
}
