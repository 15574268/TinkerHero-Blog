'use client'

import { useState, useEffect, useCallback } from 'react'

type CodeTheme = 'light' | 'dark'

// 全局变量跟踪已加载的主题
let currentLoadedTheme: CodeTheme | null = null

export default function CodeThemeToggle() {
  const [theme, setTheme] = useState<CodeTheme>('light')

  const applyTheme = useCallback((newTheme: CodeTheme) => {
    document.documentElement.setAttribute('data-code-theme', newTheme)
    
    // 只在主题变化时才更新 link 元素
    if (currentLoadedTheme === newTheme) return
    
    // 查找现有的 prism-theme link
    let link = document.getElementById('prism-theme') as HTMLLinkElement
    
    if (!link) {
      // 创建新的 link 元素
      link = document.createElement('link')
      link.id = 'prism-theme'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    
    // 更新 href
    link.href = newTheme === 'dark'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css'
    
    currentLoadedTheme = newTheme
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('code-theme') as CodeTheme
    if (saved) {
      setTheme(saved)
      applyTheme(saved)
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const initial = prefersDark ? 'dark' : 'light'
      setTheme(initial)
      applyTheme(initial)
    }
  }, [applyTheme])

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('code-theme', newTheme)
    applyTheme(newTheme)
  }, [theme, applyTheme])

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition"
      title={theme === 'light' ? '切换暗色代码主题' : '切换亮色代码主题'}
      aria-label={theme === 'light' ? '切换暗色代码主题' : '切换亮色代码主题'}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'light' ? (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          <span className="text-sm">暗色代码</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-sm">亮色代码</span>
        </>
      )}
    </button>
  )
}
