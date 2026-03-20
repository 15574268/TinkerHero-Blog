'use client'

import { useEffect, useState, useCallback } from 'react'
import { Tag } from '@/lib/types'
import { fetchTags as fetchTagsApi, createTag, deleteTag } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, X as XIcon, Tags } from 'lucide-react'

export default function TagsManagement() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  const fetchTags = useCallback(async () => {
    try {
      const data = await fetchTagsApi()
      setTags(data)
    } catch (error) {
      handleApiError(error, showToast, '获取标签失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())

    setSubmitting(true)
    try {
      await createTag(data as Partial<Tag>)
      showToast('创建成功', 'success')
      setShowForm(false)
      fetchTags()
    } catch (error) {
      handleApiError(error, showToast, '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个标签吗？')) return

    try {
      await deleteTag(id)
      showToast('删除成功', 'success')
      fetchTags()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="p-6"><div className="flex flex-wrap gap-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}</div></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">标签管理</h1>
          <p className="text-muted-foreground">管理博客文章标签</p>
        </div>
        <Button type="button" onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'default'}>
          {showForm ? <><XIcon className="mr-2 h-4 w-4" />取消</> : <><Plus className="mr-2 h-4 w-4" />新建标签</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="name">标签名称</Label>
                <Input id="name" name="name" required placeholder="标签名称" />
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
        <CardHeader>
          <CardTitle className="text-base">所有标签</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="px-3 py-1.5 text-sm gap-2">
                {tag.name}
                <button
                  type="button"
                  onClick={() => handleDelete(tag.id)}
                  className="ml-1 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {tags.length === 0 && (
              <div className="flex flex-col items-center gap-2 text-muted-foreground py-8 w-full">
                <Tags className="h-8 w-8" />
                <p>暂无标签</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
