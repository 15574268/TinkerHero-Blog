'use client'

import { useState, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { getAdPlacementByCode, recordAdView, recordAdClick } from '@/lib/api'

interface AdPlacement {
  id: number
  name: string
  code: string
  description: string
  location: string
  type: string
  width: number
  height: number
}

interface AdContent {
  id: number
  placement_id: number
  title: string
  image_url: string
  link_url: string
  html_code: string
  adsense_code: string
  type: string
  view_count: number
  click_count: number
  device_target?: string
}

interface AdBannerProps {
  placementCode: string
  className?: string
  device?: 'all' | 'desktop' | 'mobile'
}

// 安全的 HTML 渲染配置 - 移除 script 标签，使用 iframe 沙箱
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['div', 'span', 'a', 'img', 'p', 'br', 'strong', 'em', 'u', 'ins', 'iframe'],
  ALLOWED_ATTR: [
    'href', 'src', 'class', 'style', 'id', 'target', 'rel',
    'data-ad-client', 'data-ad-slot', 'data-ad-format', 'data-full-width-responsive',
    'frameborder', 'marginwidth', 'marginheight', 'scrolling'
  ],
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ['target'], // 允许 target="_blank"
  FORCE_BODY: true, // 强制将内容放在 body 中处理
}

// 验证 iframe 来源是否可信
function isValidAdIframe(html: string): boolean {
  // 只允许可信的广告平台 iframe
  const trustedDomains = [
    'googleads.g.doubleclick.net',
    'www.googletagmanager.com',
    'pagead2.googlesyndication.com',
  ]
  
  const iframeSrcMatch = html.match(/src=["']([^"']+)["']/i)
  if (iframeSrcMatch) {
    const src = iframeSrcMatch[1]
    return trustedDomains.some(domain => src.includes(domain))
  }
  return true // 没有 iframe src 则允许通过（后续会被 sanitize）
}

// 安全渲染 HTML 内容
function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}

export default function AdBanner({ placementCode, className = '', device = 'all' }: AdBannerProps) {
  const [placement, setPlacement] = useState<AdPlacement | null>(null)
  const [ads, setAds] = useState<AdContent[]>([])
  const [currentAdIndex, setCurrentAdIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchAd = useCallback(async () => {
    try {
      const data = await getAdPlacementByCode(placementCode)
      setPlacement(data.placement)

      let filteredAds = data.ads || []
      if (device !== 'all') {
        filteredAds = filteredAds.filter(
          (ad: AdContent) => ad.device_target === 'all' || ad.device_target === device
        )
      }
      setAds(filteredAds)

      if (filteredAds.length > 0) {
        recordAdView(filteredAds[0].id).catch(() => {})
      }
    } catch {
      // 广告位不存在或请求失败时静默处理
    } finally {
      setLoading(false)
    }
  }, [placementCode, device])

  useEffect(() => {
    fetchAd()
  }, [fetchAd])

  // 轮播广告
  useEffect(() => {
    if (ads.length > 1) {
      const timer = setInterval(() => {
        setCurrentAdIndex((prev) => (prev + 1) % ads.length)
      }, 5000)
      return () => clearInterval(timer)
    }
  }, [ads.length])

  const handleClick = async (ad: AdContent) => {
    recordAdClick(ad.id).catch(() => {})
  }

  if (loading || !placement || ads.length === 0) {
    return null
  }

  const currentAd = ads[currentAdIndex]

  // 渲染广告内容
  const renderAd = (ad: AdContent) => {
    // AdSense 广告
    if (ad.type === 'adsense' && ad.adsense_code) {
      // 验证 iframe 来源
      if (!isValidAdIframe(ad.adsense_code)) {
        console.warn('Invalid ad iframe source detected')
        return null
      }
      return (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizeHTML(ad.adsense_code) }}
          className="ad-adsense"
        />
      )
    }

    // 自定义 HTML 广告
    if (ad.type === 'code' && ad.html_code) {
      // 验证 iframe 来源
      if (!isValidAdIframe(ad.html_code)) {
        console.warn('Invalid custom ad iframe source detected')
        return null
      }
      return (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizeHTML(ad.html_code) }}
          className="ad-custom"
        />
      )
    }

    // 图片广告
    if (ad.type === 'image' && ad.image_url) {
      if (ad.link_url) {
        return (
          <a
            href={ad.link_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => handleClick(ad)}
            className="block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.image_url}
              alt={ad.title || '广告'}
              className="w-full h-auto"
              style={{
                maxWidth: placement.width || 'auto',
                maxHeight: placement.height || 'auto',
              }}
            />
          </a>
        )
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.image_url}
          alt={ad.title || '广告'}
          className="w-full h-auto"
          style={{
            maxWidth: placement.width || 'auto',
            maxHeight: placement.height || 'auto',
          }}
        />
      )
    }

    return null
  }

  return (
    <div
      className={`ad-banner ${className} relative`}
      data-placement={placementCode}
    >
      {renderAd(currentAd)}

      {/* 轮播指示器 */}
      {ads.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {ads.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentAdIndex(index)}
              aria-label={`切换到广告 ${index + 1}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentAdIndex
                  ? 'bg-blue-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>
      )}

      {/* 广告标识 */}
      <span className="absolute top-1 right-1 text-xs text-gray-400 bg-white/50 dark:bg-gray-900/50 px-1 rounded">
        广告
      </span>
    </div>
  )
}

// 首页顶部广告位
export function HomeTopAd() {
  return (
    <AdBanner
      placementCode="home_top"
      className="w-full mb-6"
    />
  )
}

// 首页侧边栏广告位
export function HomeSidebarAd() {
  return (
    <AdBanner
      placementCode="home_sidebar"
      className="w-full mb-6"
      device="desktop"
    />
  )
}

// 文章顶部广告位
export function PostTopAd() {
  return (
    <AdBanner
      placementCode="post_top"
      className="w-full mb-6"
    />
  )
}

// 文章底部广告位
export function PostBottomAd() {
  return (
    <AdBanner
      placementCode="post_bottom"
      className="w-full mt-6"
    />
  )
}

// 文章侧边栏广告位
export function PostSidebarAd() {
  return (
    <AdBanner
      placementCode="post_sidebar"
      className="w-full mb-6 sticky top-4"
      device="desktop"
    />
  )
}

// 文章内容内嵌广告（每N段插入）
export function InContentAd({ index }: { index: number }) {
  // 只在第3段后显示
  if (index !== 2) return null

  return (
    <AdBanner
      placementCode="post_in_content"
      className="my-6"
    />
  )
}

// 移动端底部固定广告
export function MobileBottomAd() {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setVisible(false)}
        className="absolute -top-6 right-2 bg-gray-900 text-white text-xs px-2 py-1 rounded"
      >
        关闭
      </button>
      <AdBanner
        placementCode="mobile_bottom"
        className="p-2"
        device="mobile"
      />
    </div>
  )
}
