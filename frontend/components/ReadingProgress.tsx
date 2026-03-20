'use client'

import { useEffect, useState, useCallback } from 'react'

export default function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  const updateProgress = useCallback(() => {
    const scrollTop = window.scrollY
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    if (docHeight <= 0) {
      setProgress(0)
      return
    }
    setProgress(Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)))
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', updateProgress, { passive: true })
    updateProgress()
    return () => window.removeEventListener('scroll', updateProgress)
  }, [updateProgress])

  return (
    <div
      className="fixed top-0 left-0 w-full h-[3px] z-[60] pointer-events-none"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="阅读进度"
    >
      <div
        className="h-full transition-[width] duration-100 ease-out rounded-r-full"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, hsl(160, 84%, 39%), hsl(172, 66%, 50%), hsl(199, 89%, 48%))',
          boxShadow: progress > 0 ? '0 0 8px hsl(160, 84%, 39% / 0.4)' : 'none',
        }}
      />
    </div>
  )
}
