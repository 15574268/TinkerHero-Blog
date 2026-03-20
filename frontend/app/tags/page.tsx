import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchTags } from '@/lib/api'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Card, CardContent } from '@/components/ui/card'
import { Tags } from 'lucide-react'
import { SITE_URL } from '@/lib/constants'

export const revalidate = 300

export const metadata: Metadata = {
  title: '标签云',
  description: '通过标签发现相关文章，探索更多精彩内容',
  alternates: { canonical: `${SITE_URL}/tags` },
  openGraph: {
    title: '标签云',
    description: '通过标签发现相关文章，探索更多精彩内容',
    url: `${SITE_URL}/tags`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '标签云',
    description: '通过标签发现相关文章，探索更多精彩内容',
  },
}

export default async function TagsPage() {
  let tags: Awaited<ReturnType<typeof fetchTags>> = []
  try {
    tags = await fetchTags()
  } catch {
    // show empty state
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-12">
        {/* Hero Header */}
        <div className="joe-card overflow-hidden mb-8 max-w-4xl mx-auto animate-fade-in-up">
          <div className="h-28 gradient-hero relative">
            <div className="absolute inset-0 dot-pattern opacity-20" />
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <div className="text-center">
                <Tags className="w-8 h-8 mx-auto mb-2" />
                <h1 className="text-2xl md:text-3xl font-bold">标签云</h1>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-sm text-muted-foreground">通过标签发现相关文章，探索更多精彩内容</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          {tags.length > 0 ? (
            <Card className="joe-card animate-fade-in-up delay-100">
              <CardContent className="p-8">
                <div className="flex flex-wrap gap-3 justify-center">
                  {tags.map((tag) => (
                    <Link href={`/tag/${tag.slug}`} key={tag.id}>
                      <span className="inline-flex items-center px-4 py-2 rounded-full border border-border/80 hover:border-primary/50 hover:text-primary hover:bg-primary/5 text-sm text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer">
                        #{tag.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="joe-card text-center py-20">
              <CardContent>
                <Tags className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground text-lg mb-2">暂无标签</p>
                <p className="text-muted-foreground/70">敬请期待更多内容</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
