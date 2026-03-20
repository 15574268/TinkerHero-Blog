'use client'

import { useEffect, useState, useCallback } from 'react'
import { Category } from '@/lib/types'
import { fetchCategories as fetchCategoriesApi, createCategory, deleteCategory } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Trash2, X, FolderOpen } from 'lucide-react'

export default function CategoriesManagement() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  const fetchCategories = useCallback(async () => {
    try {
      const data = await fetchCategoriesApi()
      setCategories(data)
    } catch (error) {
      handleApiError(error, showToast, '获取分类失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())

    setSubmitting(true)
    try {
      await createCategory(data as Partial<Category>)
      showToast('创建成功', 'success')
      setShowForm(false)
      fetchCategories()
    } catch (error) {
      handleApiError(error, showToast, '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个分类吗？')) return

    try {
      await deleteCategory(id)
      showToast('删除成功', 'success')
      fetchCategories()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Card><CardContent className="p-6"><div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">分类管理</h1>
          <p className="text-muted-foreground">管理博客文章分类</p>
        </div>
        <Button type="button" onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'default'}>
          {showForm ? <><X className="mr-2 h-4 w-4" />取消</> : <><Plus className="mr-2 h-4 w-4" />新建分类</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="name">分类名称</Label>
                <Input id="name" name="name" required placeholder="分类名称" />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="slug">URL别名</Label>
                <Input id="slug" name="slug" required placeholder="URL别名" />
              </div>
              <Button type="submit" disabled={submitting}>{submitting ? '创建中...' : '创建'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>别名</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-muted-foreground">{category.slug}</TableCell>
                  <TableCell className="text-muted-foreground">{category.description || '-'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(category.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FolderOpen className="h-8 w-8" />
                      <p>暂无分类</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
