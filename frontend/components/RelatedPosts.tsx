'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { fetchRelatedPosts } from '@/lib/api'
import { Post } from '@/lib/types'
import { resolveUploadUrl } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'

interface RelatedPostsProps {
  postId: number
}

const RelatedPosts = React.memo(function RelatedPosts({ postId }: RelatedPostsProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const loadRelatedPosts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchRelatedPosts(postId)
      setPosts(data)
    } catch (error) {
      console.error('加载相关文章失败', error)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    loadRelatedPosts()
  }, [loadRelatedPosts])

  if (loading) {
    return (
      <div className="joe-card p-6">
        <div className="h-5 w-24 rounded bg-muted animate-pulse mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (posts.length === 0) return null

  return (
    <div className="joe-card p-5 md:p-6">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <ArrowRight className="w-4 h-4 text-primary" />
        相关推荐
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/posts/${post.id}`}
            className="group flex gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border/50 transition-all"
          >
            {post.cover_image && (
              <div className="relative w-20 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <Image
                  src={resolveUploadUrl(post.cover_image)}
                  alt={post.title}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                {post.title}
              </h4>
              {post.summary && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{post.summary}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
})

export default RelatedPosts
