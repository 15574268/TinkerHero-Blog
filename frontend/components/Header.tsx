'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { useNavMenus } from '@/lib/contexts/NavMenuContext'
import { fetchNavMenus } from '@/lib/api'
import { DEFAULT_SITE_NAME } from '@/lib/constants'
import { resolveUploadUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NavMenu } from '@/lib/types'
import {
  Home,
  Folder,
  Tags,
  Archive,
  Info,
  Search,
  Menu,
  Wrench,
  BookOpen,
  Link2,
  ChevronDown,
  PenTool,
  Camera,
  Utensils,
  Cpu,
  Share2,
  Server,
  Globe,
  Code2,
  MonitorSmartphone,
  Star,
  User,
  Package,
  Mail,
  Sun,
  Moon,
  Heart,
  Music,
  Film,
  Gamepad2,
  Newspaper,
  GraduationCap,
  Coffee,
  Palette,
  Rocket,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Home, Folder, Tags, Archive, Info, Search, Wrench, BookOpen, Link2,
  PenTool, Camera, Utensils, Cpu, Share2, Server, Globe, Code2,
  MonitorSmartphone, Star, User, Package, Mail, Heart, Music, Film,
  Gamepad2, Newspaper, GraduationCap, Coffee, Palette, Rocket, Shield, Zap,
}

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Folder
}

function resolveHref(menu: NavMenu): string {
  switch (menu.link_type) {
    case 'category':
      return `/category/${menu.link_value}`
    case 'page':
    case 'external':
      return menu.link_value
    default:
      return '#'
  }
}

interface RenderedNavItem {
  label: string
  icon: LucideIcon
  href?: string
  openNew?: boolean
  children?: { label: string; icon: LucideIcon; href: string; openNew?: boolean }[]
}

function toNavItems(menus: NavMenu[]): RenderedNavItem[] {
  return menus.map((m) => {
    if (m.link_type === 'group' && m.children && m.children.length > 0) {
      return {
        label: m.label,
        icon: getIcon(m.icon),
        children: m.children.map((child) => ({
          label: child.label,
          icon: getIcon(child.icon),
          href: resolveHref(child),
          openNew: child.open_new,
        })),
      }
    }
    return {
      label: m.label,
      icon: getIcon(m.icon),
      href: resolveHref(m),
      openNew: m.open_new,
    }
  })
}

function toMobileLinks(menus: NavMenu[]): { label: string; icon: LucideIcon; href: string; openNew?: boolean }[] {
  const links: { label: string; icon: LucideIcon; href: string; openNew?: boolean }[] = []
  for (const m of menus) {
    if (m.link_type === 'group') {
      if (m.children) {
        for (const child of m.children) {
          links.push({
            label: child.label,
            icon: getIcon(child.icon),
            href: resolveHref(child),
            openNew: child.open_new,
          })
        }
      }
    } else {
      links.push({
        label: m.label,
        icon: getIcon(m.icon),
        href: resolveHref(m),
        openNew: m.open_new,
      })
    }
  }
  return links
}

