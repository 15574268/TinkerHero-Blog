/**
 * 安全的 HTML 净化工具
 * 使用 isomorphic-dompurify（服务端 + 客户端均可用）防止 XSS 攻击
 */
import DOMPurify from 'isomorphic-dompurify'

/** 自定义页脚 HTML 允许的标签和属性（比默认宽松，支持链接、样式类等） */
const FOOTER_HTML_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    'a', 'b', 'i', 'u', 'strong', 'em', 'mark', 'span', 'p', 'br',
    'small', 'sub', 'sup', 'code', 'img',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height'],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
}

/**
 * 净化 HTML 字符串，移除潜在危险的标签和属性。
 * 使用 isomorphic-dompurify，服务端与客户端行为完全一致，不会引起 Hydration 不一致。
 */
export function sanitizeHTML(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, FOOTER_HTML_CONFIG)
}

/**
 * 转义 HTML 特殊字符（用于将纯文本安全插入 HTML 上下文）
 */
export function escapeHTML(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (char) => escapeMap[char] || char)
}

/**
 * 安全渲染高亮文本（用于搜索结果，只允许 mark/em/strong 标签）
 */
export function renderHighlightSafely(text: string): string {
  if (!text) return ''
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['mark', 'em', 'strong'],
    ALLOWED_ATTR: [],
  })
}
