import { fetchCategories, fetchTags, fetchPopularPosts } from '@/lib/api'
import HomeSidebar from '@/components/HomeSidebar'
import type { Post } from '@/lib/types'

interface Props {
  totalPosts: number
  posts: Pick<Post, 'id' | 'title' | 'view_count' | 'created_at'>[]
  className?: string
}

/**
 * Server Component：独立获取侧边栏所需的分类、标签、热门文章数据，
 * 使首页主内容列表无需等待这三个接口即可开始流式渲染。
 * 在 app/page.tsx 中用 <Suspense> 包裹后即可实现流式传输。
 */
export default async function HomeSidebarLoader({ totalPosts, posts, className }: Props) {
  const [categories, tags, hotPosts] = await Promise.all([
    fetchCategories().catch(() => []),
    fetchTags().catch(() => []),
    fetchPopularPosts(6).catch(() => []),
  ])

  return (
    <HomeSidebar
      totalPosts={totalPosts}
      categories={categories}
      tags={tags}
      posts={posts}
      hotPosts={hotPosts}
      className={className}
    />
  )
}
