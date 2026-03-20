'use client'

import { useEffect, useState, useCallback } from 'react'
import { Changelog } from '@/lib/types'
import {
  getChangelogs,
  createChangelog,
  updateChangelog,
  deleteChangelog,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import MarkdownEditor from '@/components/MarkdownEditor'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Pencil, Trash2, History } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'release', label: '发布' },
  { value: 'feature', label: '新功能' },
  { value: 'fix', label: '修复' },
  { value: 'improvement', label: '改进' },
]

const TYPE_COLORS: Record<string, string> = {
  release: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  feature: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  fix: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  improvement: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
}

export default function ChangelogsAdminPage() {
  const [list, setList] = useState<Changelog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Changelog | null>(null)
  const [isPublished, setIsPublished] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [changelogContent, setChangelogContent] = useState('')
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getChangelogs()
      setList(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取更新日志失败')
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
      version: (form.elements.namedItem('version') as HTMLInputElement).value,
      title: (form.elements.namedItem('title') as HTMLInputElement).value,
      content: changelogContent,
      type: (form.elements.namedItem('type') as HTMLSelectElement).value as Changelog['type'],
      published_at: (form.elements.namedItem('published_at') as HTMLInputElement).value || new Date().toISOString(),
      is_published: isPublished,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateChangelog(editing.id, payload)
        showToast('更新成功', 'success')
      } else {
        await createChangelog(payload)
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
    if (!confirm('确定删除该更新日志？')) return
    try {
      await deleteChangelog(id)
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
          <h1 className="text-2xl font-bold tracking-tight">更新日志</h1>
          <p className="text-muted-foreground">管理博客版本更新记录与变更说明</p>
        </div>
        <Button type="button" onClick={() => { setEditing(null); setIsPublished(true); setChangelogContent(''); setShowForm(!showForm) }}>
          {showForm ? '取消' : <><Plus className="mr-2 h-4 w-4" />新建日志</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="version">版本号</Label>
                  <Input id="version" name="version" defaultValue={editing?.version} placeholder="v1.0.0" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="title">标题</Label>
                  <Input id="title" name="title" defaultValue={editing?.title} placeholder="更新标题" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="type">类型</Label>
                  <select id="type" name="type" defaultValue={editing?.type || 'release'} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>内容 (支持 Markdown)</Label>
                <div className="mt-1">
                  <MarkdownEditor
                    value={changelogContent}
                    onChange={setChangelogContent}
                    placeholder="更新内容详情..."
                    rows={6}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="published_at">发布日期</Label>
                  <Input id="published_at" name="published_at" type="date" defaultValue={editing?.published_at?.split('T')[0] || new Date().toISOString().split('T')[0]} className="mt-1" />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch id="is_published" checked={isPublished} onCheckedChange={setIsPublished} />
                  <Label htmlFor="is_published">立即发布</Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? '提交中...' : (editing ? '更新' : '创建')}</Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>取消</Button>
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
                <TableHead>版本</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>发布日期</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <History className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无更新日志</p>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono font-semibold">{item.version}</TableCell>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={TYPE_COLORS[item.type] || ''}>
                        {TYPE_OPTIONS.find(o => o.value === item.type)?.label || item.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.is_published
                        ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">已发布</Badge>
                        : <Badge variant="secondary">草稿</Badge>
                      }
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.published_at ? new Date(item.published_at).toLocaleDateString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(item); setIsPublished(item.is_published ?? true); setChangelogContent(item.content || ''); setShowForm(true) }}>
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
