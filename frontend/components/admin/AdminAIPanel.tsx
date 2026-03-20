'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAdminAIUsage } from '@/lib/contexts/AdminAIUsageContext'
import {
  Sparkles, Loader2, Square, Trash2, ChevronDown, ChevronRight,
  X, Bot, User, AlertCircle, CheckCircle2, Ban, Clock,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { AIUsageEntry, AIUsageEntryStatus } from '@/lib/contexts/AdminAIUsageContext'

function parseThinkingResult(full: string, isStreaming = false): { thinking?: string; result: string } {
  const markerRe = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*{0,2})最终结果(?:\*{0,2})\s*[：:]/g
  let lastIdx = -1
  let lastLen = 0
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(full)) !== null) {
    lastIdx = m.index
    lastLen = m[0].length
  }
  if (lastIdx >= 0) {
    const result = full.substring(lastIdx + lastLen).trim()
    let raw = full.substring(0, lastIdx).trim()
    raw = raw.replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*{0,2})思考过程(?:\*{0,2})\s*[：:]\s*/g, '\n').trim()
    return { thinking: raw.length >= 5 ? raw : undefined, result }
  }
  if (isStreaming && full.trim().length > 0) {
    const raw = full.replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*{0,2})思考过程(?:\*{0,2})\s*[：:]\s*/g, '\n').trim()
    return { thinking: raw.length >= 5 ? raw : undefined, result: '' }
  }
  return { thinking: undefined, result: full.trim() }
}

const actionLabels: Record<string, string> = {
  continue: '续写', polish: '润色', translate: '翻译', outline: '大纲',
  grammar: '语法检查', spell: '拼写检查', meta: 'Meta 生成',
  title: '标题生成', summary: '摘要生成', seo_analyze: 'SEO 分析',
  slug: '生成 URL 别名', tags_category: '推荐标签与分类',
  batch_generate: '一键生成', comment_reply: '评论回复建议',
  enhance_prompt: '增强提示词',
}

const statusConfig: Record<AIUsageEntryStatus, { label: string; icon: typeof Loader2; color: string }> = {
  pending:   { label: '排队中', icon: Clock,        color: 'text-amber-500' },
  streaming: { label: '生成中', icon: Loader2,      color: 'text-blue-500' },
  done:      { label: '完成',   icon: CheckCircle2, color: 'text-emerald-500' },
  error:     { label: '失败',   icon: AlertCircle,  color: 'text-red-500' },
  cancelled: { label: '已停止', icon: Ban,          color: 'text-muted-foreground' },
}

