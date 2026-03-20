import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getResources } from '@/lib/api'
import type { Resource } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star, ExternalLink, Book, Code, Globe, Video, Library } from 'lucide-react'
import type React from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import { resolveUploadUrl } from '@/lib/utils'

export const revalidate = 300

export const metadata: Metadata = {
  title: '资源推荐',
  description: '读过、用过、踩过坑后留下的高质量资源清单',
}

const categoryMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  book: { label: '书籍', icon: Book },
  tool: { label: '工具', icon: Code },
  website: { label: '网站', icon: Globe },
  course: { label: '课程', icon: Video },
}

export default async function ResourcesPage() {
  let resources: Resource[] = []
  try {
    resources = await getResources()
  } catch {
    resources = []
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="joe-card overflow-hidden mb-8 animate-fade-in-up">
            <div className="h-28 gradient-hero relative">
              <div className="absolute inset-0 dot-pattern opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <Library className="w-8 h-8 mx-auto mb-2" />
                  <h1 className="text-2xl md:text-3xl font-bold">资源推荐</h1>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                读过、用过、踩过坑后留下的高质量资源清单。
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => {
              const meta = categoryMeta[r.category] || { label: r.category || '资源', icon: Book }
              const Icon = meta.icon
              const tags = typeof r.tags === 'string' ? r.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
              const rating = Math.max(0, Math.min(5, Number(r.rating || 0)))
              return (
                <Card key={r.id} className="overflow-hidden border-border/60 bg-card/60 backdrop-blur hover:shadow-xl transition-shadow">
                  <div className="aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 flex items-center justify-center">
                    {r.cover_image ? (
                      <Image
                        src={resolveUploadUrl(r.cover_image)}
                        alt={r.title}
                        width={1280}
                        height={720}
                        className="h-full w-full object-cover"
                        unoptimized={!r.cover_image.startsWith('/') || r.cover_image.startsWith('http')}
                      />
                    ) : (
                      <Icon className="h-12 w-12 text-muted-foreground/50" />
                    )}
                  </div>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="secondary">{meta.label}</Badge>
                      {r.is_recommended ? <Badge variant="outline">推荐</Badge> : null}
                    </div>
                    <h2 className="mt-3 font-bold text-lg leading-snug line-clamp-2">{r.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">{r.description}</p>

                    {tags.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tags.slice(0, 8).map((t: string) => (
                          <Badge key={t} variant="outline" className="font-normal">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'}`}
                          />
                        ))}
                      </div>
                      {r.url && /^https?:\/\//.test(r.url) && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                        >
                          访问 <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {resources.length === 0 ? (
            <div className="text-center text-muted-foreground mt-12">暂无资源</div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  )
}

