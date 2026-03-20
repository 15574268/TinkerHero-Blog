import { redirect } from 'next/navigation'

type PageProps = {
  params: Promise<{ slug: string }>
}

// 兼容自动内链生成的 /categories/:slug 链接，统一跳转到现有的 /category/:slug 页面
export default async function CategoriesSlugRedirectPage({ params }: PageProps) {
  const { slug } = await params
  redirect(`/category/${slug}`)
}

