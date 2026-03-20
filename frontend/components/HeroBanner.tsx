'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Wrench, User, BookOpen } from 'lucide-react'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { DEFAULT_SITE_NAME } from '@/lib/constants'
import { resolveUploadUrl } from '@/lib/utils'

export default function HeroBanner() {
  const { config } = useSiteConfig()
  const siteName = getConfigStr(config, 'site_name', DEFAULT_SITE_NAME)
  const siteDesc = getConfigStr(config, 'site_description', '记录生活中的技术脉搏')
  const siteLogo = getConfigStr(config, 'site_logo')
  const logoUrl = siteLogo ? resolveUploadUrl(siteLogo) : null

  const slides = [
    {
      title: '欢迎光临本站。',
      subtitle: `${siteName} - ${siteDesc}`,
      href: '/',
      gradient: 'from-blue-500/80 via-indigo-500/80 to-purple-500/80',
      icon: Wrench,
      logoUrl,
    },
    {
      title: '关于博主',
      subtitle: `了解${siteName}背后的故事`,
      href: '/about',
      gradient: 'from-emerald-500/80 via-teal-500/80 to-cyan-500/80',
      icon: User,
      logoUrl: null,
    },
    {
      title: '文章合集',
      subtitle: '按主题系统整理的系列内容',
      href: '/series',
      gradient: 'from-orange-500/80 via-rose-500/80 to-pink-500/80',
      icon: BookOpen,
      logoUrl: null,
    },
  ]

  const [current, setCurrent] = useState(0)

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % slides.length)
  }, [slides.length])

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length)
  }, [slides.length])

  useEffect(() => {
    const timer = setInterval(next, 5000)
    return () => clearInterval(timer)
  }, [next])

  return (
    <div className="container mx-auto px-4 pt-6">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-2xl h-[160px] sm:h-[200px] md:h-[240px] group">
          {slides.map((slide, index) => (
            <Link
              key={index}
              href={slide.href}
              className={`absolute inset-0 flex items-center transition-all duration-700 ease-in-out ${
                index === current
                  ? 'opacity-100 translate-x-0'
                  : index < current
                  ? 'opacity-0 -translate-x-full'
                  : 'opacity-0 translate-x-full'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r ${slide.gradient}`} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
              <div className="relative z-10 px-5 sm:px-8 md:px-12 text-white">
                <div className="flex items-center gap-2.5 mb-2 sm:mb-3">
                  {slide.logoUrl ? (
                    <Image
                      src={slide.logoUrl}
                      alt=""
                      width={36}
                      height={36}
                      className="object-contain rounded-xl bg-white/15 border border-white/20 p-1 w-8 h-8 sm:w-10 sm:h-10"
                      priority={index === 0}
                    />
                  ) : (
                    <slide.icon className="w-8 h-8 sm:w-10 sm:h-10" />
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2 line-clamp-1">{slide.title}</h2>
                <p className="text-white/80 text-xs sm:text-sm md:text-base line-clamp-1">{slide.subtitle}</p>
              </div>
            </Link>
          ))}

          {/* Controls */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); prev() }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="上一张"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); next() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="下一张"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, index) => (
              <button
                type="button"
                key={index}
                onClick={(e) => { e.preventDefault(); setCurrent(index) }}
                aria-label={`切换到第 ${index + 1} 张`}
                aria-current={index === current ? 'true' : undefined}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === current
                    ? 'bg-white w-6'
                    : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
