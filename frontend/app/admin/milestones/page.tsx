'use client'

import { useEffect, useState, useCallback } from 'react'
import { Milestone } from '@/lib/types'
import {
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Pencil, Trash2, Trophy, CheckCircle2 } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'posts', label: '文章数' },
  { value: 'views', label: '浏览量' },
  { value: 'comments', label: '评论数' },
  { value: 'subscribers', label: '订阅者' },
  { value: 'years', label: '运营年限' },
]

const TYPE_COLORS: Record<string, string> = {
  posts: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  views: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  comments: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  subscribers: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  years: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
}

export default function MilestonesAdminPage() {
  const [list, setList] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Milestone | null>(null)
  const [isAchieved, setIsAchieved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getMilestones()
      setList(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取里程碑失败')
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
      title: (form.elements.namedItem('title') as HTMLInputElement).value,
      description: (form.elements.namedItem('description') as HTMLTextAreaElement).value,
      icon: (form.elements.namedItem('icon') as HTMLInputElement).value,
      type: (form.elements.namedItem('type') as HTMLSelectElement).value as Milestone['type'],
      value: Number((form.elements.namedItem('value') as HTMLInputElement).value) || 0,
      is_achieved: isAchieved,
      achieved_at: (form.elements.namedItem('achieved_at') as HTMLInputElement).value || undefined,
      sort_order: Number((form.elements.namedItem('sort_order') as HTMLInputElement).value) || 0,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateMilestone(editing.id, payload)
        showToast('更新成功', 'success')
      } else {
        await createMilestone(payload)
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
    if (!confirm('确定删除该里程碑？')) return
    try {
      await deleteMilestone(id)
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
          <h1 className="text-2xl font-bold tracking-tight">里程碑管理</h1>
          <p className="text-muted-foreground">设置和追踪博客的成就里程碑</p>
        </div>
        <Button type="button" onClick={() => { setEditing(null); setIsAchieved(false); setShowForm(!showForm) }}>
          {showForm ? '取消' : <><Plus className="mr-2 h-4 w-4" />新建里程碑</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">标题</Label>
                  <Input id="title" name="title" defaultValue={editing?.title} placeholder="里程碑名称" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="icon">图标 (emoji 或图标名)</Label>
                  <Input id="icon" name="icon" defaultValue={editing?.icon} placeholder="🎉" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="description">描述</Label>
                <Textarea id="description" name="description" defaultValue={editing?.description} placeholder="里程碑描述" rows={2} className="mt-1" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="type">类型</Label>
                  <select id="type" name="type" defaultValue={editing?.type || 'posts'} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="value">目标值</Label>
                  <Input id="value" name="value" type="number" defaultValue={editing?.value || 0} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="sort_order">排序</Label>
                  <Input id="sort_order" name="sort_order" type="number" defaultValue={editing?.sort_order || 0} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 pt-2">
                  <Switch id="is_achieved" checked={isAchieved} onCheckedChange={setIsAchieved} />
                  <Label htmlFor="is_achieved">已达成</Label>
                </div>
                <div>
                  <Label htmlFor="achieved_at">达成日期</Label>
                  <Input id="achieved_at" name="achieved_at" type="date" defaultValue={editing?.achieved_at?.split('T')[0]} className="mt-1" />
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
                <TableHead>里程碑</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>目标值</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <Trophy className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无里程碑</p>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{item.icon}</span>
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={TYPE_COLORS[item.type] || ''}>
                        {TYPE_OPTIONS.find(o => o.value === item.type)?.label || item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{item.value.toLocaleString()}</TableCell>
                    <TableCell>
                      {item.is_achieved ? (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm">已达成</span>
                        </div>
                      ) : (
                        <Badge variant="secondary">未达成</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(item); setIsAchieved(item.is_achieved ?? false); setShowForm(true) }}>
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
