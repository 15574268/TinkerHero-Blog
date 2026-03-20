'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import TableOfContents from '@/components/TableOfContents'
import { Flame, ArrowLeft } from 'lucide-react'

interface SidebarPost {
  id: number
  title: string
  view_count: number
}

interface PostSidebarProps {
  content: string
  hasCover?: boolean
  hotPosts: SidebarPost[]
  /** 是否显示目录，默认 true */
  enableToc?: boolean
}

export default function PostSidebar({
  content,
  hasCover,
  hotPosts,
  enableToc = true,
}: PostSidebarProps) {
  return (
    <aside className="hidden xl:block">
      {/* 整体占满视口高度的粘性容器，各模块始终可见 */}
      <div className={`sticky top-20 h-[calc(100vh-5rem)] flex flex-col gap-4 overflow-hidden pb-4 ${hasCover ? '' : 'pt-10'}`}>

        {/* TOC — 占 2/3 剩余空间，内容可滚动 */}
        {enableToc && (
          <Card className={`joe-card border-0 overflow-hidden min-h-0 ${hotPosts.length > 0 ? 'flex-[2]' : 'flex-1'}`}>
            <CardContent className="p-4 h-full overflow-y-auto">
              <TableOfContents content={content} />
            </CardContent>
          </Card>
        )}

        {/* Hot Articles — 占 1/3 剩余空间，内容可滚动 */}
        {hotPosts.length > 0 && (
          <Card className={`joe-card border-0 overflow-hidden min-h-0 ${enableToc ? 'flex-1' : 'flex-1'}`}>
            <CardContent className="p-4 h-full flex flex-col">
              <h4 className="font-semibold text-foreground mb-3 text-sm flex items-center gap-2 shrink-0">
                <div className="w-5 h-5 rounded-md bg-orange-500/10 flex items-center justify-center">
                  <Flame className="w-3 h-3 text-orange-500" />
                </div>
                热门文章
              </h4>
              <div className="space-y-0 overflow-y-auto min-h-0 flex-1">
                {hotPosts.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/posts/${p.id}`}
                    className="flex items-start gap-2.5 py-2 group border-b border-border/30 last:border-0"
                  >
                    <span
                      className={`w-[18px] h-[18px] rounded text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                        i < 3
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[13px] text-foreground/80 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                      {p.title}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Return button — 固定在底部 */}
        <Button variant="outline" className="w-full rounded-xl text-sm shrink-0" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            返回首页
          </Link>
        </Button>
      </div>
    </aside>
  )
}
