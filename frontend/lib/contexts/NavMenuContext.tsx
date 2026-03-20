'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { fetchNavMenus } from '@/lib/api'
import type { NavMenu } from '@/lib/types'

interface NavMenuContextValue {
  menus: NavMenu[] | null
  refresh: () => Promise<void>
}

const NavMenuContext = createContext<NavMenuContextValue>({
  menus: null,
  refresh: async () => {},
})

export function NavMenuProvider({
  children,
  initialMenus,
}: {
  children: ReactNode
  initialMenus?: NavMenu[] | null
}) {
  const [menus, setMenus] = useState<NavMenu[] | null>(initialMenus ?? null)

  const load = useCallback(async () => {
    try {
      const data = await fetchNavMenus()
      setMenus(Array.isArray(data) ? data : null)
    } catch {
      setMenus(null)
    }
  }, [])

  useEffect(() => {
    // 如果服务端已成功加载菜单数据，直接使用
    if (initialMenus !== undefined && initialMenus !== null && initialMenus.length > 0) return
    // initialMenus 为 undefined（未传）或为空数组/null（服务端请求失败兜底），客户端重新拉取
    load()
  }, [initialMenus, load])

  const value: NavMenuContextValue = {
    menus: menus ?? initialMenus ?? null,
    refresh: load,
  }

  return (
    <NavMenuContext.Provider value={value}>
      {children}
    </NavMenuContext.Provider>
  )
}

export function useNavMenus() {
  return useContext(NavMenuContext)
}
