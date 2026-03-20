'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import zh from './locales/zh.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'

type Locale = 'zh' | 'en' | 'ja' | 'ko'
type TranslationData = typeof zh

interface I18nContextType {
  locale: Locale
  t: (key: string) => string
  changeLocale: (locale: Locale) => void
}

const translations: Record<Locale, TranslationData> = { zh, en, ja, ko }

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>('zh')

  useEffect(() => {
    // 从本地存储加载语言设置
    const savedLocale = localStorage.getItem('locale') as Locale
    if (savedLocale && ['zh', 'en', 'ja', 'ko'].includes(savedLocale)) {
      setLocale(savedLocale)
    } else {
      // 检测浏览器语言
      const browserLang = navigator.language.toLowerCase()
      if (browserLang.startsWith('zh')) {
        setLocale('zh')
      } else if (browserLang.startsWith('ja')) {
        setLocale('ja')
      } else if (browserLang.startsWith('ko')) {
        setLocale('ko')
      } else {
        setLocale('en')
      }
    }
  }, [])

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale)
    localStorage.setItem('locale', newLocale)
    const langMap: Record<Locale, string> = {
      zh: 'zh-CN',
      en: 'en',
      ja: 'ja',
      ko: 'ko'
    }
    document.documentElement.lang = langMap[newLocale]
  }

  // 根据key路径获取翻译文本
  const t = (key: string): string => {
    const keys = key.split('.')
    let value: unknown = translations[locale]
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k]
      } else {
        // 如果找不到翻译，返回key本身
        return key
      }
    }
    
    return typeof value === 'string' ? value : key
  }

  return (
    <I18nContext.Provider value={{ locale, t, changeLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

// 翻译函数（用于非组件场景）
export function getTranslation(locale: Locale, key: string): string {
  const keys = key.split('.')
  let value: unknown = translations[locale]
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k]
    } else {
      return key
    }
  }
  
  return typeof value === 'string' ? value : key
}
