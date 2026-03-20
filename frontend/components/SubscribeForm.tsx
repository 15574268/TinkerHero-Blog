'use client'

import { useState } from 'react'
import { subscribe, unsubscribe } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function SubscribeForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [alreadySubscribedOpen, setAlreadySubscribedOpen] = useState(false)
  const [unsubscribeToken, setUnsubscribeToken] = useState<string | null>(null)
  const [unsubscribing, setUnsubscribing] = useState(false)
  const { showToast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !email.includes('@')) {
      showToast('请输入有效的邮箱地址', 'error')
      return
    }

    setLoading(true)
    setUnsubscribeToken(null)
    try {
      const result = await subscribe(email)
      if (result && typeof result === 'object' && 'already_subscribed' in result && result.already_subscribed && 'token' in result) {
        setUnsubscribeToken(result.token)
        setAlreadySubscribedOpen(true)
      } else {
        showToast('订阅成功！', 'success')
        setSubscribed(true)
        setEmail('')
      }
    } catch (error: unknown) {
      handleApiError(error, showToast, '订阅失败')
    } finally {
      setLoading(false)
    }
  }

  const handleContinueSubscribe = () => {
    setAlreadySubscribedOpen(false)
    setUnsubscribeToken(null)
  }

  const handleUnsubscribe = async () => {
    if (!unsubscribeToken) return
    setUnsubscribing(true)
    try {
      await unsubscribe(unsubscribeToken)
      showToast('已取消订阅', 'success')
      setAlreadySubscribedOpen(false)
      setUnsubscribeToken(null)
    } catch {
      handleApiError(null, showToast, '取消订阅失败')
    } finally {
      setUnsubscribing(false)
    }
  }

  if (subscribed) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-4 text-center">
        <p className="text-foreground">订阅成功！新文章发布时会收到邮件通知。</p>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2" aria-label="邮件订阅表单">
        <label htmlFor="subscribe-email" className="sr-only">邮箱地址</label>
        <Input
          id="subscribe-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="输入邮箱订阅更新"
          className="h-11"
          required
          aria-required="true"
        />
        <Button
          type="submit"
          disabled={loading}
          variant="gradient"
          className="h-11 whitespace-nowrap"
          aria-busy={loading}
        >
          {loading ? '订阅中...' : '订阅'}
        </Button>
      </form>

      <Dialog open={alreadySubscribedOpen} onOpenChange={setAlreadySubscribedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>您已订阅</DialogTitle>
            <DialogDescription>
              该邮箱已在订阅列表中，新文章发布时会收到邮件通知。如需退订，请点击「取消订阅」。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleContinueSubscribe}>
              继续订阅
            </Button>
            <Button
              variant="secondary"
              onClick={handleUnsubscribe}
              disabled={unsubscribing}
            >
              {unsubscribing ? '处理中...' : '取消订阅'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
