'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  getBackups,
  createBackup,
  downloadBackup,
  deleteBackup,
  restoreBackup,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Download, Trash2, RotateCcw, Database } from 'lucide-react'

export default function BackupsPage() {
  const [backups, setBackups] = useState<{ filename: string; size: number; created_at?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getBackups()
      setBackups(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取备份列表失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await createBackup('full')
      showToast('备份已创建', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '创建备份失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDownload = (filename: string) => {
    downloadBackup(filename)
    showToast('开始下载', 'success')
  }

  const handleDelete = async (filename: string) => {
    if (!confirm('确定删除该备份？此操作不可恢复。')) return
    try {
      await deleteBackup(filename)
      showToast('已删除', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const handleRestore = async (filename: string) => {
    if (!confirm('确定从该备份恢复？当前数据可能被覆盖。')) return
    setRestoring(filename)
    try {
      await restoreBackup(filename)
      showToast('恢复请求已提交', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '恢复失败')
    } finally {
      setRestoring(null)
    }
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
          <h1 className="text-2xl font-bold tracking-tight">数据备份</h1>
          <p className="text-muted-foreground">创建与恢复全量备份</p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          <Plus className="mr-2 h-4 w-4" />{creating ? '创建中...' : '创建备份'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文件名</TableHead>
                <TableHead>大小</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                    <Database className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无备份</p>
                  </TableCell>
                </TableRow>
              ) : (
                backups.map((b) => (
                  <TableRow key={b.filename}>
                    <TableCell className="font-medium">{b.filename}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof b.size === 'number' ? `${(b.size / 1024).toFixed(1)} KB` : '-'}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(b.filename)}>
                        <Download className="h-4 w-4 mr-1" />下载
                      </Button>
                      <Button variant="ghost" size="sm" disabled={restoring === b.filename} onClick={() => handleRestore(b.filename)}>
                        <RotateCcw className="h-4 w-4 mr-1" />{restoring === b.filename ? '恢复中...' : '恢复'}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(b.filename)}>
                        <Trash2 className="h-4 w-4 mr-1" />删除
                      </Button>
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
