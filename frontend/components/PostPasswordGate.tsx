'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, KeyRound } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function PostPasswordGate({ hint }: { hint?: string | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const baseQuery = useMemo(() => {
    const qp = new URLSearchParams(searchParams.toString())
    qp.delete('password')
    return qp
  }, [searchParams])

  const submit = async () => {
    if (!password) return
    setSubmitting(true)
    try {
      const qp = new URLSearchParams(baseQuery.toString())
      qp.set('password', password)
      router.replace(`?${qp.toString()}`)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
      <Card className="w-full max-w-md border-2 shadow-lg bg-card/95 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 px-6 sm:px-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="rounded-full bg-primary/10 p-3 mb-4">
              <Lock className="h-8 w-8 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              该文章需要密码访问
            </h1>
            {hint ? (
              <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 shrink-0" />
                提示：{hint}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                请输入作者设置的访问密码以阅读全文
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="post-password" className="text-muted-foreground font-normal">
                访问密码
              </Label>
              <Input
                id="post-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoFocus
                autoComplete="current-password"
                className="h-11 text-base"
                disabled={submitting}
              />
            </div>
            <Button
              type="submit"
              disabled={!password.trim() || submitting}
              className="w-full h-11 text-base font-medium"
            >
              {submitting ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  验证中…
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2 shrink-0" />
                  解锁阅读
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
