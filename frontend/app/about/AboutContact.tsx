'use client'

import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { Mail, Globe } from 'lucide-react'

export default function AboutContact() {
  const { config } = useSiteConfig()
  const siteUrl = getConfigStr(config, 'site_url')
  const smtpFrom = getConfigStr(config, 'smtp_from')
  const contactEmail = smtpFrom ? smtpFrom.replace(/.*<|>.*/g, '').trim() || smtpFrom : ''

  return (
    <div className="joe-card p-6 md:p-8 animate-fade-in-up delay-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
          <Mail className="w-5 h-5 text-purple-500" />
        </div>
        <h2 className="text-2xl font-bold">联系我</h2>
      </div>
      <p className="text-muted-foreground mb-4">
        如有任何问题或建议，欢迎通过以下方式联系我：
      </p>
      <div className="space-y-3">
        {contactEmail && (
          <a
            href={`mailto:${contactEmail}`}
            className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors"
          >
            <Mail className="w-5 h-5" />
            {contactEmail}
          </a>
        )}
        {siteUrl && (
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors"
          >
            <Globe className="w-5 h-5" />
            {siteUrl.replace(/^https?:\/\//, '')}
          </a>
        )}
        {!contactEmail && !siteUrl && (
          <p className="text-muted-foreground text-sm">
            请在后台「系统设置」中配置 SMTP 发件人邮箱和网站地址，联系方式将自动展示。
          </p>
        )}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
        <p className="text-sm text-muted-foreground leading-relaxed">
          感谢你花时间了解我。无论是技术讨论还是生活分享，
          每一次交流都让我更加坚定自己的方向。期待与志同道合的朋友一起，在技术的世界里探索和成长。
        </p>
      </div>
    </div>
  )
}
