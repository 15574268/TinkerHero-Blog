import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 将上传路径归一化为相对路径 /uploads/xxx，供组件 src 属性使用。
 * 前端通过 next.config.js rewrites 将 /uploads/* 代理到后端，
 * 因此组件只需使用相对路径，无需拼接后端域名。
 *
 * 数据库中可能存有旧数据的绝对 URL（如 http://localhost:8080/uploads/xxx），
 * 此函数会自动剥离域名部分，仅保留 /uploads/... 路径。
 */
export function resolveUploadUrl(url: string | undefined): string {
  if (!url) return ''
  if ((url.startsWith('http://') || url.startsWith('https://')) && url.includes('/uploads/')) {
    return url.substring(url.indexOf('/uploads/'))
  }
  return url
}

/** Alias kept for backward-compat. */
export const resolveUploadPath = resolveUploadUrl

/**
 * 将相对路径 /uploads/xxx 转为完整绝对 URL（包含域名）。
 * 仅用于 SEO 场景：OG / Twitter meta、JSON-LD 结构化数据等。
 * 组件渲染请使用 resolveUploadUrl（返回相对路径，走 rewrite 代理）。
 */
export function resolveAbsoluteUploadUrl(url: string | undefined): string {
  if (!url) return ''
  const path = resolveUploadUrl(url)
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//'))
    return path
  const siteUrl = (
    typeof window === 'undefined'
      ? (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') || '')
      : ''
  ).replace(/\/$/, '')
  if (path.startsWith('/') && siteUrl) return `${siteUrl}${path}`
  return path
}

/**
 * 海报/Canvas 场景：uploads 现在走同源 rewrite，无需 CORS 代理。
 * 仅对真正的跨域完整 URL 才通过 image-proxy 中转。
 */
export function getPosterImageUrl(url: string | undefined): string {
  if (!url) return ''
  const normalized = resolveUploadUrl(url)
  if (normalized.startsWith('/')) return normalized
  return `/api/image-proxy?url=${encodeURIComponent(normalized)}`
}

/**
 * 正文 media URL 解析。
 * 将内容中残留的绝对 upload URL (http(s)://xxx/uploads/...) 归一化为相对路径，
 * 以便走 rewrite 代理。
 */
export function resolveContentMediaUrls(content: string): string {
  return content.replace(/https?:\/\/[^/'"]+?(\/uploads\/[^'")\s]+)/g, '$1')
}
