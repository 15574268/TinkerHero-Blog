'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  fetchDashboardStats,
  fetchCategoryStats,
  fetchMonthlyStats,
  getVisitStats,
  fetchPopularPosts,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FolderOpen,
  TrendingUp,
  FileText,
  Eye,
  MessageSquare,
  Users,
  Calendar,
  Flame,
  CheckCircle,
  FilePen,
} from 'lucide-react'
import type { DashboardStats } from '@/lib/types'
import type { Post } from '@/lib/types'

interface CategoryStat {
  category_name: string
  post_count: number
}

interface VisitStat {
  date: string
  visit_count: number
}

interface MonthlyStat {
  month: string
  post_count: number
}

const VISIT_DAYS_OPTIONS = [
  { value: 7, label: '最近 7 天' },
  { value: 14, label: '最近 14 天' },
  { value: 30, label: '最近 30 天' },
]

export default function StatsPage() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<DashboardStats | null>(null)
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStat[]>([])
  const [visitStats, setVisitStats] = useState<VisitStat[]>([])
  const [visitDays, setVisitDays] = useState(7)
  const [popularPosts, setPopularPosts] = useState<Post[]>([])

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const [dashboard, category, monthly, visits, popular] = await Promise.all([
        fetchDashboardStats(),
        fetchCategoryStats(),
        fetchMonthlyStats(),
        getVisitStats({ days: visitDays }),
        fetchPopularPosts(10),
      ])
      setOverview(dashboard)
      setCategoryStats(Array.isArray(category) ? category : [])
      setMonthlyStats(Array.isArray(monthly) ? monthly : [])
      setVisitStats(Array.isArray(visits) ? visits : [])
      setPopularPosts(Array.isArray(popular) ? popular : [])
    } catch (error) {
      handleApiError(error, showToast, '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [showToast, visitDays])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const maxCategoryCount = Math.max(1, ...categoryStats.map((c) => c.post_count))
  const maxVisitCount = Math.max(1, ...visitStats.map((v) => v.visit_count))
  const maxMonthlyCount = Math.max(1, ...monthlyStats.map((m) => m.post_count))

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }

  const overviewCards = [
    { label: '文章总数', value: overview?.total_posts ?? 0, icon: FileText, color: 'text-blue-600 bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/20' },
    { label: '已发布', value: overview?.published_posts ?? 0, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20' },
    { label: '草稿', value: overview?.draft_posts ?? 0, icon: FilePen, color: 'text-amber-600 bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20' },
    { label: '用户数', value: overview?.total_users ?? 0, icon: Users, color: 'text-purple-600 bg-purple-500/10 dark:bg-purple-500/20 border-purple-500/20' },
    { label: '评论数', value: overview?.total_comments ?? 0, icon: MessageSquare, color: 'text-pink-600 bg-pink-500/10 dark:bg-pink-500/20 border-pink-500/20' },
    { label: '总浏览量', value: overview?.total_views ?? 0, icon: Eye, color: 'text-indigo-600 bg-indigo-500/10 dark:bg-indigo-500/20 border-indigo-500/20' },
    { label: '今日浏览', value: overview?.today_views ?? 0, icon: TrendingUp, color: 'text-rose-600 bg-rose-500/10 dark:bg-rose-500/20 border-rose-500/20' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">统计分析</h1>
        <p className="text-muted-foreground">内容与访问数据概览，支持多维度分析</p>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {overviewCards.map((item) => (
          <Card key={item.label} className="border-border/60 overflow-hidden">
            <CardContent className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${item.color} border mb-2`}>
                <item.icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 文章分类分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-5 w-5" />
              文章分类分布
            </CardTitle>
            <p className="text-xs text-muted-foreground">各分类下已发布文章数量</p>
          </CardHeader>
          <CardContent>
            {categoryStats.length > 0 ? (
              <div className="space-y-4">
                {categoryStats.map((item) => (
                  <div key={item.category_name}>
                    <div className="flex justify-between mb-1.5 text-sm">
                      <span className="font-medium">{item.category_name}</span>
                      <span className="text-muted-foreground tabular-nums">{item.post_count} 篇</span>
                    </div>
                    <Progress
                      value={Math.max(5, (item.post_count / maxCategoryCount) * 100)}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">暂无分类数据</p>
            )}
          </CardContent>
        </Card>

        {/* 访问趋势 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5" />
                访问趋势
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">基于访问日志的每日 PV</p>
            </div>
            <Select value={String(visitDays)} onValueChange={(v) => setVisitDays(Number(v))}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIT_DAYS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {visitStats.length > 0 ? (
              <div className="space-y-3">
                {visitStats.map((item) => (
                  <div key={item.date}>
                    <div className="flex justify-between mb-1 text-sm">
                      <span className="font-medium text-muted-foreground">{item.date}</span>
                      <span className="tabular-nums">{item.visit_count} 次</span>
                    </div>
                    <Progress
                      value={Math.max(5, (item.visit_count / maxVisitCount) * 100)}
                      className="h-1.5"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">暂无访问数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 月度发文趋势 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              月度发文趋势
            </CardTitle>
            <p className="text-xs text-muted-foreground">最近 12 个月已发布文章数</p>
          </CardHeader>
          <CardContent>
            {monthlyStats.length > 0 ? (
              <div className="space-y-3">
                {[...monthlyStats].reverse().map((item) => (
                  <div key={item.month}>
                    <div className="flex justify-between mb-1 text-sm">
                      <span className="font-medium text-muted-foreground">{item.month}</span>
                      <span className="tabular-nums">{item.post_count} 篇</span>
                    </div>
                    <Progress
                      value={Math.max(5, (item.post_count / maxMonthlyCount) * 100)}
                      className="h-1.5"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">暂无月度数据</p>
            )}
          </CardContent>
        </Card>

        {/* 热门文章 TOP10 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-orange-500" />
              热门文章 TOP10
            </CardTitle>
            <p className="text-xs text-muted-foreground">按浏览量排序的已发布文章</p>
          </CardHeader>
          <CardContent>
            {popularPosts.length > 0 ? (
              <ul className="space-y-2">
                {popularPosts.map((post, index) => (
                  <li key={post.id}>
                    <Link
                      href={`/admin/posts/edit/${post.id}`}
                      className="flex items-center gap-2 py-2 rounded-lg hover:bg-muted/60 transition-colors group"
                    >
                      <span
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 ${
                          index < 3
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="flex-1 min-w-0 text-sm truncate group-hover:text-primary">
                        {post.title}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {post.view_count} 次
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">暂无文章数据</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
