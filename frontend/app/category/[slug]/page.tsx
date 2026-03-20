import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchPosts, fetchCategoriesCached, getPublicConfigsCached } from '@/lib/api'
import { SITE_URL } from '@/lib/constants'
import type { Post, Category } from '@/lib/types'
import { format } from 'date-fns'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveUploadUrl } from '@/lib/utils'
import CategoryPagination from '@/components/CategoryPagination'
import { BreadcrumbJsonLd } from '@/components/JsonLd'
import { ArrowLeft, Eye, MessageCircle, Calendar, FolderOpen } from 'lucide-react'
import { notFound } from 'next/navigation'

export const revalidate = 60

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const categories = await fetchCategoriesCached().catch(() => [])
  const cat = categories.find((c: Category) => c.slug === slug)
  if (!cat) return { title: '分类不存在' }
  const url = `${SITE_URL}/category/${slug}`
  const description = cat.description || `浏览 ${cat.name} 分类下的所有文章`
  return {
    title: `${cat.name} - 分类`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${cat.name} - 分类`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `${cat.name} - 分类`,
      description,
    },
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams
  const pageNum = Math.max(1, parseInt(sp?.page || '1', 10) || 1)

  let pageSize = 10
  try {
    const config = await getPublicConfigsCached()
    const raw = config?.posts_per_page != null ? parseInt(String(config.posts_per_page), 10) : NaN
    if (Number.isFinite(raw) && raw > 0) pageSize = raw
  } catch {
    // use default
  }

  const categoriesData = await fetchCategoriesCached().catch(() => [] as Category[])
  const cat = categoriesData.find((c: Category) => c.slug === slug)
  if (!cat) notFound()

  const postsResult = await fetchPosts({
    category_id: cat.id,
    page: pageNum,
    page_size: pageSize,
  }).catch(() => ({ data: [] as Post[], total: 0 }))
  const posts = postsResult.data || []
  const total = postsResult.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(pageNum, totalPages)

  if (pageNum > totalPages && total > 0) {
    const { redirect } = await import('next/navigation')
    redirect(totalPages === 1 ? `/category/${slug}` : `/category/${slug}?page=${totalPages}`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <BreadcrumbJsonLd items={[
        { name: '首页', url: SITE_URL },
        { name: '分类', url: `${SITE_URL}/categories` },
        { name: cat.name, url: `${SITE_URL}/category/${slug}` },
      ]} />
      <Header />

      <main className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="max-w-4xl mx-auto mb-8 animate-fade-in-up">
          <Button variant="ghost" asChild className="mb-4 -ml-4">
            <Link href="/categories">
              <ArrowLeft className="w-4 h-4 mr-2" />
              所有分类
            </Link>
          </Button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">{cat.name}</h1>
              {cat.description && (
                <p className="text-muted-foreground mt-1">{cat.description}</p>
              )}
            </div>
          </div>

          <Badge variant="secondary">
            共 {total} 篇文章
          </Badge>
        </div>

        {/* Posts List */}
        <div className="max-w-4xl mx-auto space-y-6">
          {posts.map((post, index) => (
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
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={post.author?.avatar ? resolveUploadUrl(post.author.avatar) : undefined}
                          alt={post.author?.nickname || post.author?.username || ''}
                        />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-xs">
                          {(post.author?.nickname || post.author?.username)?.[0]?.toUpperCase() || '匿'}
                        </AvatarFallback>
                      </Avatar>
                      <span>{post.author?.nickname || post.author?.username || '匿名'}</span>
                    </div>
                    <span className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {post.view_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-4 h-4" />
                      {post.comment_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(post.created_at), 'yyyy-MM-dd')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="max-w-4xl mx-auto mt-8">
            <CategoryPagination slug={slug} currentPage={currentPage} totalPages={totalPages} />
          </div>
        )}

        {posts.length === 0 && (
          <Card className="max-w-4xl mx-auto text-center py-20">
            <CardContent>
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground text-lg">该分类下暂无文章</p>
            </CardContent>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  )
}
