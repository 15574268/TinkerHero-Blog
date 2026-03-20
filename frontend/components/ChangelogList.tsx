'use client'

import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, AlertCircle, Zap, Wrench } from 'lucide-react'
import { getChangelogs } from '@/lib/api'

interface Changelog {
  id: number
  version: string
  title: string
  content: string
  type: 'release' | 'feature' | 'fix' | 'improvement'
  published_at: string
  is_published: boolean
  created_at: string
}

const typeConfig = {
  release: {
    label: '正式发布',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    icon: CheckCircle,
  },
  feature: {
    label: '新功能',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    icon: Zap,
  },
  fix: {
    label: 'Bug修复',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    icon: AlertCircle,
  },
  improvement: {
    label: '优化改进',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    icon: Wrench,
  },
}

export default function ChangelogList() {
  const [changelogs, setChangelogs] = useState<Changelog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    fetchChangelogs()
  }, [])

  const fetchChangelogs = async () => {
    try {
      const data = await getChangelogs()
      setChangelogs(data as unknown as Changelog[])
    } catch (error) {
      console.error('获取更新日志失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 时间线 */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-6">
        {changelogs.map((log) => {
          const config = typeConfig[log.type] || typeConfig.release
          const Icon = config.icon
          const isExpanded = expandedId === log.id

          return (
            <div key={log.id} className="relative pl-10">
              {/* 时间线节点 */}
              <div
                className={`absolute left-2.5 w-3 h-3 rounded-full ${
                  log.type === 'release'
                    ? 'bg-green-500'
                    : log.type === 'feature'
                    ? 'bg-blue-500'
                    : log.type === 'fix'
                    ? 'bg-red-500'
                    : 'bg-purple-500'
                } ring-4 ring-white dark:ring-gray-900`}
              />

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow">
                {/* 头部 */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold dark:text-white">
                        v{log.version}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}
                      >
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {log.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
                    <Calendar className="w-4 h-4" />
                    {formatDate(log.published_at)}
                  </div>
                </div>

                {/* 内容 */}
                <div
                  className={`text-gray-600 dark:text-gray-400 text-sm ${
                    isExpanded ? '' : 'line-clamp-3'
                  }`}
                >
                  <div className="prose dark:prose-invert prose-sm max-w-none">
                    {log.content.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>

                {/* 展开/收起按钮 */}
                {log.content.length > 150 && (
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : log.id)
                    }
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    {isExpanded ? '收起' : '展开全部'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {changelogs.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          暂无更新日志
        </div>
      )}
    </div>
  )
}
