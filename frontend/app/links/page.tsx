import type { Metadata } from 'next'
import { fetchFriendLinks, getPublicConfigsCached } from '@/lib/api'
import { DEFAULT_SITE_NAME, SITE_URL } from '@/lib/constants'
import { FriendLink } from '@/lib/types'
import { resolveAbsoluteUploadUrl } from '@/lib/utils'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import FriendLinkApply from '@/components/FriendLinkApply'
import { Link2, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  let siteName = DEFAULT_SITE_NAME
  let ogImage: string | undefined
  try {
    const c = await getPublicConfigsCached()
    if (c?.site_name?.trim()) siteName = c.site_name.trim()
    if (c?.site_logo) ogImage = resolveAbsoluteUploadUrl(c.site_logo)
    else if (c?.site_favicon) ogImage = resolveAbsoluteUploadUrl(c.site_favicon)
  } catch { /* use defaults */ }
  const url = `${SITE_URL}/links`
  const description = '志同道合的博客朋友们，欢迎互访常来坐坐'
  return {
    title: '友情链接',
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `友情链接 - ${siteName}`,
      description,
      url,
      type: 'website',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary',
      title: `友情链接 - ${siteName}`,
      description,
    },
  }
}

export default async function LinksPage() {
  let links: FriendLink[] = []
  let siteName = DEFAULT_SITE_NAME
  let siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  let siteFavicon = ''
  let siteDesc = ''

  try {
    links = await fetchFriendLinks()
  } catch (error) {
    console.error('Failed to fetch friend links:', error)
  }

  try {
    const c = await getPublicConfigsCached()
    if (c?.site_name?.trim()) siteName = c.site_name.trim()
    if (c?.site_url?.trim()) siteUrl = c.site_url.trim().replace(/\/$/, '')
    if (c?.site_favicon?.trim()) siteFavicon = resolveAbsoluteUploadUrl(c.site_favicon.trim())
    if (c?.site_description?.trim()) siteDesc = c.site_description.trim()
  } catch {
    // use defaults
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl">
          {/* Hero Section */}
          <div className="joe-card overflow-hidden mb-8 animate-fade-in-up">
            <div className="h-28 gradient-hero relative">
              <div className="absolute inset-0 dot-pattern opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <Link2 className="w-8 h-8 mx-auto mb-2" />
                  <h1 className="text-2xl md:text-3xl font-bold">友情链接</h1>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                这里记录一些志同道合的博客朋友，欢迎互访常来坐坐。
              </p>
            </div>
          </div>

          {/* Links Grid */}
          {links.length > 0 ? (
            <section className="joe-card p-5 md:p-6 mb-8 animate-fade-in-up delay-100">
              <h2 className="text-base md:text-lg font-semibold mb-5 flex items-center gap-2">
                <div className="w-1 h-5 bg-primary rounded-full" />
                网上邻居
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {links.filter(link => /^https?:\/\//.test(link.url)).map((link, index) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-xl border border-border/60 hover:border-primary/40 bg-background/80 px-4 py-3 flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md animate-fade-in-up"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <Avatar className="w-11 h-11 border border-border/70 bg-card">
                      <AvatarImage src={link.logo} alt={link.name} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-sm font-bold">
                        {(link.name || '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                          {link.name}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      {link.desc && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {link.desc}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ) : (
            <Card className="joe-card text-center py-16 mb-8">
              <CardContent>
                <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">暂无友情链接</p>
              </CardContent>
            </Card>
          )}

          {/* Application Info */}
          <section className="joe-card p-5 md:p-6 space-y-5 mb-6 animate-fade-in-up delay-200">
            <div>
              <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                <div className="w-1 h-5 bg-primary rounded-full" />
                友链申请要求
              </h2>
              <ul className="list-disc list-inside space-y-1.5 text-sm text-muted-foreground">
                <li>贵站长期维护，并持续输出有价值、高质量的原创内容</li>
                <li>本站暂不接受资源站点的友链申请</li>
                <li>本站暂不接受直接的新站友链、文章较少的新站申请</li>
                <li>网站首屏加载时间不超过 1 分钟</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">本站信息</h3>
              <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground space-y-1">
                <p>网站名称：<strong className="text-foreground">{siteName}</strong></p>
                {siteUrl && <p>网站地址：{siteUrl}</p>}
                {siteFavicon && <p>网站图标：{siteFavicon}</p>}
                {siteDesc && <p>网站描述：{siteDesc}</p>}
              </div>
            </div>
          </section>

          {/* Apply Form */}
          <section className="animate-fade-in-up delay-300">
            <FriendLinkApply />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
