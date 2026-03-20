'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import {
  getAllLocales,
  getLocale,
  createLocale,
  updateLocale,
  deleteLocale,
  exportLocales,
  importLocales,
} from '@/lib/api'
import { Locale } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Download, Upload, Globe2, Trash2, Save } from 'lucide-react'

export default function LocalesAdminPage() {
  const [languages, setLanguages] = useState<string[]>([])
  const [currentLang, setCurrentLang] = useState<string>('default')
  const [, setCurrentLocale] = useState<Locale | null>(null)
  const [rawJson, setRawJson] = useState<string>('{}')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const langs = await getAllLocales()
        setLanguages(langs)
      } catch {
        showToast('加载语言列表失败', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  useEffect(() => {
    const loadLocale = async () => {
      if (!currentLang || currentLang === 'default') {
        setCurrentLocale(null)
        setRawJson('{}')
        return
      }
      try {
        const locale = await getLocale(currentLang)
        setCurrentLocale(locale)
        setRawJson(JSON.stringify(locale.translations ?? {}, null, 2))
      } catch (error) {
        console.error('Failed to load locale:', error)
        showToast('加载语言包失败', 'error')
      }
    }
    void loadLocale()
  }, [currentLang, showToast])

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const lang = (form.elements.namedItem('language') as HTMLInputElement).value.trim()
    if (!lang) return
    try {
      await createLocale(lang, {})
      showToast('语言包创建成功', 'success')
      setLanguages((prev) => (prev.includes(lang) ? prev : [...prev, lang]))
      setCurrentLang(lang)
      setRawJson('{}')
    } catch {
      showToast('创建失败', 'error')
    }
  }

  const handleSave = async () => {
    if (!currentLang || currentLang === 'default') {
      showToast('请选择要编辑的语言', 'info')
      return
    }
    let parsed: Record<string, unknown> = {}
    try {
      parsed = rawJson.trim() ? JSON.parse(rawJson) : {}
    } catch {
      showToast('JSON 格式不正确', 'error')
      return
    }
    setSaving(true)
    try {
      await updateLocale(currentLang, parsed)
      showToast('保存成功', 'success')
    } catch {
      showToast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (lang: string) => {
    if (!confirm(`确定删除语言包 ${lang} 吗？`)) return
    try {
      await deleteLocale(lang)
      showToast('已删除', 'success')
      setLanguages((prev) => prev.filter((l) => l !== lang))
      if (currentLang === lang) {
        setCurrentLang('default')
      }
    } catch {
      showToast('删除失败', 'error')
    }
  }

  const handleExport = async () => {
    try {
      await exportLocales()
      showToast('导出任务已开始，如有下载会自动弹出', 'success')
    } catch {
      showToast('导出失败', 'error')
    }
  }

  const handleImport = async (file: File | null) => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      await importLocales(formData)
      showToast('导入成功', 'success')
      const langs = await getAllLocales()
      setLanguages(langs)
    } catch {
      showToast('导入失败', 'error')
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
          <h1 className="text-2xl font-bold tracking-tight">语言包管理</h1>
          <p className="text-muted-foreground">管理站点多语言文案</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            导出全部
          </Button>
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".json,.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  void handleImport(file)
                  e.target.value = ''
                }}
              />
              <span className="flex items-center gap-1.5">
                <Upload className="w-4 h-4" />
                导入
              </span>
            </label>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="w-4 h-4" />
              已有语言
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {languages.map((lang) => (
                <Badge
                  key={lang}
                  variant={currentLang === lang ? 'default' : 'secondary'}
                  className="flex items-center gap-1 cursor-pointer"
                  onClick={() => setCurrentLang(lang)}
                >
                  {lang}
                  <button
                    className="ml-1 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(lang)
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {languages.length === 0 && (
                <p className="text-sm text-muted-foreground">暂无语言包</p>
              )}
            </div>

            <form onSubmit={handleCreate} className="space-y-2">
              <Label htmlFor="language">新增语言</Label>
              <div className="flex gap-2">
                <Input
                  id="language"
                  name="language"
                  placeholder="例如: en, zh-TW"
                  className="flex-1"
                />
                <Button type="submit" size="sm">添加</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {currentLang === 'default' || !currentLang
                ? '请选择左侧语言进行编辑'
                : `编辑语言：${currentLang}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="json">
              <TabsList>
                <TabsTrigger value="json">JSON 编辑</TabsTrigger>
              </TabsList>
              <TabsContent value="json" className="space-y-3">
                <Textarea
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  rows={20}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </TabsContent>
            </Tabs>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || !currentLang || currentLang === 'default'}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '保存更改'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

