'use client'

import { useEffect } from 'react'

/**
 * 文章密码通过 URL 查询参数（?password=xxx）传递给服务端以触发 SSR 鉴权，
 * 一旦页面渲染成功（文章已解锁），立即将密码从地址栏移除，
 * 避免密码出现在浏览器历史、截图或 Referer 头中。
 */
export default function PasswordCleaner() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('password')) {
      url.searchParams.delete('password')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  return null
}
