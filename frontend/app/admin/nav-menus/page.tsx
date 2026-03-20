'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { NavMenu, Category } from '@/lib/types'
import {
  fetchAdminNavMenus,
  fetchCategories,
  createNavMenu,
  updateNavMenu,
  deleteNavMenu,
  sortNavMenus,
} from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ChevronRight,
  ExternalLink,
  FolderTree,
  ArrowUp,
  ArrowDown,
  Navigation,
  Search,
  Home,
  PenTool,
  Code2,
  Cpu,
  Globe,
  Camera,
  Utensils,
  Share2,
  Server,
  MonitorSmartphone,
  Star,
  User,
  Package,
  BookOpen,
  Link2,
  Folder,
  Archive,
  Tags,
  Mail,
  Info,
  Heart,
  Music,
  Film,
  Gamepad2,
  Wrench,
  Newspaper,
  GraduationCap,
  Coffee,
  Palette,
  Rocket,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const LINK_TYPE_OPTIONS = [
  { value: 'group', label: '分组（下拉菜单）' },
  { value: 'page', label: '内置页面' },
  { value: 'category', label: '文章分类' },
  { value: 'external', label: '外部链接' },
]

const LINK_TYPE_COLORS: Record<string, string> = {
  group: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  page: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  category: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  external: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

const BUILT_IN_PAGES = [
  { value: '/archives', label: '文章归档' },
  { value: '/categories', label: '所有分类' },
  { value: '/tags', label: '标签云' },
  { value: '/links', label: '友情链接' },
  { value: '/series', label: '文章合集' },
  { value: '/resources', label: '我的装备' },
  { value: '/about', label: '关于博主' },
  { value: '/subscribe', label: '留明信片' },
  { value: '/milestones', label: '里程碑' },
  { value: '/changelogs', label: '更新日志' },
]

const ICON_OPTIONS = [
  'Home', 'PenTool', 'Code2', 'Cpu', 'Globe', 'Camera', 'Utensils',
  'Share2', 'Server', 'MonitorSmartphone', 'Star', 'User', 'Package',
  'BookOpen', 'Link2', 'Folder', 'Archive', 'Tags', 'Mail', 'Info',
  'Heart', 'Music', 'Film', 'Gamepad2', 'Wrench', 'Newspaper',
  'GraduationCap', 'Coffee', 'Palette', 'Rocket', 'Shield', 'Zap',
]

const ICON_MAP: Record<string, LucideIcon> = {
  Home, PenTool, Code2, Cpu, Globe, Camera, Utensils,
  Share2, Server, MonitorSmartphone, Star, User, Package,
  BookOpen, Link2, Folder, Archive, Tags, Mail, Info,
  Heart, Music, Film, Gamepad2, Wrench, Newspaper,
  GraduationCap, Coffee, Palette, Rocket, Shield, Zap,
}

// ────── 图标选择器 ──────
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(
    () => ICON_OPTIONS.filter(n => n.toLowerCase().includes(query.toLowerCase())),
    [query]
  )

  const SelectedIcon = ICON_MAP[value] || Folder

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className="mt-1 w-full justify-start gap-2 font-normal"
        >
          <SelectedIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left truncate text-sm">{value || '选择图标'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="搜索图标…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-6 gap-1 max-h-56 overflow-y-auto">
          {filtered.map(name => {
            const Icon = ICON_MAP[name] || Folder
            const selected = name === value
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => { onChange(name); setOpen(false); setQuery('') }}
                className={`
                  flex flex-col items-center justify-center gap-0.5 rounded-md p-1.5
                  transition-colors cursor-pointer text-[9px] leading-tight
                  ${selected
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'}
                `}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate w-full text-center">{name}</span>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <p className="col-span-6 py-4 text-center text-xs text-muted-foreground">
              未找到匹配图标
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface FormData {
  parent_id: number | null
  label: string
  link_type: string
  link_value: string
  icon: string
  sort_order: number
  is_visible: boolean
  open_new: boolean
}

const defaultFormData: FormData = {
  parent_id: null,
  label: '',
  link_type: 'page',
  link_value: '',
  icon: 'Folder',
  sort_order: 0,
  is_visible: true,
  open_new: false,
}

function flattenMenus(menus: NavMenu[]): NavMenu[] {
  const result: NavMenu[] = []
  for (const m of menus) {
    result.push(m)
    if (m.children && m.children.length > 0) {
      result.push(...flattenMenus(m.children))
    }
  }
  return result
}

function flattenCats(cats: Category[], prefix = ''): Category[] {
  const result: Category[] = []
  for (const c of cats) {
    result.push({ ...c, name: prefix + c.name })
    if (c.children && c.children.length > 0) {
      result.push(...flattenCats(c.children, prefix + c.name + ' / '))
    }
  }
  return result
}

export default function NavMenusAdminPage() {
  const [menus, setMenus] = useState<NavMenu[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<NavMenu | null>(null)
  const [formData, setFormData] = useState<FormData>(defaultFormData)
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  const fetchData = useCallback(async () => {
    try {
      const [menuData, catData] = await Promise.all([
        fetchAdminNavMenus(),
        fetchCategories(),
      ])
      setMenus(Array.isArray(menuData) ? menuData : [])
      const flatCats = flattenCats(Array.isArray(catData) ? catData : [])
      setCategories(flatCats)
    } catch (error) {
      handleApiError(error, showToast, '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openCreateDialog = (parentId: number | null = null) => {
    setEditing(null)
    const maxSort = getMaxSortOrder(parentId)
    setFormData({ ...defaultFormData, parent_id: parentId, sort_order: maxSort + 1 })
    setDialogOpen(true)
  }

  const openEditDialog = (menu: NavMenu) => {
    setEditing(menu)
    setFormData({
      parent_id: menu.parent_id,
      label: menu.label,
      link_type: menu.link_type,
      link_value: menu.link_value,
      icon: menu.icon,
      sort_order: menu.sort_order,
      is_visible: menu.is_visible,
      open_new: menu.open_new,
    })
    setDialogOpen(true)
  }

  const getMaxSortOrder = (parentId: number | null): number => {
    const siblings = parentId === null
      ? menus
      : flattenMenus(menus).find(m => m.id === parentId)?.children || []
    return siblings.reduce((max, m) => Math.max(max, m.sort_order), 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        ...formData,
        parent_id: formData.parent_id || undefined,
      }
      if (editing) {
        await updateNavMenu(editing.id, payload as Partial<NavMenu>)
        showToast('更新成功', 'success')
      } else {
        await createNavMenu(payload as Partial<NavMenu>)
        showToast('创建成功', 'success')
      }
      setDialogOpen(false)
      fetchData()
    } catch (error) {
      handleApiError(error, showToast, editing ? '更新失败' : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (menu: NavMenu) => {
    const hasChildren = menu.children && menu.children.length > 0
    const msg = hasChildren
      ? `确定删除「${menu.label}」及其所有子菜单吗？`
      : `确定删除「${menu.label}」吗？`
    if (!confirm(msg)) return
    try {
      await deleteNavMenu(menu.id)
      showToast('已删除', 'success')
      fetchData()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const handleToggleVisible = async (menu: NavMenu) => {
    try {
      await updateNavMenu(menu.id, { is_visible: !menu.is_visible } as Partial<NavMenu>)
      fetchData()
    } catch (error) {
      handleApiError(error, showToast, '更新失败')
    }
  }

  const handleMove = async (menu: NavMenu, direction: 'up' | 'down', siblings: NavMenu[]) => {
    const idx = siblings.findIndex(m => m.id === menu.id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return

    const items = siblings.map((m, i) => {
      let sort = m.sort_order
      if (i === idx) sort = siblings[swapIdx].sort_order
      if (i === swapIdx) sort = siblings[idx].sort_order
      return { id: m.id, sort_order: sort, parent_id: m.parent_id }
    })
    try {
      await sortNavMenus(items)
      fetchData()
    } catch (error) {
      handleApiError(error, showToast, '排序失败')
    }
  }

  const renderLinkValue = (menu: NavMenu) => {
    switch (menu.link_type) {
      case 'group':
        return <span className="text-muted-foreground text-xs">下拉分组</span>
      case 'category':
        return <span className="text-xs">/category/{menu.link_value}</span>
      case 'page':
        return <span className="text-xs">{menu.link_value}</span>
      case 'external':
        return (
          <a href={menu.link_value} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />{menu.link_value}
          </a>
        )
      default:
        return <span className="text-xs">{menu.link_value}</span>
    }
  }

  const renderMenuItem = (menu: NavMenu, siblings: NavMenu[], level = 0) => {
    const idx = siblings.findIndex(m => m.id === menu.id)
    const MenuIcon = ICON_MAP[menu.icon] || null
    return (
      <div key={menu.id}>
        <div className={`flex items-center gap-2 px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${!menu.is_visible ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${16 + level * 28}px` }}>
          <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />

          {level > 0 && (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {MenuIcon && (
                <MenuIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="font-medium text-sm">{menu.label}</span>
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${LINK_TYPE_COLORS[menu.link_type] || ''}`}>
                {LINK_TYPE_OPTIONS.find(o => o.value === menu.link_type)?.label || menu.link_type}
              </Badge>
              {menu.icon && (
                <span className="text-[10px] text-muted-foreground/60">{menu.icon}</span>
              )}
            </div>
            <div className="mt-0.5">{renderLinkValue(menu)}</div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              disabled={idx === 0}
              onClick={() => handleMove(menu, 'up', siblings)}
              title="上移">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              disabled={idx === siblings.length - 1}
              onClick={() => handleMove(menu, 'down', siblings)}
              title="下移">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => handleToggleVisible(menu)}
              title={menu.is_visible ? '隐藏' : '显示'}>
              {menu.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
            {menu.link_type === 'group' && (
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => openCreateDialog(menu.id)}
                title="添加子菜单">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => openEditDialog(menu)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => handleDelete(menu)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {menu.children && menu.children.length > 0 && (
          <div>
            {menu.children.map(child => renderMenuItem(child, menu.children!, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card><CardContent className="p-6"><Skeleton className="h-64" /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">导航管理</h1>
          <p className="text-muted-foreground">管理前台顶部导航菜单，支持分组和排序</p>
        </div>
        <Button onClick={() => openCreateDialog(null)}>
          <Plus className="mr-2 h-4 w-4" />添加菜单
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {menus.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Navigation className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm mb-4">还没有导航菜单，点击上方按钮添加</p>
              <Button variant="outline" size="sm" onClick={() => openCreateDialog(null)}>
                <Plus className="mr-2 h-4 w-4" />添加第一个菜单项
              </Button>
            </div>
          ) : (
            <div>
              {menus.map(menu => renderMenuItem(menu, menus, 0))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑菜单项' : '添加菜单项'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="label">显示名称</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={e => setFormData({ ...formData, label: e.target.value })}
                placeholder="如：技术分享"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label>链接类型</Label>
              <Select
                value={formData.link_type}
                onValueChange={val => setFormData({ ...formData, link_type: val, link_value: '' })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.link_type === 'page' && (
              <div>
                <Label>选择页面</Label>
                <Select
                  value={formData.link_value}
                  onValueChange={val => setFormData({ ...formData, link_value: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择内置页面" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUILT_IN_PAGES.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label} ({p.value})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.link_type === 'category' && (
              <div>
                <Label>选择分类</Label>
                <Select
                  value={formData.link_value}
                  onValueChange={val => setFormData({ ...formData, link_value: val })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择文章分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.link_type === 'external' && (
              <div>
                <Label htmlFor="link_value">外部链接</Label>
                <Input
                  id="link_value"
                  type="url"
                  value={formData.link_value}
                  onChange={e => setFormData({ ...formData, link_value: e.target.value })}
                  placeholder="https://example.com"
                  className="mt-1"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>图标</Label>
                <IconPicker
                  value={formData.icon}
                  onChange={val => setFormData({ ...formData, icon: val })}
                />
              </div>
              <div>
                <Label htmlFor="sort_order">排序</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={e => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>

            {formData.parent_id === null && (
              <div>
                <Label>所属分组</Label>
                <Select
                  value={formData.parent_id === null ? '__root__' : String(formData.parent_id)}
                  onValueChange={val => setFormData({
                    ...formData,
                    parent_id: val === '__root__' ? null : Number(val)
                  })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">顶级菜单</SelectItem>
                    {flattenMenus(menus).filter(m => m.link_type === 'group').map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        <FolderTree className="inline h-3.5 w-3.5 mr-1.5" />{m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_visible"
                  checked={formData.is_visible}
                  onCheckedChange={val => setFormData({ ...formData, is_visible: val })}
                />
                <Label htmlFor="is_visible">显示</Label>
              </div>
              {formData.link_type !== 'group' && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="open_new"
                    checked={formData.open_new}
                    onCheckedChange={val => setFormData({ ...formData, open_new: val })}
                  />
                  <Label htmlFor="open_new">新窗口打开</Label>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? '提交中...' : (editing ? '保存修改' : '添加')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
