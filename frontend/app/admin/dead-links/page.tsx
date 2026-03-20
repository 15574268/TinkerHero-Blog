'use client'

import { useEffect, useState, useCallback } from 'react'
import { DeadLink } from '@/lib/types'
import {
  checkDeadLinks,
  getDeadLinks,
  fixDeadLink,
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
import { LinkIcon, Search, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'

export default function DeadLinksPage() {
  const [links, setLinks] = useState<DeadLink[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [showFixed, setShowFixed] = useState(false)
  const [lastCheckResult, setLastCheckResult] = useState<{ checked: number; found: number } | null>(null)
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getDeadLinks(showFixed ? { is_fixed: true } : { is_fixed: false })
      setLinks(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取死链列表失败')
    } finally {
      setLoading(false)
    }
  }, [showToast, showFixed])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleCheck = async () => {
    setChecking(true)
    try {
      const result = await checkDeadLinks()
      setLastCheckResult(result)
      showToast(`检测完成：检查 ${result.checked} 个链接，发现 ${result.found} 个死链`, result.found > 0 ? 'warning' : 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '死链检测失败')
    } finally {
      setChecking(false)
    }
  }

  const handleFix = async (id: number) => {
    try {
      await fixDeadLink(id)
      showToast('已标记为已修复', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '标记失败')
    }
  }

  const getStatusColor = (code: number) => {
    if (code >= 500) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    if (code >= 400) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  }

  const getSourceLabel = (type: string) => {
    const map: Record<string, string> = { post: '文章', page: '页面', comment: '评论' }
    return map[type] || type
  }

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
          <h1 className="text-2xl font-bold tracking-tight">死链检测</h1>
          <p className="text-muted-foreground">检测博客中的失效链接并进行修复</p>
        </div>
        <Button onClick={handleCheck} disabled={checking}>
          {checking ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />检测中...</>
          ) : (
            <><Search className="mr-2 h-4 w-4" />开始检测</>
          )}
        </Button>
      </div>

      {lastCheckResult && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">检查链接: <strong>{lastCheckResult.checked}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                <span className="text-sm">发现死链: <strong className="text-orange-600 dark:text-orange-400">{lastCheckResult.found}</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant={!showFixed ? 'default' : 'outline'} size="sm" onClick={() => setShowFixed(false)}>
          未修复
        </Button>
        <Button variant={showFixed ? 'default' : 'outline'} size="sm" onClick={() => setShowFixed(true)}>
          已修复
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>链接地址</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>状态码</TableHead>
                <TableHead>错误信息</TableHead>
                <TableHead>检测时间</TableHead>
                {!showFixed && <TableHead>操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showFixed ? 5 : 6} className="h-32 text-center text-muted-foreground">
                    {showFixed ? (
                      <>
                        <CheckCircle2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
                        <p>暂无已修复的死链</p>
                      </>
                    ) : (
                      <>
                        <LinkIcon className="mx-auto h-8 w-8 mb-2 opacity-50" />
                        <p>暂无死链，点击「开始检测」进行扫描</p>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                links.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all max-w-xs inline-block truncate">
                        {item.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getSourceLabel(item.source_type)}</Badge>
                      <span className="text-xs text-muted-foreground ml-1">#{item.source_id}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getStatusColor(item.status_code)}>
                        {item.status_code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{item.error_msg}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(item.checked_at).toLocaleString('zh-CN')}
                    </TableCell>
                    {!showFixed && (
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleFix(item.id)}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />已修复
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
