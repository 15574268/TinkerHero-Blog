'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { unsubscribe } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { Suspense } from 'react'

function UnsubscribeContent() {
  const sp = useSearchParams()
  const token = sp.get('token') || ''
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('缺少 token 参数')
      return
    }

    let cancelled = false
    ;(async () => {
      setStatus('loading')
      try {
        await unsubscribe(token)
        if (cancelled) return
        setStatus('success')
        setMessage('已成功退订。之后将不再收到更新邮件。')
      } catch {
        if (cancelled) return
        setStatus('error')
        setMessage('退订失败：token 无效或已过期。')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />
      <main className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl">
          <Card className="border-border/60 bg-card/70 backdrop-blur">
            <CardContent className="p-6 md:p-8 text-center">
              {status === 'loading' ? (
                <div className="text-muted-foreground">处理中...</div>
              ) : status === 'success' ? (
                <>
                  <CheckCircle2 className="w-14 h-14 mx-auto text-green-500 mb-4" />
                  <div className="text-xl font-bold mb-2">退订成功</div>
                  <div className="text-muted-foreground mb-6">{message}</div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-14 h-14 mx-auto text-amber-500 mb-4" />
                  <div className="text-xl font-bold mb-2">退订失败</div>
                  <div className="text-muted-foreground mb-6">{message}</div>
                </>
              )}

              <div className="flex justify-center gap-3">
                <Button variant="outline" asChild>
                  <Link href="/subscribe">重新订阅</Link>
                </Button>
                <Button variant="gradient" asChild>
                  <Link href="/">
                    回到首页 <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <UnsubscribeContent />
    </Suspense>
  )
}

