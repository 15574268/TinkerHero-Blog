import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { fetchPost, fetchPostCached, fetchPopularPosts, getPublicConfigsCached } from '@/lib/api'
import { Post } from '@/lib/types'
import { Metadata } from 'next'
import { resolveUploadUrl, resolveAbsoluteUploadUrl, getPosterImageUrl } from '@/lib/utils'
import CommentSection from '@/components/CommentSection'
import PostSidebar from '@/components/PostSidebar'
import SocialShareButtons from '@/components/SocialShareButtons'
import RelatedPosts from '@/components/RelatedPosts'
import LikeFavoriteButtons from '@/components/LikeFavoriteButtons'
import ReadingProgress from '@/components/ReadingProgress'
import VisitTracker from '@/components/VisitTracker'
import PostPasswordGate from '@/components/PostPasswordGate'
import ArticleContent from '@/components/ArticleContent'
import PasswordCleaner from '@/components/PasswordCleaner'
import { BlogPostingJsonLd, BreadcrumbJsonLd } from '@/components/JsonLd'
import { calculateReadingTime, formatReadingTime, calculateWordCount, formatWordCount } from '@/lib/utils/readingTime'
import { DEFAULT_SITE_NAME, SITE_URL } from '@/lib/constants'

export const revalidate = 300
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MobileArticleBar from '@/components/MobileArticleBar'
import DonationButton from '@/components/DonationButton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Calendar,
  Eye,
  Clock,
  FileText,
  Heart,
  MessageCircle,
  Tag,
  ChevronRight,
  Home,
} from 'lucide-react'

