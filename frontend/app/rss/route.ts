import RSS from 'rss'
import { getPublicConfigs } from '@/lib/api'
import { DEFAULT_SITE_NAME } from '@/lib/constants'

export const dynamic = 'force-dynamic'

interface RSSPost {
  id: number
  title: string
  content: string
  summary?: string
  published_at?: string
  created_at: string
  author?: {
    username: string
  }
  category?: {
    name: string
  }
}

function stripMarkdownAndHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET() {
  let siteName = DEFAULT_SITE_NAME
  let siteDescription = '记录生活中的技术脉搏'
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-blog.com'
  try {
    const c = await getPublicConfigs()
    if (c?.site_name?.trim()) siteName = c.site_name.trim()
    if (c?.site_description?.trim()) siteDescription = c.site_description.trim()
    if (c?.site_url?.trim()) baseUrl = c.site_url.trim().replace(/\/$/, '')
  } catch {
    // use defaults
  }

  const feed = new RSS({
    title: siteName,
    description: siteDescription,
    site_url: baseUrl,
    feed_url: `${baseUrl}/rss`,
    language: 'zh-CN',
    pubDate: new Date(),
  })

  const apiUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8080/api/v1' : 'http://backend:8080/api/v1')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(`${apiUrl}/posts?page_size=50`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`)
    }

    const data = await res.json()
    // 后端响应结构: { code, data: { data: [...posts], total, ... }, message }
    // data.data 是分页对象，实际文章数组在 data.data.data
    const rawData = data?.data
    const posts = (Array.isArray(rawData) ? rawData : (rawData?.data || [])) as RSSPost[]

    posts.forEach((post) => {
      const description = post.summary
        || stripMarkdownAndHtml(post.content || '').substring(0, 300)
      feed.item({
        title: post.title,
        description,
        url: `${baseUrl}/posts/${post.id}`,
        date: post.published_at || post.created_at,
        author: post.author?.username || '匿名',
        categories: post.category?.name ? [post.category.name] : [],
      })
    })
  } catch (error) {
    console.error('RSS generation error:', error)
  }

  return new Response(feed.xml({ indent: true }), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
