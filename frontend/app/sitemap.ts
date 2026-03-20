import type { MetadataRoute } from 'next'
import { fetchCategories, fetchTags } from '@/lib/api'
import { SITE_URL } from '@/lib/constants'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Static pages
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/categories`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/tags`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/archives`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/series`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/resources`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/links`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]

  // 分批拉取所有文章（每批 100 篇，最多 20 批 = 2000 篇）
  const postRoutes: MetadataRoute.Sitemap = []
  try {
    const PAGE_SIZE = 100 // 后端默认 MaxPageSize = 100
    const MAX_PAGES = 20
    const nowTs = now.getTime()
    const MONTH_MS = 30 * 24 * 60 * 60 * 1000

    for (let page = 1; page <= MAX_PAGES; page++) {
      // 直接请求后端，避免使用前端 axios 缓存导致 sitemap 生成时读到空结果
      const res = await fetch(`${SITE_URL}/api/v1/posts?page=${page}&page_size=${PAGE_SIZE}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error(`sitemap: fetch posts failed: ${res.status}`)
      }

      const json = await res.json()
      const posts = (json?.data?.data ?? []) as Array<{ id: number; updated_at?: string }>
      const total = (json?.data?.total ?? 0) as number

      if (!Array.isArray(posts) || posts.length === 0) break

      for (const post of posts) {
        const lastMod = post.updated_at ? new Date(post.updated_at) : now
        const ageMs = nowTs - lastMod.getTime()
        // 近 30 天内更新的文章优先级更高
        const priority = ageMs < MONTH_MS ? 0.9 : 0.7
        postRoutes.push({
          url: `${SITE_URL}/posts/${post.id}`,
          lastModified: lastMod,
          changeFrequency: 'monthly' as const,
          priority,
        })
      }

      if (page * PAGE_SIZE >= total) break
    }
  } catch (err) {
    // If this fails, posts will be missing from sitemap.
    // eslint-disable-next-line no-console
    console.error('sitemap: failed to fetch posts, skipping post routes', err)
  }

  // Categories
  let categoryRoutes: MetadataRoute.Sitemap = []
  try {
    const categories = await fetchCategories()
    categoryRoutes = categories.map((cat) => ({
      url: `${SITE_URL}/category/${cat.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    // skip categories on error
  }

  // Tags
  let tagRoutes: MetadataRoute.Sitemap = []
  try {
    const tags = await fetchTags()
    tagRoutes = tags.map((tag) => ({
      url: `${SITE_URL}/tag/${tag.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    // skip tags on error
  }

  return [...staticRoutes, ...postRoutes, ...categoryRoutes, ...tagRoutes]
}