/** 用 ISO 日期部分格式化，避免服务端/客户端时区不同导致 hydration 不一致 */
function formatDateSafe(iso: string, pattern: 'long' | 'short'): string {
  const datePart = iso.slice(0, 10)
  const [y, m, d] = datePart.split('-')
  if (!y || !m || !d) return iso
  if (pattern === 'long') return `${y}年${m}月${d}日`
  return `${y}/${m}/${d}`
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  // id 可以是数字 ID 或 slug，统一作为字符串传递
  const postKey: number | string = /^\d+$/.test(id) ? parseInt(id) : id
  let siteName = DEFAULT_SITE_NAME
  let c: Awaited<ReturnType<typeof getPublicConfigsCached>> | null = null
  try {
    c = await getPublicConfigsCached()
    if (c?.site_name?.trim()) siteName = c.site_name.trim()
  } catch {
    // keep default
  }
  let post
  try {
    // 不传密码：metadata 仅用于 SEO，密码保护的文章返回通用标题即可
    // 使用 reactCache 版本，与页面主体共享同一请求内的缓存，避免双重 API 调用
    post = await fetchPostCached(postKey)
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { need_password?: boolean } } }
    if (e?.response?.status === 403 && e?.response?.data?.need_password) {
      return { title: `该文章需要密码访问 - ${siteName}` }
    }
    return { title: '文章不存在' }
  }
  if (!post) return { title: '文章不存在' }
  const useAutoDesc = (c?.seo_auto_description ?? 'true') !== 'false'
  const description = useAutoDesc
    ? (post.summary || post.content.substring(0, 160))
    : (post.summary || '')
  const canonical = `${SITE_URL}/posts/${postKey}`
  return {
    title: `${post.title} - ${siteName}`,
    description,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description,
      images: post.cover_image
        ? [{ url: resolveAbsoluteUploadUrl(post.cover_image), width: 1200, height: 630, alt: post.title }]
        : [],
      type: 'article',
      publishedTime: post.published_at,
      modifiedTime: post.updated_at || post.published_at,
      authors: [post.author?.nickname || post.author?.username || '匿名'],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images: post.cover_image
        ? [{ url: resolveAbsoluteUploadUrl(post.cover_image), alt: post.title }]
        : [],
    },
  }
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ password?: string }>
}) {
  const { id } = await params
  const { password } = await searchParams

  // id 可以是数字 ID 或 slug，统一作为字符串传递
  const postKey: number | string = /^\d+$/.test(id) ? parseInt(id) : id

  let post: Post | null = null
  let needPassword = false
  let passwordHint: string | null = null

  try {
    // 无密码时复用 reactCache，与 generateMetadata 共享缓存（减少一次 API 请求）
    post = password ? await fetchPost(postKey, password) : await fetchPostCached(postKey)
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown } }
    const status = e?.response?.status
    const body = e?.response?.data as { need_password?: boolean; password_hint?: string } | undefined
    if (status === 403 && body?.need_password) {
      needPassword = true
      passwordHint = body.password_hint || null
    } else {
      notFound()
    }
  }

  if (needPassword || !post) {
    return (
      <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
        <Header />
        <Suspense fallback={<div className="flex-1" />}>
          <PostPasswordGate hint={passwordHint} />
        </Suspense>
        <Footer />
      </div>
    )
  }

  let siteConfig: Record<string, string> = {}
  try {
    siteConfig = await getPublicConfigsCached()
  } catch {
    // use defaults
  }
  const allowCommentGlobal = siteConfig?.allow_comment !== 'false'
  const enableToc = siteConfig?.enable_toc !== 'false'
  const enableReadingTime = siteConfig?.enable_reading_time !== 'false'

  const popularPosts = await fetchPopularPosts(6).catch(() => [])

  const postUrl = `${SITE_URL}/posts/${post.id}`
  const readingTime = calculateReadingTime(post.content)
  const wordCount = calculateWordCount(post.content)

  const siteName = siteConfig?.site_name?.trim() || DEFAULT_SITE_NAME
  const breadcrumbItems = [
    { name: '首页', url: SITE_URL },
    ...(post.category ? [{
      name: post.category.name,
      url: `${SITE_URL}/category/${post.category.slug}`,
    }] : []),
    { name: post.title, url: postUrl },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <BlogPostingJsonLd
        postId={post.id}
        title={post.title}
        description={post.summary || post.content.substring(0, 160)}
        publishedAt={post.published_at || post.created_at}
        updatedAt={post.updated_at}
        authorName={post.author?.nickname || post.author?.username || '匿名'}
        coverImage={post.cover_image ? resolveAbsoluteUploadUrl(post.cover_image) : undefined}
        siteName={siteName}
        categoryName={post.category?.name}
        tags={post.tags?.map((t) => t.name)}
        publisherLogoUrl={siteConfig?.site_logo ? resolveAbsoluteUploadUrl(siteConfig.site_logo) : undefined}
      />
      <BreadcrumbJsonLd items={breadcrumbItems} />
      <PasswordCleaner />
      <VisitTracker postId={post.id} />
      <ReadingProgress />
      <Header />

      {/* Unified content container — pb-32 on mobile reserves space for MobileArticleBar */}
      <div className="w-full mx-auto max-w-[768px] xl:max-w-[1200px] px-4 sm:px-6 pb-32 xl:pb-16">
        <div className="xl:grid xl:grid-cols-[minmax(0,768px)_280px] xl:gap-8">

          {/* ─── Main Column ─── */}
          {/* [overflow-x:clip] 裁剪宽代码块/表格的横向溢出，不创建滚动容器（不影响 sticky 侧边栏） */}
          <div className="min-w-0 [overflow-x:clip]">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5 mt-6">
              <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
                <Home className="w-3.5 h-3.5" />
                首页
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              {post.category && (
                <>
                  <Link href={`/category/${post.category.slug}`} className="hover:text-primary transition-colors">
                    {post.category.name}
                  </Link>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
              <span className="text-foreground/50 truncate max-w-[200px]">{post.title}</span>
            </nav>

            {/* Article Card (header + content) */}
            <article className="joe-card overflow-hidden">
              <div className="p-5 md:p-8 lg:p-10">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {post.category && (
                    <Link href={`/category/${post.category.slug}`}>
                      <Badge className="px-3 py-1 text-sm rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors border-0">
                        {post.category.name}
                      </Badge>
                    </Link>
                  )}
                  <time className="text-muted-foreground text-sm flex items-center gap-1.5" dateTime={post.created_at}>
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDateSafe(post.created_at, 'long')}
                  </time>
                </div>

                <h1 className="font-serif text-balance text-3xl md:text-4xl lg:text-[2.6rem] font-bold leading-[1.2] mb-4">
                  {post.title}
                </h1>

                {post.summary && (
                  <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                    {post.summary}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                      <AvatarImage src={post.author?.avatar ? resolveUploadUrl(post.author.avatar) : undefined} alt={post.author?.nickname || post.author?.username || '匿名'} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-indigo-400 text-white font-semibold text-sm">
                        {(post.author?.nickname || post.author?.username || '匿').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-foreground text-sm">{post.author?.nickname || post.author?.username || '匿名'}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateSafe(post.created_at, 'short')} 发布
                      </div>
                    </div>
                  </div>
                  <Separator orientation="vertical" className="h-7 hidden sm:block" />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="stat-badge">
                      <Eye className="w-3.5 h-3.5" />
                      {post.view_count}
                    </span>
                    {enableReadingTime && (
                      <span className="stat-badge">
                        <Clock className="w-3.5 h-3.5" />
                        {formatReadingTime(readingTime)}
                      </span>
                    )}
                    <span className="stat-badge">
                      <FileText className="w-3.5 h-3.5" />
                      {formatWordCount(wordCount)}
                    </span>
                    <span className="stat-badge">
                      <Heart className="w-3.5 h-3.5" />
                      {post.like_count}
                    </span>
                    <span className="stat-badge">
                      <MessageCircle className="w-3.5 h-3.5" />
                      {post.comment_count}
                    </span>
                  </div>
                </div>

                <Separator className="my-6" />

                <ArticleContent content={post.content} />
              </div>
            </article>

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="joe-card p-5 mt-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                    <Tag className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">标签</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Link key={tag.id} href={`/tag/${tag.slug}`}>
                      <Badge variant="secondary" className="tag-pill border-0 cursor-pointer">
                        #{tag.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Share + Like/Favorite */}
            <div className="joe-card p-5 mt-5">
              <SocialShareButtons
                title={post.title}
                url={postUrl}
                postId={post.id}
                summary={post.summary}
                image={post.cover_image ? getPosterImageUrl(resolveUploadUrl(post.cover_image)) : undefined}
                siteName={siteConfig?.site_name || undefined}
                siteLogo={siteConfig?.site_logo ? getPosterImageUrl(resolveUploadUrl(siteConfig.site_logo)) : undefined}
                siteDescription={siteConfig?.site_description || undefined}
              />
              <Separator className="my-4" />
              <LikeFavoriteButtons postId={post.id} />
            </div>

            {/* Donation */}
            <div className="joe-card p-5 mt-5 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">如果这篇文章对你有帮助，欢迎请作者喝杯咖啡 ☕</p>
              <DonationButton authorId={post.author_id} postId={post.id} />
            </div>

            {/* Related Posts */}
            <div className="mt-8">
              <RelatedPosts postId={post.id} />
            </div>

            {/* Comments: 全局允许评论 且 文章允许评论 时显示 */}
            {allowCommentGlobal && post.allow_comment && (
              <div className="mt-8 mb-8">
                <CommentSection
                  postId={post.id}
                  enableCaptchaComment={siteConfig?.enable_captcha_comment === 'true'}
                  commentNeedAudit={siteConfig?.comment_need_audit !== 'false'}
                />
              </div>
            )}
          </div>

          {/* ─── Sidebar ─── */}
          <PostSidebar
            content={post.content}
            hasCover={false}
            hotPosts={popularPosts.map((p) => ({ id: p.id, title: p.title, view_count: p.view_count }))}
            enableToc={enableToc}
          />

        </div>
      </div>

      <MobileArticleBar
        postId={post.id}
        content={post.content}
        url={postUrl}
        title={post.title}
      />

      <Footer />
    </div>
  )
}
