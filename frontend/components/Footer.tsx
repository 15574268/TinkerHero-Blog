'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Wrench,
  Heart,
  User,
  Link2,
  Rss,
  Map,
} from 'lucide-react'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { DEFAULT_SITE_NAME } from '@/lib/constants'
import { resolveUploadUrl } from '@/lib/utils'
import { sanitizeHTML } from '@/lib/utils/sanitize'

export default function Footer() {
  const { config } = useSiteConfig()
  const siteName = getConfigStr(config, 'site_name', DEFAULT_SITE_NAME)
  const siteLogo = getConfigStr(config, 'site_logo')
  const logoUrl = siteLogo ? resolveUploadUrl(siteLogo) : null
  const siteFooter = getConfigStr(config, 'site_footer')
  const siteIcp = getConfigStr(config, 'site_icp')
  const sitePublicSecurity = getConfigStr(config, 'site_public_security')
  const customFooterHtml = getConfigStr(config, 'custom_footer_html')
  const [currentYear] = useState(() => new Date().getFullYear())

  return (
    <footer className="relative mt-auto border-t border-border/60 bg-card/80">
      <div className="absolute inset-0 gradient-mesh opacity-20 pointer-events-none" />

      <div className="relative container mx-auto px-4 pt-10 pb-6">
        {/* Site Info Card */}
        <div className="mx-auto max-w-md text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            {logoUrl ? (
              <Image src={logoUrl} alt={siteName} width={32} height={32} className="object-contain rounded-xl" />
            ) : (
              <Wrench className="w-8 h-8 text-muted-foreground" />
            )}
            <span className="font-bold text-lg text-foreground">欢迎来到 {siteName}</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-primary transition-colors flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              博主
            </Link>
            <Link href="/links" className="hover:text-primary transition-colors flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" />
              朋友
            </Link>
            <Link href="/rss" className="hover:text-primary transition-colors flex items-center gap-1">
              <Rss className="w-3.5 h-3.5" />
              RSS
            </Link>
            <Link href="/sitemap.xml" className="hover:text-primary transition-colors flex items-center gap-1">
              <Map className="w-3.5 h-3.5" />
              站点地图
            </Link>
          </div>
        </div>

        {/* Divider */}
        <div className="divider-gradient mb-5" />

        {/* Bottom */}
        <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-1" suppressHydrationWarning>
            {siteFooter.trim() ? (
              <span>{siteFooter}</span>
            ) : (
              <>
                &copy; {currentYear} {siteName} &middot; Made with{' '}
                <Heart className="w-3 h-3 text-red-400 fill-red-400 inline" /> and code
              </>
            )}
          </p>
          {(siteIcp || sitePublicSecurity) && (
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {siteIcp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-primary">{siteIcp}</a>}
              {sitePublicSecurity && <span>{sitePublicSecurity}</span>}
            </p>
          )}
          {/* 为尊重作者版权，请勿擅自删除此段代码，作者将保留法律权利 */}
          <p className="flex items-center gap-1.5">
            Powered by{' '}
            <span className="font-semibold text-gradient">TinkerHero Blog</span> +{' '}
            <a
              href="https://blog.railx.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-gradient hover:underline"
            >
              blog.railx.cn
            </a>
          </p>
        </div>

        {customFooterHtml && (
          <div
            className="mt-4 pt-4 border-t border-border/40 text-center text-xs text-muted-foreground [&_a]:text-primary [&_a]:hover:underline"
            dangerouslySetInnerHTML={{ __html: sanitizeHTML(customFooterHtml) }}
          />
        )}
      </div>
    </footer>
  )
}
