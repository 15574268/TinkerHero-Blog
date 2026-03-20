'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import { getWatermarkConfig, updateWatermarkConfig, uploadWithWatermark } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ImageIcon, Save, Upload } from 'lucide-react'

export default function WatermarkAdminPage() {
  const [config, setConfig] = useState<{ enabled?: boolean; text?: string; position?: string; opacity?: number }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const cfg = await getWatermarkConfig()
        setConfig(cfg || {})
      } catch (error) {
        console.error('Failed to load watermark config:', error)
        showToast('加载水印配置失败', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  const handleFieldChange = (field: keyof typeof config, value: unknown) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateWatermarkConfig(config)
      setConfig(updated)
      showToast('保存成功', 'success')
    } catch {
      showToast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (file: File | null) => {
    if (!file) return
    try {
      const result = await uploadWithWatermark(file)
      showToast(`上传成功：${result.filename}`, 'success')
    } catch {
      showToast('上传失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">水印配置</h1>
          <p className="text-muted-foreground">为上传的图片自动添加水印</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? '保存中...' : '保存配置'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="w-4 h-4" />
            水印设置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>启用水印</Label>
              <p className="text-xs text-muted-foreground">
                仅对通过“水印上传”入口上传的图片生效
              </p>
            </div>
            <Switch
              checked={!!config.enabled}
              onCheckedChange={(checked) => handleFieldChange('enabled', checked)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="text">水印文字</Label>
              <Input
                id="text"
                value={config.text || ''}
                onChange={(e) => handleFieldChange('text', e.target.value)}
                placeholder="例如：My Blog"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">位置（如 top-left / center / bottom-right）</Label>
              <Input
                id="position"
                value={config.position || ''}
                onChange={(e) => handleFieldChange('position', e.target.value)}
                placeholder="bottom-right"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="opacity">不透明度（0-255）</Label>
            <Input
              id="opacity"
              type="number"
              value={config.opacity ?? 128}
              onChange={(e) => handleFieldChange('opacity', Number(e.target.value) || 0)}
              className="w-32"
            />
          </div>

          <div className="pt-4 border-t mt-4">
            <p className="text-sm text-muted-foreground mb-2">快速测试水印效果：</p>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    void handleUpload(file)
                    e.target.value = ''
                  }}
                />
                <span className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  带水印上传图片
                </span>
              </label>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

