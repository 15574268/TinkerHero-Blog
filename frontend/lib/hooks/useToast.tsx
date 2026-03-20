'use client'

import { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

interface ToastContextType {
  toasts: Toast[]
  showToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // 组件卸载时清理所有定时器
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    // 清除对应的定时器
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message: unknown, type: Toast['type'] = 'info') => {
    // 统一将任意类型的 message 转成字符串，避免 React 渲染对象时报错
    let text: string
    if (typeof message === 'string') {
      text = message
    } else if (message && typeof message === 'object') {
      const m = message as Record<string, unknown>
      if (typeof m.message === 'string') {
        text = m.message
      } else if (typeof m.error === 'string') {
        text = m.error
      } else if (typeof m.code === 'string' && typeof m.message === 'string') {
        text = m.message
      } else {
        try {
          text = JSON.stringify(message)
        } catch {
          text = '发生未知错误'
        }
      }
    } else {
      text = String(message ?? '发生未知错误')
    }

    const id = Math.random().toString(36).substr(2, 9)
    const toast: Toast = { id, message: text, type }

    setToasts((prev) => [...prev, toast])

    // 3秒后自动移除，存储定时器引用以便清理
    const timer = setTimeout(() => {
      removeToast(id)
    }, 3000)
    timersRef.current.set(id, timer)
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  if (toasts.length === 0) return null

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  }

  const icon = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2" role="region" aria-label="通知">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`${bgColor[toast.type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[300px] animate-slide-in`}
        >
          <span className="text-lg">{icon[toast.type]}</span>
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="text-white hover:text-gray-200"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
