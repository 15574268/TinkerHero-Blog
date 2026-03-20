'use client'

import { useEffect, useState, useCallback } from 'react'
import { Page } from '@/lib/types'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Plus, X, Pencil, Trash2, FileText, MoreHorizontal } from 'lucide-react'

export default function PagesManagement() {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPage, setEditingPage] = useState<Page | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pageContent, setPageContent] = useState('')
  const { showToast } = useToast()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'

  const fetchPages = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/pages`)
      if (!response.ok) throw new Error('获取页面失败')
      const result = await response.json()
      const data = Array.isArray(result) ? result : (result?.data || [])
      setPages(data)
    } catch (error) {
      handleApiError(error, showToast, '获取页面失败')
    } finally {
      setLoading(false)
    }
  }, [showToast, apiUrl])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      title: formData.get('title') as string,
      slug: formData.get('slug') as string,
      content: pageContent,
      status: formData.get('status') as 'draft' | 'published',
    }

    setSubmitting(true)
    try {
      const url = editingPage
        ? `${apiUrl}/admin/pages/${editingPage.id}`
        : `${apiUrl}/admin/pages`
      const response = await fetch(url, {
        method: editingPage ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || '操作失败')
      }
      showToast(editingPage ? '更新成功' : '创建成功', 'success')
      setShowForm(false)
      setEditingPage(null)
      fetchPages()
    } catch (error) {
      handleApiError(error, showToast, editingPage ? '更新失败' : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个页面吗？')) return

    try {
      const response = await fetch(`${apiUrl}/admin/pages/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('删除失败')
      showToast('删除成功', 'success')
      fetchPages()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const handleEdit = (page: Page) => {
    setEditingPage(page)
    setPageContent(page.content || '')
    setShowForm(true)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Card><CardContent className="p-0">{[...Array(3)].map((_, i) => <div key={i} className="flex gap-4 p-4 border-b"><Skeleton className="h-5 flex-1" /></div>)}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">页面管理</h1>
          <p className="text-muted-foreground">管理独立页面（如关于、友链申请等）</p>
        </div>
        <Button
          onClick={() => {
            setShowForm(!showForm)
            setEditingPage(null)
            if (!showForm) setPageContent('')
          }}
          variant={showForm ? 'outline' : 'default'}
        >
          {showForm ? <><X className="mr-2 h-4 w-4" />取消</> : <><Plus className="mr-2 h-4 w-4" />新建页面</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form key={editingPage?.id || 'new'} onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">页面标题</Label>
                  <Input id="title" name="title" required defaultValue={editingPage?.title || ''} placeholder="关于我们" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL别名</Label>
                  <Input id="slug" name="slug" required defaultValue={editingPage?.slug || ''} placeholder="about" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>页面内容</Label>
                <MarkdownEditor
                  value={pageContent}
                  onChange={setPageContent}
                  placeholder="支持 Markdown 格式..."
                  rows={10}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="status">状态</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={editingPage?.status || 'draft'}
                    className="flex h-9 w-28 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                  </select>
                </div>
                <Button type="submit" disabled={submitting}>{submitting ? '提交中...' : (editingPage ? '更新' : '创建')}</Button>
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
                <TableHead>别名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p>暂无页面</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pages.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell className="font-medium">{page.title}</TableCell>
                    <TableCell className="text-muted-foreground">/{page.slug}</TableCell>
                    <TableCell>
                      <Badge variant={page.status === 'published' ? 'default' : 'secondary'}>
                        {page.status === 'published' ? '已发布' : '草稿'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(page.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(page)}>
                            <Pencil className="mr-2 h-4 w-4" />编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(page.id)} className="text-destructive focus:text-destructive">
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
