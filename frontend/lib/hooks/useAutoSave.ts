'use client'

import { useEffect, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { autoSavePost } from '@/lib/api'

interface UseAutoSaveOptions {
  postId: number
  title: string
  content: string
  summary: string
  enabled?: boolean
  interval?: number // milliseconds
}

interface AutoSaveResult {
  lastSaved: Date | null
  isSaving: boolean
  error: string | null
  saveNow: () => Promise<void>
}

export function useAutoSave({
  postId,
  title,
  content,
  summary,
  enabled = true,
  interval = 30000, // 30秒
}: UseAutoSaveOptions): AutoSaveResult {
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** force: 为 true 时忽略 enabled，用于「立即保存」按钮 */
  const save = async (force = false) => {
    if (!postId || !content) return
    if (!force && !enabled) return

    setIsSaving(true)
    setError(null)

    try {
      await autoSavePost(postId, { title, content, summary })
      setLastSaved(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  // 防抖保存（仅草稿时自动保存）
  const debouncedSave = useDebouncedCallback(() => save(false), interval)

  useEffect(() => {
    if (enabled && postId && content) {
      debouncedSave()
    }
  }, [title, content, summary, enabled, postId, debouncedSave])

  return {
    lastSaved,
    isSaving,
    error,
    saveNow: () => save(true),
  }
}

// 保存到 localStorage
export function saveToLocalStorage(key: string, data: { title: string; content: string; summary: string }) {
  try {
    localStorage.setItem(key, JSON.stringify({
      ...data,
      savedAt: new Date().toISOString(),
    }))
  } catch (e) {
    console.error('Failed to save to localStorage:', e)
  }
}

// 从 localStorage 加载
export function loadFromLocalStorage(key: string): { title: string; content: string; summary: string; savedAt: string } | null {
  try {
    const data = localStorage.getItem(key)
    if (data) {
      return JSON.parse(data)
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e)
  }
  return null
}

// 清除 localStorage
export function clearLocalStorage(key: string) {
  localStorage.removeItem(key)
}
