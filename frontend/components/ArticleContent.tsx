'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkUnwrapImages from 'remark-unwrap-images'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'
import type { Plugin } from 'unified'
import { Check, Copy, ExternalLink, X } from 'lucide-react'
import type { Components } from 'react-markdown'
import { resolveContentMediaUrls as resolveContentMediaUrlsUtil, resolveUploadUrl } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  rehype-sanitize schema                                             */
/*  允许博客文章所需的所有安全 HTML，同时阻止 on* 事件和 javascript: URL  */
/* ------------------------------------------------------------------ */
const sanitizeSchema: Schema = {
  strip: ['script', 'noscript'],
  clobberPrefix: '',   // 博客为单一作者，不需要给 id 加前缀
  clobber: ['name'],   // 仅保护 name，避免 DOM 命名冲突
  tagNames: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'div', 'span', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'main',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
    'em', 'strong', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
    'a', 'abbr', 'cite', 'dfn', 'q', 'time',
    'img', 'figure', 'figcaption', 'picture', 'source',
    'video', 'audio',
    'iframe',
    'hr', 'br',
    'details', 'summary',
    'menu',
  ],
  attributes: {
    // 所有元素允许 class、id、lang、dir、title、role（用于 prose 样式和无障碍）
    '*': ['className', 'id', 'lang', 'dir', 'title', 'hidden', 'tabIndex', 'role'],
    a: ['href', 'target', 'rel', 'download', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    video: ['src', 'controls', 'width', 'height', 'preload', 'autoPlay', 'muted', 'loop', 'playsInline', 'poster'],
    audio: ['src', 'controls', 'preload', 'autoPlay', 'muted', 'loop'],
    source: ['src', 'srcSet', 'type', 'media', 'sizes'],
    // iframe 用于 YouTube / Bilibili 嵌入
    iframe: ['src', 'width', 'height', 'frameBorder', 'allowFullScreen', 'allow', 'title', 'loading'],
    // code/pre 需要 className 供 rehype-highlight 添加语言类
    code: ['className'],
    pre: ['className'],
    // div/span 允许 style 供文章自定义排版（作者可信）
    div: ['className', 'id', 'style'],
    span: ['className', 'style'],
    th: ['align', 'colSpan', 'rowSpan', 'scope'],
    td: ['align', 'colSpan', 'rowSpan', 'scope'],
    col: ['align', 'span', 'width'],
    colgroup: ['align', 'span'],
    ol: ['type', 'start', 'reversed'],
    ul: ['type'],
    li: ['value', 'className'],
    details: ['open'],
    // 明确允许标题 id，供 TOC 锚点跳转
    h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
  },
  protocols: {
    href: ['http', 'https', 'mailto', '#'],
    src: ['http', 'https'],
  },
}

interface ArticleContentProps {
  content: string
}

function resolveMediaSrc(src: string | undefined): string | undefined {
  if (!src) return src
  return resolveUploadUrl(src) || src
}

/* ------------------------------------------------------------------ */
/*  Language display name mapping                                      */
/* ------------------------------------------------------------------ */
const LANG_NAMES: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX',
  ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX',
  py: 'Python', python: 'Python',
  go: 'Go', golang: 'Go',
  rs: 'Rust', rust: 'Rust',
  rb: 'Ruby', ruby: 'Ruby',
  java: 'Java', kt: 'Kotlin', kotlin: 'Kotlin',
  cs: 'C#', csharp: 'C#', cpp: 'C++', c: 'C',
  sh: 'Shell', bash: 'Bash', zsh: 'Zsh', shell: 'Shell',
  powershell: 'PowerShell', ps1: 'PowerShell',
  sql: 'SQL', mysql: 'MySQL', pgsql: 'PostgreSQL',
  html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'LESS',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  md: 'Markdown', markdown: 'Markdown',
  docker: 'Dockerfile', dockerfile: 'Dockerfile',
  nginx: 'Nginx', apache: 'Apache',
  lua: 'Lua', php: 'PHP', swift: 'Swift', dart: 'Dart',
  r: 'R', matlab: 'MATLAB', scala: 'Scala',
  graphql: 'GraphQL', proto: 'Protobuf',
  ini: 'INI', conf: 'Config', env: '.env',
  plaintext: '纯文本', text: '纯文本',
}

