'use client'

import React, { useEffect, useRef, useState } from 'react'
import { likePost } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Bookmark } from 'lucide-react'
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

interface LikeFavoriteButtonsProps {
  postId: number
  initialLiked?: boolean
  initialFavorited?: boolean
}

const LikeFavoriteButtons = React.memo(function LikeFavoriteButtons({
  postId,
}: LikeFavoriteButtonsProps) {
  const [likeLoading, setLikeLoading] = useState(false)
  const [likeTrigger, setLikeTrigger] = useState(0)
  const [favorited, setFavorited] = useState(false)
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
      // 静默处理，点赞特效已触发
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

  return (
    <div className="flex items-center gap-3 relative" role="group" aria-label="文章互动按钮">
      <LikeFloatingEffect trigger={likeTrigger} anchorRef={likeButtonRef} />

      <button
        ref={likeButtonRef}
        type="button"
        onClick={handleLike}
        disabled={likeLoading}
        aria-label="点赞"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all text-sm font-medium select-none active:scale-95"
      >
        <span className="text-lg leading-none">👍</span>
        <span>点赞</span>
      </button>

      <Button
        variant={favorited ? 'default' : 'outline'}
        size="sm"
        onClick={handleFavorite}
        aria-pressed={favorited}
        aria-label={favorited ? '取消收藏' : '收藏'}
        className={favorited
          ? 'bg-amber-500 hover:bg-amber-600 text-white border-0'
          : 'text-muted-foreground hover:text-amber-500 hover:border-amber-200'
        }
      >
        <Bookmark className={`w-4 h-4 mr-1.5 ${favorited ? 'fill-current' : ''}`} />
        {favorited ? '已收藏' : '收藏'}
      </Button>
    </div>
  )
})

export default LikeFavoriteButtons