export default function AdminAIPanel() {
  const ctx = useAdminAIUsage()
  const [open, setOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const entries = ctx?.entries ?? []
  const activeCount = entries.filter(
    (e) => e.status === 'streaming' || e.status === 'pending'
  ).length
  const cancel = ctx?.cancel ?? (() => {})
  const clear = ctx?.clear ?? (() => {})

  // 新消息放在底部显示
  const orderedEntries = [...entries].reverse()

  // 仅当用户在底部且 autoScroll=true 时，才在新消息时自动滚动到底部
  useEffect(() => {
    if (!open || !autoScroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [open, autoScroll, orderedEntries.length])

  if (!ctx) return null

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        aria-label="AI 助手"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-6 right-6 z-50 group',
          'h-14 w-14 rounded-2xl',
          'bg-gradient-to-br from-violet-500 to-indigo-600',
          'shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30',
          'flex items-center justify-center',
          'transition-all duration-300 hover:scale-105 active:scale-95',
          open && 'rounded-xl scale-95 from-violet-600 to-indigo-700',
        )}
      >
        <Sparkles className={cn(
          'h-6 w-6 text-white transition-transform duration-300',
          open && 'rotate-45',
        )} />
        {/* Badge */}
        {entries.length > 0 && !open && (
          <span className={cn(
            'absolute -top-1 -right-1 flex items-center justify-center',
            'h-5 min-w-5 px-1 rounded-full text-[10px] font-bold',
            activeCount > 0
              ? 'bg-amber-400 text-amber-950 animate-pulse'
              : 'bg-white text-violet-700',
          )}>
            {entries.length > 99 ? '99+' : entries.length}
          </span>
        )}
      </button>

      {/* Chat panel */}
      <div className={cn(
        'fixed bottom-24 right-4 z-50',
        'w-[calc(100vw-2rem)] sm:w-[520px] h-[82vh] max-h-[82vh]',
        'rounded-2xl border border-border/50',
        'bg-background/95 backdrop-blur-xl',
        'shadow-2xl shadow-black/10 dark:shadow-black/30',
        'flex flex-col overflow-hidden',
        'transition-all duration-300 ease-out origin-bottom-right',
        open
          ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 scale-95 translate-y-4 pointer-events-none',
      )}>
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-purple-500/10" />
          <div className="relative px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                {activeCount > 0 && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-background animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-tight">AI 助手</h3>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {activeCount > 0
                    ? `${activeCount} 个任务进行中...`
                    : entries.length > 0
                      ? `${entries.length} 条记录`
                      : '等待任务'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={clear}
                  title="清空记录"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget
            const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
            // 距离底部小于 40px 认为在底部，允许自动滚动；否则认为用户在看历史，关闭自动滚动
            setAutoScroll(distanceToBottom < 40)
          }}
        >
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {orderedEntries.length === 0 ? (
                <EmptyState />
              ) : (
                orderedEntries.map((entry) => (
                  <ConversationItem
                    key={entry.id}
                    entry={entry}
                    onStop={() => cancel(entry.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border/50 bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            在文章编辑页使用 AI 功能（续写、润色等）后记录将显示在这里
          </p>
        </div>
      </div>
    </>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center mb-4">
        <Sparkles className="h-8 w-8 text-violet-400" />
      </div>
      <h4 className="text-sm font-medium text-foreground mb-1">暂无 AI 记录</h4>
      <p className="text-xs text-muted-foreground text-center max-w-[200px] leading-relaxed">
        使用续写、润色、翻译等 AI 功能后，对话将在此显示
      </p>
    </div>
  )
}

function ConversationItem({ entry, onStop }: { entry: AIUsageEntry; onStop: () => void }) {
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const isRunning = entry.status === 'streaming' || entry.status === 'pending'
  const { thinking, result } = parseThinkingResult(entry.content || '', isRunning)
  const hasThinking = !!thinking && thinking.length > 0
  const isThinkingInProgress = isRunning && hasThinking && !result
  const cfg = statusConfig[entry.status]
  const StatusIcon = cfg.icon
  const displayAction = actionLabels[entry.action] || entry.action

  return (
    <div className="space-y-2.5">
      {/* Timestamp + status */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-[10px] text-muted-foreground/70">
          {format(entry.startedAt, 'HH:mm')}
        </span>
      </div>

      {/* User message */}
      <div className="flex justify-end gap-2">
        <div className="flex flex-col items-end gap-1 max-w-[80%]">
          <div className={cn(
            'px-3.5 py-2 rounded-2xl rounded-tr-md',
            'bg-gradient-to-br from-violet-500 to-indigo-600 text-white',
            'text-[13px] leading-relaxed',
          )}>
            {displayAction}
          </div>
        </div>
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* AI response */}
      <div className="flex gap-2">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="flex flex-col gap-1.5 max-w-[85%] min-w-0">
          {/* Status badge */}
          <div className="flex items-center gap-1.5">
            <StatusIcon className={cn('h-3 w-3', cfg.color, entry.status === 'streaming' && 'animate-spin')} />
            <span className={cn('text-[11px] font-medium', cfg.color)}>{cfg.label}</span>
            {isRunning && (
              <button
                type="button"
                onClick={onStop}
                className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                <Square className="h-2.5 w-2.5" />
                停止
              </button>
            )}
          </div>

          {/* Error message */}
          {entry.error && (
            <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
              {entry.error}
            </div>
          )}

          {/* Thinking section */}
          {hasThinking && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-fit"
              onClick={() => setThinkingOpen((o) => !o)}
            >
              {thinkingOpen
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />}
              <span className="font-medium">{isThinkingInProgress ? '思考中' : '思考过程'}</span>
              {isThinkingInProgress && <Loader2 className="h-3 w-3 animate-spin" />}
            </button>
          )}
          {hasThinking && thinkingOpen && (
            <div className="px-3 py-2 rounded-xl bg-muted/50 border border-border/50 max-h-40 overflow-y-auto">
              <div className="text-[11px] text-muted-foreground leading-relaxed ai-md-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking!}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* AI content bubble */}
          {(entry.content || isRunning) && (
            <div className={cn(
              'px-3.5 py-2.5 rounded-2xl rounded-tl-md',
              'bg-muted/70 dark:bg-muted/50',
              'text-[13px] leading-relaxed',
              isRunning && !entry.content && 'min-w-[60px]',
            )}>
              {isThinkingInProgress ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="text-xs">思考中</span>
                  <span className="inline-block w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                  <span className="inline-block w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                  <span className="inline-block w-1 h-1 rounded-full bg-current animate-bounce" />
                </span>
              ) : (
                <AIContentRenderer content={hasThinking ? result : (entry.content || '')} isRunning={isRunning} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Separator between conversations */}
      <div className="h-px bg-border/30 mx-4 mt-1" />
    </div>
  )
}

function AIContentRenderer({ content, isRunning }: { content: string; isRunning: boolean }) {
  if (!content && isRunning) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
      </span>
    )
  }
  return (
    <div className="max-h-72 overflow-y-auto ai-md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
