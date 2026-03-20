'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { Comment } from '@/lib/types'
import { fetchComments, createComment, getCaptcha, verifyCaptcha } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { MessageCircle, Reply, RefreshCw, Send } from 'lucide-react'

interface CommentSectionProps {
  postId: number
  /** 是否启用评论验证码（与后台「评论是否需验证码」一致，未传时默认 false） */
  enableCaptchaComment?: boolean
  /** 评论是否需要审核（与后台「评论是否需要审核」一致，未传时默认 true，用于提示文案） */
  commentNeedAudit?: boolean
}

function isErrorWithResponse(error: unknown): error is { response?: { data?: { error?: string } } } {
  return typeof error === 'object' && error !== null && 'response' in error
}

export default function CommentSection({ postId, enableCaptchaComment = false, commentNeedAudit = true }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [content, setContent] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [author, setAuthor] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(true)
  const { showToast } = useToast()
  const abortControllerRef = useRef<AbortController | null>(null)

  const refreshCaptcha = useCallback(async () => {
    setCaptchaLoading(true)
    try {
      const data = await getCaptcha()
      setCaptchaId(data.captcha_id)
      setCaptchaImg(data.captcha_img)
      setCaptchaCode('')
    } catch (err) {
      console.error('Failed to get captcha:', err)
    } finally {
      setCaptchaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enableCaptchaComment) refreshCaptcha()
  }, [enableCaptchaComment, refreshCaptcha])

  const loadComments = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await fetchComments(postId, signal)
      if (!signal?.aborted) {
        setComments(data)
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') return
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to load comments:', error)
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()
    loadComments(abortControllerRef.current.signal)
    return () => { abortControllerRef.current?.abort() }
  }, [loadComments])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const isReply = replyTo !== null
    const activeContent = isReply ? replyContent : content
    if (!activeContent.trim()) { showToast('请输入评论内容', 'error'); return }
    if (!author.trim() || !email.trim()) { showToast('请填写昵称和邮箱', 'error'); return }
    if (enableCaptchaComment && !captchaCode) { showToast('请输入验证码', 'error'); return }

    if (enableCaptchaComment) {
      try {
        const captchaResult = await verifyCaptcha(captchaId, captchaCode)
        if (!captchaResult.valid) {
          showToast(captchaResult.error || '验证码错误', 'error')
          refreshCaptcha()
          return
        }
      } catch {
        showToast('验证码验证失败', 'error')
        refreshCaptcha()
        return
      }
    }

    try {
      await createComment({
        post_id: postId,
        parent_id: replyTo || undefined,
        content: activeContent,
        author,
        email,
        website: website || undefined,
        ...(enableCaptchaComment && captchaId && captchaCode ? { captcha_id: captchaId, captcha: captchaCode } : {}),
      })
      showToast(commentNeedAudit ? '评论提交成功，等待审核' : '评论已发布', 'success')
      if (isReply) {
        setReplyContent('')
        setReplyTo(null)
      } else {
        setContent('')
      }
      setWebsite('')
      setCaptchaCode('')
      if (enableCaptchaComment) refreshCaptcha()
      loadComments()
    } catch (error: unknown) {
      const errorMessage = isErrorWithResponse(error) && error.response?.data?.error
        ? error.response.data.error : '评论提交失败'
      showToast(errorMessage, 'error')
      if (enableCaptchaComment) refreshCaptcha()
    }
  }, [postId, replyTo, content, replyContent, author, email, website, showToast, loadComments, enableCaptchaComment, commentNeedAudit, captchaId, captchaCode, refreshCaptcha])

  const captchaRow = (
    <div className="flex items-center gap-3">
      {captchaLoading ? (
        <div className="w-[120px] h-[40px] bg-muted rounded-lg flex items-center justify-center">
          <span className="text-muted-foreground text-xs">加载中...</span>
        </div>
      ) : captchaImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={captchaImg}
          alt="验证码"
          className="w-[120px] h-[40px] rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
          onClick={refreshCaptcha}
          title="点击刷新"
        />
      ) : null}
      <input
        type="text"
        value={captchaCode}
        onChange={(e) => setCaptchaCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4))}
        placeholder="验证码"
        className="w-24 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-center transition-shadow"
        maxLength={4}
        required
      />
      <button
        type="button"
        onClick={refreshCaptcha}
        className="text-muted-foreground hover:text-primary transition-colors"
        title="换一张"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  )

  const renderComment = (comment: Comment, level = 0) => (
    <div key={comment.id} className={`${level > 0 ? 'ml-6 md:ml-10' : ''}`}>
      <div className="group rounded-xl bg-muted/40 p-4 transition-colors hover:bg-muted/60">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {(comment.user?.nickname || comment.user?.username || comment.author || '匿').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="font-medium text-foreground text-sm">
                {comment.user?.nickname || comment.user?.username || comment.author || '匿名'}
              </span>
              <span className="text-xs text-muted-foreground ml-2" suppressHydrationWarning>
                {new Date(comment.created_at).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
              onClick={() => setReplyTo(comment.id)}
            >
              <Reply className="w-3.5 h-3.5 mr-1" />回复
            </Button>
          </div>
        </div>
        <p className="text-foreground/85 text-sm leading-relaxed pl-[42px]">{comment.content}</p>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => renderComment(reply, level + 1))}
        </div>
      )}

      {replyTo === comment.id && (
        <form onSubmit={handleSubmit} className="mt-3 ml-6 md:ml-10 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="昵称"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                required
              />
              <input
                type="email"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                required
              />
              <input
                type="url"
                placeholder="网址（可选）"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
              />
            </div>
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="写下你的回复..."
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-shadow"
            rows={3}
            required
          />
          <div className="flex items-center justify-between">
            {enableCaptchaComment && captchaRow}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setReplyTo(null); setReplyContent('') }}
              >
                取消
              </Button>
              <Button type="submit" size="sm">
                <Send className="w-3.5 h-3.5 mr-1.5" />提交
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="joe-card p-8 text-center">
        <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />加载评论中...
        </div>
      </div>
    )
  }

  return (
    <div className="joe-card overflow-hidden">
      <div className="p-5 md:p-6">
        <div className="flex items-center gap-2 mb-5">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">
            评论 ({comments.length})
          </h3>
        </div>

        {/* Comment form */}
        {replyTo === null && (
          <form onSubmit={handleSubmit} className="rounded-xl bg-muted/30 border border-border/50 p-4 mb-6 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="comment-author" className="sr-only">昵称</label>
                <input
                  id="comment-author"
                  type="text"
                  placeholder="昵称"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  required
                />
                <label htmlFor="comment-email" className="sr-only">邮箱</label>
                <input
                  id="comment-email"
                  type="email"
                  placeholder="邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  required
                />
                <label htmlFor="comment-website" className="sr-only">网址</label>
                <input
                  id="comment-website"
                  type="url"
                  placeholder="网址（可选）"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                />
              </div>
            <label htmlFor="comment-content" className="sr-only">评论内容</label>
            <textarea
              id="comment-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下你的评论..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-shadow"
              rows={4}
              required
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {enableCaptchaComment && captchaRow}
              <Button type="submit" size="sm" className="self-end sm:self-auto">
                <Send className="w-3.5 h-3.5 mr-1.5" />发表评论
              </Button>
            </div>
          </form>
        )}

        {/* Comments list */}
        {comments.length > 0 ? (
          <div className="space-y-3">
            {comments.map((comment) => renderComment(comment))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            暂无评论，快来发表第一条评论吧
          </div>
        )}
      </div>
    </div>
  )
}
