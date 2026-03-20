'use client'

import { useI18n } from '@/lib/i18n/config'

export default function LanguageSwitcher() {
  const { locale, changeLocale } = useI18n()

  const languages = [
    { code: 'zh' as const, name: '中文', flag: '🇨🇳' },
    { code: 'en' as const, name: 'English', flag: '🇺🇸' },
    { code: 'ja' as const, name: '日本語', flag: '🇯🇵' },
    { code: 'ko' as const, name: '한국어', flag: '🇰🇷' },
  ]

  return (
    <div className="flex items-center gap-2">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => changeLocale(lang.code)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition ${
            locale === lang.code
              ? 'bg-blue-100 text-blue-700 font-medium'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={lang.name}
        >
          <span>{lang.flag}</span>
          <span className="hidden sm:inline">{lang.name}</span>
        </button>
      ))}
    </div>
  )
}
