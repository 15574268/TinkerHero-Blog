/* eslint-disable @next/next/no-img-element -- 海报预览使用 base64 data URL，不适合 next/image 处理 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Download, ImageIcon, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/useToast'

interface ArticlePosterModalProps {
  title: string
  summary?: string
  coverImage?: string
  url: string
  siteName?: string
  siteLogo?: string
  siteDescription?: string
  onClose: () => void
}

export default function ArticlePosterModal({
  title,
  summary,
  coverImage,
  url,
  siteName = '我的博客',
  siteLogo,
  siteDescription,
  onClose,
}: ArticlePosterModalProps) {
  const posterRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)
  const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const { showToast } = useToast()

  // 预先生成二维码 data URL，避免 html2canvas 跨域问题
  useEffect(() => {
    let cancelled = false
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(url, {
        width: 160,
        margin: 1,
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
    })
    return () => { cancelled = true }
  }, [url])

  const generatePoster = useCallback(async () => {
    if (!posterRef.current || !qrDataUrl) return
    setGenerating(true)
    try {
      // 确保字体已全部加载，避免首次渲染时字体回退
      await document.fonts.ready

      const { toPng } = await import('html-to-image')

      // 海报只用系统字体（PingFang SC / Microsoft YaHei / system-ui），
      // skipFonts:true 跳过 @font-face 内联，避免下载页面其他 web font 导致超时
      const opts = { pixelRatio: 3, skipFonts: true }

      // 第一次调用预热：html-to-image 会 fetch 并缓存图片资源
      // 第二次调用取得稳定结果（图片已缓存，不会因首次加载未完成而空白）
      await toPng(posterRef.current, opts).catch(() => {/* 预热失败忽略 */})
      const dataUrl = await toPng(posterRef.current, opts)
      setPosterDataUrl(dataUrl)
    } catch (err) {
      console.error('生成海报失败', err)
      showToast('生成海报失败，请重试', 'error')
    } finally {
      setGenerating(false)
    }
  }, [qrDataUrl, showToast])

  const handleDownload = () => {
    if (!posterDataUrl) return
    const a = document.createElement('a')
    a.href = posterDataUrl
    a.download = `${title.slice(0, 20)}-海报.png`
    // 需要挂载到 DOM 再触发，否则 Firefox 等浏览器不会弹出下载
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const shortUrl = url.replace(/^https?:\/\//, '').slice(0, 45)

  /* ── 渐变色系 ── */
  const BG   = 'linear-gradient(150deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'
  const CARD = 'rgba(255,255,255,0.06)'
  const LINE = 'rgba(255,255,255,0.12)'
  const W    = '#ffffff'
  const W70  = 'rgba(255,255,255,0.70)'
  const W45  = 'rgba(255,255,255,0.45)'
  const ACC  = '#a78bfa'   // violet-400

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="生成文章海报"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden my-auto">

        {/* ── 顶部操作栏 ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ImageIcon className="w-4 h-4 text-primary" />
            文章海报
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── 内容区 ── */}
        <div className="p-4">
          {posterDataUrl ? (
            /* 已生成 → 显示预览图 */
            <img src={posterDataUrl} alt="文章海报预览" className="w-full rounded-xl border border-border shadow-lg" />
          ) : (
            /* 海报模板（用于 html-to-image 截图） */
            <div
              ref={posterRef}
              style={{
                width: '100%',
                background: BG,
                borderRadius: 16,
                overflow: 'hidden',
                fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
                position: 'relative',
              }}
            >
              {/* 装饰光晕 */}
              <div style={{
                position: 'absolute', top: -60, right: -60,
                width: 200, height: 200,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', bottom: 80, left: -40,
                width: 150, height: 150,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(96,165,250,0.18) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              {/* ── 博客信息头部 ── */}
              <div style={{ padding: '22px 22px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {siteLogo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={siteLogo}
                    alt={siteName}
                    crossOrigin="anonymous"
                    style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(255,255,255,0.2)' }}
                  />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 700, color: W,
                  }}>
                    {siteName.charAt(0)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: W, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{siteName}</div>
                  {siteDescription && (
                    <div style={{
                      color: W45, fontSize: 11, lineHeight: 1.4, marginTop: 2,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                    }}>
                      {siteDescription}
                    </div>
                  )}
                </div>
                {/* 小徽标 */}
                <div style={{
                  fontSize: 10, color: ACC,
                  border: `1px solid ${ACC}`,
                  borderRadius: 20, padding: '2px 8px',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  原创文章
                </div>
              </div>

              {/* 分隔线 */}
              <div style={{ height: 1, background: LINE, margin: '0 22px' }} />

              {/* ── 封面图：固定高度容器，避免图片加载/缩放导致下方文字位移 ── */}
              {coverImage && (
                <div style={{ width: '100%', height: 160, overflow: 'hidden', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverImage}
                    alt={title}
                    crossOrigin="anonymous"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      verticalAlign: 'top',
                    }}
                  />
                </div>
              )}

              {/* ── 文章信息 ── */}
              <div style={{ padding: coverImage ? '18px 22px 0' : '18px 22px 0' }}>
                {/* 标题 */}
                <h2 style={{
                  fontSize: 19, fontWeight: 800, color: W,
                  lineHeight: 1.45, letterSpacing: '-0.01em',
                  margin: 0, marginBottom: summary ? 10 : 16,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {title}
                </h2>
                {/* 摘要 */}
                {summary && (
                  <p style={{
                    fontSize: 13, color: W70, lineHeight: 1.65, margin: 0, marginBottom: 16,
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {summary}
                  </p>
                )}
              </div>

              {/* ── 底部：二维码 + URL ── */}
              <div style={{
                margin: '0 22px 22px',
                background: CARD,
                borderRadius: 12,
                border: `1px solid ${LINE}`,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}>
                {/* 二维码 */}
                {qrDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrDataUrl}
                    alt="扫码阅读"
                    style={{ width: 72, height: 72, borderRadius: 8, flexShrink: 0, background: W }}
                  />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 8, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                )}

                {/* URL 信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: W70, fontSize: 11, marginBottom: 4 }}>扫描二维码阅读全文</div>
                  <div style={{
                    color: ACC, fontSize: 11, wordBreak: 'break-all', lineHeight: 1.5,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {shortUrl}
                  </div>
                </div>
              </div>

              {/* ── 底部版权条 ── */}
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '10px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ color: W45, fontSize: 10 }}>分享自 {siteName}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[ACC, '#60a5fa', '#34d399'].map((c, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: c, opacity: 0.8 }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 底部按钮 ── */}
        <div className="flex gap-3 px-5 pb-5">
          {!posterDataUrl ? (
            <Button className="flex-1" onClick={generatePoster} disabled={generating || !qrDataUrl}>
              {generating ? (
                <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />生成中...</>
              ) : !qrDataUrl ? (
                '准备中...'
              ) : (
                <><ImageIcon className="w-4 h-4 mr-1.5" />生成海报</>
              )}
            </Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setPosterDataUrl(null)}>
                <RefreshCw className="w-4 h-4 mr-1.5" />重新生成
              </Button>
              <Button className="flex-1" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-1.5" />下载海报
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
