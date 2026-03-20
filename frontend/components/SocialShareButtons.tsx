'use client'

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  Share2,
  Link2,
  X,
  Check,
  Image as ImageIcon,
} from 'lucide-react'
import { getSharePlatforms, recordShare } from '@/lib/api'

const ArticlePosterModal = lazy(() => import('@/components/ArticlePosterModal'))

interface ShareButtonProps {
  url: string
  title: string
  summary?: string
  image?: string
  postId?: number
  platforms?: string[]
  siteName?: string
  siteLogo?: string
  siteDescription?: string
}

interface Platform {
  key: string
  name: string
  icon: string
  color: string
  share_count?: number
  url_template?: string
}

const PLATFORM_SHARE_URLS: Record<string, (url: string, title: string) => string> = {
  wechat: () => '',
  qq: (url, title) =>
    `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(title)}`,
  x: (url, title) =>
    `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  weibo: (url, title) =>
    `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
}

const iconMap: Record<string, React.ReactNode> = {
  wechat: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.295.295a.328.328 0 0 0 .186-.068l2.038-1.353a.95.95 0 0 1 .53-.16c.09 0 .18.012.27.036C7.29 16.25 8.44 16.5 9.65 16.5c.324 0 .644-.016.96-.048-.35-.846-.54-1.756-.54-2.71 0-3.882 3.562-7.028 7.954-7.028.274 0 .545.013.812.039C17.622 4.166 13.46 2.188 8.69 2.188zm-2.41 4.667a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.82 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM24 13.74c0-3.39-3.216-6.14-7.18-6.14-3.965 0-7.182 2.75-7.182 6.14S12.855 19.88 16.82 19.88c.93 0 1.82-.168 2.64-.474a.722.722 0 0 1 .214-.033c.138 0 .272.04.387.115l1.577 1.044a.25.25 0 0 0 .14.051.228.228 0 0 0 .228-.228.436.436 0 0 0-.038-.165l-.301-1.142a.457.457 0 0 1 .165-.514C22.893 17.55 24 15.73 24 13.74zm-9.725-.6a.694.694 0 1 1 0-1.387.694.694 0 0 1 0 1.387zm5.09 0a.694.694 0 1 1 0-1.387.694.694 0 0 1 0 1.387z"/>
    </svg>
  ),
  qq: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.003 2c-4.66 0-8.4 3.12-8.4 7.68 0 2.148.87 4.09 2.31 5.52-.23.73-.61 1.39-1.14 1.88-.14.14-.04.37.16.37.89 0 2.36-.48 3.23-1.25.54.13 1.1.2 1.67.2h.35l.18-.01.17-.01h.32c4.62-.03 8.33-3.15 8.33-7.66C19.2 5.12 16.37 2 12.003 2zm-3.32 9.72a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zm6.63 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zM18.15 17.2c-.34-.99-.85-1.77-1.42-2.33.7-.63 1.3-1.38 1.75-2.22.87 1.04 1.4 2.37 1.4 3.82 0 .55-.07 1.09-.21 1.6.03-.29.05-.59.05-.9a5.7 5.7 0 0 0-1.57-3.97zm-8.6 2.1c-1.98-.57-3.4-2.32-3.4-4.41 0-.6.12-1.18.33-1.7-.57.63-.94 1.4-1.04 2.24-.5.53-.87 1.18-1.07 1.9-.14-.5-.21-1.03-.21-1.57 0-1.45.53-2.78 1.4-3.82.45.84 1.05 1.59 1.75 2.22-.57.56-1.08 1.34-1.42 2.33A5.7 5.7 0 0 0 5.32 20c0 .31.02.61.05.9-.14-.51-.21-1.05-.21-1.6v-.48c0 1.58.6 3.01 1.58 4.09.57.28 1.19.44 1.84.44h6.84c.65 0 1.27-.16 1.84-.44.98-1.08 1.58-2.51 1.58-4.09v.48c0 .55-.07 1.09-.21 1.6.03-.29.05-.59.05-.9a5.7 5.7 0 0 0-1.57-3.97 5.7 5.7 0 0 1-1.42-2.33c.7-.63 1.3-1.38 1.75-2.22.87 1.04 1.4 2.37 1.4 3.82 0 1.02-.27 1.97-.73 2.8z"/>
    </svg>
  ),
  x: <X className="w-4 h-4" />,
  weibo: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.194.573zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.579-.18-.402-.649.386-1.032.425-1.922.009-2.556-.782-1.193-2.924-1.129-5.389-.032 0 0-.771.336-.573-.271.381-1.206.324-2.215-.27-2.8-1.352-1.33-4.947.05-8.03 3.084C.906 11.167 0 13.385 0 15.294c0 3.662 4.7 5.886 9.295 5.886 6.027 0 10.038-3.508 10.038-6.29 0-1.686-1.419-2.643-2.507-2.991l.001-.002zM23.02 6.771c-1.301-1.437-3.219-2.017-5.012-1.737l.001-.001c-.383.057-.648.409-.59.79.056.381.408.648.789.591 1.286-.201 2.654.217 3.58 1.24.927 1.022 1.2 2.409.813 3.647-.085.371.145.744.515.83.371.085.744-.145.83-.515.543-1.717.162-3.642-.926-4.945zm-2.4 1.966c-.612-.676-1.515-.946-2.356-.804-.369.063-.617.413-.555.782.063.37.413.618.782.555.44-.075.916.065 1.234.417.319.352.411.83.28 1.255-.103.363.106.746.47.85.363.104.747-.106.85-.47.217-.772.043-1.631-.605-2.585z"/>
    </svg>
  ),
  copy: <Link2 className="w-5 h-5" />,
  poster: <ImageIcon className="w-4 h-4" aria-hidden="true" />,
}

