'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Star, ExternalLink, Book, Code, Globe, Video } from 'lucide-react'
import { getResources } from '@/lib/api'
import { resolveUploadUrl } from '@/lib/utils'

interface Resource {
  id: number
  title: string
  description: string
  url: string
  cover_image?: string
  category: 'book' | 'tool' | 'website' | 'course'
  tags: string
  rating: number
  is_recommended: boolean
  sort_order: number
  created_at: string
}

const categoryIcons = {
  book: Book,
  tool: Code,
  website: Globe,
  course: Video,
}

const categoryLabels = {
  book: '书籍',
  tool: '工具',
  website: '网站',
  course: '课程',
}

export default function ResourceList() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')

  useEffect(() => {
    fetchResources()
  }, [])

  const fetchResources = async () => {
    try {
      const data = await getResources()
      setResources(data as unknown as Resource[])
    } catch (error) {
      console.error('获取资源失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredResources =
    activeCategory === 'all'
      ? resources
      : resources.filter((r) => r.category === activeCategory)

  const categories = ['all', ...new Set(resources.map((r) => r.category))]

  if (loading) {
    return (
      <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-gray-200 dark:bg-gray-700 h-64 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {cat === 'all' ? '全部' : categoryLabels[cat as keyof typeof categoryLabels] || cat}
          </button>
        ))}
      </div>

      {/* 资源列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredResources.map((resource) => {
          const Icon = categoryIcons[resource.category] || Book
          return (
            <div
              key={resource.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow group"
            >
              {/* 封面图 */}
              {resource.cover_image ? (
                <div className="aspect-video relative overflow-hidden">
                  <Image
                    src={resolveUploadUrl(resource.cover_image)}
                    alt={resource.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {resource.is_recommended && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                      推荐
                    </span>
                  )}
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Icon className="w-16 h-16 text-white opacity-50" />
                </div>
              )}

              <div className="p-4">
                {/* 标题 */}
                <h3 className="font-bold text-lg mb-2 line-clamp-1 dark:text-white">
                  {resource.title}
                </h3>

                {/* 描述 */}
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                  {resource.description}
                </p>

                {/* 标签 */}
                {resource.tags && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {resource.tags.split(',').map((tag, i) => (
                      <span
                        key={i}
                        className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs px-2 py-1 rounded"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}

                {/* 底部信息 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < resource.rating
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    访问
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredResources.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          暂无资源
        </div>
      )}
    </div>
  )
}
