'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import {
  getAdPlacements,
  createAdPlacement,
  updateAdPlacement,
  deleteAdPlacement,
  getAds,
  createAd,
  updateAd,
  deleteAd,
  getAdStats,
} from '@/lib/api'
import { AdPlacement, AdContent, AdStats } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Trash2, Pencil, MonitorSmartphone, BarChart3 } from 'lucide-react'

export default function AdsAdminPage() {
  const [placements, setPlacements] = useState<AdPlacement[]>([])
  const [ads, setAds] = useState<AdContent[]>([])
  const [stats, setStats] = useState<AdStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingPlacement, setEditingPlacement] = useState<AdPlacement | null>(null)
  const [editingAd, setEditingAd] = useState<AdContent | null>(null)
  const [submittingPlacement, setSubmittingPlacement] = useState(false)
  const [submittingAd, setSubmittingAd] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [pl, adList, st] = await Promise.all([
          getAdPlacements(),
          getAds(),
          getAdStats({}),
        ])
        setPlacements(pl || [])
        setAds(adList || [])
        setStats(st)
      } catch (error) {
        console.error('Failed to load ads data:', error)
        showToast('加载广告配置失败', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  const handlePlacementSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const payload: Partial<AdPlacement> = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      code: (form.elements.namedItem('code') as HTMLInputElement).value,
      location: (form.elements.namedItem('location') as HTMLInputElement).value,
      description: (form.elements.namedItem('description') as HTMLInputElement).value,
      width: Number((form.elements.namedItem('width') as HTMLInputElement).value) || 0,
      height: Number((form.elements.namedItem('height') as HTMLInputElement).value) || 0,
    }
    setSubmittingPlacement(true)
    try {
      if (editingPlacement) {
        const updated = await updateAdPlacement(editingPlacement.id, payload)
        setPlacements((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        showToast('广告位已更新', 'success')
      } else {
        const created = await createAdPlacement(payload)
        setPlacements((prev) => [...prev, created])
        showToast('广告位已创建', 'success')
      }
      setEditingPlacement(null)
      form.reset()
    } catch {
      showToast(editingPlacement ? '更新失败' : '创建失败', 'error')
    } finally {
      setSubmittingPlacement(false)
    }
  }

  const handleDeletePlacement = async (id: number) => {
    if (!confirm('确定删除该广告位及其关联广告吗？')) return
    try {
      await deleteAdPlacement(id)
      setPlacements((prev) => prev.filter((p) => p.id !== id))
      setAds((prev) => prev.filter((a) => a.placement_id !== id))
      showToast('广告位已删除', 'success')
    } catch {
      showToast('删除失败', 'error')
    }
  }

  const handleAdSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const payload: Partial<AdContent> = {
      placement_id: Number((form.elements.namedItem('placement_id') as HTMLSelectElement).value),
      title: (form.elements.namedItem('title') as HTMLInputElement).value,
      image_url: (form.elements.namedItem('image_url') as HTMLInputElement).value,
      link_url: (form.elements.namedItem('link_url') as HTMLInputElement).value,
      type: (form.elements.namedItem('type') as HTMLSelectElement).value || 'image',
    }
    setSubmittingAd(true)
    try {
      if (editingAd) {
        const updated = await updateAd(editingAd.id, payload)
        setAds((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
        showToast('广告已更新', 'success')
      } else {
        const created = await createAd(payload)
        setAds((prev) => [...prev, created])
        showToast('广告已创建', 'success')
      }
      setEditingAd(null)
      form.reset()
    } catch {
      showToast(editingAd ? '更新失败' : '创建失败', 'error')
    } finally {
      setSubmittingAd(false)
    }
  }

  const handleDeleteAd = async (id: number) => {
    if (!confirm('确定删除该广告吗？')) return
    try {
      await deleteAd(id)
      setAds((prev) => prev.filter((a) => a.id !== id))
      showToast('广告已删除', 'success')
    } catch {
      showToast('删除失败', 'error')
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
        <h1 className="text-2xl font-bold tracking-tight">广告管理</h1>
        <p className="text-muted-foreground">管理站点广告位与广告内容</p>
      </div>

      <Tabs defaultValue="placements">
        <TabsList>
          <TabsTrigger value="placements">广告位</TabsTrigger>
          <TabsTrigger value="ads">广告内容</TabsTrigger>
          <TabsTrigger value="stats">效果统计</TabsTrigger>
        </TabsList>

        <TabsContent value="placements" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editingPlacement ? '编辑广告位' : '新建广告位'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePlacementSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="name">名称</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingPlacement?.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">代码</Label>
                  <Input
                    id="code"
                    name="code"
                    defaultValue={editingPlacement?.code}
                    required
                    placeholder="如: sidebar_top"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">位置描述</Label>
                  <Input
                    id="location"
                    name="location"
                    defaultValue={editingPlacement?.location}
                    placeholder="例如：侧边栏顶部"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">宽度</Label>
                  <Input
                    id="width"
                    name="width"
                    type="number"
                    defaultValue={editingPlacement?.width ?? 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">高度</Label>
                  <Input
                    id="height"
                    name="height"
                    type="number"
                    defaultValue={editingPlacement?.height ?? 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">描述</Label>
                  <Input
                    id="description"
                    name="description"
                    defaultValue={editingPlacement?.description}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submittingPlacement}>
                    {submittingPlacement ? '提交中...' : editingPlacement ? '保存' : '创建'}
                  </Button>
                  {editingPlacement && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingPlacement(null)}
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
              <CardTitle className="text-base">已有广告位</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {placements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  暂无广告位，请先创建。
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>代码</TableHead>
                      <TableHead>位置</TableHead>
                      <TableHead>尺寸</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {placements.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.code}</TableCell>
                        <TableCell className="text-muted-foreground">{p.location}</TableCell>
                        <TableCell>
                          {p.width} × {p.height}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.is_active ? 'default' : 'secondary'}>
                            {p.is_active ? '启用' : '停用'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingPlacement(p)}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeletePlacement(p.id)}
                            >
                              <Trash2 className="w-3 h-3" />
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
        </TabsContent>

        <TabsContent value="ads" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">新建 / 编辑广告</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="placement_id">广告位</Label>
                  <Select
                    defaultValue={editingAd?.placement_id?.toString() || placements[0]?.id?.toString()}
                    name="placement_id"
                  >
                    <SelectTrigger id="placement_id">
                      <SelectValue placeholder="选择广告位" />
                    </SelectTrigger>
                    <SelectContent>
                      {placements.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name} ({p.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">标题</Label>
                  <Input
                    id="title"
                    name="title"
                    defaultValue={editingAd?.title}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image_url">图片地址</Label>
                  <Input
                    id="image_url"
                    name="image_url"
                    defaultValue={editingAd?.image_url}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link_url">跳转链接</Label>
                  <Input
                    id="link_url"
                    name="link_url"
                    defaultValue={editingAd?.link_url}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">类型</Label>
                  <Select defaultValue={editingAd?.type || 'image'} name="type">
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">图片</SelectItem>
                      <SelectItem value="html">HTML 代码</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submittingAd || placements.length === 0}>
                    {submittingAd ? '提交中...' : (editingAd ? '保存' : '创建')}
                  </Button>
                  {editingAd && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingAd(null)}
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
              <CardTitle className="text-base">广告列表</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {ads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  暂无广告，请先创建。
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>广告位</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>展示 / 点击</TableHead>
                      <TableHead className="w-[140px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ads.map((ad) => (
                      <TableRow key={ad.id}>
                        <TableCell>{ad.title}</TableCell>
                        <TableCell>
                          {placements.find((p) => p.id === ad.placement_id)?.name || ad.placement_id}
                        </TableCell>
                        <TableCell>{ad.type}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {ad.view_count} / {ad.click_count} ({ad.click_rate}%)
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingAd(ad)}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteAd(ad.id)}
                            >
                              <Trash2 className="w-3 h-3" />
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
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MonitorSmartphone className="w-4 h-4" />
                广告效果统计
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {stats ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">总展示</p>
                      <p className="text-xl font-bold">{stats.total_views}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">总点击</p>
                      <p className="text-xl font-bold">{stats.total_clicks}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">平均点击率</p>
                      <p className="text-xl font-bold">{stats.avg_click_rate.toFixed(2)}%</p>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>广告</TableHead>
                        <TableHead>广告位</TableHead>
                        <TableHead>展示</TableHead>
                        <TableHead>点击</TableHead>
                        <TableHead>点击率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stats.ad_stats ?? []).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.title}</TableCell>
                          <TableCell>{s.placement}</TableCell>
                          <TableCell>{s.view_count}</TableCell>
                          <TableCell>{s.click_count}</TableCell>
                          <TableCell>{s.click_rate.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BarChart3 className="w-8 h-8 mb-3" />
                  暂无统计数据
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

