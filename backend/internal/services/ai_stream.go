package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
)

// 流式请求体：与各 AI 接口一致，多一个 action 字段
type streamRequest struct {
	Action         string   `json:"action" binding:"required"`
	Content        string   `json:"content"`
	Title          string   `json:"title"`
	Lang           string   `json:"lang"`
	Topic          string   `json:"topic"`
	CategoryNames  []string `json:"category_names"`
	TagNames       []string `json:"tag_names"`
	Generate       []string `json:"generate"`
	CommentContent string   `json:"comment_content"`
	PostTitle      string   `json:"post_title"`
	Prompt         string   `json:"prompt"`
}

const thinkingPromptPrefix = `你的输出必须严格分为两段，以下面的标记行作为分隔（标记独占一行，冒号使用半角":"）：

思考过程:
（这里写你的详细分析和推理，可使用多行）

最终结果:
（这里写最终答案，不要包含任何多余说明）

注意：标记行「思考过程:」和「最终结果:」必须各占一行，且不能省略。以下是具体任务——

`

// Stream 流式 AI 调用：SSE 返回，支持思考过程+最终结果两段式；客户端可 Abort 停止
func (s *MultiAIService) Stream(c *gin.Context) {
	var req streamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	prompt := buildStreamPrompt(req)
	if prompt == "" {
		utils.BadRequest(c, "无效的 action 或缺少必要参数")
		return
	}

	ctx := c.Request.Context()
	// 若后台配置了 ai_provider，则优先按配置选择提供商；否则使用默认提供商
	provider := ""
	if s.getConfig != nil {
		if p := strings.TrimSpace(strings.ToLower(s.getConfig("ai_provider"))); p != "" {
			provider = p
		}
	}
	ch, err := s.StreamWithProvider(ctx, provider, prompt)
	if err != nil {
		logger.Error("AI stream 启动失败", zap.String("action", req.Action), zap.Error(err))
		utils.InternalError(c, err.Error())
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	c.Writer.Flush()

	for chunk := range ch {
		payload, _ := json.Marshal(map[string]string{"content": chunk})
		fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
		c.Writer.Flush()
	}
	fmt.Fprint(c.Writer, "data: [DONE]\n\n")
	c.Writer.Flush()
}

func buildStreamPrompt(req streamRequest) string {
	base := thinkingPromptPrefix
	switch req.Action {
	case "title":
		if strings.TrimSpace(req.Content) == "" {
			return ""
		}
		return base + fmt.Sprintf("根据以下文章内容生成 3 个吸引人的标题。要求：简洁、可包含核心关键词、适合 SEO；每行一个标题，不要序号或引号。只需在「最终结果」中给出标题列表。\n\n%s", req.Content)
	case "summary":
		if strings.TrimSpace(req.Content) == "" {
			return ""
		}
		content := req.Content
		if len([]rune(content)) > 1000 {
			content = string([]rune(content)[:1000])
		}
		return base + fmt.Sprintf("为以下文章生成一则 100–150 字的摘要。要求：概括核心观点、吸引读者点击，用完整句子表达，不要直接复制原文长句。只输出摘要正文。\n\n%s", content)
	case "continue":
		if strings.TrimSpace(req.Content) == "" {
			return ""
		}
		return base + fmt.Sprintf("续写以下文章，保持语气与段落风格一致，续写 200–300 字。不要重复前文已写内容，只输出续写部分。\n\n%s", req.Content)
	case "polish":
		if strings.TrimSpace(req.Content) == "" {
			return ""
		}
		return base + fmt.Sprintf("润色以下文章，使表达更流畅、用语更专业，不改变事实与观点。只输出润色后的全文，不要说明或批注。\n\n%s", req.Content)
	case "translate":
		if strings.TrimSpace(req.Content) == "" {
			return ""
		}
		if req.Lang == "en" {
			return base + fmt.Sprintf("将以下中文翻译成英文，译文需自然、符合英文习惯；技术术语可保留不译。只输出译文。\n\n%s", req.Content)
		}
		return base + fmt.Sprintf("将以下英文翻译成中文，译文需自然、符合中文习惯；技术术语可保留不译。只输出译文。\n\n%s", req.Content)
	case "outline":
		topic := strings.TrimSpace(req.Topic)
		if topic == "" {
			topic = strings.TrimSpace(req.Title)
		}
		if topic == "" {
			topic = "文章主题"
		}
		return base + fmt.Sprintf("为主题「%s」生成一篇详细文章大纲。要求：3–5 个主要章节，每章下 2–3 个子要点；用「一、二、三」或「1. 2. 3.」标注章节，子要点换行缩进。只输出大纲，不要前言说明。", topic)
	case "grammar":
		if strings.TrimSpace(req.Content) == "" {
			return ""
		}
		langLabel := "中文"
		if req.Lang == "en" {
			langLabel = "英文"
		}
		return base + fmt.Sprintf("检查以下%s文本的语法与用词错误。在「最终结果:」下按 JSON 数组格式输出，每项包含 message（错误描述）、suggestion（修改建议）。若无疑问可输出空数组。\n\n%s", langLabel, req.Content)
	case "spell":
		if strings.TrimSpace(req.Content) == "" {
			return ""
		}
		return base + fmt.Sprintf("检查以下文本的拼写错误，列出错误词及修改建议。若为中文可检查错别字与用词。在「最终结果:」下输出修改建议列表或「未发现明显错误」。\n\n%s", req.Content)
	case "meta":
		if strings.TrimSpace(req.Content) == "" || strings.TrimSpace(req.Title) == "" {
			return ""
		}
		return base + fmt.Sprintf("为以下文章生成 SEO Meta 建议（title、description、keywords、og_title、og_description）。在「最终结果:」下以简洁键值形式输出。\n\n标题：%s\n\n正文（前 500 字）：%s", req.Title, truncate(req.Content, 500))
	case "seo_analyze":
		if strings.TrimSpace(req.Content) == "" && strings.TrimSpace(req.Title) == "" {
			return ""
		}
		return base + fmt.Sprintf("从 SEO 角度分析以下文章（标题可为空）。请在「最终结果:」下用分条的中文建议输出，包括：关键词使用、标题优化、描述建议、内链/外链建议、可读性等维度。\n\n标题：%s\n\n正文（前 800 字）：%s", strings.TrimSpace(req.Title), truncate(req.Content, 800))
	case "slug":
		title := strings.TrimSpace(req.Title)
		if title == "" {
			return ""
		}
		return base + fmt.Sprintf("将以下文章标题转换为适合作为 URL 路径的英文别名（slug）。要求：仅输出一段小写英文，单词用连字符 - 分隔，无空格与特殊符号，长度控制在 3～8 个单词内。不要任何解释或引号。在「最终结果:」下只输出 slug。\n\n标题：%s", title)
	case "tags_category":
		if strings.TrimSpace(req.Content) == "" {
			return ""
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
		return base + fmt.Sprintf("根据以下文章标题和正文，推荐一个分类与若干标签。%s\n在「最终结果:」下严格只输出两行：第一行以「分类：」开头写一个分类名；第二行以「标签：」开头写多个标签，用中文逗号分隔。不要任何解释、序号或其它内容。\n\n标题：%s\n\n正文：\n%s", hint, strings.TrimSpace(req.Title), truncate(req.Content, 2000))
	case "comment_reply":
		commentContent := strings.TrimSpace(req.CommentContent)
		if commentContent == "" {
			commentContent = strings.TrimSpace(req.Content)
		}
		if commentContent == "" {
			return ""
		}
		ctx := ""
		postTitle := strings.TrimSpace(req.PostTitle)
		if postTitle == "" {
			postTitle = strings.TrimSpace(req.Title)
		}
		if postTitle != "" {
			ctx = "文章标题：" + postTitle + "\n\n"
		}
		return base + fmt.Sprintf("作为博客站长，针对以下读者评论写一条简短、友好的回复（2–5 句）。语气亲切，可感谢或简要回应观点，避免官方腔。%s在「最终结果:」下只输出回复正文，不要「回复：」等前缀或引号。\n\n读者评论：\n%s", ctx, commentContent)
	case "batch_generate":
		content := strings.TrimSpace(req.Content)
		title := strings.TrimSpace(req.Title)
		if content == "" {
			return ""
		}
		if len(req.Generate) == 0 {
			return ""
		}
		if len(content) > 2500 {
			content = content[:2500] + "..."
		}
		var fields []string
		for _, g := range req.Generate {
			switch g {
			case "title":
				fields = append(fields, `"title": "一个简洁、含关键词的文章标题"`)
			case "summary":
				fields = append(fields, `"summary": "100-150字摘要，概括核心观点"`)
			case "slug":
				if title != "" {
					fields = append(fields, `"slug": "英文小写、单词用连字符分隔、3-8个单词，无空格与特殊符号"`)
				}
			case "tags_category":
				fields = append(fields, `"category_name": "一个分类名称"`, `"tags": ["标签1", "标签2"]`)
			}
		}
		if len(fields) == 0 {
			return ""
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
		return fmt.Sprintf(`你是博客写作助手。根据下面的「标题」和「正文」，生成以下内容。
请在「最终结果:」下**仅输出一个 JSON 对象**，不要任何其他文字、解释或 markdown 代码块。不需要的字段可省略或留空字符串/空数组。
JSON 需包含且仅包含以下字段（按需生成）：
{ %s }
要求：title 简洁、适合 SEO；summary 概括核心、吸引点击；slug 仅英文小写连字符%s。

标题：%s

正文：
%s`, strings.Join(fields, ", "), hintOpt, title, content)
	case "enhance_prompt":
		prompt := strings.TrimSpace(req.Prompt)
		if prompt == "" {
			prompt = strings.TrimSpace(req.Content)
		}
		if prompt == "" {
			return ""
		}
		return base + fmt.Sprintf("将以下图片描述优化为一段英文的 AI 绘图提示词。要求：保留用户意图，补充风格、光线、构图、画质等细节（如 realistic, 4k, soft lighting）；在「最终结果:」下仅输出一段英文，不要编号或解释。\n\n用户描述：\n%s", prompt)
	default:
		return ""
	}
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
