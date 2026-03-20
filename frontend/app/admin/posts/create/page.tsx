'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPost, fetchCategories, fetchTags, getPublicConfigs, aiStream } from '@/lib/api'
import { Category, Tag } from '@/lib/types'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { useAdminAIUsage } from '@/lib/contexts/AdminAIUsageContext'
import axios from 'axios'

function parseThinkingResult(full: string): { thinking?: string; result: string } {
  const thinkingRe = /(?:^|\n)\s*(?:\*{0,2})思考过程(?:\*{0,2})\s*[：:]\s*\n?([\s\S]*?)(?=\n\s*(?:\*{0,2})最终结果(?:\*{0,2})\s*[：:]|$)/
  const resultRe = /(?:^|\n)\s*(?:\*{0,2})最终结果(?:\*{0,2})\s*[：:]\s*\n?([\s\S]*)/
  const resultMatch = full.match(resultRe)
  const thinkingMatch = full.match(thinkingRe)
  const result = resultMatch ? resultMatch[1].trim() : full.trim()
  let thinking = thinkingMatch ? thinkingMatch[1].trim() : undefined
  if (thinking && thinking.length < 5) thinking = undefined
  return { thinking, result }
}

function extractJSON(s: string): string {
  let t = s.trim()
  const fenceIdx = t.indexOf('```')
  if (fenceIdx >= 0) {
    t = t.slice(fenceIdx + 3)
    if (t.trimStart().startsWith('json')) t = t.slice(t.indexOf('json') + 4)
    const end = t.indexOf('```')
    if (end >= 0) t = t.slice(0, end)
  }
  t = t.trim()
  const braceStart = t.indexOf('{')
  if (braceStart >= 0) t = t.slice(braceStart)
  return t
}
import { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } from '@/lib/hooks/useAutoSave'
import { useDebouncedCallback } from 'use-debounce'
import MarkdownEditor from '@/components/MarkdownEditor'
import CoverImageInput from '@/components/CoverImageInput'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, Sparkles, Wand2 } from 'lucide-react'

