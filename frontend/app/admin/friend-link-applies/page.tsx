'use client'

import { useEffect, useState, useCallback } from 'react'
import { FriendLinkApply } from '@/lib/types'
import { getFriendLinkApplies, handleFriendLinkApply, deleteFriendLinkApply } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Link2, Check, X, MoreVertical, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

export default function FriendLinkAppliesPage() {
  const [list, setList] = useState<FriendLinkApply[]>([])
  const [loading, setLoading] = useState(true)
  const [page] = useState(1)
  const [processing, setProcessing] = useState<number | null>(null)
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const res = await getFriendLinkApplies({ page })
      setList(res?.data ?? [])
    } catch (error) {
      handleApiError(error, showToast, '获取申请列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, showToast])

  useEffect(() => {
    setLoading(true)
    fetchList()
  }, [fetchList])

  const handleApprove = async (id: number) => {
    setProcessing(id)
    try {
      await handleFriendLinkApply(id, 'approved')
      showToast('已通过', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '操作失败')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (id: number) => {
    setProcessing(id)
    try {
      await handleFriendLinkApply(id, 'rejected')
      showToast('已拒绝', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '操作失败')
    } finally {
      setProcessing(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该申请记录？')) return
    try {
      await deleteFriendLinkApply(id)
      showToast('已删除', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const statusMap: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
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
          <h1 className="text-2xl font-bold tracking-tight">友链申请</h1>
          <p className="text-muted-foreground">审核用户提交的友链申请</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>站点名称</TableHead>
                <TableHead>链接</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Link2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无申请</p>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] inline-block">
                        {item.url}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.email}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'approved' ? 'default' : item.status === 'rejected' ? 'secondary' : 'outline'}>
                        {statusMap[item.status] ?? item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.created_at ? format(new Date(item.created_at), 'yyyy-MM-dd HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === 'pending' && (
                        <span className="inline-flex gap-1">
                          <Button variant="ghost" size="sm" disabled={processing === item.id} onClick={() => handleApprove(item.id)}>
                            <Check className="h-4 w-4 mr-1" />通过
                          </Button>
                          <Button variant="ghost" size="sm" disabled={processing === item.id} onClick={() => handleReject(item.id)}>
                            <X className="h-4 w-4 mr-1" />拒绝
                          </Button>
                        </span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />删除
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
    </div>
  )
}