function NavDropdown({ items, isOpen }: { items: NonNullable<RenderedNavItem['children']>; isOpen: boolean }) {
  if (!isOpen) return null
  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50">
      <div role="menu" className="bg-card border border-border/60 rounded-xl shadow-lg py-2 min-w-[160px] animate-fade-in-down">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            target={item.openNew ? '_blank' : undefined}
            rel={item.openNew ? 'noopener noreferrer' : undefined}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Header() {
  const { config } = useSiteConfig()
  const { menus: contextMenus } = useNavMenus()
  const siteName = getConfigStr(config, 'site_name', DEFAULT_SITE_NAME)
  const siteSlogan = getConfigStr(config, 'site_slogan', '')
  const siteLogo = getConfigStr(config, 'site_logo')
  const logoUrl = siteLogo ? resolveUploadUrl(siteLogo) : null

  const [scrolled, setScrolled] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [apiMenus, setApiMenus] = useState<NavMenu[] | null>(contextMenus)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const fetchMenus = useCallback(async () => {
    try {
      const data = await fetchNavMenus()
      if (Array.isArray(data)) setApiMenus(data)
    } catch {
      // Silent - will use context fallback
    }
  }, [])

  useEffect(() => {
    if (contextMenus != null) {
      setApiMenus(contextMenus)
      return
    }
    fetchMenus()
  }, [contextMenus, fetchMenus])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    setIsDark(document.documentElement.classList.contains('dark'))

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const toggleTheme = () => {
    const html = document.documentElement
    if (html.classList.contains('dark')) {
      html.classList.remove('dark')
      localStorage.setItem('theme', 'light')
      setIsDark(false)
    } else {
      html.classList.add('dark')
      localStorage.setItem('theme', 'dark')
      setIsDark(true)
    }
  }

  const handleMouseEnter = (label: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setOpenDropdown(label)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpenDropdown(null), 150)
  }

  const handleDropdownToggle = (label: string) => {
    setOpenDropdown((prev) => (prev === label ? null : label))
  }

  const handleDropdownKeyDown = (e: React.KeyboardEvent, label: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleDropdownToggle(label)
    } else if (e.key === 'Escape') {
      setOpenDropdown(null)
    }
  }

  const handleDropdownBlur = (e: React.FocusEvent) => {
    // Close only when focus leaves the entire dropdown container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setOpenDropdown(null)
    }
  }

  const dynamicItems = apiMenus ? toNavItems(apiMenus) : []
  const navItems: RenderedNavItem[] = [
    { href: '/', label: '首页', icon: Home },
    ...dynamicItems,
  ]

  const dynamicMobileLinks = apiMenus ? toMobileLinks(apiMenus) : []
  const allMobileLinks = [
    { href: '/', label: '首页', icon: Home },
    ...dynamicMobileLinks,
    { href: '/search', label: '搜索', icon: Search },
  ]

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'glass shadow-sm border-b border-border/40'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={siteName}
                width={36}
                height={36}
                className="rounded-xl object-contain bg-muted"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-white shadow-glow-sm group-hover:shadow-glow transition-shadow duration-300">
                <Wrench className="w-4.5 h-4.5" />
              </div>
            )}
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="font-bold text-foreground tracking-tight group-hover:text-primary transition-colors duration-200 text-[15px]">
                {siteName}
              </span>
              {siteSlogan ? (
                <span className="text-[10px] text-muted-foreground tracking-wider">{siteSlogan}</span>
              ) : null}
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {navItems.map((item) => (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => item.children && handleMouseEnter(item.label)}
                onMouseLeave={handleMouseLeave}
                onBlur={item.children ? handleDropdownBlur : undefined}
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    target={item.openNew ? '_blank' : undefined}
                    rel={item.openNew ? 'noopener noreferrer' : undefined}
                    className="relative px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-all duration-200 font-medium flex items-center gap-1.5 group/nav"
                  >
                    <item.icon className="w-4 h-4 opacity-70 group-hover/nav:opacity-100 transition-opacity" />
                    <span>{item.label}</span>
                    <span className="absolute bottom-0.5 left-0 right-0 h-0.5 bg-primary rounded-full scale-x-0 origin-center transition-transform duration-300 group-hover/nav:scale-x-100" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-expanded={openDropdown === item.label}
                    aria-haspopup="menu"
                    onClick={() => handleDropdownToggle(item.label)}
                    onKeyDown={(e) => handleDropdownKeyDown(e, item.label)}
                    className="relative px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-all duration-200 font-medium flex items-center gap-1.5 group/nav"
                  >
                    <item.icon className="w-4 h-4 opacity-70 group-hover/nav:opacity-100 transition-opacity" />
                    <span>{item.label}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === item.label ? 'rotate-180' : ''}`} />
                  </button>
                )}
                {item.children && (
                  <NavDropdown items={item.children} isOpen={openDropdown === item.label} />
                )}
              </div>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="hidden lg:flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="rounded-xl hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Link href="/search" aria-label="Search">
                <Search className="w-[18px] h-[18px]" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl hover:bg-primary/10 hover:text-primary transition-colors"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              suppressHydrationWarning
            >
              <span suppressHydrationWarning>
                {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
              </span>
            </Button>
          </div>

          {/* Mobile Menu */}
          <div className="flex items-center gap-1 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="rounded-xl hover:bg-primary/10 hover:text-primary"
            >
              <Link href="/search" aria-label="搜索">
                <Search className="w-[18px] h-[18px]" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl hover:bg-primary/10 hover:text-primary"
              onClick={toggleTheme}
              aria-label="切换主题"
              suppressHydrationWarning
            >
              <span suppressHydrationWarning>
                {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
              </span>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl" aria-label="打开菜单">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] p-0">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <ScrollArea className="h-full">
                  <div className="p-6">
                    <Link href="/" className="flex items-center gap-3 mb-6">
                      {logoUrl ? (
                        <Image
                          src={logoUrl}
                          alt={siteName}
                          width={40}
                          height={40}
                          className="rounded-xl object-contain bg-muted"
                        />
                      ) : (
                        <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center text-white shadow-glow-sm">
                          <Wrench className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex flex-col leading-tight">
                        <span className="font-bold text-lg tracking-tight">{siteName}</span>
                        {siteSlogan ? (
                          <span className="text-[10px] text-muted-foreground tracking-wider">{siteSlogan}</span>
                        ) : null}
                      </div>
                    </Link>

                    <nav className="space-y-1">
                      {allMobileLinks.map((item) => (
                        <Link
                          key={item.href + item.label}
                          href={item.href}
                          target={item.openNew ? '_blank' : undefined}
                          rel={item.openNew ? 'noopener noreferrer' : undefined}
                          className="flex items-center gap-3 px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-primary/5 rounded-xl transition-all duration-200"
                        >
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.label}</span>
                        </Link>
                      ))}
                    </nav>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
