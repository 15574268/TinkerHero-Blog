'use client'

import { useEffect, useState, useCallback } from 'react'
import { Announcement } from '@/lib/types'
import {
  getActiveAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import MarkdownEditor from '@/components/MarkdownEditor'
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Plus, MoreVertical, Pencil, Trash2, Megaphone } from 'lucide-react'

export default function AnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [announcementContent, setAnnouncementContent] = useState('')
  const [announcementLevel, setAnnouncementLevel] = useState<'info' | 'warning' | 'success' | 'error'>('info')
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getActiveAnnouncements()
      setList(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取公告失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const payload = {
      title: (form.elements.namedItem('title') as HTMLInputElement)?.value,
      content: announcementContent,
      type: announcementLevel,
      is_active: true,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateAnnouncement(editing.id, payload)
        showToast('更新成功', 'success')
      } else {
        await createAnnouncement(payload)
        showToast('创建成功', 'success')
      }
      setShowForm(false)
      setEditing(null)
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, editing ? '更新失败' : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该公告？')) return
    try {
      await deleteAnnouncement(id)
      showToast('已删除', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
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
          <h1 className="text-2xl font-bold tracking-tight">公告管理</h1>
          <p className="text-muted-foreground">站点顶部公告，支持多级样式</p>
        </div>
        <Button onClick={() => { setEditing(null); setAnnouncementContent(''); setAnnouncementLevel('info'); setShowForm(!showForm); }}>
          {showForm ? '取消' : <><Plus className="mr-2 h-4 w-4" />新建公告</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">标题</Label>
                <Input id="title" name="title" defaultValue={editing?.title} placeholder="公告标题" required className="mt-1" />
              </div>
              <div>
                <Label>内容</Label>
                <div className="mt-1">
                  <MarkdownEditor
                    value={announcementContent}
                    onChange={setAnnouncementContent}
                    placeholder="公告内容"
                    rows={4}
                  />
                </div>
              </div>
              <div>
                <Label>级别</Label>
                <Select value={announcementLevel} onValueChange={(v) => setAnnouncementLevel(v as typeof announcementLevel)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">信息</SelectItem>
                    <SelectItem value="warning">警告</SelectItem>
                    <SelectItem value="success">成功</SelectItem>
                    <SelectItem value="error">错误</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? '提交中...' : (editing ? '更新' : '创建')}</Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>取消</Button>
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
                <TableHead>标题</TableHead>
                <TableHead>级别</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                    <Megaphone className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无公告</p>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{(item as { level?: string }).level || item.type || 'info'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(item); setAnnouncementContent(item.content || ''); setAnnouncementLevel((item.type as typeof announcementLevel) || 'info'); setShowForm(true); }}>
                            <Pencil className="mr-2 h-4 w-4" />编辑
                          </DropdownMenuItem>
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
