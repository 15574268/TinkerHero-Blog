import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { fetchPosts, getPublicConfigsCached } from '@/lib/api'
import { resolveUploadUrl } from '@/lib/utils'
import { WebSiteJsonLd } from '@/components/JsonLd'
import { estimateReadingTime } from '@/lib/utils/readingTime'
import type { Post } from '@/lib/types'
import { format } from 'date-fns'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Card, CardContent } from '@/components/ui/card'
import HomeSidebarLoader from '@/components/HomeSidebarLoader'
import HeroBanner from '@/components/HeroBanner'
import HomePagination from '@/components/HomePagination'
import {
  Eye,
  Calendar,
  FileText,
  Clock,
  FolderOpen,
} from 'lucide-react'
import type { Metadata } from 'next'
import { SITE_URL, DEFAULT_SITE_NAME } from '@/lib/constants'

export const revalidate = 60

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const params = await searchParams
  const pageNum = Math.max(1, parseInt(params?.page || '1', 10) || 1)
  let config: Record<string, string> = {}
  try { config = await getPublicConfigsCached() } catch { /* ignore */ }
  const siteName = config?.site_name?.trim() || DEFAULT_SITE_NAME
  const description = config?.site_description?.trim() || ''
  const canonical = pageNum > 1 ? `${SITE_URL}/?page=${pageNum}` : SITE_URL
  return {
    title: pageNum > 1 ? `${siteName} - 第 ${pageNum} 页` : siteName,
    description,
    alternates: { canonical },
    openGraph: {
      title: siteName,
      description,
      url: canonical,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: siteName,
      description,
    },
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const pageNum = Math.max(1, parseInt(params?.page || '1', 10) || 1)

  let config: Record<string, string> = {}
  try {
    config = await getPublicConfigsCached()
  } catch {
    // use defaults
  }
  const pageSizeRaw = config?.posts_per_page != null ? parseInt(String(config.posts_per_page), 10) : NaN
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : 12

  const postsData = await fetchPosts({ page: pageNum, page_size: pageSize }).catch(
    () => ({ data: [] as Post[], total: 0, page: pageNum, page_size: pageSize })
  )
  const posts = postsData?.data || []
  const total = postsData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(pageNum, totalPages)
  if (pageNum > totalPages && total > 0) {
    redirect(totalPages === 1 ? '/' : `/?page=${totalPages}`)
  }

  const siteName = config?.site_name?.trim() || '博客'
  const siteDescription = config?.site_description?.trim() || ''

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <WebSiteJsonLd siteName={siteName} description={siteDescription} />
      <Header />

      {/* Hero Banner */}
      <HeroBanner />

      {/* Main Content */}
      {/* pb-32: 移动端为底部 Tab 导航预留空间；lg:pb-20: 桌面端恢复原始间距 */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-32 lg:pb-20">
        <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-12">

          {/* Main Column */}
          <section className="lg:col-span-8 min-w-0">
            <div className="space-y-4">
              {posts.map((post, index) => (
                <Link href={`/posts/${post.id}`} key={post.id} className="block group">
                  <article
                    className="post-grid-card joe-card overflow-hidden flex flex-col md:flex-row h-full animate-fade-in-up"
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    {/* Cover Image：有封面才渲染，无封面不显示占位块 */}
                    {post.cover_image && (
                      <div className="relative w-full md:w-52 lg:w-60 aspect-[16/10] md:aspect-auto md:min-h-[180px] overflow-hidden bg-muted shrink-0">
                        <Image
                          src={resolveUploadUrl(post.cover_image)}
                          alt={post.title}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 208px, 240px"
                          className="object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.05]"
                          priority={index === 0}
                        />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex flex-col flex-1 p-4 md:p-5 min-w-0">
                      {/* Title */}
                      <h3 className="font-bold text-[1.05rem] leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h3>

                      {/* Summary */}
                      <p className="mt-2 text-muted-foreground text-sm leading-relaxed line-clamp-3 flex-1">
                        {post.summary || '点击阅读文章详情…'}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                          {post.category?.name && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium max-w-[7rem] shrink-0">
                              <FolderOpen className="h-3 w-3 shrink-0" />
                              <span className="truncate">{post.category.name}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 shrink-0">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(post.created_at), 'MM-dd')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {estimateReadingTime(post.content)} min
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            {post.view_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8">
                <HomePagination currentPage={currentPage} totalPages={totalPages} />
              </div>
            )}

            {/* Empty State */}
            {posts.length === 0 && (
              <Card className="joe-card text-center py-20">
                <CardContent>
                  <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-foreground font-semibold text-lg mb-1">暂无文章</p>
                  <p className="text-muted-foreground text-sm">
                    博主正在筹备内容，欢迎稍后再来。
                  </p>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Sidebar: 移动端隐藏（通过底部 Tab 导航访问分类/标签），lg+ 显示 */}
          {/* Suspense 使侧边栏数据独立加载，不阻塞主内容列表的流式渲染 */}
          <Suspense fallback={<div className="hidden lg:block lg:col-span-4" />}>
            <HomeSidebarLoader
              totalPosts={total}
              posts={posts}
              className="hidden lg:block lg:col-span-4"
            />
          </Suspense>
        </div>
      </main>

      <Footer />
    </div>
  )
}
