'use client'

import { useEffect, useState, useCallback } from 'react'
import { FriendLink } from '@/lib/types'
import { useToast } from '@/lib/hooks/useToast'
import { fetchFriendLinksAdmin, createFriendLink, updateFriendLink, deleteFriendLink } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Plus, X, Pencil, Trash2, Link2, ExternalLink } from 'lucide-react'

export default function LinksManagement() {
  const [links, setLinks] = useState<FriendLink[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingLink, setEditingLink] = useState<FriendLink | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [linkStatus, setLinkStatus] = useState('true')
  const { showToast } = useToast()

  const loadLinks = useCallback(async () => {
    try {
      const data = await fetchFriendLinksAdmin()
      setLinks(data)
    } catch {
      showToast('获取友链失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadLinks()
  }, [loadLinks])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name') as string,
      url: formData.get('url') as string,
      logo: formData.get('logo') as string,
      desc: formData.get('desc') as string,
      status: linkStatus === 'true',
      sort_order: parseInt(formData.get('sort_order') as string) || 0,
    }

    setSubmitting(true)
    try {
      if (editingLink) {
        await updateFriendLink(editingLink.id, data)
        showToast('更新成功', 'success')
      } else {
        await createFriendLink(data)
        showToast('创建成功', 'success')
      }
      setShowForm(false)
      setEditingLink(null)
      loadLinks()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (editingLink ? '更新失败' : '创建失败')
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个友链吗？')) return
    try {
      await deleteFriendLink(id)
      showToast('删除成功', 'success')
      loadLinks()
    } catch {
      showToast('删除失败', 'error')
    }
  }

  const handleEdit = (link: FriendLink) => {
    setEditingLink(link)
    setLinkStatus(link.status ? 'true' : 'false')
    setShowForm(true)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Card>
          <CardContent className="p-0">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4 p-4 border-b">
                <Skeleton className="h-8 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">友情链接管理</h1>
          <p className="text-muted-foreground">管理友链展示与排序</p>
        </div>
        <Button
          onClick={() => {
            setShowForm(!showForm)
            setEditingLink(null)
            setLinkStatus('true')
          }}
          variant={showForm ? 'outline' : 'default'}
        >
          {showForm ? <><X className="mr-2 h-4 w-4" />取消</> : <><Plus className="mr-2 h-4 w-4" />新建友链</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form key={editingLink?.id || 'new'} onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">网站名称</Label>
                  <Input id="name" name="name" required defaultValue={editingLink?.name || ''} placeholder="我的博客" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">网站地址</Label>
                  <Input id="url" name="url" type="url" required defaultValue={editingLink?.url || ''} placeholder="https://example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="logo">Logo 地址</Label>
                  <Input id="logo" name="logo" type="url" defaultValue={editingLink?.logo || ''} placeholder="https://example.com/logo.png" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sort_order">排序</Label>
                  <Input id="sort_order" name="sort_order" type="number" defaultValue={editingLink?.sort_order ?? 0} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">网站描述</Label>
                <Textarea id="desc" name="desc" rows={2} defaultValue={editingLink?.desc || ''} placeholder="简短描述..." />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label>状态</Label>
                  <Select value={linkStatus} onValueChange={setLinkStatus}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">启用</SelectItem>
                      <SelectItem value="false">禁用</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '提交中...' : (editingLink ? '更新' : '创建')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Logo</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>地址</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Link2 className="h-8 w-8" />
                      <p>暂无友链</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      {link.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={link.logo} alt={link.name} className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          N/A
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{link.name}</TableCell>
                    <TableCell>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm inline-flex items-center gap-1"
                      >
                        {link.url.length > 30 ? link.url.substring(0, 30) + '...' : link.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {link.desc || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{link.sort_order}</TableCell>
                    <TableCell>
                      <Badge variant={link.status ? 'default' : 'secondary'}>
                        {link.status ? '启用' : '禁用'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(link)}>
                            <Pencil className="mr-2 h-4 w-4" />编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(link.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
