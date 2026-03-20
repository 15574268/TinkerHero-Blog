'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Eye,
  Users,
  Clock,
  TrendingUp,
  Monitor,
  Smartphone,
  Tablet,
  Chrome,
  Globe,
} from 'lucide-react'

interface AnalyticsStats {
  total_views: number
  unique_visitors: number
  avg_time_on_page: number
  avg_scroll_depth: number
  bounce_rate: number
  device_stats: { device: string; count: number }[]
  browser_stats: { browser: string; count: number }[]
  os_stats: { os: string; count: number }[]
}

export default function AnalyticsDashboard() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')

  const fetchStats = useCallback(async (signal: AbortSignal) => {
    try {
      const endDate = new Date().toISOString().split('T')[0]
      const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const response = await fetch(
        `/api/v1/analytics/stats?start_date=${startDate}&end_date=${endDate}`,
        { signal }
      )
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('获取统计失败:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    const loadData = async () => {
      await fetchStats(controller.signal)
    }

    if (isMounted) {
      setLoading(true)
      loadData()
    }

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [fetchStats])

  const deviceIcons: Record<string, React.ReactNode> = {
    desktop: <Monitor className="w-5 h-5" />,
    mobile: <Smartphone className="w-5 h-5" />,
    tablet: <Tablet className="w-5 h-5" />,
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-200 dark:bg-gray-700 h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 dark:bg-gray-700 h-64 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}分${secs}秒`
  }

  return (
    <div className="space-y-6">
      {/* 日期选择 */}
      <div className="flex gap-2">
        {['7', '30', '90'].map((days) => (
          <button
            key={days}
            onClick={() => setDateRange(days)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              dateRange === days
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            近 {days} 天
          </button>
        ))}
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">总浏览量</p>
              <p className="text-2xl font-bold dark:text-white">
                {stats.total_views.toLocaleString()}
              </p>
            </div>
            <Eye className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">独立访客</p>
              <p className="text-2xl font-bold dark:text-white">
                {stats.unique_visitors.toLocaleString()}
              </p>
            </div>
            <Users className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">平均停留</p>
              <p className="text-2xl font-bold dark:text-white">
                {formatTime(Math.round(stats.avg_time_on_page))}
              </p>
            </div>
            <Clock className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">跳出率</p>
              <p className="text-2xl font-bold dark:text-white">
                {stats.bounce_rate.toFixed(1)}%
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* 详细统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 设备分布 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-bold mb-4 dark:text-white">设备分布</h3>
          <div className="space-y-3">
            {stats.device_stats.map((item, i) => {
              const total = stats.device_stats.reduce((a, b) => a + b.count, 0)
              const percent = ((item.count / total) * 100).toFixed(1)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      {deviceIcons[item.device] || <Monitor className="w-5 h-5" />}
                      {item.device}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">{percent}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 浏览器分布 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-bold mb-4 dark:text-white">浏览器分布</h3>
          <div className="space-y-3">
            {stats.browser_stats.slice(0, 5).map((item, i) => {
              const total = stats.browser_stats.reduce((a, b) => a + b.count, 0)
              const percent = ((item.count / total) * 100).toFixed(1)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Chrome className="w-4 h-4" />
                      {item.browser}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">{percent}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 操作系统分布 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-bold mb-4 dark:text-white">操作系统</h3>
          <div className="space-y-3">
            {stats.os_stats.slice(0, 5).map((item, i) => {
              const total = stats.os_stats.reduce((a, b) => a + b.count, 0)
              const percent = ((item.count / total) * 100).toFixed(1)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Globe className="w-4 h-4" />
                      {item.os}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">{percent}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
