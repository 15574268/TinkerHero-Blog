'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Post, Category } from '@/lib/types'
import {
  fetchAdminPosts,
  deletePost,
  batchDeletePosts,
  batchUpdatePostStatus,
  batchMoveCategory,
  fetchCategories,
  importPosts,
  exportPosts,
} from '@/lib/api'
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
import { Plus, MoreHorizontal, Pencil, Trash2, FileText, Upload, Download, CalendarClock, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import Pagination from '@/components/Pagination'

const PAGE_SIZE = 20

export default function PostsManagement() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'scheduled'>('all')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [, setMovingCategoryId] = useState<number | null>(null)
  const { showToast } = useToast()

  const fetchPosts = useCallback(async (page: number) => {
    try {
      const result = await fetchAdminPosts({
        page,
        page_size: PAGE_SIZE,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setPosts(result?.data || [])
      setTotal(result?.total || 0)
      setSelectedIds([])
    } catch (error) {
      handleApiError(error, showToast, '获取文章失败')
    } finally {
      setLoading(false)
    }
  }, [showToast, statusFilter])

  useEffect(() => {
    fetchPosts(currentPage)
  }, [fetchPosts, currentPage])

  useEffect(() => {
    // 预加载分类用于批量移动
    fetchCategories()
      .then(setCategories)
      .catch((error) => {
        console.error('加载分类失败', error)
      })
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这篇文章吗？')) return

    try {
      await deletePost(id)
      showToast('删除成功', 'success')
      fetchPosts(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(posts.map((p) => p.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleToggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((v) => v !== id)
    )
  }

  const hasSelection = selectedIds.length > 0

  const handleBatchDelete = async () => {
    if (!hasSelection) {
      showToast('请先选择文章', 'info')
      return
    }
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 篇文章吗？`)) return
    try {
      await batchDeletePosts(selectedIds)
      showToast('批量删除成功', 'success')
      fetchPosts(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '批量删除失败')
    }
  }

  const handleBatchStatusChange = async (status: 'draft' | 'published') => {
    if (!hasSelection) {
      showToast('请先选择文章', 'info')
      return
    }
    try {
      await batchUpdatePostStatus(selectedIds, status)
      showToast('批量更新状态成功', 'success')
      fetchPosts(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '批量更新状态失败')
    }
  }

  const handleBatchMoveCategory = async (categoryId: number | null) => {
    if (!hasSelection) {
      showToast('请先选择文章', 'info')
      return
    }
    try {
      await batchMoveCategory(selectedIds, categoryId)
      showToast('批量移动分类成功', 'success')
      setMovingCategoryId(categoryId)
      fetchPosts(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '批量移动分类失败')
    }
  }

  const handleImport = async (file: File | null) => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await importPosts(formData)
      showToast(`导入完成：成功 ${result.success} 篇，失败 ${result.failed} 篇`, 'success')
      fetchPosts(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '导入失败')
    }
  }

  const handleExport = async (format: string) => {
    try {
      await exportPosts(format)
      showToast('导出任务已开始，如有下载会自动弹出', 'success')
    } catch (error) {
      handleApiError(error, showToast, '导出失败')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Card>
          <CardContent className="p-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">文章管理</h1>
          <p className="text-sm text-muted-foreground">
            管理和发布您的博客文章，支持批量操作与导入导出
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/scheduled-posts">
                <CalendarClock className="mr-2 h-4 w-4" />
                定时发布
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  导入 / 导出
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>导入文章</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    const input = document.getElementById('post-import-input') as HTMLInputElement | null
                    input?.click()
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  从文件导入
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>导出文章</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExport('markdown')}>
                  导出为 Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>
                  导出为 JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild>
              <Link href="/admin/posts/create">
                <Plus className="mr-2 h-4 w-4" />
                新建文章
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">状态筛选:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {{
                    all: '全部',
                    published: '已发布',
                    draft: '草稿',
                    scheduled: '定时发布',
                  }[statusFilter]}
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setStatusFilter('all')}>全部</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('published')}>已发布</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('draft')}>草稿</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatusFilter('scheduled')}>定时发布</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <input
        id="post-import-input"
        type="file"
        accept=".zip,.json,.md,.markdown"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null
          void handleImport(file)
          // 重置 input，便于连续选择同一文件
          e.target.value = ''
        }}
      />

      {hasSelection && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3 px-4 text-sm">
            <span className="text-muted-foreground">
              已选中 {selectedIds.length} 篇文章
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleBatchDelete}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                批量删除
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchStatusChange('published')}
              >
                批量设为已发布
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchStatusChange('draft')}
              >
                批量设为草稿
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    移动到分类
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleBatchMoveCategory(null)}>
                    不设置分类
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {categories.map((cat) => (
                    <DropdownMenuItem
                      key={cat.id}
                      onClick={() => handleBatchMoveCategory(cat.id)}
                    >
                      {cat.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="全选"
                    checked={
                      posts.length > 0 && selectedIds.length === posts.length
                        ? true
                        : selectedIds.length > 0
                        ? "indeterminate"
                        : false
                    }
                    onCheckedChange={(value) => handleToggleSelectAll(Boolean(value))}
                  />
                </TableHead>
                <TableHead>标题</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>浏览</TableHead>
                <TableHead>评论</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => {
                const checked = selectedIds.includes(post.id)
                return (
                <TableRow key={post.id} data-selected={checked}>
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        handleToggleSelectOne(post.id, Boolean(value))
                      }
                      aria-label="选择文章"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{post.title}</div>
                    <div className="text-sm text-muted-foreground">{post.author?.username}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={post.status === 'published' ? 'default' : 'secondary'}>
                      {post.status === 'published' ? '已发布' : '草稿'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{post.view_count}</TableCell>
                  <TableCell className="text-muted-foreground">{post.comment_count}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(post.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/posts/edit/${post.id}`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            编辑
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(post.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )})}
              {posts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p>暂无文章</p>
                      <Button variant="link" asChild>
                        <Link href="/admin/posts/create">立即创建</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(total / PAGE_SIZE)}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