function getLangFromClassName(className?: string): string {
  if (!className) return ''
  const match = className.match(/(?:language|hljs)-(\S+)/)
  return match ? match[1] : ''
}

/* ------------------------------------------------------------------ */
/*  Code block with language label + copy button                       */
/* ------------------------------------------------------------------ */
function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as { props: { children?: React.ReactNode } }
    return getTextContent(el.props.children)
  }
  return ''
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const lang = getLangFromClassName(className)
  const displayLang = LANG_NAMES[lang] || lang.toUpperCase() || ''

  const handleCopy = useCallback(() => {
    const text = getTextContent(children).replace(/\n$/, '')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [children])

  return (
    <div className="code-block-wrapper group">
      <div className="code-block-header">
        <span className="code-block-lang">{displayLang}</span>
        <button
          onClick={handleCopy}
          className="code-block-copy"
          title={copied ? '已复制！' : '复制代码'}
          aria-label={copied ? '已复制！' : '复制代码'}
        >
          {/* aria-live 让屏幕阅读器在状态变化时播报 */}
          <span aria-live="polite" className="contents">
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>复制</span>
              </>
            )}
          </span>
        </button>
      </div>
      {/* scroll 容器独立于 pre，是最可靠的移动端横向滚动方案 */}
      <div className="code-block-scroll">
        <pre className="code-block-pre">
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline code                                                        */
/* ------------------------------------------------------------------ */
function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="inline-code">{children}</code>
}

/* ------------------------------------------------------------------ */
/*  Image with lightbox                                                */
/* ------------------------------------------------------------------ */
function ArticleImage({ src, alt }: { src?: string; alt?: string }) {
  const [lightbox, setLightbox] = useState(false)
  const resolvedSrc = resolveMediaSrc(src)
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!lightbox) return

    // Focus the close button when lightbox opens
    closeButtonRef.current?.focus()

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightbox(false)
        return
      }
      // Focus trap: keep Tab/Shift+Tab inside the overlay
      if (e.key === 'Tab') {
        const overlay = overlayRef.current
        if (!overlay) return
        const focusable = overlay.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [lightbox])

  if (!resolvedSrc) return null

  return (
    <>
      <figure className="article-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvedSrc}
          alt={alt || ''}
          loading="lazy"
          className="article-img"
          onClick={() => setLightbox(true)}
        />
        {alt && alt !== resolvedSrc && (
          <figcaption className="article-figcaption">{alt}</figcaption>
        )}
      </figure>

      {lightbox && (
        <div
          ref={overlayRef}
          className="lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={alt ? `图片预览：${alt}` : '图片预览'}
          onClick={() => setLightbox(false)}
        >
          <button
            ref={closeButtonRef}
            className="lightbox-close"
            aria-label="关闭图片预览"
            onClick={(e) => { e.stopPropagation(); setLightbox(false) }}
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedSrc}
            alt={alt || ''}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          {alt && alt !== resolvedSrc && (
            <div className="lightbox-caption">{alt}</div>
          )}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Video / source (resolve URLs so video plays when backend is different origin) */
/* ------------------------------------------------------------------ */
function ArticleVideo(props: React.VideoHTMLAttributes<HTMLVideoElement>) {
  const { src, children, ...rest } = props
  const resolvedSrc = typeof src === 'string' ? resolveMediaSrc(src) : src
  return (
    <div className="article-video-wrapper">
      <video
        {...rest}
        src={resolvedSrc ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="article-video"
      >
        {children}
        您的浏览器不支持视频播放
      </video>
    </div>
  )
}

function ArticleSource(props: React.SourceHTMLAttributes<HTMLSourceElement>) {
  const { src, ...rest } = props
  const resolvedSrc = typeof src === 'string' ? resolveMediaSrc(src) : src
  if (!resolvedSrc) return null
  return <source {...rest} src={resolvedSrc} />
}

/* ------------------------------------------------------------------ */
/*  Headings with auto-generated anchor IDs                            */
/* ------------------------------------------------------------------ */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function createHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements
  return function Heading({ children }: { children?: React.ReactNode }) {
    const text = typeof children === 'string'
      ? children
      : Array.isArray(children)
        ? children.map(c => (typeof c === 'string' ? c : '')).join('')
        : ''
    const id = slugify(text) || undefined
    return <Tag id={id}>{children}</Tag>
  }
}

/* ------------------------------------------------------------------ */
/*  Enhanced link (external icon)                                      */
/* ------------------------------------------------------------------ */
function ArticleLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'))
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
    >
      {children}
      {isExternal && <ExternalLink className="inline w-3.5 h-3.5 ml-0.5 -mt-0.5 opacity-50" />}
    </a>
  )
}

