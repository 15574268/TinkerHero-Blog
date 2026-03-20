'use client'

import React from 'react'
import { useToast } from '@/lib/hooks/useToast'
import { Link2, Share2, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ShareButtonsProps {
  title: string
  url: string
}

interface ShareLink {
  name: string
  icon: React.ReactNode
  getUrl: () => string
  isQr?: boolean
}

const ShareButtons = React.memo(function ShareButtons({ title, url }: ShareButtonsProps) {
  const { showToast } = useToast()

  const shareLinks: ShareLink[] = [
    {
      name: '微信',
      icon: <span className="text-xs font-semibold">微</span>,
      getUrl: () => `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`,
      isQr: true,
    },
    {
      name: 'QQ',
      icon: <span className="text-xs font-semibold">Q</span>,
      getUrl: () => `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    },
    {
      name: 'X',
      icon: <XIcon className="w-4 h-4" />,
      getUrl: () => `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    },
    {
      name: '微博',
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.194.573zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.579-.18-.402-.649.386-1.032.425-1.922.009-2.556-.782-1.193-2.924-1.129-5.389-.032 0 0-.771.336-.573-.271.381-1.206.324-2.215-.27-2.8-1.352-1.33-4.947.05-8.03 3.084C.906 11.167 0 13.385 0 15.294c0 3.662 4.7 5.886 9.295 5.886 6.027 0 10.038-3.508 10.038-6.29 0-1.686-1.419-2.643-2.507-2.991l.001-.002zM23.02 6.771c-1.301-1.437-3.219-2.017-5.012-1.737l.001-.001c-.383.057-.648.409-.59.79.056.381.408.648.789.591 1.286-.201 2.654.217 3.58 1.24.927 1.022 1.2 2.409.813 3.647-.085.371.145.744.515.83.371.085.744-.145.83-.515.543-1.717.162-3.642-.926-4.945zm-2.4 1.966c-.612-.676-1.515-.946-2.356-.804-.369.063-.617.413-.555.782.063.37.413.618.782.555.44-.075.916.065 1.234.417.319.352.411.83.28 1.255-.103.363.106.746.47.85.363.104.747-.106.85-.47.217-.772.043-1.631-.605-2.585z"/>
        </svg>
      ),
      getUrl: () => `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    },
  ]

  const handleShare = (name: string, getUrl: () => string, isQr?: boolean) => {
    if (isQr) {
      window.open(getUrl(), '_blank', 'width=260,height=260')
      return
    }
    window.open(getUrl(), '_blank', 'width=600,height=400')
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      showToast('链接已复制到剪贴板', 'success')
    } catch {
      showToast('复制失败，请手动复制', 'error')
    }
  }

  return (
    <div className="flex items-center gap-3" role="group" aria-label="社交分享按钮">
      <Share2 className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">分享</span>
      <div className="flex items-center gap-1.5">
        {shareLinks.map((link) => (
          <Button
            key={link.name}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => handleShare(link.name, link.getUrl, link.isQr)}
            aria-label={`分享到${link.name}`}
          >
            {link.icon}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={handleCopyLink}
          aria-label="复制链接"
        >
          <Link2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
})

export default ShareButtons
