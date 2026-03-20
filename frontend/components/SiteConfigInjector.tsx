'use client'

import { useEffect, useRef } from 'react'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { sanitizeHTML } from '@/lib/utils/sanitize'

const THEME_VAR = '--theme-primary'
const HLJS_THEME_LINK_ID = 'hljs-theme-link'
const HLJS_CDN_VERSION = '11.9.0'
const HLJS_CDN_LOAD_TIMEOUT_MS = 5000

/** 注入主题色、自定义 CSS、自定义 head HTML、代码高亮主题（仅客户端） */
export default function SiteConfigInjector() {
  const { config, loading } = useSiteConfig()
  const headInjected = useRef(false)

  useEffect(() => {
    if (loading) return

    const themeColor = getConfigStr(config, 'theme_color', '#3b82f6')
    if (themeColor && /^#[0-9A-Fa-f]{6}$/.test(themeColor)) {
      document.documentElement.style.setProperty(THEME_VAR, themeColor)
    }

    const customCss = getConfigStr(config, 'custom_css')
    if (customCss) {
      const id = 'site-custom-css'
      let el = document.getElementById(id) as HTMLStyleElement | null
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = customCss
    }

    const codeTheme = getConfigStr(config, 'code_highlight_theme', '').trim()
    let link = document.getElementById(HLJS_THEME_LINK_ID) as HTMLLinkElement | null
    if (codeTheme) {
      const href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${HLJS_CDN_VERSION}/styles/${codeTheme}.min.css`
      if (!link) {
        link = document.createElement('link')
        link.id = HLJS_THEME_LINK_ID
        link.rel = 'stylesheet'
        document.head.appendChild(link)
      }
      if (link.getAttribute('href') !== href) {
        link.href = href
        const timeoutId = setTimeout(() => {
          if (!link?.sheet) link?.remove()
        }, HLJS_CDN_LOAD_TIMEOUT_MS)
        link.onload = () => clearTimeout(timeoutId)
        link.onerror = () => {
          clearTimeout(timeoutId)
          link?.remove()
        }
      }
    } else if (link) {
      link.remove()
    }

    const customHead = getConfigStr(config, 'custom_head_html')
    if (customHead && !headInjected.current) {
      headInjected.current = true
      const wrap = document.createElement('div')
      wrap.innerHTML = sanitizeHTML(customHead)
      while (wrap.firstChild) {
        document.head.appendChild(wrap.firstChild)
      }
    }
  }, [config, loading])

  return null
}
