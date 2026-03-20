'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import {
  getShortcodes,
  previewShortcode,
  registerCustomShortcode,
  exportShortcodes,
} from '@/lib/api'
import { Shortcode } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Code2, Eye, Download, Plus, Copy, Play } from 'lucide-react'

export default function ShortcodesAdminPage() {
  const [shortcodes, setShortcodes] = useState<Shortcode[]>([])
  const [loading, setLoading] = useState(true)
  const [previewInput, setPreviewInput] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customTemplate, setCustomTemplate] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [registering, setRegistering] = useState(false)
  const { showToast } = useToast()

  const loadShortcodes = useCallback(async () => {
    try {
      const list = await getShortcodes()
      setShortcodes(list || [])
    } catch {
      showToast('加载短代码列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadShortcodes()
  }, [loadShortcodes])

  const handlePreview = async () => {
    if (!previewInput.trim()) {
      showToast('请输入短代码内容', 'info')
      return
    }
    setPreviewing(true)
    try {
      const res = await previewShortcode(previewInput)
      setPreviewHtml(res.html || '')
    } catch {
      showToast('预览失败', 'error')
    } finally {
      setPreviewing(false)
    }
  }

  const handleRegisterCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customName.trim() || !customTemplate.trim()) {
      showToast('名称和模板不能为空', 'info')
      return
    }
    setRegistering(true)
    try {
      await registerCustomShortcode({
        name: customName,
        template: customTemplate,
        description: customDescription,
      })
      showToast(`自定义短代码 [${customName}] 注册成功`, 'success')
      setCustomName('')
      setCustomTemplate('')
      setCustomDescription('')
      loadShortcodes()
    } catch {
      showToast('注册失败', 'error')
    } finally {
      setRegistering(false)
    }
  }

  const handleExport = async () => {
    try {
      await exportShortcodes()
      showToast('导出已开始', 'success')
    } catch {
      showToast('导出失败', 'error')
    }
  }

  const handleCopyExample = (example: string) => {
    navigator.clipboard.writeText(example)
    showToast('已复制到剪贴板', 'success')
  }

  const handleQuickPreview = (example: string) => {
    setPreviewInput(example)
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
          <h1 className="text-2xl font-bold tracking-tight">短代码管理</h1>
          <p className="text-muted-foreground">
            查看、预览和管理文章中可用的短代码
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          导出配置
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">
            <Code2 className="w-4 h-4 mr-1" />
            可用短代码
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="w-4 h-4 mr-1" />
            在线预览
          </TabsTrigger>
          <TabsTrigger value="custom">
            <Plus className="w-4 h-4 mr-1" />
            自定义短代码
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {shortcodes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                暂无可用短代码
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {shortcodes.map((sc) => (
                <Card key={sc.name} className="group">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          [{sc.name}]
                        </Badge>
                      </CardTitle>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {sc.example && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => handleCopyExample(sc.example)}
                              title="复制示例"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => handleQuickPreview(sc.example)}
                              title="快速预览"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sc.description && (
                      <p className="text-sm text-muted-foreground">
                        {sc.description}
                      </p>
                    )}
                    {sc.example && (
                      <pre className="text-xs bg-muted/60 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                        {sc.example}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4" />
                短代码预览
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="preview_input">输入短代码</Label>
                <Textarea
                  id="preview_input"
                  value={previewInput}
                  onChange={(e) => setPreviewInput(e.target.value)}
                  rows={5}
                  placeholder={'例如：[alert type="info" title="提示"]这是一段提示内容[/alert]'}
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={handlePreview} disabled={previewing}>
                <Play className="w-4 h-4 mr-2" />
                {previewing ? '渲染中...' : '预览效果'}
              </Button>
              {previewHtml && (
                <div className="space-y-2">
                  <Label>渲染结果</Label>
                  <div className="border rounded-lg p-4 bg-background min-h-[60px]">
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      查看 HTML 源码
                    </summary>
                    <pre className="mt-2 bg-muted/60 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                      {previewHtml}
                    </pre>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4" />
                注册自定义短代码
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegisterCustom} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom_name">短代码名称</Label>
                    <Input
                      id="custom_name"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="mycode"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      注册后使用 [mycode attr=&quot;val&quot;]内容[/mycode]
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom_desc">描述（可选）</Label>
                    <Input
                      id="custom_desc"
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      placeholder="自定义短代码的说明"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom_template">HTML 模板</Label>
                  <Textarea
                    id="custom_template"
                    value={customTemplate}
                    onChange={(e) => setCustomTemplate(e.target.value)}
                    rows={6}
                    placeholder={'<div class="{{style}}">\n  <h3>{{title}}</h3>\n  <p>{{content}}</p>\n</div>'}
                    className="font-mono text-sm"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    使用 {'{{属性名}}'} 引用属性值，{'{{content}}'} 引用短代码包裹的内容
                  </p>
                </div>
                <Button type="submit" disabled={registering}>
                  {registering ? '注册中...' : '注册短代码'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">模板语法说明</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                模板中可使用 <code className="bg-muted px-1 rounded">{'{{属性名}}'}</code> 来引用短代码属性。
              </p>
              <p>
                使用 <code className="bg-muted px-1 rounded">{'{{content}}'}</code> 来引用开闭标签之间的内容。
              </p>
              <div className="bg-muted/60 rounded-md p-3 font-mono text-xs space-y-1">
                <p>短代码: [mybox color=&quot;blue&quot; title=&quot;标题&quot;]内容[/mybox]</p>
                <p>模板: {'<div class="box box-{{color}}"><h3>{{title}}</h3>{{content}}</div>'}</p>
                <p>输出: {'<div class="box box-blue"><h3>标题</h3>内容</div>'}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
