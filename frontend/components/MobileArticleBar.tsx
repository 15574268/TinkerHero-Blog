'use client'

import { useEffect, useRef, useState } from 'react'
import { List, Bookmark, Share2, X, Check, Link2 } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import TableOfContents from '@/components/TableOfContents'
import { likePost } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import LikeFloatingEffect from '@/components/LikeFloatingEffect'

const FAVORITES_KEY = 'blog_favorites'

function getLocalFavorites(): number[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
  } catch {
    return []
  }
}

function toggleLocalFavorite(postId: number): boolean {
  const favorites = getLocalFavorites()
  const idx = favorites.indexOf(postId)
  if (idx >= 0) {
    favorites.splice(idx, 1)
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
    return false
  } else {
    favorites.push(postId)
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
    return true
  }
}

interface MobileArticleBarProps {
  postId: number
  content: string
  url: string
  title: string
  initialLiked?: boolean
  initialFavorited?: boolean
}

export default function MobileArticleBar({
  postId,
  content,
  url,
  title,
}: MobileArticleBarProps) {
  const [tocOpen, setTocOpen] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)
  const [likeTrigger, setLikeTrigger] = useState(0)
  const [copied, setCopied] = useState(false)
  const { showToast } = useToast()
  const likeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setFavorited(getLocalFavorites().includes(postId))
  }, [postId])

  const handleLike = async () => {
    if (likeLoading) return
    setLikeLoading(true)
    setLikeTrigger((n) => n + 1)
    try {
      await likePost(postId)
    } catch {
      // 静默处理
    } finally {
      setLikeLoading(false)
    }
  }

  const handleFavorite = () => {
    const nowFavorited = toggleLocalFavorite(postId)
    setFavorited(nowFavorited)
    if (nowFavorited) {
      showToast('已收藏到本地浏览器，清除浏览器数据后将消失', 'success')
    } else {
      showToast('已取消收藏', 'success')
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      showToast('链接已复制', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('复制失败', 'error')
    }
  }

  return (
    <>
      <div
        className="fixed bottom-0 inset-x-0 z-40 xl:hidden bg-card/95 backdrop-blur-md border-t border-border/60"
        role="toolbar"
        aria-label="文章操作"
      >
        <div className="flex items-stretch h-14 relative">
          <LikeFloatingEffect trigger={likeTrigger} anchorRef={likeButtonRef} />

          {/* 目录 */}
          <button
            type="button"
            onClick={() => setTocOpen(true)}
            aria-label="目录"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <List className="w-5 h-5" strokeWidth={1.8} />
            <span className="text-[10px] font-medium leading-none">目录</span>
          </button>

          {/* 点赞 */}
          <button
            ref={likeButtonRef}
            type="button"
            onClick={handleLike}
            disabled={likeLoading}
            aria-label="点赞"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-rose-500 transition-colors disabled:opacity-50 active:scale-90"
          >
            <span className="text-xl leading-none">👍</span>
            <span className="text-[10px] font-medium leading-none">点赞</span>
          </button>

          {/* 收藏 */}
          <button
            type="button"
            onClick={handleFavorite}
            aria-pressed={favorited}
            aria-label={favorited ? '取消收藏' : '收藏'}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
              favorited ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'
            }`}
          >
            <Bookmark
              className="w-5 h-5 transition-transform"
              strokeWidth={favorited ? 2.5 : 1.8}
              fill={favorited ? 'currentColor' : 'none'}
            />
            <span className="text-[10px] font-medium leading-none">
              {favorited ? '已收藏' : '收藏'}
            </span>
          </button>

          {/* 分享 */}
          <button
            type="button"
            onClick={handleShare}
            aria-label="分享"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
              copied ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {copied ? (
              <Check className="w-5 h-5" strokeWidth={1.8} />
            ) : (
              <Share2 className="w-5 h-5" strokeWidth={1.8} />
            )}
            <span className="text-[10px] font-medium leading-none">
              {copied ? '已复制' : '分享'}
            </span>
          </button>

          {/* 复制链接备用按钮（隐藏） */}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url)
                setCopied(true)
                showToast('链接已复制', 'success')
                setTimeout(() => setCopied(false), 2000)
              } catch {
                showToast('复制失败', 'error')
              }
            }}
            aria-label="复制链接"
            className="hidden flex flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Link2 className="w-5 h-5" strokeWidth={1.8} />
            <span className="text-[10px] font-medium leading-none">复制</span>
          </button>
        </div>
      </div>

      {/* TOC 抽屉 */}
      <Sheet open={tocOpen} onOpenChange={setTocOpen}>
        <SheetContent
          side="bottom"
          hideCloseButton
          className="xl:hidden rounded-t-2xl px-0 pb-safe max-h-[70vh] overflow-hidden flex flex-col"
        >
          <SheetTitle className="sr-only">文章目录</SheetTitle>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <List className="w-4 h-4 text-primary" />
              文章目录
            </div>
            <button
              type="button"
              onClick={() => setTocOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="关闭目录"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3" onClick={() => setTocOpen(false)}>
            <TableOfContents content={content} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
