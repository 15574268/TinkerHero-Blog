import type { Metadata } from 'next'
import { fetchArchives } from '@/lib/api'
import type { ArchiveItem } from '@/lib/types'
import Link from 'next/link'
import { format } from 'date-fns'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Archive, Eye, Calendar } from 'lucide-react'
import { SITE_URL } from '@/lib/constants'

export const revalidate = 300

export const metadata: Metadata = {
  title: '文章归档',
  description: '按时间归档的所有博客文章',
  alternates: { canonical: `${SITE_URL}/archives` },
  openGraph: {
    title: '文章归档',
    description: '按时间归档的所有博客文章',
    url: `${SITE_URL}/archives`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '文章归档',
    description: '按时间归档的所有博客文章',
  },
}

export default async function ArchivesPage() {
  let posts: ArchiveItem[] = []
  try {
    posts = await fetchArchives()
  } catch {
    posts = []
  }

  const archivesByYear: Record<string, ArchiveItem[]> = {}
  for (const item of posts) {
    const yearKey = String(item.year)
    if (!archivesByYear[yearKey]) archivesByYear[yearKey] = []
    archivesByYear[yearKey].push(item)
  }
  const years = Object.keys(archivesByYear).sort((a, b) => parseInt(b) - parseInt(a))

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Hero Header */}
        <div className="joe-card overflow-hidden mb-8 animate-fade-in-up">
          <div className="h-28 gradient-hero relative">
            <div className="absolute inset-0 dot-pattern opacity-20" />
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <div className="text-center">
                <Archive className="w-8 h-8 mx-auto mb-2" />
                <h1 className="text-2xl md:text-3xl font-bold">文章归档</h1>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-sm text-muted-foreground">按时间线浏览所有文章</p>
          </div>
        </div>

        {years.length === 0 ? (
          <Card className="joe-card text-center py-20">
            <CardContent>
              <Archive className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground text-lg">暂无文章</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {years.map((year, yearIndex) => (
              <div key={year} className="animate-fade-in-up" style={{ animationDelay: `${yearIndex * 100}ms` }}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                    {year}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{year} 年</h2>
                    <p className="text-sm text-muted-foreground">
                      {archivesByYear[year].reduce((sum, i) => sum + (i.count || i.posts?.length || 0), 0)} 篇文章
                    </p>
                  </div>
                </div>

                {archivesByYear[year]
                  .slice()
                  .sort((a, b) => b.month - a.month)
                  .map((bucket) => (
                    <Card key={`${year}-${bucket.month}`} className="joe-card mb-5 overflow-hidden">
                      <CardHeader className="bg-muted/50 py-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <span className="w-1 h-5 bg-primary rounded-full" />
                          {String(bucket.month).padStart(2, '0')} 月
                          <Badge variant="secondary" className="ml-2">
                            {bucket.count || bucket.posts?.length || 0} 篇
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="divide-y">
                          {(bucket.posts ?? []).map((post) => (
                            <Link
                              key={post.id}
                              href={`/posts/${post.id}`}
                              className="flex items-center gap-4 p-4 hover:bg-primary/5 transition-colors group"
                            >
                              <span className="text-muted-foreground text-sm w-16 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {(() => {
                                  const raw = post.published_at || post.created_at
                                  const date = raw ? new Date(raw) : null
                                  return date && !isNaN(date.getTime())
                                    ? format(date, 'MM-dd')
                                    : '--'
                                })()}
                              </span>
                              <span className="flex-1 font-medium group-hover:text-primary transition-colors line-clamp-1">
                                {post.title}
                              </span>
                              <span className="text-muted-foreground text-sm flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {post.view_count}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
