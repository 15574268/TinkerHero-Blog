'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import { getShareConfigs, updateShareConfig, getShareHistory } from '@/lib/api'
import { SocialShareConfig, SocialShare } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Share2, Save } from 'lucide-react'

export default function SocialAdminPage() {
  const [configs, setConfigs] = useState<SocialShareConfig[]>([])
  const [history, setHistory] = useState<SocialShare[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [cfgs, his] = await Promise.all([
          getShareConfigs(),
          getShareHistory({}),
        ])
        // 后台配置中不展示「复制链接」平台（该按钮由前台本地实现）
        setConfigs((cfgs || []).filter((c) => c.platform !== 'copy'))
        setHistory(his.data || [])
      } catch (error) {
        console.error('Failed to load social configs/history:', error)
        showToast('加载社交分享配置失败', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  const handleConfigChange = (id: number, field: keyof SocialShareConfig, value: unknown) => {
    setConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } as SocialShareConfig : c)),
    )
  }

  const handleSaveConfig = async (cfg: SocialShareConfig) => {
    setSavingId(cfg.id)
    try {
      const updated = await updateShareConfig(cfg.id, {
        enabled: cfg.enabled,
        app_id: cfg.app_id,
        redirect_uri: cfg.redirect_uri,
        default_hashtags: cfg.default_hashtags,
        default_via: cfg.default_via,
        show_count: cfg.show_count,
      })
      setConfigs((prev) => prev.map((c) => (c.id === cfg.id ? updated : c)))
      showToast('保存成功', 'success')
    } catch {
      showToast('保存失败', 'error')
    } finally {
      setSavingId(null)
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">社交分享管理</h1>
        <p className="text-muted-foreground">配置社交平台分享参数并查看分享记录</p>
      </div>

      <Tabs defaultValue="configs">
        <TabsList>
          <TabsTrigger value="configs">平台配置</TabsTrigger>
          <TabsTrigger value="history">分享记录</TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {configs.map((cfg) => (
              <Card key={cfg.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{cfg.platform}</span>
                    <Badge variant={cfg.enabled ? 'default' : 'secondary'}>
                      {cfg.enabled ? '启用中' : '已禁用'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>启用平台</Label>
                      <p className="text-xs text-muted-foreground">
                        控制该平台分享按钮是否在前台显示
                      </p>
                    </div>
                    <Switch
                      checked={cfg.enabled}
                      onCheckedChange={(checked) => handleConfigChange(cfg.id, 'enabled', checked)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`app_${cfg.id}`}>App ID / Key</Label>
                    <Input
                      id={`app_${cfg.id}`}
                      value={cfg.app_id || ''}
                      onChange={(e) => handleConfigChange(cfg.id, 'app_id', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`redirect_${cfg.id}`}>回调地址</Label>
                    <Input
                      id={`redirect_${cfg.id}`}
                      value={cfg.redirect_uri || ''}
                      onChange={(e) => handleConfigChange(cfg.id, 'redirect_uri', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`hashtags_${cfg.id}`}>默认标签</Label>
                    <Input
                      id={`hashtags_${cfg.id}`}
                      value={cfg.default_hashtags || ''}
                      onChange={(e) =>
                        handleConfigChange(cfg.id, 'default_hashtags', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`via_${cfg.id}`}>默认 via / from</Label>
                    <Input
                      id={`via_${cfg.id}`}
                      value={cfg.default_via || ''}
                      onChange={(e) =>
                        handleConfigChange(cfg.id, 'default_via', e.target.value)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={cfg.show_count}
                        onCheckedChange={(checked) =>
                          handleConfigChange(cfg.id, 'show_count', checked)
                        }
                      />
                      <span className="text-sm text-muted-foreground">显示分享次数</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSaveConfig(cfg)}
                      disabled={savingId === cfg.id}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {savingId === cfg.id ? '保存中...' : '保存'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {configs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                暂无可配置的社交平台，如需支持可在后端增加配置记录。
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Share2 className="w-4 h-4" />
                最近分享记录
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  暂无分享记录
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文章 ID</TableHead>
                      <TableHead>平台</TableHead>
                      <TableHead>链接</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.slice(0, 50).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.post_id}</TableCell>
                        <TableCell>{item.platform}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {item.share_url}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