/* ------------------------------------------------------------------ */
/*  Enhanced table                                                     */
/* ------------------------------------------------------------------ */
function ArticleTable({ children }: { children?: React.ReactNode }) {
  return (
    <div className="article-table-wrapper">
      <table>{children}</table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Blockquote                                                         */
/* ------------------------------------------------------------------ */
function ArticleBlockquote({ children }: { children?: React.ReactNode }) {
  return <blockquote className="article-blockquote">{children}</blockquote>
}

/* ------------------------------------------------------------------ */
/*  Responsive iframe (YouTube, Bilibili, CodePen, etc.)              */
/* ------------------------------------------------------------------ */
function ArticleIframe(props: React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const { width, height, style, ...rest } = props
  // 根据原始宽高计算宽高比，默认 16:9
  const w = typeof width === 'string' ? parseFloat(width) : (width ?? 560)
  const h = typeof height === 'string' ? parseFloat(height) : (height ?? 315)
  const ratio = h && w ? (h / w) * 100 : 56.25

  return (
    <div
      style={{ position: 'relative', width: '100%', paddingBottom: `${ratio.toFixed(2)}%`, height: 0, overflow: 'hidden', borderRadius: 8, marginBlock: '1.5rem' }}
    >
      <iframe
        {...rest}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 0,
          ...style,
        }}
        // sandbox 限制 iframe 权限：允许脚本、同源、弹窗、全屏演示，但禁止访问父页面 cookie/DOM
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
        allowFullScreen
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Static component map — defined once at module level so ReactMarkdown
    receives stable references across every render of ArticleContent.   */
/* ------------------------------------------------------------------ */
const BLOCK_TAG_NAMES = new Set([
  'img', 'video', 'iframe', 'table', 'figure', 'div', 'pre',
  'blockquote', 'ul', 'ol', 'hr', 'details', 'section',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

const markdownComponents: Partial<Components> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  p({ children, node }: any) {
    const hasBlock = node?.children?.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child: any) => child.type === 'element' && BLOCK_TAG_NAMES.has(child.tagName),
    )
    if (hasBlock) return <>{children}</>
    return <p>{children}</p>
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code({ className, children }: any) {
    // react-markdown v9 removed the `inline` prop.
    // Block code has className from rehypeHighlight (e.g. "hljs language-js")
    // or contains newlines; inline code has neither.
    const isBlock = Boolean(className) || getTextContent(children).includes('\n')
    if (!isBlock) {
      return <InlineCode>{children}</InlineCode>
    }
    return <CodeBlock className={className}>{children}</CodeBlock>
  },

  pre({ children }) {
    return <>{children}</>
  },

  img({ src, alt }) {
    return <ArticleImage src={typeof src === 'string' ? src : undefined} alt={alt} />
  },

  video(props) {
    return <ArticleVideo {...(props as React.VideoHTMLAttributes<HTMLVideoElement>)} />
  },

  source(props) {
    return <ArticleSource {...(props as React.SourceHTMLAttributes<HTMLSourceElement>)} />
  },

  a({ href, children }) {
    return <ArticleLink href={href}>{children}</ArticleLink>
  },

  table({ children }) {
    return <ArticleTable>{children}</ArticleTable>
  },

  blockquote({ children }) {
    return <ArticleBlockquote>{children}</ArticleBlockquote>
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  iframe(props: any) {
    return <ArticleIframe {...props} />
  },

  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function ArticleContent({ content }: ArticleContentProps) {
  const resolvedContent = resolveContentMediaUrlsUtil(content)

  return (
    <div className="classic-prose prose-lg max-w-none prose-headings:scroll-mt-24">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkUnwrapImages]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize as unknown as Plugin, sanitizeSchema],
          rehypeHighlight,
        ]}
        components={markdownComponents}
      >
        {resolvedContent}
      </ReactMarkdown>
    </div>
  )
}
