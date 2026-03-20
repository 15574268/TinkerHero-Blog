import type { Metadata } from 'next'
import { Inter, Noto_Serif_SC, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import { getPublicConfigsCached, getPublicNavMenusCached } from '@/lib/api'
import { DEFAULT_SITE_NAME, SITE_URL } from '@/lib/constants'
import { resolveUploadUrl, resolveAbsoluteUploadUrl } from '@/lib/utils'
import MobileBottomNav from '@/components/MobileBottomNav'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Noto_Serif_SC 通过 Google CDN 按需分片，subsets 只支持 'latin'（用于 ASCII 预加载 hint）
const serif = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-serif',
  display: 'swap',
})

// 仅文章页需要等宽字体，preload:false 避免在所有页面注入 <link rel="preload">
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'optional',
  preload: false,
})

export async function generateMetadata(): Promise<Metadata> {
  try {
    const c = await getPublicConfigsCached()
    const siteName = c?.site_name?.trim() || DEFAULT_SITE_NAME
    const suffix = c?.seo_title_suffix?.trim() || ''
    const verification: Metadata['verification'] = {}
    const g = c?.seo_google_verification?.trim()
    if (g) verification.google = g
    const other: Record<string, string> = {}
    const b = c?.seo_baidu_verification?.trim()
    if (b) other['baidu-site-verification'] = b
    const bing = c?.seo_bing_verification?.trim()
    if (bing) other['msvalidate.01'] = bing
    if (Object.keys(other).length) verification.other = other
    const ogImage = c?.site_logo
      ? resolveAbsoluteUploadUrl(c.site_logo)
      : c?.site_favicon
        ? resolveAbsoluteUploadUrl(c.site_favicon)
        : undefined
    return {
      title: {
        default: siteName,
        template: suffix ? `%s ${suffix}` : '%s',
      },
      description: c?.site_description?.trim() || '',
      keywords: c?.site_keywords
        ? c.site_keywords.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      icons: c?.site_favicon ? { icon: resolveUploadUrl(c.site_favicon) } : undefined,
      ...(Object.keys(verification).length ? { verification } : {}),
      // 默认 OG 图片（无封面页面社交分享使用）
      openGraph: {
        siteName,
        type: 'website',
        ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      },
      // RSS 自动发现
      alternates: {
        types: { 'application/rss+xml': `${SITE_URL}/rss` },
      },
    }
  } catch {
    return { title: DEFAULT_SITE_NAME, description: '' }
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [initialConfig, initialNavMenus] = await Promise.all([
    getPublicConfigsCached().catch(() => ({})),
    getPublicNavMenusCached(),
  ])
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 提前建立与一言 API 的 DNS/TCP 连接，降低首次请求延迟 */}
        <link rel="preconnect" href="https://v1.hitokoto.cn" />
        <link rel="dns-prefetch" href="https://v1.hitokoto.cn" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${serif.variable} ${mono.variable} font-sans`}>
        <Providers initialConfig={initialConfig} initialNavMenus={initialNavMenus}>
          {children}
          <MobileBottomNav />
        </Providers>
      </body>
    </html>
  )
}
