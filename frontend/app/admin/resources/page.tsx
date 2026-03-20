'use client'

import { useEffect, useState, useCallback } from 'react'
import { Resource } from '@/lib/types'
import {
  getResources,
  createResource,
  updateResource,
  deleteResource,
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
import { Plus, MoreVertical, Pencil, Trash2, BookOpen, Star, ExternalLink } from 'lucide-react'

const CATEGORY_OPTIONS = [
  { value: 'book', label: '书籍' },
  { value: 'tool', label: '工具' },
  { value: 'website', label: '网站' },
  { value: 'course', label: '课程' },
]

const CATEGORY_COLORS: Record<string, string> = {
  book: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  tool: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  website: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  course: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

export default function ResourcesAdminPage() {
  const [list, setList] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Resource | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [isRecommended, setIsRecommended] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const params: { category?: string } = {}
      if (filterCategory) params.category = filterCategory
      const data = await getResources(params)
      setList(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取资源失败')
    } finally {
      setLoading(false)
    }
  }, [showToast, filterCategory])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const payload = {
      title: (form.elements.namedItem('title') as HTMLInputElement).value,
      description: (form.elements.namedItem('description') as HTMLTextAreaElement).value,
      url: (form.elements.namedItem('url') as HTMLInputElement).value,
      cover_image: (form.elements.namedItem('cover_image') as HTMLInputElement).value || undefined,
      category: (form.elements.namedItem('category') as HTMLSelectElement).value as Resource['category'],
      tags: (form.elements.namedItem('tags') as HTMLInputElement).value,
      rating: Number((form.elements.namedItem('rating') as HTMLInputElement).value) || 0,
      is_recommended: isRecommended,
      sort_order: Number((form.elements.namedItem('sort_order') as HTMLInputElement).value) || 0,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateResource(editing.id, payload)
        showToast('更新成功', 'success')
      } else {
        await createResource(payload)
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
    if (!confirm('确定删除该资源？')) return
    try {
      await deleteResource(id)
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
          <h1 className="text-2xl font-bold tracking-tight">资源管理</h1>
          <p className="text-muted-foreground">管理书单、工具、网站、课程等推荐资源</p>
        </div>
        <Button type="button" onClick={() => { setEditing(null); setIsRecommended(false); setShowForm(!showForm) }}>
          {showForm ? '取消' : <><Plus className="mr-2 h-4 w-4" />添加资源</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">标题</Label>
                  <Input id="title" name="title" defaultValue={editing?.title} placeholder="资源名称" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="url">链接</Label>
                  <Input id="url" name="url" defaultValue={editing?.url} placeholder="https://..." required className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="description">描述</Label>
                <Textarea id="description" name="description" defaultValue={editing?.description} placeholder="简要描述" rows={3} className="mt-1" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="category">分类</Label>
                  <select id="category" name="category" defaultValue={editing?.category || 'book'} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="rating">评分 (0-5)</Label>
                  <Input id="rating" name="rating" type="number" min={0} max={5} step={0.5} defaultValue={editing?.rating || 0} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="sort_order">排序</Label>
                  <Input id="sort_order" name="sort_order" type="number" defaultValue={editing?.sort_order || 0} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cover_image">封面图片 URL</Label>
                  <Input id="cover_image" name="cover_image" defaultValue={editing?.cover_image} placeholder="可选" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="tags">标签 (逗号分隔)</Label>
                  <Input id="tags" name="tags" defaultValue={editing?.tags} placeholder="Go, 编程, 后端" className="mt-1" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="is_recommended" checked={isRecommended} onCheckedChange={setIsRecommended} />
                <Label htmlFor="is_recommended">推荐资源</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? '提交中...' : (editing ? '更新' : '创建')}</Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>取消</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant={filterCategory === '' ? 'default' : 'outline'} size="sm" onClick={() => setFilterCategory('')}>全部</Button>
        {CATEGORY_OPTIONS.map(o => (
          <Button key={o.value} variant={filterCategory === o.value ? 'default' : 'outline'} size="sm" onClick={() => setFilterCategory(o.value)}>
            {o.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>资源</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>评分</TableHead>
                <TableHead>推荐</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <BookOpen className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无资源</p>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5">
                        <ExternalLink className="h-3 w-3" />链接
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={CATEGORY_COLORS[item.category] || ''}>
                        {CATEGORY_OPTIONS.find(o => o.value === item.category)?.label || item.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <span>{item.rating}</span>
                      </div>
                    </TableCell>
                    <TableCell>{item.is_recommended ? <Badge>推荐</Badge> : '-'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(item); setIsRecommended(item.is_recommended ?? false); setShowForm(true) }}>
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
