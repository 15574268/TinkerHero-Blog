'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import DOMPurify from 'dompurify'

interface ShortcodeRendererProps {
  content: string
}

// HTML 转义函数 - 用于纯文本内容
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

// 安全渲染用户内容
function sanitizeContent(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'span', 'code', 'pre', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'class', 'target', 'rel'],
    // 强制所有链接添加安全属性
    ADD_ATTR: ['target', 'rel'],
    // 允许 data: 和 https: 协议
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  })
}

// 验证 URL 安全性
function sanitizeUrl(url: string): string {
  if (!url) return '#'
  // 只允许 http, https, mailto 协议
  const safeProtocols = ['http://', 'https://', 'mailto:', '/', '#']
  const isSafe = safeProtocols.some(p => url.toLowerCase().startsWith(p))
  if (!isSafe) {
    console.warn('Blocked potentially unsafe URL:', url)
    return '#'
  }
  return DOMPurify.sanitize(url, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}

// 短代码解析器
function parseShortcodes(content: string): React.ReactNode[] {
  const shortcodeRegex = /\[([a-zA-Z0-9_-]+)([^\]]*)\](?:([^\[]*)\[\/\1\])?/g
  const result: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = shortcodeRegex.exec(content)) !== null) {
    // 添加前面的文本（转义后安全渲染）
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index)
      result.push(
        <span key={`text-${lastIndex}`}>{textContent}</span>
      )
    }

    const [fullMatch, name, attrStr, innerContent] = match
    const attrs = parseAttributes(attrStr)

    // 渲染短代码
    result.push(
      <ShortcodeElement key={`shortcode-${match.index}`} name={name} attrs={attrs} content={innerContent || ''} />
    )

    lastIndex = match.index + fullMatch.length
  }

  // 添加剩余文本（转义后安全渲染）
  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex)
    result.push(
      <span key={`text-${lastIndex}`}>{textContent}</span>
    )
  }

  return result
}

// 解析属性
function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /([a-zA-Z0-9_-]+)=["']?([^"'\]\s]+)["']?/g
  let match

  while ((match = attrRegex.exec(attrStr)) !== null) {
    attrs[match[1]] = match[2]
  }

  return attrs
}

// 短代码元素
function ShortcodeElement({
  name,
  attrs,
  content,
}: {
  name: string
  attrs: Record<string, string>
  content: string
}) {
  switch (name) {
    case 'code':
      return <CodeBlock attrs={attrs} content={content} />
    case 'alert':
      return <AlertBlock attrs={attrs} content={content} />
    case 'collapse':
      return <CollapseBlock attrs={attrs} content={content} />
    case 'quote':
      return <QuoteBlock attrs={attrs} content={content} />
    case 'button':
      return <ButtonBlock attrs={attrs} content={content} />
    case 'badge':
      return <BadgeBlock attrs={attrs} content={content} />
    case 'progress':
      return <ProgressBlock attrs={attrs} />
    case 'video':
      return <VideoBlock attrs={attrs} />
    case 'audio':
      return <AudioBlock attrs={attrs} />
    default:
      return (
        <span className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded text-sm">
          [{name}]
        </span>
      )
  }
}

// 代码块
function CodeBlock({ attrs, content }: { attrs: Record<string, string>; content: string }) {
  const lang = attrs.lang || 'plaintext'
  const title = attrs.title

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {title && (
        <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium border-b border-gray-200 dark:border-gray-700">
          {title}
        </div>
      )}
      <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto">
        <code className={`language-${lang}`}>{content}</code>
      </pre>
    </div>
  )
}

