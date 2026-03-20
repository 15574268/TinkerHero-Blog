'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Series, SeriesPost, Post } from '@/lib/types'
import {
  getAdminSeriesList,
  getAdminSeriesDetail,
  createSeries,
  updateSeries,
  deleteSeries,
  addPostToSeries,
  removePostFromSeries,
  reorderSeriesPosts,
  fetchAdminPosts,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, MoreVertical, Pencil, Trash2, BookOpen, ExternalLink, ListOrdered, ChevronUp, ChevronDown, FileText } from 'lucide-react'

export default function SeriesAdminPage() {
  const [list, setList] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Series | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [managingSeriesId, setManagingSeriesId] = useState<number | null>(null)
  const [detail, setDetail] = useState<{ series: Series; posts: SeriesPost[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [addPostOpen, setAddPostOpen] = useState(false)
  const [candidatePosts, setCandidatePosts] = useState<Post[]>([])
  const [candidateLoading, setCandidateLoading] = useState(false)
  const { showToast } = useToast()

  const fetchList = useCallback(async () => {
    try {
      const data = await getAdminSeriesList()
      setList(Array.isArray(data) ? data : [])
    } catch (error) {
      handleApiError(error, showToast, '获取合集列表失败')
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
    const title = (form.elements.namedItem('title') as HTMLInputElement)?.value
    const slugInput = (form.elements.namedItem('slug') as HTMLInputElement)?.value?.trim()
    const slug = slugInput || title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || `series-${Date.now()}`
    const payload = {
      title,
      slug,
      description: (form.elements.namedItem('description') as HTMLTextAreaElement)?.value || '',
      status: (form.elements.namedItem('status') as HTMLSelectElement)?.value as 'draft' | 'published',
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateSeries(editing.id, payload)
        showToast('更新成功', 'success')
      } else {
        await createSeries(payload)
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
    if (!confirm('确定删除该合集？')) return
    try {
      await deleteSeries(id)
      showToast('已删除', 'success')
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const loadSeriesDetail = useCallback(async (id: number) => {
    setDetailLoading(true)
    try {
      const data = await getAdminSeriesDetail(id)
      setDetail(data)
    } catch (error) {
      handleApiError(error, showToast, '获取合集详情失败')
      setManagingSeriesId(null)
    } finally {
      setDetailLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (managingSeriesId != null) loadSeriesDetail(managingSeriesId)
    else setDetail(null)
  }, [managingSeriesId, loadSeriesDetail])

  const handleRemoveFromSeries = async (postId: number) => {
    if (!managingSeriesId || !detail) return
    try {
      await removePostFromSeries(managingSeriesId, postId)
      showToast('已移出合集', 'success')
      loadSeriesDetail(managingSeriesId)
      fetchList()
    } catch (error) {
      handleApiError(error, showToast, '移除失败')
    }
  }

  const handleAddToSeries = async (postId: number) => {
    if (!managingSeriesId || !detail) return
    try {
      await addPostToSeries(managingSeriesId, postId, detail.posts.length)
      showToast('已加入合集', 'success')
      loadSeriesDetail(managingSeriesId)
      fetchList()
      setAddPostOpen(false)
    } catch (error) {
      handleApiError(error, showToast, '添加失败')
    }
  }

  const handleMovePost = async (index: number, direction: 'up' | 'down') => {
    if (!managingSeriesId || !detail) return
    const posts = [...detail.posts]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= posts.length) return
    ;[posts[index], posts[newIndex]] = [posts[newIndex], posts[index]]
    const postIds = posts.map((p) => p.post_id)
    try {
      await reorderSeriesPosts(managingSeriesId, postIds)
      showToast('顺序已更新', 'success')
      setDetail({ ...detail, posts: posts.map((p, i) => ({ ...p, sort_order: i })) })
    } catch (error) {
      handleApiError(error, showToast, '排序失败')
    }
  }

  const openAddPost = useCallback(async () => {
    setCandidateLoading(true)
    setAddPostOpen(true)
    try {
      const res = await fetchAdminPosts({ page: 1, page_size: 100 })
      setCandidatePosts(res?.data ?? [])
    } catch (error) {
      handleApiError(error, showToast, '获取文章列表失败')
    } finally {
      setCandidateLoading(false)
    }
  }, [showToast])

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
          <h1 className="text-2xl font-bold tracking-tight">合集管理</h1>
          <p className="text-muted-foreground">文章专栏/合集，前台可见已发布合集</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(!showForm); }}>
          {showForm ? '取消' : <><Plus className="mr-2 h-4 w-4" />新建合集</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">标题</Label>
                <Input id="title" name="title" defaultValue={editing?.title} placeholder="合集标题" required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="slug">别名 (URL)</Label>
                <Input id="slug" name="slug" defaultValue={editing?.slug} placeholder="series-slug" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="description">描述</Label>
                <Textarea id="description" name="description" defaultValue={editing?.description} placeholder="简短描述" rows={2} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="status">状态</Label>
                <select id="status" name="status" defaultValue={editing?.status || 'published'} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                </select>
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
                <TableHead>别名</TableHead>
                <TableHead>文章数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <BookOpen className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>暂无合集</p>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell className="text-muted-foreground">{item.slug}</TableCell>
                    <TableCell>{item.post_count ?? 0}</TableCell>
                    <TableCell>{item.status === 'published' ? '已发布' : '草稿'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/series/${item.slug}`} target="_blank">
                          <ExternalLink className="h-4 w-4 mr-1" />查看
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setManagingSeriesId(item.id)}>
                            <ListOrdered className="mr-2 h-4 w-4" />管理文章
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditing(item); setShowForm(true); }}>
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

      <Dialog open={managingSeriesId != null} onOpenChange={(open) => !open && setManagingSeriesId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {detail ? `管理合集文章：${detail.series.title}` : '管理合集文章'}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <Skeleton className="h-48" />
          ) : detail ? (
            <div className="flex flex-col gap-4 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">共 {detail.posts.length} 篇</span>
                <Button size="sm" onClick={openAddPost}>
                  <Plus className="mr-2 h-4 w-4" />添加文章
                </Button>
              </div>
              <div className="border rounded-md overflow-auto flex-1 min-h-0 max-h-64">
                {detail.posts.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    该合集暂无文章，点击「添加文章」从文章列表中选择加入
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">顺序</TableHead>
                        <TableHead>标题</TableHead>
                        <TableHead className="text-right w-28">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.posts.map((sp, index) => (
                        <TableRow key={sp.id}>
                          <TableCell className="py-1">
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={index === 0}
                                onClick={() => handleMovePost(index, 'up')}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={index === detail.posts.length - 1}
                                onClick={() => handleMovePost(index, 'down')}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {sp.post ? (
                              <Link href={`/admin/posts/edit/${sp.post_id}`} target="_blank" className="hover:underline">
                                {sp.post.title}
                              </Link>
                            ) : (
                              `文章 #${sp.post_id}`
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleRemoveFromSeries(sp.post_id)}
                            >
                              移出
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={addPostOpen} onOpenChange={setAddPostOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>选择要加入合集的文章</DialogTitle>
          </DialogHeader>
          {candidateLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="overflow-auto min-h-0 max-h-96 border rounded-md">
              {candidatePosts.filter((p) => !detail?.posts.some((sp) => sp.post_id === p.id)).length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  没有可添加的文章，或所有文章已在合集中
                </div>
              ) : (
                <Table>
                  <TableBody>
                    {candidatePosts
                      .filter((p) => !detail?.posts.some((sp) => sp.post_id === p.id))
                      .map((post) => (
                        <TableRow
                          key={post.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleAddToSeries(post.id)}
                        >
                          <TableCell>
                            <FileText className="inline h-4 w-4 mr-2 text-muted-foreground" />
                            {post.title}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
