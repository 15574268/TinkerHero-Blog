'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type AIUsageEntryStatus = 'pending' | 'streaming' | 'done' | 'error' | 'cancelled'

export interface AIUsageEntry {
  id: string
  action: string
  startedAt: number
  status: AIUsageEntryStatus
  content: string
  error?: string
  abortController?: AbortController
}

interface AdminAIUsageContextValue {
  entries: AIUsageEntry[]
  /** 开始一条 AI 使用记录，返回 id 与 abortController.signal，用于请求与停止 */
  startEntry: (action: string) => { id: string; signal: AbortSignal }
  /** 追加流式内容（可多次调用） */
  appendContent: (id: string, chunk: string) => void
  /** 标记完成并写入最终内容 */
  setDone: (id: string, content?: string) => void
  /** 标记失败 */
  setError: (id: string, message: string) => void
  /** 停止当前请求（abort），并标记为已取消 */
  cancel: (id: string) => void
  /** 清空记录（仅内存，刷新后也会清空） */
  clear: () => void
}

const AdminAIUsageContext = createContext<AdminAIUsageContextValue | null>(null)

export function AdminAIUsageProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<AIUsageEntry[]>([])

  const startEntry = useCallback((action: string) => {
    const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const abortController = new AbortController()
    const entry: AIUsageEntry = {
      id,
      action,
      startedAt: Date.now(),
      status: 'streaming',
      content: '',
      abortController,
    }
    setEntries((prev) => [entry, ...prev])
    return { id, signal: abortController.signal }
  }, [])

  const appendContent = useCallback((id: string, chunk: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, content: e.content + chunk, status: 'streaming' as const } : e))
    )
  }, [])

  const setDone = useCallback((id: string, content?: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: 'done' as const, content: content !== undefined ? content : e.content }
          : e
      )
    )
  }, [])

  const setError = useCallback((id: string, message: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'error' as const, error: message } : e))
    )
  }, [])

  const cancel = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          e.abortController?.abort()
          return { ...e, status: 'cancelled' as const, abortController: undefined }
        }
        return e
      })
    )
  }, [])

  const clear = useCallback(() => {
    setEntries([])
  }, [])

  const value = useMemo(
    () => ({
      entries,
      startEntry,
      appendContent,
      setDone,
      setError,
      cancel,
      clear,
    }),
    [entries, startEntry, appendContent, setDone, setError, cancel, clear]
  )

  return (
    <AdminAIUsageContext.Provider value={value}>
      {children}
    </AdminAIUsageContext.Provider>
  )
}

export function useAdminAIUsage() {
  const ctx = useContext(AdminAIUsageContext)
  return ctx
}
