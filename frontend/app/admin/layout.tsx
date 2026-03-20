'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Notification } from '@/lib/types'
import { AdminAIUsageProvider } from '@/lib/contexts/AdminAIUsageContext'
import AdminAIPanel from '@/components/admin/AdminAIPanel'
import { useToast } from '@/lib/hooks/useToast'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LayoutDashboard,
  FileText,
  File,
  MessageSquare,
  Link2,
  Users,
  ShieldAlert,
  Mail,
  Image,
  BarChart3,
  Settings,
  Bell,
  ExternalLink,
  LogOut,
  Wrench,
  ChevronRight,
  ChevronDown,
  User,
  Megaphone,
  Database,
  History,
  Menu,
} from 'lucide-react'
import { cn, resolveUploadUrl } from '@/lib/utils'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'

type MenuItem = {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  href?: string
  children?: MenuItem[]
  adminOnly?: boolean
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { showToast } = useToast()
  const { user, loading, logout } = useAuth()
  const { config } = useSiteConfig()
  const siteLogo = getConfigStr(config, 'site_logo')
  const logoUrl = siteLogo ? resolveUploadUrl(siteLogo) : null

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) return

      // token 通过 HttpOnly Cookie 自动携带，credentials: 'include' 保证 Cookie 发送
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/notifications`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setNotifications(Array.isArray(data) ? data : (data?.data || []))
        setUnreadCount((Array.isArray(data) ? data : (data?.data || [])).filter((n: Notification) => !n.is_read).length)
      }
    } catch {
      // Silent error
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (pathname === '/admin/login') return

    if (!loading && !user) {
      router.push('/admin/login')
      return
    }

    if (!loading && user && user.role !== 'admin' && user.role !== 'author') {
      showToast('权限不足', 'error')
      router.push('/')
      return
    }

    // author 角色不能访问管理员专属页面
    const adminOnlyPaths = ['/admin/users', '/admin/sensitive-words', '/admin/ip-blacklist', '/admin/subscribers', '/admin/settings', '/admin/announcements', '/admin/backups', '/admin/friend-link-applies']
    if (!loading && user && user.role !== 'admin' && adminOnlyPaths.some(p => pathname.startsWith(p))) {
      showToast('权限不足，仅管理员可访问', 'error')
      router.push('/admin')
      return
    }

  }, [mounted, pathname, router, showToast, user, loading])

  // 初次登录后拉取通知，之后每 5 分钟轮询一次（不随路由切换重复请求）
  useEffect(() => {
    if (!mounted || !user) return
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [mounted, user, fetchNotifications])

  const markAsRead = async (id: number) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/notifications/${id}/read`, {
        method: 'PUT',
        credentials: 'include',
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // Silent error
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/notifications/read-all`, {
        method: 'PUT',
        credentials: 'include',
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // Silent error
    }
  }

  const handleLogout = async () => {
    await logout()
    router.push('/admin/login')
  }

  // Avoid SSR/client hydration mismatch for client-only auth state
  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground" suppressHydrationWarning>
          加载中...
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    )
  }

  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  const mainContent = (
    <>
      {children}
      <AdminAIPanel />
    </>
  )

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: '总览',
      items: [
        { icon: LayoutDashboard, label: '仪表盘', href: '/admin' },
        { icon: User, label: '个人资料', href: '/admin/profile' },
      ],
    },
    {
      title: '内容管理',
      items: [
        {
          icon: FileText,
          label: '文章',
          children: [
            { label: '文章列表', href: '/admin/posts' },
            { label: '定时发布', href: '/admin/scheduled-posts' },
            { label: '文章模板', href: '/admin/templates' },
            { label: '分类管理', href: '/admin/categories' },
            { label: '标签管理', href: '/admin/tags' },
          ],
        },
        {
          icon: File,
          label: '页面与合集',
          children: [
            { label: '页面管理', href: '/admin/pages' },
            { label: '合集管理', href: '/admin/series' },
            { label: '导航管理', href: '/admin/nav-menus' },
          ],
        },
        {
          icon: Image,
          label: '资源与媒体',
          children: [
            { label: '媒体库', href: '/admin/media' },
            { label: '资源管理', href: '/admin/resources' },
          ],
        },
        {
          icon: History,
          label: '站点内容',
          children: [
            { label: '更新日志', href: '/admin/changelogs' },
            { label: '里程碑', href: '/admin/milestones' },
          ],
        },
      ],
    },
    {
      title: '互动与社区',
      items: [
        {
          icon: MessageSquare,
          label: '评论与互动',
          children: [
            { label: '评论管理', href: '/admin/comments' },
            { label: '死链检测', href: '/admin/dead-links' },
          ],
        },
        {
          icon: Link2,
          label: '友链',
          children: [
            { label: '友链管理', href: '/admin/links' },
            { label: '友链申请', href: '/admin/friend-link-applies', adminOnly: true },
          ],
        },
        {
          icon: Mail,
          label: '订阅',
          children: [
            { label: '订阅者', href: '/admin/subscribers', adminOnly: true },
          ],
        },
      ],
    },
    {
      title: '运营与数据',
      items: [
        {
          icon: Megaphone,
          label: '内容运营',
          children: [
            { label: '公告管理', href: '/admin/announcements', adminOnly: true },
          ],
        },
        {
          icon: BarChart3,
          label: '统计报表',
          children: [
            { label: '统计分析', href: '/admin/stats' },
          ],
        },
      ],
    },
    ...(user?.role === 'admin'
      ? [
          {
            title: '系统与安全',
            items: [
              {
                icon: Users,
                label: '用户与权限',
                children: [
                  { label: '用户管理', href: '/admin/users' },
                ],
              },
              {
                icon: ShieldAlert,
                label: '内容与安全',
                children: [
                  { label: '敏感词管理', href: '/admin/sensitive-words' },
                  { label: 'IP黑名单', href: '/admin/ip-blacklist' },
                  { label: '语言包管理', href: '/admin/locales' },
                ],
              },
              {
                icon: Database,
                label: '数据与备份',
                children: [
                  { label: '数据备份', href: '/admin/backups' },
                  { label: '打赏配置', href: '/admin/donation' },
                ],
              },
              {
                icon: Settings,
                label: '系统配置',
                children: [
                  { label: '系统设置', href: '/admin/settings' },
                  { label: '水印配置', href: '/admin/watermark' },
                  { label: '社交分享', href: '/admin/social' },
                  { label: '广告管理', href: '/admin/ads' },
                  { label: '短代码', href: '/admin/shortcodes' },
                  { label: '自动内链', href: '/admin/auto-links' },
                ],
              },
            ],
          },
        ]
      : []),
  ]

  const currentPageTitle = (() => {
    for (const section of menuSections) {
      for (const item of section.items) {
        if (item.href && pathname === item.href) return item.label
        if (item.children) {
          for (const child of item.children) {
            if (child.href && pathname.startsWith(child.href)) return child.label
          }
        }
      }
    }
    if (pathname === '/admin') return '仪表盘'
    if (pathname.includes('/posts/create')) return '新建文章'
    if (pathname.includes('/posts/edit')) return '编辑文章'
    return '后台管理'
  })()

  const renderNavItems = (onNavigate?: () => void) => (
    <nav className="p-4 space-y-4">
      {menuSections.map((section) => (
        <div key={section.title} className="space-y-1">
          <div className="px-4 py-1 text-xs font-semibold text-muted-foreground/70 tracking-wide">
            {section.title}
          </div>
          {section.items.map((item) => {
            const isParentActive =
              item.children?.some((child) => child.href && pathname.startsWith(child.href)) ?? false
            const isLeaf = !!item.href && !item.children
            const menuKey = `${section.title}::${item.label}`
            const isExpanded = openMenus[menuKey] ?? isParentActive

            if (isLeaf && item.href && item.icon) {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto shrink-0" />}
                </Link>
              )
            }

            const Icon = item.icon
            return (
              <div key={item.label} className="space-y-0.5">
                <div
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground/90 cursor-pointer",
                    isExpanded && "bg-muted text-foreground"
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setOpenMenus((prev) => ({
                      ...prev,
                      [menuKey]: !isExpanded,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpenMenus((prev) => ({
                        ...prev,
                        [menuKey]: !isExpanded,
                      }))
                    }
                  }}
                >
                  {Icon && <Icon className="w-4 h-4 shrink-0" />}
                  <span>{item.label}</span>
                  <ChevronDown
                    className={cn(
                      "w-3 h-3 ml-auto shrink-0 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>
                {isExpanded && (
                  <div className="ml-7 space-y-0.5">
                    {item.children
                      ?.filter((child) => !child.adminOnly || user?.role === 'admin')
                      .map((child) => {
                        if (!child.href) return null
                        const isActive = pathname.startsWith(child.href)
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavigate}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all duration-200",
                              isActive
                                ? "bg-primary/90 text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />
                            <span>{child.label}</span>
                          </Link>
                        )
                      })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )

  const sidebarHeader = (
    <div className="p-6 border-b border-border">
      <Link href="/admin" className="flex items-center gap-3">
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="w-10 h-10 rounded-xl object-contain" />
        ) : (
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 text-primary-foreground">
            <Wrench className="w-5 h-5" />
          </div>
        )}
        <span className="text-lg font-bold text-foreground">博客管理后台</span>
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-40 hidden lg:block">
        {sidebarHeader}
        <ScrollArea className="h-[calc(100vh-88px)]">
          {renderNavItems()}
        </ScrollArea>
      </aside>

      {/* Mobile Sidebar (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          {sidebarHeader}
          <ScrollArea className="h-[calc(100vh-88px)]">
            {renderNavItems(() => setMobileOpen(false))}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="h-16 bg-background/95 backdrop-blur-sm border-b sticky top-0 z-30">
          <div className="h-full px-4 lg:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{currentPageTitle}</h2>
                <p className="text-xs text-muted-foreground hidden sm:block">后台管理系统</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications */}
              <DropdownMenu open={showNotifications} onOpenChange={setShowNotifications}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-white text-xs rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <div className="flex items-center justify-between p-3 border-b">
                    <span className="font-medium">通知</span>
                    {unreadCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                        全部已读
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-80">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">暂无通知</div>
                    ) : (
                      notifications.slice(0, 5).map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => !notification.is_read && markAsRead(notification.id)}
                          className={cn(
                            "p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                            !notification.is_read && "bg-primary/5"
                          )}
                        >
                          <div className="font-medium text-sm">{notification.title}</div>
                          <div className="text-muted-foreground text-xs mt-1 line-clamp-2">
                            {notification.content}
                          </div>
                          <div className="text-muted-foreground/70 text-xs mt-1">
                            {new Date(notification.created_at).toLocaleString('zh-CN')}
                          </div>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/" target="_blank">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  查看网站
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2">
                    <Avatar className="h-8 w-8">
                      {user?.avatar && <AvatarImage src={resolveUploadUrl(user.avatar)} alt={user.username} />}
                      <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-sm">
                        {user?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline">{user?.username}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/admin/profile">
                      <User className="w-4 h-4 mr-2" />
                      个人资料
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">
          <AdminAIUsageProvider>
            {mainContent}
          </AdminAIUsageProvider>
        </main>
      </div>
    </div>
  )
}