export default function CreatePost() {
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('draft')
  const [publishedAt, setPublishedAt] = useState('')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  /** 当前正在执行的 AI 操作，仅该按钮显示 loading */
  const [aiLoadingAction, setAiLoadingAction] = useState<'title' | 'summary' | 'seo' | 'tags' | 'slug' | 'batch' | 'continue' | 'polish' | 'translate' | 'outline' | 'grammar' | 'spell' | 'meta' | null>(null)
  // AI results now shown in the floating AI panel (no separate dialog needed)
  const [slug, setSlug] = useState('')
  /** 一键生成勾选项 */
  const [batchGenerateOptions, setBatchGenerateOptions] = useState({
    title: true,
    summary: true,
    slug: true,
    tags_category: true,
  })
  const router = useRouter()
  const { showToast } = useToast()
  const aiUsage = useAdminAIUsage()
  const initialStatusSet = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  const localStorageKey = 'post_new_draft'

  useEffect(() => {
    loadData()

    const draft = loadFromLocalStorage(localStorageKey)
    if (draft) {
      if (draft.title) setTitle(draft.title)
      if (draft.summary) setSummary(draft.summary)
      if (draft.content) setContent(draft.content)
      if (draft.savedAt) setLastSaved(new Date(draft.savedAt))
    }
  }, [])

  const [autoSaveIntervalSec, setAutoSaveIntervalSec] = useState(60)

  // 从系统配置加载默认状态与自动保存间隔（仅首次）
  useEffect(() => {
    getPublicConfigs()
      .then((c) => {
        if (!c) return
        if (!initialStatusSet.current) {
          const defaultStatus = (c.default_post_status || 'draft').toLowerCase()
          if (defaultStatus === 'published') setStatus('published')
          initialStatusSet.current = true
        }
        const sec = parseInt(String(c.auto_save_interval_sec || 60), 10)
        if (Number.isFinite(sec) && sec > 0) setAutoSaveIntervalSec(sec)
      })
      .catch(() => {})
  }, [])

  const debouncedSave = useDebouncedCallback(
    (t: string, s: string, c: string) => {
      saveToLocalStorage(localStorageKey, { title: t, summary: s, content: c })
      setLastSaved(new Date())
    },
    autoSaveIntervalSec * 1000
  )

  // 内容变更时按配置间隔防抖保存到本地
  useEffect(() => {
    debouncedSave(title, summary, content)
  }, [title, summary, content, debouncedSave])

  const handleManualSave = () => {
    if (!title && !summary && !content) {
      showToast('暂无内容可保存', 'info')
      return
    }

    saveToLocalStorage(localStorageKey, {
      title,
      content,
      summary,
    })
    setLastSaved(new Date())
    showToast('已保存到本地草稿', 'success')
  }

  const loadData = async () => {
    try {
      const [categoriesData, tagsData] = await Promise.all([
        fetchCategories(),
        fetchTags(),
      ])
      setCategories(categoriesData)
      setTags(tagsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const ensureContentForAI = () => {
    if (!content.trim()) {
      showToast('请先输入一些正文内容，再使用 AI 功能', 'info')
      return false
    }
    return true
  }

  const handleAIGenerateSlug = async () => {
    if (!title.trim()) {
      showToast('请先输入文章标题，再生成 URL 别名', 'info')
      return
    }
    setAiLoadingAction('slug')
    try {
      await runStream('slug', { title }, (result) => {
        const raw = result.trim().split('\n')[0]?.trim() || ''
        const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'post'
        setSlug(slug)
        showToast(slug ? '已生成 URL 别名' : 'AI 未返回有效别名', slug ? 'success' : 'error')
      })
    } catch (error) {
      handleApiError(error, showToast, '生成 URL 别名失败')
    }
  }

  const handleBatchGenerate = async () => {
    if (!content.trim()) {
      showToast('请先输入正文内容，再使用一键生成', 'info')
      return
    }
    const generate: string[] = []
    if (batchGenerateOptions.title) generate.push('title')
    if (batchGenerateOptions.summary) generate.push('summary')
    if (batchGenerateOptions.slug) generate.push('slug')
    if (batchGenerateOptions.tags_category) generate.push('tags_category')
    if (generate.length === 0) {
      showToast('请至少勾选一项要生成的内容', 'info')
      return
    }
    setAiLoadingAction('batch')
    try {
      await runStream(
        'batch_generate',
        { content, title, category_names: categories.map((c) => c.name), tag_names: tags.map((t) => t.name), generate },
        (result) => {
          const jsonStr = extractJSON(result)
          let res: { title?: string; summary?: string; slug?: string; category_name?: string; tags?: string[] } = {}
          try { res = JSON.parse(jsonStr) } catch { /* ignore */ }
          let applied = 0
          if (res.title) { setTitle(res.title); applied++ }
          if (res.summary) { setSummary(res.summary); applied++ }
          if (res.slug) {
            const s = res.slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '')
            if (s) { setSlug(s); applied++ }
          }
          if (res.category_name || (res.tags && res.tags.length > 0)) {
            const cat = categories.find((c) => c.name === res.category_name || c.name.trim() === (res.category_name || '').trim())
            const suggestedTagIds = (res.tags || [])
              .map((name) => tags.find((t) => t.name === name || t.name.trim() === name.trim())?.id)
              .filter((id): id is number => id != null)
            const form = formRef.current
            if (form) {
              if (cat) { const sel = form.querySelector<HTMLSelectElement>('[name="category_id"]'); if (sel) sel.value = String(cat.id) }
              suggestedTagIds.forEach((id) => { const cb = form.querySelector<HTMLInputElement>(`input[name="tag_ids"][value="${id}"]`); if (cb) cb.checked = true })
            }
            applied++
          }
          showToast(applied > 0 ? `已生成并填入 ${applied} 项` : '生成完成，部分项未返回', applied > 0 ? 'success' : 'info')
        }
      )
    } catch (error) {
      handleApiError(error, showToast, '一键生成失败')
    }
  }

  const handleAIContinue = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('continue')
    try {
      await runStream('continue', { content }, (result) => {
        const text = result.trim()
        if (text) setContent((c) => c + '\n\n' + text)
        showToast(text ? '已追加续写' : '未返回内容', text ? 'success' : 'info')
      })
    } catch (e) {
      handleApiError(e, showToast, '续写失败')
    }
  }
  const handleAIPolish = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('polish')
    try {
      await runStream('polish', { content }, (result) => {
        const text = result.trim()
        if (text) setContent(text)
        showToast(text ? '已润色' : '未返回内容', text ? 'success' : 'info')
      })
    } catch (e) {
      handleApiError(e, showToast, '润色失败')
    }
  }
  const handleAITranslate = async (lang: 'en' | 'zh') => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('translate')
    const actionName = lang === 'en' ? '中→英' : '英→中'
    const entry = aiUsage?.startEntry(actionName)
    try {
      const full = await aiStream(
        { action: 'translate', content, lang },
        { signal: entry?.signal, onChunk: entry ? (chunk) => aiUsage!.appendContent(entry.id, chunk) : undefined }
      )
      if (entry) aiUsage!.setDone(entry.id, full)
      const { result } = parseThinkingResult(full)
      const text = result.trim()
      if (text) setContent(text)
      showToast(text ? '已翻译' : '未返回内容', text ? 'success' : 'info')
    } catch (e) {
      if (entry && !axios.isCancel(e)) aiUsage?.setError(entry.id, (e as Error)?.message || '翻译失败')
      handleApiError(e, showToast, '翻译失败')
    } finally {
      setAiLoadingAction(null)
    }
  }
  const handleAIOutline = async () => {
    const topic = (title || '').trim() || '文章主题'
    setAiLoadingAction('outline')
    try {
      await runStream('outline', { topic, title }, (result) =>
        showToast(result.trim() ? '大纲已生成，查看 AI 面板' : '未返回大纲', result.trim() ? 'success' : 'info')
      )
    } catch (e) {
      handleApiError(e, showToast, '生成大纲失败')
    }
  }
  const handleAIGrammar = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('grammar')
    try {
      await runStream('grammar', { content, lang: 'zh' }, (result) =>
        showToast(result.trim() ? '语法检查完成，查看 AI 面板' : '未发现明显问题', 'success')
      )
    } catch (e) {
      handleApiError(e, showToast, '语法检查失败')
    }
  }
  const handleAISpell = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('spell')
    try {
      await runStream('spell', { content, lang: 'zh' }, (result) =>
        showToast(result.trim() ? '拼写检查完成，查看 AI 面板' : '未发现明显问题', 'success')
      )
    } catch (e) {
      handleApiError(e, showToast, '拼写检查失败')
    }
  }
  type AIStreamAction =
    | 'continue'
    | 'polish'
    | 'translate'
    | 'outline'
    | 'grammar'
    | 'spell'
    | 'meta'
    | 'title'
    | 'summary'
    | 'seo_analyze'
    | 'slug'
    | 'tags_category'
    | 'batch_generate'
  const actionLabels: Record<AIStreamAction, string> = {
    continue: '续写',
    polish: '润色',
    translate: '中→英',
    outline: '大纲',
    grammar: '语法检查',
    spell: '拼写检查',
    meta: '生成 Meta',
    title: '生成标题',
    summary: '生成摘要',
    seo_analyze: 'SEO 分析',
    slug: '生成 URL 别名',
    tags_category: '推荐标签与分类',
    batch_generate: '一键生成',
  }
  const runStream = async (
    action: AIStreamAction,
    payload: Record<string, unknown>,
    onResult: (result: string) => void
  ) => {
    const entry = aiUsage?.startEntry(actionLabels[action])
    try {
      const full = await aiStream(
        { action, ...payload } as Parameters<typeof aiStream>[0],
        {
          signal: entry?.signal,
          onChunk: entry ? (chunk) => aiUsage!.appendContent(entry.id, chunk) : undefined,
        }
      )
      if (entry) aiUsage!.setDone(entry.id, full)
      const { result } = parseThinkingResult(full)
      onResult(result)
    } catch (e) {
      if (entry && !axios.isCancel(e)) aiUsage?.setError(entry.id, (e as Error)?.message || '请求失败')
      throw e
    } finally {
      setAiLoadingAction(null)
    }
  }

  const handleAIMeta = async () => {
    if (!content.trim()) { showToast('请先输入正文', 'info'); return }
    setAiLoadingAction('meta')
    try {
      await runStream('meta', { content, title }, (result) =>
        showToast(result.trim() ? 'Meta 已生成，查看 AI 面板' : '未返回', result.trim() ? 'success' : 'info')
      )
    } catch (e) {
      handleApiError(e, showToast, '生成 Meta 失败')
    }
  }

  const handleAIGenerateTitle = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('title')
    try {
      await runStream('title', { content }, (result) => {
        const text = result
          .split('\n')
          .map((s) => s.trim())
          .find(Boolean) || ''
        if (!text) {
          showToast('AI 未返回标题', 'error')
        } else {
          setTitle(text)
          showToast('已生成标题', 'success')
        }
      })
    } catch (error) {
      handleApiError(error, showToast, '生成标题失败')
    }
  }

  const handleAIGenerateSummary = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('summary')
    try {
      await runStream('summary', { content }, (result) => {
        const text = result.trim()
        if (!text) {
          showToast('AI 未返回摘要', 'error')
        } else {
          setSummary(text)
          showToast('已生成摘要', 'success')
        }
      })
    } catch (error) {
      handleApiError(error, showToast, '生成摘要失败')
    }
  }

  const handleSEOAnalyze = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('seo')
    try {
      await runStream(
        'seo_analyze',
        { content, title },
        (result) =>
          showToast(result.trim() ? 'SEO 分析完成，查看 AI 面板' : '未返回分析结果', result.trim() ? 'success' : 'info')
      )
    } catch (error) {
      handleApiError(error, showToast, 'SEO 分析失败')
    }
  }

  const handleAISuggestTagsCategory = useCallback(async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('tags')
    try {
      await runStream(
        'tags_category',
        { content, title, category_names: categories.map((c) => c.name), tag_names: tags.map((t) => t.name) },
        (result) => {
          let categoryName = ''
          const tagStrs: string[] = []
          for (const line of result.split('\n')) {
            const l = line.trim()
            if (l.startsWith('分类：') || l.startsWith('分类:')) categoryName = l.replace(/^分类[：:]/, '').trim()
            else if (l.startsWith('标签：') || l.startsWith('标签:')) {
              const part = l.replace(/^标签[：:]/, '').trim().replace(/，/g, ',')
              part.split(',').forEach((s) => { const t = s.trim(); if (t) tagStrs.push(t) })
            }
          }
          const cat = categories.find((c) => c.name === categoryName || c.name.trim() === categoryName.trim())
          const suggestedTagIds = tagStrs
            .map((name) => tags.find((t) => t.name === name || t.name.trim() === name.trim())?.id)
            .filter((id): id is number => id != null)
          const form = formRef.current
          if (form) {
            if (cat) { const sel = form.querySelector<HTMLSelectElement>('[name="category_id"]'); if (sel) sel.value = String(cat.id) }
            suggestedTagIds.forEach((id) => { const cb = form.querySelector<HTMLInputElement>(`input[name="tag_ids"][value="${id}"]`); if (cb) cb.checked = true })
          }
          const parts: string[] = []
          if (cat) parts.push(`分类：${cat.name}`)
          if (suggestedTagIds.length) parts.push(`标签：${suggestedTagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean).join('、')}`)
          showToast(parts.length ? `已采纳 ${parts.join('，')}` : '已尝试采纳推荐', 'success')
        }
      )
    } catch (error) {
      handleApiError(error, showToast, '推荐标签/分类失败')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, categories, tags, showToast])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const tagIds = formData
      .getAll('tag_ids')
      .map((id) => parseInt(id as string, 10))
      .filter((n) => Number.isFinite(n))

    const statusValue = (formData.get('status') as 'draft' | 'published' | 'scheduled') || status
    const publishedAtValue = (formData.get('published_at') as string) || publishedAt

    if (statusValue === 'scheduled' && !publishedAtValue) {
      showToast('请选择定时发布时间', 'error')
      setLoading(false)
      return
    }

    const data = {
      title: title || (formData.get('title') as string) || '',
      slug: slug || (formData.get('slug') as string) || '',
      content,
      summary: summary || (formData.get('summary') as string) || undefined,
      cover_image: coverImage || undefined,
      category_id: formData.get('category_id')
        ? parseInt(formData.get('category_id') as string, 10)
        : undefined,
      tag_ids: tagIds,
      status: statusValue,
      is_top: formData.get('is_top') === 'on',
      allow_comment: formData.get('allow_comment') === 'on',
      password: (formData.get('password') as string) || undefined,
      password_hint: (formData.get('password_hint') as string) || undefined,
      // 后端期望时间字符串，统一用 ISO 字符串
      published_at:
        statusValue === 'scheduled' && publishedAtValue
          ? new Date(publishedAtValue).toISOString()
          : undefined,
    }

    try {
      await createPost(data)
      clearLocalStorage(localStorageKey)
      showToast('创建成功', 'success')
      router.push('/admin/posts')
    } catch (error: unknown) {
      handleApiError(error, showToast, '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">新建文章</h1>
          <p className="text-sm text-muted-foreground">
            {lastSaved ? `已自动保存到本地：${lastSaved.toLocaleTimeString()}` : '撰写并发布新文章，支持本地自动保存'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleManualSave}>
            立即保存草稿
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/posts">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回列表
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form ref={formRef} onSubmit={handleSubmit} className="grid gap-6">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Wand2 className="h-4 w-4" /> AI 一键生成
              </p>
              <p className="text-xs text-muted-foreground mb-3">勾选要生成的内容（基于当前正文与标题），点击后并行生成并自动填入。</p>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={batchGenerateOptions.title}
                    onChange={(e) => setBatchGenerateOptions((o) => ({ ...o, title: e.target.checked }))}
                    className="rounded border-input"
                  />
                  标题
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={batchGenerateOptions.summary}
                    onChange={(e) => setBatchGenerateOptions((o) => ({ ...o, summary: e.target.checked }))}
                    className="rounded border-input"
                  />
                  摘要
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={batchGenerateOptions.slug}
                    onChange={(e) => setBatchGenerateOptions((o) => ({ ...o, slug: e.target.checked }))}
                    className="rounded border-input"
                  />
                  URL 别名
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={batchGenerateOptions.tags_category}
                    onChange={(e) => setBatchGenerateOptions((o) => ({ ...o, tags_category: e.target.checked }))}
                    className="rounded border-input"
                  />
                  分类与标签
                </label>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleBatchGenerate}
                  disabled={aiLoadingAction !== null}
                >
                  {aiLoadingAction === 'batch' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
                  {aiLoadingAction === 'batch' ? '生成中...' : '一键生成'}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">文章标题 *</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="title"
                    name="title"
                    required
                    placeholder="请输入标题"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="flex-1 min-w-0"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={handleAIGenerateTitle}
                    disabled={aiLoadingAction !== null}
                  >
                    {aiLoadingAction === 'title' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                    {aiLoadingAction === 'title' ? '生成中...' : 'AI 生成'}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL别名 *</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="slug"
                    name="slug"
                    required
                    placeholder="例如: my-first-post"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="flex-1 min-w-0"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={handleAIGenerateSlug}
                    disabled={aiLoadingAction !== null}
                  >
                    {aiLoadingAction === 'slug' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                    {aiLoadingAction === 'slug' ? '生成中...' : 'AI 生成'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">文章摘要</Label>
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  id="summary"
                  name="summary"
                  placeholder="简短描述"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="flex-1 min-w-[200px]"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={handleAIGenerateSummary}
                  disabled={aiLoadingAction !== null}
                >
                  {aiLoadingAction === 'summary' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                  {aiLoadingAction === 'summary' ? '生成中...' : 'AI 生成摘要'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={handleSEOAnalyze}
                  disabled={aiLoadingAction !== null}
                >
                  {aiLoadingAction === 'seo' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  {aiLoadingAction === 'seo' ? '分析中...' : 'SEO 分析'}
                </Button>
              </div>
            </div>

            <CoverImageInput
              value={coverImage}
              onChange={setCoverImage}
            />

            <div className="space-y-2">
              <Label>文章内容 *</Label>
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="支持 Markdown 格式，可使用工具栏快速插入"
              />
              <input type="hidden" name="content" value={content} />
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> AI 写作与检查
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleAIContinue} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'continue' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'continue' ? '续写中...' : '续写'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAIPolish} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'polish' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'polish' ? '润色中...' : '润色'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleAITranslate('en')} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'translate' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'translate' ? '翻译中...' : '中→英'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleAITranslate('zh')} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'translate' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'translate' ? '翻译中...' : '英→中'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAIOutline} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'outline' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'outline' ? '大纲中...' : '大纲'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAIGrammar} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'grammar' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'grammar' ? '检查中...' : '语法检查'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAISpell} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'spell' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'spell' ? '检查中...' : '拼写检查'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAIMeta} disabled={aiLoadingAction !== null}>
                    {aiLoadingAction === 'meta' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {aiLoadingAction === 'meta' ? '生成中...' : '生成 Meta'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">发布状态</Label>
              <select
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'scheduled')}
                className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="draft">草稿</option>
                <option value="published">立即发布</option>
                <option value="scheduled">定时发布</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>分类与标签</Label>
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  name="category_id"
                  className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">请选择分类</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2 rounded-md border border-input px-3 py-2 min-h-[40px] items-center flex-1 min-w-0">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" name="tag_ids" value={tag.id} className="rounded border-input" />
                      <span className="text-sm">{tag.name}</span>
                    </label>
                  ))}
                  {tags.length === 0 && (
                    <span className="text-sm text-muted-foreground">暂无标签</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={handleAISuggestTagsCategory}
                  disabled={aiLoadingAction !== null}
                >
                  {aiLoadingAction === 'tags' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                  {aiLoadingAction === 'tags' ? '推荐中...' : 'AI 推荐'}
                </Button>
              </div>
            </div>

            {status === 'scheduled' && (
              <div className="space-y-2">
                <Label htmlFor="published_at">定时发布时间</Label>
                <Input
                  id="published_at"
                  name="published_at"
                  type="datetime-local"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">仅当状态为“定时发布”时生效</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">访问密码（可选）</Label>
                <Input
                  id="password"
                  name="password"
                  type="text"
                  placeholder="设置后需输入密码才能访问"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password_hint">密码提示（可选）</Label>
                <Input
                  id="password_hint"
                  name="password_hint"
                  type="text"
                  placeholder="给读者的提示信息"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="is_top" className="rounded border-input" />
                <span className="text-sm font-medium">置顶文章</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="allow_comment" defaultChecked className="rounded border-input" />
                <span className="text-sm font-medium">允许评论</span>
              </label>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? '提交中...' : '发布文章'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                取消
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

    </div>
  )
}
