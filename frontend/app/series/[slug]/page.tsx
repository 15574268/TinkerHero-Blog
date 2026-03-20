import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getSeriesBySlug } from '@/lib/api'
import type { Series, SeriesPost } from '@/lib/types'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SeriesDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let series: (Series & { posts: SeriesPost[] }) | null = null
  try {
    series = await getSeriesBySlug(slug)
  } catch {
    notFound()
  }

  if (!series) notFound()

  const posts: SeriesPost[] = Array.isArray(series.posts) ? series.posts : []

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span>合集</span>
            </div>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">{series.title}</h1>
            {series.description ? (
              <p className="mt-3 text-muted-foreground leading-relaxed">{series.description}</p>
            ) : null}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{posts.length} 篇文章</Badge>
            </div>
          </div>

          <div className="space-y-4">
            {posts.map((p, idx) => (
              <Link key={p.post_id ?? idx} href={`/posts/${p.post_id}`} className="block">
                <Card className="border-border/60 bg-card/70 backdrop-blur hover:shadow-lg transition-shadow">
                  <CardContent className="p-6 flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">第 {idx + 1} 篇</div>
                      <div className="mt-2 font-semibold text-lg leading-snug line-clamp-2">
                        {p.post?.title || '未命名'}
                      </div>
                      {p.post?.summary ? (
                        <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {p.post.summary}
                        </div>
                      ) : null}
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {posts.length === 0 ? (
            <div className="text-center text-muted-foreground mt-12">该合集暂无文章</div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  )
}

