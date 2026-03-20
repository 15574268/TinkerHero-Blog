'use client'

import { useEffect, useState, useCallback } from 'react'
import { Comment } from '@/lib/types'
import { fetchAllComments, updateCommentStatus, deleteComment, createComment, aiModerationCheck, aiStream } from '@/lib/api'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MoreHorizontal, CheckCircle, XCircle, Trash2, MessageSquare, MessageCircle, Loader2, ShieldCheck } from 'lucide-react'
import Pagination from '@/components/Pagination'

const PAGE_SIZE = 20

export default function CommentsManagement() {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyComment, setReplyComment] = useState<Comment | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replySuggesting, setReplySuggesting] = useState(false)
  const [replyPublishing, setReplyPublishing] = useState(false)
  const [moderationOpen, setModerationOpen] = useState(false)
  const [moderationResult, setModerationResult] = useState<{ is_safe: boolean; results: { category: string; description: string; is_violation: boolean }[]; suggestions: string[] } | null>(null)
  const [moderationLoading, setModerationLoading] = useState(false)
  const { showToast } = useToast()

  const fetchComments = useCallback(async (page: number) => {
    setLoading(true)
    try {
      const result = await fetchAllComments({ page })
      setComments(result?.data || [])
      setTotal(result?.total || 0)
    } catch (error) {
      handleApiError(error, showToast, '获取评论失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchComments(currentPage)
  }, [fetchComments, currentPage])

  const handleStatusChange = async (id: number, status: 'pending' | 'approved' | 'rejected') => {
    try {
      await updateCommentStatus(id, status)
      showToast('更新成功', 'success')
      fetchComments(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '更新失败')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条评论吗？')) return

    try {
      await deleteComment(id)
      showToast('删除成功', 'success')
      fetchComments(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const handleAIModeration = async (comment: Comment) => {
    setModerationLoading(true)
    setModerationResult(null)
    setModerationOpen(true)
    try {
      const res = await aiModerationCheck({ content: comment.content })
      setModerationResult({
        is_safe: res?.is_safe ?? true,
        results: res?.results ?? [],
        suggestions: res?.suggestions ?? [],
      })
    } catch (error) {
      handleApiError(error, showToast, 'AI 审核失败')
      setModerationOpen(false)
    } finally {
      setModerationLoading(false)
    }
  }

  const handleSuggestReply = async (comment: Comment) => {
    setReplyComment(comment)
    setReplyText('')
    setReplyOpen(true)
    setReplySuggesting(true)
    try {
      const full = await aiStream(
        { action: 'comment_reply', comment_content: comment.content, post_title: comment.post?.title },
        { onChunk: (chunk) => setReplyText((t) => t + chunk) }
      )
      const resultMatch = full.match(/最终结果[：:]\s*([\s\S]*)/)
      setReplyText(resultMatch ? resultMatch[1].trim() : full.trim())
    } catch (error) {
      handleApiError(error, showToast, '生成建议回复失败')
    } finally {
      setReplySuggesting(false)
    }
  }

  const handlePublishReply = async () => {
    if (!replyComment || !replyText.trim()) return
    setReplyPublishing(true)
    try {
      await createComment({
        post_id: replyComment.post_id,
        parent_id: replyComment.id,
        content: replyText.trim(),
        author: '站长',
      })
      showToast('回复已发布', 'success')
      setReplyOpen(false)
      setReplyComment(null)
      setReplyText('')
      fetchComments(currentPage)
    } catch (error) {
      handleApiError(error, showToast, '发布回复失败')
    } finally {
      setReplyPublishing(false)
    }
  }

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    approved: { label: '已通过', variant: 'default' },
    rejected: { label: '已拒绝', variant: 'destructive' },
    pending: { label: '待审核', variant: 'secondary' },
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="p-0">{[...Array(5)].map((_, i) => <div key={i} className="flex gap-4 p-4 border-b last:border-0"><Skeleton className="h-5 flex-1" /><Skeleton className="h-5 w-20" /></div>)}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">评论管理</h1>
        <p className="text-muted-foreground">审核和管理用户评论</p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>评论者</TableHead>
                <TableHead>内容</TableHead>
                <TableHead>文章</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {comments.map((comment) => {
                const status = statusConfig[comment.status] || statusConfig.pending
                return (
                  <TableRow key={comment.id}>
                    <TableCell>
                      <div className="font-medium">{comment.user?.username || comment.author}</div>
                      {comment.email && <div className="text-sm text-muted-foreground">{comment.email}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate">{comment.content}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{comment.post?.title || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(comment.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleAIModeration(comment)} disabled={moderationLoading}>
                            <ShieldCheck className="mr-2 h-4 w-4" />AI 审核
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSuggestReply(comment)}>
                            <MessageCircle className="mr-2 h-4 w-4" />建议回复
                          </DropdownMenuItem>
                          {comment.status !== 'approved' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(comment.id, 'approved')}>
                              <CheckCircle className="mr-2 h-4 w-4" />通过
                            </DropdownMenuItem>
                          )}
                          {comment.status !== 'rejected' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(comment.id, 'rejected')}>
                              <XCircle className="mr-2 h-4 w-4" />拒绝
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(comment.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
              {comments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <MessageSquare className="h-8 w-8" />
                      <p>暂无评论</p>
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

      <Dialog open={moderationOpen} onOpenChange={setModerationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {moderationLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              AI 审核结果
            </DialogTitle>
          </DialogHeader>
          {moderationLoading ? (
            <p className="text-sm text-muted-foreground">检测中...</p>
          ) : moderationResult ? (
            <div className="space-y-2 text-sm">
              <p><strong>结论：</strong>{moderationResult.is_safe ? '内容安全' : '存在风险'}</p>
              {moderationResult.results?.length > 0 && (
                <div>
                  <strong>详情：</strong>
                  <ul className="list-disc pl-4 mt-1">
                    {moderationResult.results.map((r, i) => (
                      <li key={i}>{r.category}: {r.description} {r.is_violation ? '(违规)' : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              {moderationResult.suggestions?.length > 0 && (
                <p><strong>建议：</strong>{moderationResult.suggestions.join('；')}</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={replyOpen} onOpenChange={(open) => { setReplyOpen(open); if (!open) setReplyComment(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {replySuggesting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              回复评论
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>回复内容</Label>
            <div className="relative">
              <Textarea
                placeholder={replySuggesting ? '正在生成建议回复...' : '可编辑后发布'}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                className="resize-none"
                disabled={replySuggesting}
              />
              {replySuggesting && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/80">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyOpen(false)}>取消</Button>
            <Button onClick={handlePublishReply} disabled={replySuggesting || replyPublishing || !replyText.trim()}>
              {replyPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {replyPublishing ? '发布中...' : '发布回复'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
