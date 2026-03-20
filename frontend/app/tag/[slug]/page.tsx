import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchPosts, fetchTagsCached, getPublicConfigsCached } from '@/lib/api'
import { SITE_URL } from '@/lib/constants'
import type { Post, Tag } from '@/lib/types'
import { format } from 'date-fns'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import TagPagination from '@/components/TagPagination'
import { BreadcrumbJsonLd } from '@/components/JsonLd'
import { ArrowLeft, Tag as TagIcon, Calendar, User } from 'lucide-react'
import { notFound } from 'next/navigation'

export const revalidate = 60

const TAG_PAGE_SIZE = 10

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const tagsData = await fetchTagsCached().catch(() => [])
  const tag = tagsData.find((t: Tag) => t.slug === slug)
  if (!tag) return { title: '标签不存在' }
  const url = `${SITE_URL}/tag/${slug}`
  const description = `浏览标签 #${tag.name} 下的所有文章`
  return {
    title: `#${tag.name} - 标签`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `#${tag.name} - 标签`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `#${tag.name} - 标签`,
      description,
    },
  }
}

export default async function TagPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams
  const pageNum = Math.max(1, parseInt(sp?.page || '1', 10) || 1)

  let pageSize = TAG_PAGE_SIZE
  try {
    const config = await getPublicConfigsCached()
    const raw = config?.posts_per_page != null ? parseInt(String(config.posts_per_page), 10) : NaN
    if (Number.isFinite(raw) && raw > 0) pageSize = raw
  } catch {
    // use default
  }

  // 使用 reactCache 版 fetchTagsCached，与 generateMetadata 共享缓存
  const tagsData = await fetchTagsCached().catch(() => [] as Tag[])
  const tag = tagsData.find((t: Tag) => t.slug === slug)
  if (!tag) notFound()

  // 改用 fetchPosts 服务端分页，避免一次拉取全量文章再内存分页
  const postsResult = await fetchPosts({
    tag_id: tag.id,
    page: pageNum,
    page_size: pageSize,
  }).catch(() => ({ data: [] as Post[], total: 0 }))
  const results = postsResult.data || []
  const total = postsResult.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(pageNum, totalPages)

  if (pageNum > totalPages && total > 0) {
    const { redirect } = await import('next/navigation')
    redirect(totalPages === 1 ? `/tag/${slug}` : `/tag/${slug}?page=${totalPages}`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <BreadcrumbJsonLd items={[
        { name: '首页', url: SITE_URL },
        { name: '标签', url: `${SITE_URL}/tags` },
        { name: `#${tag.name}`, url: `${SITE_URL}/tag/${slug}` },
      ]} />
      <Header />

      <main className="container mx-auto px-4 py-24">
        {/* Header */}
        <div className="max-w-4xl mx-auto mb-8 animate-fade-in-up">
          <Button variant="ghost" asChild className="mb-4 -ml-4">
            <Link href="/tags">
              <ArrowLeft className="w-4 h-4 mr-2" />
              所有标签
            </Link>
          </Button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
              <TagIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">#{tag.name}</h1>
            </div>
          </div>

          <Badge className="bg-primary/10 text-primary border-0">
            共 {total} 篇文章
          </Badge>
        </div>

        {/* Posts List */}
        <div className="max-w-4xl mx-auto space-y-6">
          {results.map((post, index) => (
            <Link href={`/posts/${post.id}`} key={post.id}>
              <Card
                className="joe-card group hover:shadow-lg transition-all duration-300 hover:border-primary/20 animate-fade-in-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardHeader className="pb-2">
                  <h2 className="text-xl font-bold group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-2 mb-4">
                    {post.summary}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <User className="w-4 h-4" />
                      {post.author?.nickname || post.author?.username || '匿名'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {post.published_at ? format(new Date(post.published_at), 'yyyy-MM-dd') : '-'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="max-w-4xl mx-auto mt-8">
            <TagPagination slug={slug} currentPage={currentPage} totalPages={totalPages} />
          </div>
        )}

        {total === 0 && (
          <Card className="max-w-4xl mx-auto text-center py-20">
            <CardContent>
              <TagIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground text-lg">该标签下暂无文章</p>
            </CardContent>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  )
}
