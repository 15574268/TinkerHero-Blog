import { MetadataRoute } from 'next'
import { getPublicConfigs } from '@/lib/api'
import { SITE_URL } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  let baseUrl = SITE_URL

  try {
    const c = await getPublicConfigs()
    if (c?.site_url?.trim()) baseUrl = c.site_url.trim().replace(/\/$/, '')
  } catch {
    // use env fallback
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/profile/', '/subscribe/', '/unsubscribe/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
