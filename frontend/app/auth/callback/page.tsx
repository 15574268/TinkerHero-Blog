'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/lib/hooks/useToast'

export const dynamic = 'force-dynamic'

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      showToast(decodeURIComponent(error), 'error')
      router.push('/admin/login')
      return
    }
    // Cookie 已由后端在 OAuth 回调时写入，useAuth 会自动从 /profile 恢复用户状态
    router.push('/admin')
  }, [router, searchParams, showToast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="mt-4 text-muted-foreground">正在跳转...</p>
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}