export default function SocialShareButtons({
  url,
  title,
  summary,
  image,
  postId,
  platforms: enabledPlatforms,
  siteName,
  siteLogo,
  siteDescription,
}: ShareButtonProps) {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [showWechatQR, setShowWechatQR] = useState(false)
  const [showPoster, setShowPoster] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadPlatforms = useCallback(async () => {
    try {
      let pls = (await getSharePlatforms()) as unknown as Platform[]
      if (enabledPlatforms && enabledPlatforms.length > 0) {
        pls = pls.filter((p) => enabledPlatforms.includes(p.key))
      } else {
        const order = ['wechat', 'qq', 'x', 'weibo', 'copy']
        pls = pls
          .filter((p) => order.includes(p.key))
          .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      }
      if (!pls.some((p) => p.key === 'copy')) {
        pls = [...pls, { key: 'copy', name: '复制链接', icon: 'copy', color: '#666666' }]
      }
      setPlatforms(pls)
    } catch {
      setPlatforms([
        { key: 'x', name: 'X', icon: 'x', color: '#000000' },
        { key: 'weibo', name: '微博', icon: 'weibo', color: '#E6162D' },
        { key: 'copy', name: '复制链接', icon: 'copy', color: '#666666' },
      ])
    }
  }, [enabledPlatforms])

  useEffect(() => {
    loadPlatforms()
  }, [loadPlatforms])

  const handleShare = async (platform: Platform) => {
    if (platform.key === 'copy') {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        console.error('复制链接失败')
      }
      return
    }

    if (postId) {
      recordShare(postId, platform.key, url).catch(() => {})
    }

    if (platform.key === 'wechat') {
      setShowWechatQR(true)
      return
    }

    const buildUrl = PLATFORM_SHARE_URLS[platform.key]
    if (buildUrl) {
      const shareUrl = buildUrl(url, title)
      if (shareUrl) window.open(shareUrl, '_blank', 'width=600,height=400')
    } else if (platform.url_template) {
      const shareUrl = platform.url_template
        .replace('{url}', encodeURIComponent(url))
        .replace('{title}', encodeURIComponent(title))
      window.open(shareUrl, '_blank', 'width=600,height=400')
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <Share2 className="w-4 h-4" />
          分享到：
        </span>

        {platforms.map((platform) => (
          <button
            type="button"
            key={platform.key}
            onClick={() => handleShare(platform)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 hover:scale-105"
            style={{ backgroundColor: platform.color }}
            title={platform.name}
          >
            {iconMap[platform.key] || iconMap[platform.icon] || <Share2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{platform.name}</span>
            {platform.share_count !== undefined && (
              <span className="text-xs opacity-80">({platform.share_count})</span>
            )}
          </button>
        ))}

        {/* 生成海报按钮 */}
        <button
          type="button"
          onClick={() => setShowPoster(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 hover:scale-105"
          style={{ backgroundColor: '#7c3aed' }}
          title="生成海报"
        >
          <ImageIcon className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">生成海报</span>
        </button>

        {copied && (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <Check className="w-4 h-4" />
            已复制
          </span>
        )}
      </div>

      {/* 微信二维码弹窗 */}
      {showWechatQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="微信扫码分享">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full mx-4 border border-border shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-foreground">微信扫码分享</h3>
              <button
                type="button"
                onClick={() => setShowWechatQR(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`}
                alt="微信二维码"
                width={200}
                height={200}
                className="rounded-lg"
              />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              打开微信扫一扫，分享给好友或朋友圈
            </p>
          </div>
        </div>
      )}

      {/* 生成海报弹窗 */}
      {showPoster && (
        <Suspense fallback={null}>
          <ArticlePosterModal
            title={title}
            summary={summary}
            coverImage={image}
            url={url}
            siteName={siteName}
            siteLogo={siteLogo}
            siteDescription={siteDescription}
            onClose={() => setShowPoster(false)}
          />
        </Suspense>
      )}
    </>
  )
}

// 迷你分享按钮组
export function MiniShareButtons({ url, title }: Omit<ShareButtonProps, 'postId' | 'image'>) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const defaultPlatforms = [
    { key: 'x', url: `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, color: '#000000' },
    { key: 'weibo', url: `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, color: '#E6162D' },
  ]

  return (
    <div className="flex items-center gap-1">
      {defaultPlatforms.map((platform) => (
        <a
          key={platform.key}
          href={platform.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full text-white transition-all hover:opacity-80"
          style={{ backgroundColor: platform.color }}
        >
          {iconMap[platform.key] ?? <Share2 className="w-4 h-4" />}
        </a>
      ))}
      <button
        onClick={handleCopy}
        className="p-2 rounded-full bg-gray-600 text-white transition-all hover:opacity-80"
        title={copied ? '已复制' : '复制链接'}
      >
        {copied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
      </button>
    </div>
  )
}

// 浮动分享栏（侧边固定）
export function FloatingShareBar({ url, title, image, postId }: ShareButtonProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
      <div className="bg-card border border-border rounded-lg shadow-lg p-2 space-y-2">
        <SocialShareButtons
          url={url}
          title={title}
          image={image}
          postId={postId}
          platforms={['x', 'weibo', 'copy']}
        />
      </div>
    </div>
  )
}
