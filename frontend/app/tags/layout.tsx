import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '标签',
  description: '按标签浏览所有博客文章',
}

export default function TagsLayout({ children }: { children: React.ReactNode }) {
  return children
}
