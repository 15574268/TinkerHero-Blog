'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  FolderOpen,
  Tags,
  Calendar,
  Flame,
  User,
  Link2,
  Rss,
  BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { DEFAULT_SITE_NAME } from '@/lib/constants'
import type { Category, Tag } from '@/lib/types'

interface SidebarPost {
  id: number
  title: string
  view_count: number
  created_at: string
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了，注意休息！'
  if (hour < 9) return '早上好！'
  if (hour < 12) return '上午好！'
  if (hour < 14) return '中午好！'
  if (hour < 18) return '下午好！'
  if (hour < 22) return '晚上好！'
  return '夜深了，注意休息！'
}

const POETRY_FALLBACKS = [
  { content: '青青子衿，悠悠我心。但为君故，沉吟至今。', author: '曹操', source: '短歌行' },
  { content: '长风破浪会有时，直挂云帆济沧海。', author: '李白', source: '行路难' },
  { content: '不畏浮云遮望眼，自缘身在最高层。', author: '王安石', source: '登飞来峰' },
  { content: '人生得意须尽欢，莫使金樽空对月。', author: '李白', source: '将进酒' },
  { content: '山重水复疑无路，柳暗花明又一村。', author: '陆游', source: '游山西村' },
]

const HITOKOTO_CACHE_KEY = 'blog_hitokoto'
const HITOKOTO_CACHE_TTL_MS = 5 * 60 * 1000
const HITOKOTO_TIMEOUT_MS = 2000

