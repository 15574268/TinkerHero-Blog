import { redirect } from 'next/navigation'

type PageProps = {
  params: Promise<{ slug: string }>
}

// 兼容自动内链生成的 /tags/:slug 链接，统一跳转到现有的 /tag/:slug 页面
export default async function TagsSlugRedirectPage({ params }: PageProps) {
  const { slug } = await params
  redirect(`/tag/${slug}`)
}

