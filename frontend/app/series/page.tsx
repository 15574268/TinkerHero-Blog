import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getSeriesList } from '@/lib/api'
import type { Series } from '@/lib/types'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Eye } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import { resolveUploadUrl } from '@/lib/utils'

export const revalidate = 300

export const metadata: Metadata = {
  title: '文章合集',
  description: '按主题系统整理的内容合集，适合连续阅读与查找',
}

export default async function SeriesPage() {
  let series: Series[] = []
  try {
    series = await getSeriesList()
  } catch {
    series = []
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-6xl">
          {/* Hero Header */}
          <div className="joe-card overflow-hidden mb-8 animate-fade-in-up">
            <div className="h-28 gradient-hero relative">
              <div className="absolute inset-0 dot-pattern opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <BookOpen className="w-8 h-8 mx-auto mb-2" />
                  <h1 className="text-2xl md:text-3xl font-bold">文章合集</h1>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 text-center">
              <p className="text-sm text-muted-foreground">按主题系统整理的内容合集，适合连续阅读与查找。</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {series.map((s, index) => (
              <Link key={s.id} href={`/series/${s.slug}`} className="group">
                <Card
                  className="joe-card h-full overflow-hidden hover:shadow-xl transition-all duration-300 animate-fade-in-up"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="aspect-[16/9] bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 overflow-hidden">
                    {s.cover_image ? (
                      <Image
                        src={resolveUploadUrl(s.cover_image)}
                        alt={s.title}
                        width={1280}
                        height={720}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized={!s.cover_image.startsWith('/')}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-primary/30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{s.post_count ?? 0} 篇</Badge>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {(s.view_count ?? 0).toLocaleString?.() ?? s.view_count ?? 0}
                      </span>
                    </div>
                    <h2 className="mt-3 font-bold text-lg leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {s.title}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {s.description || '暂无描述'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {series.length === 0 && (
            <Card className="joe-card text-center py-20 mt-6">
              <CardContent>
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground text-lg">暂无合集</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
