'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, Grid3X3, User } from 'lucide-react'

const tabs = [
  { href: '/', icon: Home, label: '首页', matchExact: true },
  { href: '/search', icon: Search, label: '搜索', matchExact: false },
  { href: '/categories', icon: Grid3X3, label: '分类', matchExact: false },
  { href: '/about', icon: User, label: '关于', matchExact: false },
]

export default function MobileBottomNav() {
  const pathname = usePathname()

  // Article detail pages have their own MobileArticleBar, so hide bottom nav there
  if (/^\/posts\/\d+/.test(pathname)) return null

  const isActive = (href: string, matchExact: boolean) => {
    if (matchExact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 lg:hidden bg-card/95 backdrop-blur-md border-t border-border/60 safe-area-bottom"
      aria-label="底部导航"
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ href, icon: Icon, label, matchExact }) => {
          const active = isActive(href, matchExact)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`}
                  strokeWidth={active ? 2.5 : 1.8}
                />
              </div>
              <span className={`text-[10px] font-medium leading-none mt-0.5 ${active ? 'text-primary' : ''}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
