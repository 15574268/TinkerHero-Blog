'use client'

import { useState, useEffect } from 'react'
import { X, AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { getActiveAnnouncements } from '@/lib/api'
import type { Announcement } from '@/lib/types'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'

const typeStyles = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-200',
    icon: Info,
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-800 dark:text-yellow-200',
    icon: AlertTriangle,
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-200',
    icon: CheckCircle,
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: AlertCircle,
  },
}

export default function AnnouncementBar() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchAnnouncements()
    // 从 localStorage 加载已关闭的公告
    const stored = localStorage.getItem('dismissedAnnouncements')
    if (stored) {
      try {
        setDismissed(new Set(JSON.parse(stored)))
      } catch (error) {
        console.error('Failed to parse dismissedAnnouncements:', error)
        localStorage.removeItem('dismissedAnnouncements')
      }
    }
  }, [])

  useEffect(() => {
    if (announcements.length > 1) {
      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % announcements.length)
      }, 5000)
      return () => clearInterval(timer)
    }
  }, [announcements.length])

  const fetchAnnouncements = async () => {
    try {
      const data = await getActiveAnnouncements()
      setAnnouncements(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('获取公告失败:', error)
    }
  }

  const handleDismiss = (id: number) => {
    const newDismissed = new Set(dismissed)
    newDismissed.add(id)
    setDismissed(newDismissed)
    localStorage.setItem('dismissedAnnouncements', JSON.stringify([...newDismissed]))
    setCurrentIndex(0)
  }

  const { config } = useSiteConfig()
  const siteAnnouncement = getConfigStr(config, 'site_announcement').trim()

  // 过滤已关闭的公告
  const activeAnnouncements = announcements.filter((a) => !dismissed.has(a.id))

  if (siteAnnouncement === '' && activeAnnouncements.length === 0) {
    return null
  }

  const current = activeAnnouncements[currentIndex % activeAnnouncements.length]
  const style = typeStyles[current?.type] || typeStyles.info
  const Icon = style.icon

  return (
    <>
      {siteAnnouncement && (
        <div className="border-b border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-center text-foreground/90">
          {siteAnnouncement}
        </div>
      )}
      {activeAnnouncements.length > 0 && (
    <div
      className={`${style.bg} ${style.border} border-b px-4 py-3 transition-all duration-300`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <Icon className={`w-5 h-5 ${style.text} flex-shrink-0`} />
          <div className="flex-1">
            {current.link ? (
              <a
                href={current.link}
                className={`${style.text} hover:underline font-medium`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {current.title}
                {current.content && (
                  <span className="ml-2 font-normal opacity-80">
                    {current.content}
                  </span>
                )}
              </a>
            ) : (
              <div className={style.text}>
                <span className="font-medium">{current.title}</span>
                {current.content && (
                  <span className="ml-2 font-normal opacity-80">
                    {current.content}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeAnnouncements.length > 1 && (
            <div className="flex gap-1">
              {activeAnnouncements.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentIndex
                      ? `${style.text.replace('text-', 'bg-')}`
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>
          )}
          <button
            onClick={() => handleDismiss(current.id)}
            className={`${style.text} hover:opacity-70 p-1`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
      )}
    </>
  )
}
