'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import {
  getAutoLinkKeywords,
  createAutoLinkKeyword,
  updateAutoLinkKeyword,
  deleteAutoLinkKeyword,
  batchImportKeywords,
  previewAutoLink,
  getAutoLinkStats,
  suggestKeywords,
  exportAutoLinkKeywords,
  getAutoLinkConfig,
  updateAutoLinkConfig,
} from '@/lib/api'
import { AutoLinkKeyword, AutoLinkConfig } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Link2, Download, Upload, Wand2, Lightbulb, Settings } from 'lucide-react'

const defaultConfig: AutoLinkConfig = {
  enabled: true,
  link_posts: true,
  link_categories: true,
  link_tags: true,
  link_keywords: true,
  max_links_per_post: 5,
  min_keyword_length: 2,
  exclude_headings: true,
  exclude_code_blocks: true,
  exclude_links: true,
}

export default function AutoLinksAdminPage() {
  const [keywords, setKeywords] = useState<AutoLinkKeyword[]>([])
  const [config, setConfig] = useState<AutoLinkConfig>({ ...defaultConfig })
  const [stats, setStats] = useState<{
    keyword_count: number
    post_count: number
    category_count: number
    tag_count: number
  } | null>(null)
  const [previewInput, setPreviewInput] = useState<string>('')
  const [previewOutput, setPreviewOutput] = useState<string>('')
  const [suggested, setSuggested] = useState<Array<{ word: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [editing, setEditing] = useState<AutoLinkKeyword | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [list, st, cfg] = await Promise.all([
          getAutoLinkKeywords(),
          getAutoLinkStats(),
          getAutoLinkConfig().catch(() => null),
        ])
        setKeywords(list || [])
        setStats(st || null)
        if (cfg) setConfig({ ...defaultConfig, ...cfg })
      } catch (error) {
        console.error('Failed to load auto-link data:', error)
        showToast('加载自动内链配置失败', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const saved = await updateAutoLinkConfig(config)
      setConfig({ ...defaultConfig, ...saved })
      showToast('自动内链配置已保存（前台文章会按此配置生效）', 'success')
    } catch (error) {
      console.error('Failed to save auto-link config:', error)
      showToast('保存配置失败', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleKeywordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const payload: Partial<AutoLinkKeyword> = {
      keyword: (form.elements.namedItem('keyword') as HTMLInputElement).value,
      link: (form.elements.namedItem('link') as HTMLInputElement).value,
      title: (form.elements.namedItem('title') as HTMLInputElement).value,
      target: (form.elements.namedItem('target') as HTMLSelectElement).value || '_blank',
      rel: (form.elements.namedItem('rel') as HTMLInputElement).value || undefined,
      priority: Number((form.elements.namedItem('priority') as HTMLInputElement).value) || 0,
      max_count: Number((form.elements.namedItem('max_count') as HTMLInputElement).value) || 0,
    }
    setSubmitting(true)
    try {
      if (editing) {
        const updated = await updateAutoLinkKeyword(editing.id, payload)
        setKeywords((prev) => prev.map((k) => (k.id === updated.id ? updated : k)))
        showToast('关键词已更新', 'success')
      } else {
        const created = await createAutoLinkKeyword(payload)
        setKeywords((prev) => [...prev, created])
        showToast('关键词已创建', 'success')
      }
      setEditing(null)
      form.reset()
    } catch {
      showToast(editing ? '更新失败' : '创建失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteKeyword = async (id: number) => {
    if (!confirm('确定删除这个自动内链关键词吗？')) return
    try {
      await deleteAutoLinkKeyword(id)
      setKeywords((prev) => prev.filter((k) => k.id !== id))
      showToast('已删除', 'success')
    } catch {
      showToast('删除失败', 'error')
    }
  }

  const handleBatchImport = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (!value.trim()) return
    try {
      const lines = value.split('\n').map((l) => l.trim()).filter(Boolean)
      const payload: Partial<AutoLinkKeyword>[] = lines.map((line) => {
        const [keyword, link] = line.split(/\s+/)
        return { keyword, link, target: '_blank', priority: 0, max_count: 0 }
      })
      const res = await batchImportKeywords(payload)
      showToast(`导入成功：${res.count} 条`, 'success')
      const list = await getAutoLinkKeywords()
      setKeywords(list || [])
    } catch {
      showToast('批量导入失败', 'error')
    }
  }

  const handlePreview = async () => {
    if (!previewInput.trim()) {
      showToast('请先输入要预览的文章内容', 'info')
      return
    }
    try {
      const res = await previewAutoLink(previewInput, config)
      setPreviewOutput(res.processed || '')
      showToast(`预览完成，新增链接 ${res.added_links} 个`, 'success')
    } catch {
      showToast('预览失败', 'error')
    }
  }

  const handleSuggest = async () => {
    try {
      const res = await suggestKeywords()
      setSuggested(res || [])
    } catch {
      showToast('获取推荐关键词失败', 'error')
    }
  }

  const handleExport = async () => {
    try {
      await exportAutoLinkKeywords()
      showToast('导出任务已开始，如有下载会自动弹出', 'success')
    } catch {
      showToast('导出失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">自动内链管理</h1>
          <p className="text-muted-foreground">为文章内容中的关键词自动添加站内链接</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          导出配置
        </Button>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">全局配置</TabsTrigger>
          <TabsTrigger value="keywords">关键词规则</TabsTrigger>
          <TabsTrigger value="preview">预览效果</TabsTrigger>
          <TabsTrigger value="suggest">关键词建议</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" />
                全局设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">启用自动内链</Label>
                  <p className="text-sm text-muted-foreground">开启后文章中的关键词将自动添加链接</p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
                />
              </div>

              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium">链接来源</p>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <Label>链接文章</Label>
                    <Switch
                      checked={config.link_posts}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, link_posts: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>链接分类</Label>
                    <Switch
                      checked={config.link_categories}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, link_categories: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>链接标签</Label>
                    <Switch
                      checked={config.link_tags}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, link_tags: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>链接自定义关键词</Label>
                    <Switch
                      checked={config.link_keywords}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, link_keywords: v }))}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium">限制与排除</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="max_links">每篇文章最大链接数</Label>
                    <Input
                      id="max_links"
                      type="number"
                      min={1}
                      value={config.max_links_per_post}
                      onChange={(e) => setConfig((c) => ({ ...c, max_links_per_post: Number(e.target.value) || 1 }))}
                      className="w-32"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min_len">最小关键词长度</Label>
                    <Input
                      id="min_len"
                      type="number"
                      min={1}
                      value={config.min_keyword_length}
                      onChange={(e) => setConfig((c) => ({ ...c, min_keyword_length: Number(e.target.value) || 1 }))}
                      className="w-32"
                    />
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>排除标题</Label>
                      <p className="text-xs text-muted-foreground">不在 h1-h6 标题中添加链接</p>
                    </div>
                    <Switch
                      checked={config.exclude_headings}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, exclude_headings: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>排除代码块</Label>
                      <p className="text-xs text-muted-foreground">不在代码块中添加链接</p>
                    </div>
                    <Switch
                      checked={config.exclude_code_blocks}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, exclude_code_blocks: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>排除已有链接</Label>
                      <p className="text-xs text-muted-foreground">不在已有的 a 标签内容中添加链接</p>
                    </div>
                    <Switch
                      checked={config.exclude_links}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, exclude_links: v }))}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  配置保存后会应用到前台文章正文。切换到「预览效果」可查看替换结果。
                </p>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button onClick={handleSaveConfig} disabled={savingConfig}>
                  {savingConfig ? '保存中...' : '保存全局配置'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keywords" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editing ? '编辑关键词' : '新增关键词'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleKeywordSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="keyword">关键词</Label>
                  <Input
                    id="keyword"
                    name="keyword"
                    defaultValue={editing?.keyword}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link">链接地址</Label>
                  <Input
                    id="link"
                    name="link"
                    defaultValue={editing?.link}
                    required
                    placeholder="https://example.com/xxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">提示标题（可选）</Label>
                  <Input
                    id="title"
                    name="title"
                    defaultValue={editing?.title}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target">打开方式</Label>
                  <select
                    id="target"
                    name="target"
                    defaultValue={editing?.target || '_blank'}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="_blank">新窗口</option>
                    <option value="_self">当前窗口</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rel">rel 属性</Label>
                  <Input
                    id="rel"
                    name="rel"
                    defaultValue={editing?.rel || ''}
                    placeholder="如: nofollow"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">优先级</Label>
                  <Input
                    id="priority"
                    name="priority"
                    type="number"
                    defaultValue={editing?.priority ?? 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_count">单文最大替换次数</Label>
                  <Input
                    id="max_count"
                    name="max_count"
                    type="number"
                    defaultValue={editing?.max_count ?? 0}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>{submitting ? '提交中...' : (editing ? '保存' : '创建')}</Button>
                  {editing && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(null)}
                    >
                      取消编辑
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">关键词列表</CardTitle>
            </CardHeader>
            <CardContent>
              {keywords.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  暂无关键词规则。
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>关键词</TableHead>
                      <TableHead>链接</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead>最大次数</TableHead>
                      <TableHead className="w-[140px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keywords.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell>{k.keyword}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {k.link}
                        </TableCell>
                        <TableCell>{k.priority}</TableCell>
                        <TableCell>{k.max_count}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(k)}
                            >
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteKeyword(k.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4" />
                批量导入（每行：关键词 空格 链接）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={4}
                placeholder="例如：&#10;Next.js https://nextjs.org&#10;Golang https://go.dev"
                onBlur={handleBatchImport}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="w-4 h-4" />
                预览自动内链效果
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="preview_content">文章内容</Label>
                <Textarea
                  id="preview_content"
                  value={previewInput}
                  onChange={(e) => setPreviewInput(e.target.value)}
                  rows={8}
                />
              </div>
              <Button type="button" onClick={handlePreview}>
                生成预览
              </Button>
              {previewOutput && (
                <div className="space-y-2">
                  <Label>处理后的 HTML</Label>
                  <div className="border rounded-lg p-3 bg-muted/40">
                    <div
                      className="prose prose-sm max-w-none"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: previewOutput }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggest" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="w-4 h-4" />
                推荐关键词
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button type="button" variant="outline" size="sm" onClick={handleSuggest}>
                <Wand2 className="w-4 h-4 mr-1" />
                获取推荐关键词
              </Button>
              {suggested.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  点击上方按钮，从现有内容中分析推荐关键词。
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {suggested.map((s) => (
                    <Badge key={s.word} variant="secondary" className="gap-1">
                      {s.word}
                      <span className="text-[10px] text-muted-foreground">
                        ×{s.count}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {stats && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wand2 className="w-4 h-4" />
                  内链统计概览
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">关键词数量</p>
                  <p className="text-xl font-bold">{stats.keyword_count}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">文章数</p>
                  <p className="text-xl font-bold">{stats.post_count}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">分类数</p>
                  <p className="text-xl font-bold">{stats.category_count}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">标签数</p>
                  <p className="text-xl font-bold">{stats.tag_count}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

