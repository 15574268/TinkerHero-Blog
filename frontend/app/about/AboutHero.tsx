'use client'

import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { DEFAULT_SITE_NAME } from '@/lib/constants'
import { resolveUploadUrl } from '@/lib/utils'
import { Wrench } from 'lucide-react'

export default function AboutHero() {
  const { config } = useSiteConfig()
  const siteName = getConfigStr(config, 'site_name', DEFAULT_SITE_NAME)
  const siteLogo = getConfigStr(config, 'site_logo')
  const logoUrl = siteLogo ? resolveUploadUrl(siteLogo) : null

  return (
    <div className="joe-card overflow-hidden mb-8 animate-fade-in-up">
      <div className="h-32 md:h-40 gradient-hero relative">
        <div className="absolute inset-0 dot-pattern opacity-20" />
      </div>
      <div className="px-6 md:px-8 pb-8 -mt-12 relative">
        <div className="mb-4 flex items-center justify-start">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt={siteName}
              className="h-20 w-20 rounded-2xl object-contain bg-muted"
            />
          ) : (
            <div className="h-20 w-20 rounded-2xl gradient-primary flex items-center justify-center text-white shadow-glow-sm">
              <Wrench className="w-8 h-8" />
            </div>
          )}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">你好，很高兴认识你 👋</h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
          我是<strong className="text-foreground">{siteName}</strong>，一个热爱技术、喜欢折腾的开发者。
          相信技术可以改变生活，用代码记录世界。
        </p>
      </div>
    </div>
  )
}
