'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { User } from '@/lib/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (user: User) => void
  logout: () => void
  updateUser: (user: User) => void
  refreshToken: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// 用户数据存储 key（只存非敏感的用户信息，token 由 HttpOnly Cookie 管理）
const USER_KEY = 'user'

let refreshInFlight: Promise<boolean> | null = null

function sanitizeUserData(user: User): User {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    avatar: user.avatar,
    bio: user.bio,
    website: user.website,
    role: user.role,
    is_active: user.is_active,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 刷新 Token（refresh_token 通过 HttpOnly Cookie 自动携带）
  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight

    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/auth/refresh-token`, {
          method: 'POST',
          credentials: 'include',
        })
        return response.ok
      } catch {
        return false
      } finally {
        refreshInFlight = null
      }
    })()

    return refreshInFlight
  }, [])

  // 清除认证数据（token 由后端通过 Set-Cookie: Max-Age=-1 清除）
  const clearAuthData = useCallback(() => {
    localStorage.removeItem(USER_KEY)
  }, [])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      // 先从本地存储恢复用户信息
      const userStr = localStorage.getItem(USER_KEY)
      if (userStr) {
        try {
          const userData = JSON.parse(userStr)
          if (isMounted) setUser(userData)
          if (isMounted) setLoading(false)
        } catch {
          clearAuthData()
          if (isMounted) setLoading(false)
        }
        return
      }

      // 本地无数据时，尝试通过 Cookie 从 API 恢复登录状态（OAuth 回调后第一次加载）
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/profile`,
          { credentials: 'include' }
        )
        if (res.ok) {
          const json = await res.json()
          const userData: User = json?.data ?? json
          if (isMounted && userData?.id) {
            const safeData = sanitizeUserData(userData)
            localStorage.setItem(USER_KEY, JSON.stringify(safeData))
            setUser(safeData)
          }
        }
      } catch {
        // 未登录或网络错误，静默处理
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    init()

    // 已登录用户定期刷新 Token（每30分钟）
    const interval = setInterval(() => {
      if (!localStorage.getItem(USER_KEY)) return
      refreshToken().catch(() => {})
    }, 30 * 60 * 1000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [refreshToken, clearAuthData])

  const login = useCallback((userData: User) => {
    // 只存储非敏感用户信息（token 由 HttpOnly Cookie 管理，不存入 localStorage）
    const safeData = sanitizeUserData(userData)
    localStorage.setItem(USER_KEY, JSON.stringify(safeData))
    setUser(userData)
  }, [])

  const logout = useCallback(async () => {
    try {
      // credentials: 'include' 保证后端能清除 HttpOnly Cookie
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Silent — clearing local state is enough even if server call fails
    }

    clearAuthData()
    setUser(null)
  }, [clearAuthData])

  const updateUser = useCallback((userData: User) => {
    const safeData = sanitizeUserData(userData)
    localStorage.setItem(USER_KEY, JSON.stringify(safeData))
    setUser(userData)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, refreshToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
