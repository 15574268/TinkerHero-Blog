'use client'

import { useEffect, useState, useCallback } from 'react'
import { Subscriber } from '@/lib/types'
import { getSubscribers } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
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
import { Mail } from 'lucide-react'

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const { showToast } = useToast()

  const fetchSubscribers = useCallback(async () => {
    try {
      const data = await getSubscribers()
      setSubscribers(data?.data ?? [])
      setTotal(data?.total ?? 0)
    } catch {
      showToast('获取订阅者列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchSubscribers()
  }, [fetchSubscribers])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Card><CardContent className="p-0">{[...Array(5)].map((_, i) => <div key={i} className="flex gap-4 p-4 border-b"><Skeleton className="h-5 flex-1" /></div>)}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">邮件订阅者</h1>
          <p className="text-muted-foreground">共 {total} 位订阅者</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>订阅时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Mail className="h-8 w-8" />
                      <p>暂无订阅者</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                subscribers.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.email}</TableCell>
                    <TableCell>
                      <Badge variant={sub.is_active ? 'default' : 'secondary'}>
                        {sub.is_active ? '活跃' : '已取消'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {sub.created_at ? format(new Date(sub.created_at), 'yyyy-MM-dd HH:mm') : '-'}
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
