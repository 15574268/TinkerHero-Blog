'use client'

import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import { getDonationConfigAdmin, updateDonationConfig, uploadFile } from '@/lib/api'
import { DonationConfig } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { HeartHandshake, Save, Upload, X } from 'lucide-react'

export default function DonationAdminPage() {
  const [config, setConfig] = useState<DonationConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAlipay, setUploadingAlipay] = useState(false)
  const [uploadingWechat, setUploadingWechat] = useState(false)
  const alipayInputRef = useRef<HTMLInputElement>(null)
  const wechatInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const cfg = await getDonationConfigAdmin()
        setConfig(cfg)
      } catch (error) {
        console.error('Failed to load donation config:', error)
        showToast('加载打赏配置失败', 'error')
        setConfig({
          id: 0,
          user_id: 0,
          enabled: false,
          default_amount: 500,
          show_donors: true,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  const handleFieldChange = (field: keyof DonationConfig, value: unknown) => {
    if (!config) return
    setConfig({ ...config, [field]: value } as DonationConfig)
  }

  const handleQRUpload = async (
    field: 'alipay_qr' | 'wechat_qr',
    file: File,
    setUploading: (v: boolean) => void,
  ) => {
    setUploading(true)
    try {
      const result = await uploadFile(file)
      handleFieldChange(field, result.url)
      showToast('上传成功', 'success')
    } catch {
      showToast('上传失败', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      const updated = await updateDonationConfig({
        enabled: config.enabled,
        alipay_qr: config.alipay_qr || undefined,
        wechat_qr: config.wechat_qr || undefined,
        paypal_link: config.paypal_link || undefined,
        default_amount: config.default_amount || undefined,
        custom_message: config.custom_message || undefined,
        show_donors: config.show_donors,
      })
      setConfig(updated)
      showToast('保存成功', 'success')
    } catch {
      showToast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !config) {
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
          <h1 className="text-2xl font-bold tracking-tight">打赏配置</h1>
          <p className="text-muted-foreground">配置站点的打赏方式与默认金额</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? '保存中...' : '保存配置'}
        </Button>
      </div>

      <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartHandshake className="w-5 h-5" />
                打赏渠道
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>启用打赏</Label>
                  <p className="text-xs text-muted-foreground">
                    关闭后，前台将不再显示打赏入口
                  </p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => handleFieldChange('enabled', checked)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 支付宝收款码 */}
                <div className="space-y-2">
                  <Label>支付宝收款码</Label>
                  <div className="flex gap-2">
                    <Input
                      value={config.alipay_qr || ''}
                      onChange={(e) => handleFieldChange('alipay_qr', e.target.value)}
                      placeholder="图片 URL 或点击上传"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={uploadingAlipay}
                      onClick={() => alipayInputRef.current?.click()}
                      title="上传图片"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                    <input
                      ref={alipayInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleQRUpload('alipay_qr', file, setUploadingAlipay)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  {config.alipay_qr && (
                    <div className="relative inline-block mt-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={config.alipay_qr}
                        alt="支付宝收款码预览"
                        className="rounded-md border object-contain w-[120px] h-[120px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleFieldChange('alipay_qr', '')}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center hover:opacity-80"
                        title="移除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {uploadingAlipay && (
                    <p className="text-xs text-muted-foreground">上传中...</p>
                  )}
                </div>

                {/* 微信收款码 */}
                <div className="space-y-2">
                  <Label>微信收款码</Label>
                  <div className="flex gap-2">
                    <Input
                      value={config.wechat_qr || ''}
                      onChange={(e) => handleFieldChange('wechat_qr', e.target.value)}
                      placeholder="图片 URL 或点击上传"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={uploadingWechat}
                      onClick={() => wechatInputRef.current?.click()}
                      title="上传图片"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                    <input
                      ref={wechatInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleQRUpload('wechat_qr', file, setUploadingWechat)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  {config.wechat_qr && (
                    <div className="relative inline-block mt-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={config.wechat_qr}
                        alt="微信收款码预览"
                        className="rounded-md border object-contain w-[120px] h-[120px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleFieldChange('wechat_qr', '')}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center hover:opacity-80"
                        title="移除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {uploadingWechat && (
                    <p className="text-xs text-muted-foreground">上传中...</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paypal_link">PayPal 链接</Label>
                <Input
                  id="paypal_link"
                  value={config.paypal_link || ''}
                  onChange={(e) => handleFieldChange('paypal_link', e.target.value)}
                  placeholder="https://paypal.me/yourname"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default_amount">默认金额（单位：元，后端按分存储）</Label>
                  <Input
                    id="default_amount"
                    type="number"
                    min={0}
                    step={0.01}
                    value={typeof config.default_amount === 'number' ? config.default_amount / 100 : ''}
                    onChange={(e) => handleFieldChange('default_amount', Math.round((Number(e.target.value) || 0) * 100))}
                    className="w-32"
                  />
                </div>
                <div className="space-y-2">
                  <Label>展示打赏名单</Label>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={config.show_donors}
                      onCheckedChange={(checked) => handleFieldChange('show_donors', checked)}
                    />
                    <span className="text-sm text-muted-foreground">
                      在前台展示最近的打赏记录
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom_message">打赏提示语</Label>
                <Input
                  id="custom_message"
                  value={config.custom_message || ''}
                  onChange={(e) => handleFieldChange('custom_message', e.target.value)}
                  placeholder="感谢你的支持！"
                />
              </div>
            </CardContent>
          </Card>
    </div>
  )
}

