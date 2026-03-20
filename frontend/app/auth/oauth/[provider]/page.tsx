'use client'

import { Suspense, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getOAuthLoginUrl } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'

function OAuthCallbackContent() {
  const router = useRouter()
  const params = useParams()
  const { showToast } = useToast()

  const provider = String(params.provider || '')

  useEffect(() => {
    if (provider !== 'github' && provider !== 'google') {
      showToast('不支持的登录方式', 'error')
      router.push('/admin/login')
      return
    }

    // 后端会负责 OAuth 流程并最终重定向到前端 /auth/callback#token=...
    window.location.href = getOAuthLoginUrl(provider)
  }, [provider, router, showToast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">
          正在跳转到授权页面...
        </p>
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">加载中...</p>
        </div>
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  )
}
