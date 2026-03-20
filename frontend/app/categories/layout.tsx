import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '文章分类',
  description: '按分类浏览所有博客文章',
}

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return children
}
