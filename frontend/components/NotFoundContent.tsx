'use client'

import Link from 'next/link'
import { Home, Search, Wrench } from 'lucide-react'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { resolveUploadUrl } from '@/lib/utils'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function NotFoundContent() {
  const { config } = useSiteConfig()
  const siteLogo = getConfigStr(config, 'site_logo')
  const logoUrl = siteLogo ? resolveUploadUrl(siteLogo) : null

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-6 flex justify-center">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt="" className="h-16 w-auto object-contain rounded-xl" />
            ) : (
              <Wrench className="h-16 w-16 text-primary" />
            )}
          </div>
          <div className="text-8xl font-bold text-primary mb-4">404</div>
          <h1 className="text-3xl font-bold text-foreground mb-3">页面未找到</h1>
          <p className="text-muted-foreground mb-8">
            抱歉，您访问的页面不存在或已被删除。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:shadow-glow-sm transition-all hover:-translate-y-0.5"
            >
              <Home className="w-4 h-4" />
              返回首页
            </Link>
            <Link
              href="/search"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-card text-foreground border border-border rounded-xl font-medium hover:border-primary/40 hover:text-primary transition-all hover:-translate-y-0.5"
            >
              <Search className="w-4 h-4" />
              搜索文章
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
