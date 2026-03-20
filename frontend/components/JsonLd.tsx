/**
 * JSON-LD 结构化数据注入组件
 * 用于提升 SEO，帮助搜索引擎理解页面内容
 */

import { SITE_URL } from '@/lib/constants'

interface WebSiteJsonLdProps {
  siteName: string
  description?: string
}

/** 首页：WebSite + SearchAction */
export function WebSiteJsonLd({ siteName, description }: WebSiteJsonLdProps) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: SITE_URL,
    description: description || '',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

interface BlogPostingJsonLdProps {
  postId: number
  title: string
  description: string
  publishedAt: string
  updatedAt?: string
  authorName: string
  coverImage?: string
  siteName: string
  categoryName?: string
  tags?: string[]
}

interface BlogPostingJsonLdExtraProps extends BlogPostingJsonLdProps {
  publisherLogoUrl?: string
}

/** 文章页：BlogPosting */
export function BlogPostingJsonLd({
  postId,
  title,
  description,
  publishedAt,
  updatedAt,
  authorName,
  coverImage,
  siteName,
  categoryName,
  tags,
  publisherLogoUrl,
}: BlogPostingJsonLdExtraProps) {
  const postUrl = `${SITE_URL}/posts/${postId}`
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url: postUrl,
    datePublished: publishedAt,
    dateModified: updatedAt || publishedAt,
    author: {
      '@type': 'Person',
      name: authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: SITE_URL,
      ...(publisherLogoUrl ? {
        logo: { '@type': 'ImageObject', url: publisherLogoUrl },
      } : {}),
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': postUrl,
    },
    ...(coverImage ? { image: coverImage } : {}),
    ...(categoryName ? { articleSection: categoryName } : {}),
    ...(tags && tags.length > 0 ? { keywords: tags.join(', ') } : {}),
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

interface BreadcrumbItem {
  name: string
  url: string
}

/** 关于页：Person */
export function PersonJsonLd({ name, url, description, image }: {
  name: string
  url?: string
  description?: string
  image?: string
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    url: url || `${SITE_URL}/about`,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    sameAs: [],
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

/** 面包屑：BreadcrumbList */
export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
