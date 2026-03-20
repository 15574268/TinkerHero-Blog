'use client'

import { useEffect, useState, useCallback } from 'react'
import { IPBlacklist } from '@/lib/types'
import { getIPBlacklist, addToIPBlacklist, removeFromIPBlacklist } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, X, Lock, Trash2 } from 'lucide-react'

export default function IPBlacklistPage() {
  const [list, setList] = useState<IPBlacklist[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getIPBlacklist()
      setList(data?.data ?? [])
    } catch {
      showToast('获取IP黑名单失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const expiredAt = formData.get('expired_at') as string

    const data = {
      ip_address: formData.get('ip_address') as string,
      reason: formData.get('reason') as string,
      expired_at: expiredAt || undefined,
    }

    setSubmitting(true)
    try {
      await addToIPBlacklist(data)
      showToast('添加成功', 'success')
      setShowForm(false)
      fetchList()
    } catch {
      showToast('添加失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要移除此IP吗？')) return

    try {
      await removeFromIPBlacklist(id)
      showToast('移除成功', 'success')
      fetchList()
    } catch {
      showToast('移除失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Card><CardContent className="p-0">{[...Array(4)].map((_, i) => <div key={i} className="flex gap-4 p-4 border-b"><Skeleton className="h-5 flex-1" /></div>)}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IP黑名单管理</h1>
          <p className="text-muted-foreground">封禁恶意或违规IP访问</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'default'}>
          {showForm ? <><X className="mr-2 h-4 w-4" />取消</> : <><Plus className="mr-2 h-4 w-4" />添加IP</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ip_address">IP地址</Label>
                <Input id="ip_address" name="ip_address" required placeholder="192.168.1.1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">封禁原因</Label>
                <Input id="reason" name="reason" placeholder="封禁原因" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expired_at">过期时间（留空永久）</Label>
                <Input id="expired_at" name="expired_at" type="datetime-local" />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? '添加中...' : '添加'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP地址</TableHead>
                <TableHead>原因</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Lock className="h-8 w-8" />
                      <p>暂无黑名单IP</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => {
                  const isExpired = item.expired_at && new Date(item.expired_at) < new Date()
                  const isPermanent = !item.expired_at

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-medium">{item.ip_address}</TableCell>
                      <TableCell className="text-muted-foreground">{item.reason || '-'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={isExpired ? 'secondary' : isPermanent ? 'destructive' : 'default'}
                        >
                          {isExpired ? '已过期' : isPermanent ? '永久' : '临时'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <div>{new Date(item.created_at).toLocaleString('zh-CN')}</div>
                        {item.expired_at && (
                          <div className="text-xs text-muted-foreground/80">
                            过期: {new Date(item.expired_at).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
