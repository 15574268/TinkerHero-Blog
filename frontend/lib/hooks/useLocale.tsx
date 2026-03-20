'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

type Locale = 'zh' | 'en'

interface LocaleContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined)

// 内置翻译数据
const translations: Record<Locale, Record<string, unknown>> = {
  zh: {},
  en: {}
}

// 预编译的正则缓存
const regexCache = new Map<string, RegExp>()

function getParamRegex(key: string): RegExp {
  let regex = regexCache.get(key)
  if (!regex) {
    regex = new RegExp(`\\{${key}\\}`, 'g')
    regexCache.set(key, regex)
  }
  return regex
}

// 动态加载语言包
async function loadLocale(locale: Locale) {
  try {
    const response = await fetch(`/locales/${locale}.json`)
    const data = await response.json()
    translations[locale] = data
  } catch (error) {
    console.error(`Failed to load locale ${locale}:`, error)
  }
}

export function LocaleProvider({ children, defaultLocale = 'zh' }: { children: ReactNode; defaultLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)
  const [, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale
    if (saved && (saved === 'zh' || saved === 'en')) {
      setLocaleState(saved)
    }
  }, [])

  useEffect(() => {
    loadLocale(locale).then(() => setLoaded(true))
  }, [locale])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem('locale', newLocale)
    document.documentElement.lang = newLocale
  }, [])

  // 获取翻译文本
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.')
    let value: unknown = translations[locale]

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k]
      } else {
        // 返回 key 作为默认值
        return key
      }
    }

    if (typeof value !== 'string') {
      return key
    }

    // 替换参数（使用预编译正则）
    if (params) {
      return Object.entries(params).reduce(
        (str, [k, v]) => str.replace(getParamRegex(k), String(v)),
        value
      )
    }

    return value
  }, [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}

// 简化的翻译 hook
export function useTranslation() {
  const { t, locale, setLocale } = useLocale()
  return { t, locale, setLocale }
}
