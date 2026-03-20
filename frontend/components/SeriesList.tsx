'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, Eye, ChevronRight } from 'lucide-react'
import { getSeriesList } from '@/lib/api'
import { resolveUploadUrl } from '@/lib/utils'

interface Series {
  id: number
  title: string
  slug: string
  description: string
  cover_image?: string
  author_id: number
  author?: { username: string; avatar?: string }
  post_count: number
  view_count: number
  status: 'draft' | 'published'
  created_at: string
}

export default function SeriesList() {
  const [series, setSeries] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSeries()
  }, [])

  const fetchSeries = async () => {
    try {
      const data = await getSeriesList()
      setSeries(data as unknown as Series[])
    } catch (error) {
      console.error('获取合集失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-gray-200 dark:bg-gray-700 h-48 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {series.map((item) => (
        <Link
          key={item.id}
          href={`/series/${item.slug}`}
          className="group bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1"
        >
          {/* 封面 */}
          <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600">
            {item.cover_image ? (
              <Image
                src={resolveUploadUrl(item.cover_image)}
                alt={item.title}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpen className="w-16 h-16 text-white opacity-50" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
              <h3 className="text-white font-bold text-lg line-clamp-1">
                {item.title}
              </h3>
            </div>
          </div>

          {/* 内容 */}
          <div className="p-4">
            <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mb-3">
              {item.description}
            </p>

            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {item.post_count} 篇
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {item.view_count.toLocaleString()}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
