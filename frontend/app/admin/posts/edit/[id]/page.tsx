'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { fetchPost, updatePost, fetchCategories, fetchTags, aiStream } from '@/lib/api'
import { Category, Tag } from '@/lib/types'
import { useToast } from '@/lib/hooks/useToast'
import { useAutoSave, saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } from '@/lib/hooks/useAutoSave'
import VersionHistory from '@/components/VersionHistory'
import MarkdownEditor from '@/components/MarkdownEditor'
import CoverImageInput from '@/components/CoverImageInput'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, History, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { handleApiError } from '@/lib/utils/error'
import { useAdminAIUsage } from '@/lib/contexts/AdminAIUsageContext'
import axios from 'axios'

// 错误类型守卫
function isErrorWithResponse(error: unknown): error is { response?: { data?: { error?: string } } } {
  return typeof error === 'object' && error !== null && 'response' in error
}

/** 从流式两段式输出中解析「思考过程」与「最终结果」 */
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

/** 当前正在执行的 AI 操作，仅该按钮显示 loading */
type AiAction = 'title' | 'summary' | 'seo' | 'tags' | 'slug' | 'batch' | 'continue' | 'polish' | 'translate' | 'outline' | 'grammar' | 'spell' | 'meta' | null

export default function EditPost() {
  const [loading, setLoading] = useState(false)
  const [aiLoadingAction, setAiLoadingAction] = useState<AiAction>(null)
  // AI results now shown in the floating AI panel (no separate dialog needed)
  const [batchGenerateOptions, setBatchGenerateOptions] = useState({
    title: true,
    summary: true,
    slug: true,
    tags_category: true,
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    summary: '',
    cover_image: '',
    category_id: '',
    tag_ids: [] as number[],
    status: 'draft' as 'draft' | 'published' | 'scheduled',
    is_top: false,
    allow_comment: true,
    password: '',
    password_hint: '',
    published_at: '',
  })
  const router = useRouter()
  const params = useParams()
  const { showToast } = useToast()
  const aiUsage = useAdminAIUsage()

  const postId = parseInt(params.id as string, 10)

  useEffect(() => {
    if (!Number.isFinite(postId)) {
      showToast('无效的文章ID', 'error')
      router.push('/admin/posts')
    }
  }, [postId, showToast, router])

  const { lastSaved, isSaving, error: autoSaveError, saveNow } = useAutoSave({
    postId,
    title: formData.title,
    content: formData.content,
    summary: formData.summary,
    enabled: formData.status === 'draft',
  })

  useEffect(() => {
    if (autoSaveError) showToast(autoSaveError, 'error')
  }, [autoSaveError, showToast])

  // 本地存储 key
  const localStorageKey = `post_draft_${params.id}`

  const loadData = useCallback(async () => {
    try {
      const [postData, categoriesData, tagsData] = await Promise.all([
        fetchPost(postId),
        fetchCategories(),
        fetchTags(),
      ])

      // 检查本地存储是否有更新的草稿
      const localDraft = loadFromLocalStorage(localStorageKey)
      let initialData = {
        title: postData.title,
        slug: postData.slug,
        content: postData.content,
        summary: postData.summary || '',
        cover_image: postData.cover_image || '',
        category_id: postData.category_id?.toString() || '',
        tag_ids: postData.tags?.map((t: Tag) => t.id) || [],
        status: postData.status,
        is_top: postData.is_top,
        allow_comment: postData.allow_comment,
        password: '',
        password_hint: postData.password_hint || '',
        published_at: postData.published_at
          ? new Date(postData.published_at).toISOString().slice(0, 16)
          : '',
      }

      if (localDraft) {
        const localTime = new Date(localDraft.savedAt).getTime()
        const serverTime = new Date(postData.updated_at).getTime()
        if (localTime > serverTime) {
          if (confirm('发现本地有更新的草稿，是否恢复？')) {
            initialData = {
              ...initialData,
              title: localDraft.title,
              content: localDraft.content,
              summary: localDraft.summary,
            }
          } else {
            clearLocalStorage(localStorageKey)
          }
        }
      }

      setFormData(initialData)
      setCategories(categoriesData)
      setTags(tagsData)
    } catch {
      showToast('加载文章失败', 'error')
      router.push('/admin/posts')
    }
  }, [localStorageKey, postId, router, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 保存到本地存储
  useEffect(() => {
    if (formData.title || formData.content) {
      saveToLocalStorage(localStorageKey, {
        title: formData.title,
        content: formData.content,
        summary: formData.summary,
      })
    }
  }, [formData.title, formData.content, formData.summary, localStorageKey])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await updatePost(postId, {
        ...formData,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        published_at:
          formData.status === 'scheduled' && formData.published_at
            ? new Date(formData.published_at).toISOString()
            : undefined,
      })
      clearLocalStorage(localStorageKey)
      showToast('更新成功', 'success')
      router.push('/admin/posts')
    } catch (error: unknown) {
      const errorMessage = isErrorWithResponse(error) && error.response?.data?.error
        ? error.response.data.error
        : '更新失败'
      showToast(errorMessage, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async () => {
    // 重新加载文章数据
    await loadData()
    setShowVersionHistory(false)
    showToast('版本恢复成功', 'success')
  }

  const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

  const ensureContentForAI = () => {
    if (!formData.content.trim()) {
      showToast('请先输入一些正文内容，再使用 AI 功能', 'info')
      return false
    }
    return true
  }

  const handleAIGenerateTitle = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('title')
    try {
      await runStream('title', { content: formData.content }, (result) => {
        const text =
          result
            .split('\n')
            .map((s) => s.trim())
            .find(Boolean) || ''
        if (!text) {
          showToast('AI 未返回标题', 'error')
        } else {
          setFormData((prev) => ({ ...prev, title: text }))
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
      await runStream('summary', { content: formData.content }, (result) => {
        const text = result.trim()
        if (!text) {
          showToast('AI 未返回摘要', 'error')
        } else {
          setFormData((prev) => ({ ...prev, summary: text }))
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
        { content: formData.content, title: formData.title },
        (result) =>
          showToast(result.trim() ? 'SEO 分析完成，查看 AI 面板' : '未返回分析结果', result.trim() ? 'success' : 'info')
      )
    } catch (error) {
      handleApiError(error, showToast, 'SEO 分析失败')
    }
  }

  const handleAIGenerateSlug = async () => {
    if (!formData.title.trim()) {
      showToast('请先输入文章标题，再生成 URL 别名', 'info')
      return
    }
    setAiLoadingAction('slug')
    try {
      await runStream('slug', { title: formData.title }, (result) => {
        const raw = result.trim().split('\n')[0]?.trim() || ''
        const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'post'
        setFormData((prev) => ({ ...prev, slug }))
        showToast(slug ? '已生成 URL 别名' : 'AI 未返回有效别名', slug ? 'success' : 'error')
      })
    } catch (error) {
      handleApiError(error, showToast, '生成 URL 别名失败')
    }
  }

  const handleAISuggestTagsCategory = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('tags')
    try {
      await runStream(
        'tags_category',
        { content: formData.content, title: formData.title, category_names: categories.map((c) => c.name), tag_names: tags.map((t) => t.name) },
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
          setFormData((prev) => ({
            ...prev,
            category_id: cat ? String(cat.id) : prev.category_id,
            tag_ids: [...new Set([...prev.tag_ids, ...suggestedTagIds])],
          }))
          const parts: string[] = []
          if (cat) parts.push(`分类：${cat.name}`)
          if (suggestedTagIds.length) parts.push(`标签：${suggestedTagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean).join('、')}`)
          showToast(parts.length ? `已采纳 ${parts.join('，')}` : '已尝试采纳推荐', 'success')
        }
      )
    } catch (error) {
      handleApiError(error, showToast, '推荐标签/分类失败')
    }
  }

  const handleBatchGenerate = async () => {
    if (!formData.content.trim()) {
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
        { content: formData.content, title: formData.title, category_names: categories.map((c) => c.name), tag_names: tags.map((t) => t.name), generate },
        (result) => {
          const jsonStr = extractJSON(result)
          let res: { title?: string; summary?: string; slug?: string; category_name?: string; tags?: string[] } = {}
          try { res = JSON.parse(jsonStr) } catch { /* ignore */ }
          let applied = 0
          setFormData((prev) => {
            const next = { ...prev }
            if (res.title) { next.title = res.title; applied++ }
            if (res.summary) { next.summary = res.summary; applied++ }
            if (res.slug) {
              const s = res.slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '')
              if (s) { next.slug = s; applied++ }
            }
            if (res.category_name || (res.tags && res.tags.length > 0)) {
              const cat = categories.find((c) => c.name === res.category_name || c.name.trim() === (res.category_name || '').trim())
              const suggestedTagIds = (res.tags || [])
                .map((name) => tags.find((t) => t.name === name || t.name.trim() === name.trim())?.id)
                .filter((id): id is number => id != null)
              if (cat) next.category_id = String(cat.id)
              if (suggestedTagIds.length) next.tag_ids = [...new Set([...prev.tag_ids, ...suggestedTagIds])]
              applied++
            }
            return next
          })
          showToast(applied > 0 ? `已生成并填入 ${applied} 项` : '生成完成，部分项未返回', applied > 0 ? 'success' : 'info')
        }
      )
    } catch (error) {
      handleApiError(error, showToast, '一键生成失败')
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
        { action, ...payload },
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

  const handleAIContinue = async () => {
    if (!ensureContentForAI()) return
    setAiLoadingAction('continue')
    try {
      await runStream('continue', { content: formData.content }, (result) => {
        const text = result.trim()
        if (text) setFormData((prev) => ({ ...prev, content: prev.content + '\n\n' + text }))
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
      await runStream('polish', { content: formData.content }, (result) => {
        const text = result.trim()
        if (text) setFormData((prev) => ({ ...prev, content: text }))
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
        { action: 'translate', content: formData.content, lang },
        { signal: entry?.signal, onChunk: entry ? (chunk) => aiUsage!.appendContent(entry.id, chunk) : undefined }
      )
      if (entry) aiUsage!.setDone(entry.id, full)
      const { result } = parseThinkingResult(full)
      const text = result.trim()
      if (text) setFormData((prev) => ({ ...prev, content: text }))
      showToast(text ? '已翻译' : '未返回内容', text ? 'success' : 'info')
    } catch (e) {
      if (entry && !axios.isCancel(e)) aiUsage?.setError(entry.id, (e as Error)?.message || '翻译失败')
      handleApiError(e, showToast, '翻译失败')
    } finally {
      setAiLoadingAction(null)
    }
  }
  const handleAIOutline = async () => {
    const topic = (formData.title || '').trim() || '文章主题'
    setAiLoadingAction('outline')
    try {
      await runStream('outline', { topic, title: formData.title }, (result) =>
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
      await runStream('grammar', { content: formData.content, lang: 'zh' }, (result) =>
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
      await runStream('spell', { content: formData.content, lang: 'zh' }, (result) =>
        showToast(result.trim() ? '拼写检查完成，查看 AI 面板' : '未发现明显问题', 'success')
      )
    } catch (e) {
      handleApiError(e, showToast, '拼写检查失败')
    }
  }
  const handleAIMeta = async () => {
    if (!formData.content.trim()) { showToast('请先输入正文', 'info'); return }
    setAiLoadingAction('meta')
    try {
      await runStream('meta', { content: formData.content, title: formData.title }, (result) =>
        showToast(result.trim() ? 'Meta 已生成，查看 AI 面板' : '未返回', result.trim() ? 'success' : 'info')
      )
    } catch (e) {
      handleApiError(e, showToast, '生成 Meta 失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">编辑文章</h1>
          <p className="text-sm text-muted-foreground">
            {isSaving ? '正在保存...' : lastSaved ? `上次保存: ${lastSaved.toLocaleTimeString()}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => saveNow()}>
            <Save className="mr-2 h-4 w-4" />立即保存
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowVersionHistory(!showVersionHistory)}>
            <History className="mr-2 h-4 w-4" />
            {showVersionHistory ? '隐藏版本历史' : '版本历史'}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/posts"><ArrowLeft className="mr-2 h-4 w-4" />返回</Link>
          </Button>
        </div>
      </div>

      <div className={showVersionHistory ? "grid grid-cols-1 lg:grid-cols-3 gap-6" : ""}>
        <div className={showVersionHistory ? "lg:col-span-2" : ""}>
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="grid gap-6">
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">文章标题 *</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="title"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="请输入标题"
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
                        required
                        value={formData.slug}
                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                        placeholder="例如: my-first-post"
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
                      value={formData.summary}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                      placeholder="简短描述"
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
                  value={formData.cover_image}
                  onChange={(url) => setFormData({ ...formData, cover_image: url })}
                />

                <div className="space-y-2">
                  <Label>分类与标签</Label>
                  <div className="flex flex-wrap gap-3 items-center">
                    <select
                      value={formData.category_id}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                      className={`${inputClass} min-w-[140px]`}
                    >
                      <option value="">无分类</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                      {tags.map((tag) => (
                        <label
                          key={tag.id}
                          className={`px-3 py-1.5 rounded-full cursor-pointer text-sm font-medium transition-colors ${
                            formData.tag_ids.includes(tag.id)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={formData.tag_ids.includes(tag.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, tag_ids: [...formData.tag_ids, tag.id] })
                              } else {
                                setFormData({ ...formData, tag_ids: formData.tag_ids.filter((id) => id !== tag.id) })
                              }
                            }}
                          />
                          {tag.name}
                        </label>
                      ))}
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

                <div className="space-y-2">
                  <Label>文章内容 *</Label>
                  <MarkdownEditor
                    value={formData.content}
                    onChange={(val) => setFormData({ ...formData, content: val })}
                    placeholder="支持 Markdown 格式，可使用工具栏快速插入"
                    rows={18}
                  />
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

                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_top}
                      onChange={(e) => setFormData({ ...formData, is_top: e.target.checked })}
                      className="rounded border-input"
                    />
                    <span className="text-sm font-medium">置顶文章</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.allow_comment}
                      onChange={(e) => setFormData({ ...formData, allow_comment: e.target.checked })}
                      className="rounded border-input"
                    />
                    <span className="text-sm font-medium">允许评论</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <Label>发布状态</Label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as 'draft' | 'published' | 'scheduled',
                      })
                    }
                    className={inputClass}
                  >
                    <option value="draft">草稿</option>
                    <option value="published">立即发布</option>
                    <option value="scheduled">定时发布</option>
                  </select>
                </div>

                {formData.status === 'scheduled' && (
                  <div className="space-y-2">
                    <Label htmlFor="published_at">定时发布时间</Label>
                    <Input
                      id="published_at"
                      type="datetime-local"
                      value={formData.published_at}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          published_at: e.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      仅当状态为“定时发布”时生效
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">访问密码（可选）</Label>
                    <Input
                      id="password"
                      type="text"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          password: e.target.value,
                        })
                      }
                      placeholder="设置后需输入密码才能访问；留空表示取消密码"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password_hint">密码提示（可选）</Label>
                    <Input
                      id="password_hint"
                      type="text"
                      value={formData.password_hint}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          password_hint: e.target.value,
                        })
                      }
                      placeholder="给读者的提示信息"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? '保存中...' : '保存更改'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    取消
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {showVersionHistory && (
          <div className="lg:col-span-1">
            <VersionHistory postId={postId} onRestore={handleRestore} />
          </div>
        )}
      </div>

    </div>
  )
}
