/** 默认站点名称，可通过环境变量 NEXT_PUBLIC_SITE_NAME 覆盖 */
export const DEFAULT_SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || '博客'

/** 站点根 URL（不带末尾斜杠），用于生成 canonical / OG URL / JSON-LD */
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SITE_URL) {
  console.error(
    '[SEO WARNING] NEXT_PUBLIC_SITE_URL is not set. ' +
    'All canonical URLs, sitemaps, and structured data will use http://localhost:3000. ' +
    'Set this variable in your production environment or .env.production file.'
  )
}
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
