'use client'

import { useEffect, useState, useCallback } from 'react'
import { Post } from '@/lib/types'
import {
  getScheduledPosts,
  cancelSchedule,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Clock, XCircle, ExternalLink, CalendarClock } from 'lucide-react'
import Link from 'next/link'

export default function ScheduledPostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getScheduledPosts({ page })
      if (data && typeof data === 'object') {
        setPosts(Array.isArray(data.data) ? data.data : [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      handleApiError(error, showToast, '获取定时文章失败')
    } finally {
      setLoading(false)
    }
  }, [showToast, page])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleCancel = async (postId: number) => {
    if (!confirm('确定取消该文章的定时发布？')) return
    try {
      await cancelSchedule(postId)
      showToast('已取消定时发布', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '取消失败')
    }
  }

  const getTimeRemaining = (publishedAt: string) => {
    const now = new Date()
    const target = new Date(publishedAt)
    const diff = target.getTime() - now.getTime()
    if (diff <= 0) return '即将发布'
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (days > 0) return `${days}天 ${hours}小时`
    if (hours > 0) return `${hours}小时 ${minutes}分钟`
    return `${minutes}分钟`
  }

  const totalPages = Math.ceil(total / pageSize)

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Card><CardContent className="p-6"><Skeleton className="h-48" /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">定时发布</h1>
          <p className="text-muted-foreground">管理所有待定时发布的文章</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          共 {total} 篇待发布
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文章标题</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>计划发布时间</TableHead>
                <TableHead>倒计时</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <CalendarClock className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无定时发布的文章</p>
                  </TableCell>
                </TableRow>
              ) : (
                posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <div className="font-medium">{post.title}</div>
                      {post.summary && (
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{post.summary}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {post.category ? (
                        <Badge variant="secondary">{post.category.name}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {post.published_at
                          ? new Date(post.published_at).toLocaleString('zh-CN', {
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '-'
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      {post.published_at && (
                        <Badge variant="outline" className="font-mono">
                          {getTimeRemaining(post.published_at)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/posts/edit/${post.id}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />编辑文章
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleCancel(post.id)}>
                            <XCircle className="mr-2 h-4 w-4" />取消定时
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            上一页
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
