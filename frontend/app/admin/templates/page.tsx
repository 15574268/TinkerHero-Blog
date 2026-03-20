'use client'

import { useEffect, useState, useCallback } from 'react'
import { PostTemplate } from '@/lib/types'
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
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
import { Plus, MoreVertical, Pencil, Trash2, FileText, Copy, Eye } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

const CATEGORY_OPTIONS = [
  { value: 'tutorial', label: '教程' },
  { value: 'review', label: '评测' },
  { value: 'news', label: '资讯' },
  { value: 'tech', label: '技术' },
]

const CATEGORY_COLORS: Record<string, string> = {
  tutorial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  review: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  news: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  tech: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

export default function TemplatesAdminPage() {
  const [list, setList] = useState<PostTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PostTemplate | null>(null)
  const [previewItem, setPreviewItem] = useState<PostTemplate | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [templateContent, setTemplateContent] = useState('')
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getTemplates()
      setList(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取模板失败')
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
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      description: (form.elements.namedItem('description') as HTMLInputElement).value,
      category: (form.elements.namedItem('category') as HTMLSelectElement).value as PostTemplate['category'],
      content: templateContent,
      is_default: isDefault,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateTemplate(editing.id, payload)
        showToast('更新成功', 'success')
      } else {
        await createTemplate(payload)
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
    if (!confirm('确定删除该模板？')) return
    try {
      await deleteTemplate(id)
      showToast('已删除', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content)
    showToast('模板内容已复制', 'success')
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
          <h1 className="text-2xl font-bold tracking-tight">文章模板</h1>
          <p className="text-muted-foreground">预定义文章模板，快速创建标准化内容</p>
        </div>
        <Button type="button" onClick={() => { setEditing(null); setIsDefault(false); setTemplateContent(''); setShowForm(!showForm) }}>
          {showForm ? '取消' : <><Plus className="mr-2 h-4 w-4" />新建模板</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">模板名称</Label>
                  <Input id="name" name="name" defaultValue={editing?.name} placeholder="模板名称" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="category">分类</Label>
                  <select id="category" name="category" defaultValue={editing?.category || 'tech'} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="description">描述</Label>
                <Input id="description" name="description" defaultValue={editing?.description} placeholder="简要描述模板用途" className="mt-1" />
              </div>
              <div>
                <Label>模板内容 (Markdown)</Label>
                <div className="mt-1">
                  <MarkdownEditor
                    value={templateContent}
                    onChange={setTemplateContent}
                    placeholder="# 标题&#10;&#10;## 简介&#10;&#10;正文内容..."
                    rows={12}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="is_default" checked={isDefault} onCheckedChange={setIsDefault} />
                <Label htmlFor="is_default">设为默认模板</Label>
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
                <TableHead>模板名称</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>默认</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无模板</p>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={CATEGORY_COLORS[item.category] || ''}>
                        {CATEGORY_OPTIONS.find(o => o.value === item.category)?.label || item.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.is_default ? <Badge>默认</Badge> : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(item.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreviewItem(item)}>
                            <Eye className="mr-2 h-4 w-4" />预览
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyContent(item.content)}>
                            <Copy className="mr-2 h-4 w-4" />复制内容
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditing(item); setIsDefault(item.is_default ?? false); setTemplateContent(item.content || ''); setShowForm(true) }}>
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

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 bg-muted rounded-lg">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {previewItem?.content || ''}
            </ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