function getCachedHitokoto(): { content: string; author: string; source: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(HITOKOTO_CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > HITOKOTO_CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function setCachedHitokoto(data: { content: string; author: string; source: string }) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(HITOKOTO_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // ignore
  }
}

export default function HomeSidebar({
  totalPosts,
  categories,
  tags,
  posts,
  hotPosts: hotPostsProp,
  className,
}: {
  totalPosts: number
  categories: Category[]
  tags: Tag[]
  posts: SidebarPost[]
  hotPosts?: SidebarPost[]
  className?: string
}) {
  const { config } = useSiteConfig()
  const siteName = getConfigStr(config, 'site_name', DEFAULT_SITE_NAME)
  const [greeting, setGreeting] = useState('你好！')
  // 懒初始化：直接计算当前日期，避免从空白闪烁出来（suppressHydrationWarning 抑制 SSR/Client 时区差异警告）
  const [dateStr] = useState(() => {
    const now = new Date()
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
  })
  const [poetry, setPoetry] = useState(POETRY_FALLBACKS[0])
  const [hitokotoFailed, setHitokotoFailed] = useState(false)

  useEffect(() => {
    let isMounted = true

    setGreeting(getGreeting())

    const cached = getCachedHitokoto()
    if (cached) {
      setPoetry(cached)
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HITOKOTO_TIMEOUT_MS)

    fetch('https://v1.hitokoto.cn/?c=i&encode=json', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return
        if (data?.hitokoto) {
          const item = {
            content: data.hitokoto,
            author: data.from_who || data.from || '佚名',
            source: data.from || '',
          }
          setPoetry(item)
          setCachedHitokoto(item)
          setHitokotoFailed(false)
        }
      })
      .catch((err) => {
        if (!isMounted) return
        if (err.name !== 'AbortError') setHitokotoFailed(true)
        setPoetry(POETRY_FALLBACKS[Math.floor(Math.random() * POETRY_FALLBACKS.length)])
      })
      .finally(() => clearTimeout(timeoutId))

    return () => {
      isMounted = false
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  const hotPosts = useMemo(
    () => hotPostsProp && hotPostsProp.length > 0
      ? hotPostsProp.slice(0, 6)
      : [...posts].sort((a, b) => b.view_count - a.view_count).slice(0, 6),
    [hotPostsProp, posts]
  )

  return (
    <aside className={`space-y-5 ${className ?? 'lg:col-span-4'}`}>
      {/* Greeting + Poetry Widget */}
      <div className="joe-card overflow-hidden animate-fade-in-up delay-100">
        <div className="px-5 py-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xl font-bold text-foreground">{greeting}</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1" suppressHydrationWarning>
              <Calendar className="w-3.5 h-3.5" />
              {dateStr}
            </span>
          </div>
          <div className="relative rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-4">
            <p className="text-sm text-foreground/80 leading-relaxed italic font-serif">
              {poetry.content}
            </p>
            <p className="text-xs text-muted-foreground mt-2 text-right">
              ——{poetry.author}《{poetry.source}》
            </p>
            {hitokotoFailed && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 text-right">一言暂时不可用</p>
            )}
          </div>
        </div>
      </div>

      {/* Hot Articles */}
      <div className="joe-card p-5 animate-fade-in-up delay-200">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
          </div>
          热门文章
        </h3>
        <div className="space-y-0">
          {hotPosts.map((post, index) => (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="flex items-start gap-3 py-2.5 group border-b border-border/40 last:border-0"
            >
              <span
                className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                  index < 3
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {index + 1}
              </span>
              <span className="text-sm text-foreground/80 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                {post.title}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Site Info Card */}
      <div className="joe-card overflow-hidden animate-fade-in-up delay-300">
        <div className="h-24 gradient-hero relative">
          <div className="absolute inset-0 dot-pattern opacity-20" />
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <span className="text-lg font-bold tracking-wide">Welcome to {siteName}</span>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-center justify-center gap-4 text-sm mb-4">
            <Link href="/about" className="text-primary hover:underline flex items-center gap-1 font-medium">
              <User className="w-3.5 h-3.5" />
              博主
            </Link>
            <Link href="/links" className="text-primary hover:underline flex items-center gap-1 font-medium">
              <Link2 className="w-3.5 h-3.5" />
              朋友
            </Link>
            <Link href="/rss" className="text-primary hover:underline flex items-center gap-1 font-medium">
              <Rss className="w-3.5 h-3.5" />
              RSS
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{totalPosts}</div>
              <div className="text-xs text-muted-foreground">文章</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{categories.length}</div>
              <div className="text-xs text-muted-foreground">分类</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{tags.length}</div>
              <div className="text-xs text-muted-foreground">标签</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Navigation */}
      <div className="joe-card p-5 animate-fade-in-up delay-350">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Search className="w-3.5 h-3.5 text-primary" />
          </div>
          站内导航
        </h3>
        <div className="space-y-2">
          <Button size="sm" asChild className="w-full rounded-xl justify-start">
            <Link href="/search">
              <Search className="w-4 h-4 mr-2" />
              搜索文章
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild className="w-full rounded-xl justify-start">
            <Link href="/archives">
              <BookOpen className="w-4 h-4 mr-2" />
              文章归档
            </Link>
          </Button>
        </div>
      </div>

      {/* Categories */}
      <div className="joe-card p-5 animate-fade-in-up delay-400">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <FolderOpen className="w-3.5 h-3.5 text-primary" />
          </div>
          分类
        </h3>
        <div className="flex flex-wrap gap-2">
          {categories.slice(0, 12).map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="tag-pill">
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="joe-card p-5 animate-fade-in-up delay-500">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tags className="w-3.5 h-3.5 text-primary" />
          </div>
          标签云
        </h3>
        <div className="flex flex-wrap gap-2">
          {tags.slice(0, 20).map((t) => (
            <Link
              key={t.id}
              href={`/tag/${t.slug}`}
              className="inline-flex items-center px-2.5 py-1 rounded-full border border-border/80 hover:border-primary/50 hover:text-primary hover:bg-primary/5 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5"
            >
              #{t.name}
            </Link>
          ))}
        </div>
      </div>

      {/* 主页侧边栏订阅入口已移除，保留独立 /subscribe 页面 */}
    </aside>
  )
}