// 提示框
function AlertBlock({ attrs, content }: { attrs: Record<string, string>; content: string }) {
  const type = attrs.type || 'info'
  const title = attrs.title

  const styles = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  }

  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    success: '✅',
    error: '❌',
  }

  return (
    <div className={`my-4 p-4 rounded-lg border ${styles[type as keyof typeof styles] || styles.info}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{icons[type as keyof typeof icons] || 'ℹ️'}</span>
        <div>
          {title && <div className="font-bold mb-1">{escapeHtml(title)}</div>}
          <div dangerouslySetInnerHTML={{ __html: sanitizeContent(content) }} />
        </div>
      </div>
    </div>
  )
}

// 折叠面板
function CollapseBlock({ attrs, content }: { attrs: Record<string, string>; content: string }) {
  const [isOpen, setIsOpen] = useState(attrs.open === 'true')
  const title = attrs.title || '展开/折叠'

  return (
    <div className="my-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-lg"
      >
        <span className="font-medium">{title}</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700" dangerouslySetInnerHTML={{ __html: sanitizeContent(content) }} />
      )}
    </div>
  )
}

// 引用块
function QuoteBlock({ attrs, content }: { attrs: Record<string, string>; content: string }) {
  const author = attrs.author
  const source = attrs.source

  return (
    <blockquote className="my-4 pl-4 border-l-4 border-gray-300 dark:border-gray-600 italic">
      <p dangerouslySetInnerHTML={{ __html: sanitizeContent(content) }} />
      {author && (
        <footer className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          — {source ? <a href={escapeHtml(source)} className="underline" rel="noopener noreferrer">{escapeHtml(author)}</a> : escapeHtml(author)}
        </footer>
      )}
    </blockquote>
  )
}

// 按钮
function ButtonBlock({ attrs, content }: { attrs: Record<string, string>; content: string }) {
  const href = sanitizeUrl(attrs.href || '#')
  const target = attrs.target === '_blank' ? '_blank' : '_self'
  const rel = target === '_blank' ? 'noopener noreferrer' : undefined
  const style = attrs.style || 'primary'
  const size = attrs.size || 'medium'

  const styleClasses: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
  }

  const sizeClasses: Record<string, string> = {
    small: 'px-3 py-1 text-sm',
    medium: 'px-4 py-2',
    large: 'px-6 py-3 text-lg',
  }

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-colors ${styleClasses[style] || styleClasses.primary} ${sizeClasses[size] || sizeClasses.medium}`}
    >
      {escapeHtml(content)}
    </a>
  )
}

// 徽章
function BadgeBlock({ attrs, content }: { attrs: Record<string, string>; content: string }) {
  const style = attrs.style || 'default'
  const pill = attrs.pill === 'true'

  const styleClasses: Record<string, string> = {
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
    primary: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
    success: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    warning: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    danger: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${
        pill ? 'rounded-full' : 'rounded'
      } ${styleClasses[style] || styleClasses.default}`}
    >
      {content}
    </span>
  )
}

// 进度条
function ProgressBlock({ attrs }: { attrs: Record<string, string> }) {
  const value = parseInt(attrs.value) || 0
  const max = parseInt(attrs.max) || 100
  const label = attrs.label
  const percent = (value / max) * 100

  return (
    <div className="my-4">
      {label && <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</div>}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-right text-sm text-gray-500 mt-1">{percent.toFixed(0)}%</div>
    </div>
  )
}

// 视频
function VideoBlock({ attrs }: { attrs: Record<string, string> }) {
  const src = sanitizeUrl(attrs.src || '')
  const poster = sanitizeUrl(attrs.poster || '')
  const controls = attrs.controls !== 'false'

  // 验证视频源
  if (!src || src === '#') {
    return <div className="my-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">无效的视频源</div>
  }

  return (
    <div className="my-4 rounded-lg overflow-hidden">
      <video
        src={src}
        poster={poster || undefined}
        controls={controls}
        className="w-full"
        crossOrigin="anonymous"
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  )
}

// 音频
function AudioBlock({ attrs }: { attrs: Record<string, string> }) {
  const src = sanitizeUrl(attrs.src || '')
  const controls = attrs.controls !== 'false'

  // 验证音频源
  if (!src || src === '#') {
    return <div className="my-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">无效的音频源</div>
  }

  return (
    <div className="my-4">
      <audio src={src} controls={controls} className="w-full" crossOrigin="anonymous">
        您的浏览器不支持音频播放
      </audio>
    </div>
  )
}

export default function ShortcodeRenderer({ content }: ShortcodeRendererProps) {
  return <div>{parseShortcodes(content)}</div>
}
