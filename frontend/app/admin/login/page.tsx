'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { login as apiLogin } from '@/lib/api'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { getOAuthLoginUrl, getCaptcha, verifyCaptcha } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LogIn,
  Wrench,
  RefreshCw,
  Github,
} from 'lucide-react'
import { useSiteConfig, getConfigStr } from '@/lib/contexts/SiteConfigContext'
import { resolveUploadUrl } from '@/lib/utils'

function isErrorWithResponse(
  error: unknown
): error is { response?: { status?: number; data?: { error?: string }; headers?: Record<string, string> } } {
  return typeof error === 'object' && error !== null && 'response' in error
}

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const { showToast } = useToast()
  const { config } = useSiteConfig()
  const siteLogo = getConfigStr(config, 'site_logo')
  const logoUrl = siteLogo ? resolveUploadUrl(siteLogo) : null

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    captcha_code: '',
  })
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(true)

  const refreshCaptcha = async () => {
    setCaptchaLoading(true)
    try {
      const data = await getCaptcha()
      if (data && data.captcha_id && data.captcha_img) {
        setCaptchaId(data.captcha_id)
        setCaptchaImg(data.captcha_img)
      }
      setFormData(prev => ({ ...prev, captcha_code: '' }))
    } catch (error) {
      console.error('Failed to get captcha:', error)
    } finally {
      setCaptchaLoading(false)
    }
  }

  useEffect(() => {
    refreshCaptcha()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.captcha_code) {
      showToast('请输入验证码', 'error')
      return
    }

    try {
      const captchaResult = await verifyCaptcha(captchaId, formData.captcha_code)
      if (!captchaResult.valid) {
        showToast(captchaResult.error || '验证码错误', 'error')
        refreshCaptcha()
        return
      }
    } catch {
      showToast('验证码验证失败', 'error')
      refreshCaptcha()
      return
    }

    setLoading(true)

    try {
      const res = await apiLogin(formData.login, formData.password)
      if (!res?.user) {
        showToast('登录失败：服务器未返回用户信息', 'error')
        refreshCaptcha()
        return
      }
      login(res.user)
      showToast('登录成功', 'success')
      router.push('/admin')
    } catch (error: unknown) {
      let errorMessage = '登录失败'
      if (isErrorWithResponse(error) && error.response) {
        if (error.response.status === 429) {
          const retryAfter = error.response.headers?.['retry-after'] ?? error.response.headers?.['Retry-After']
          const seconds = retryAfter ? parseInt(String(retryAfter), 10) : 0
          const minutes = Math.max(1, Math.ceil(seconds / 60))
          errorMessage = `登录尝试过多，请 ${minutes} 分钟后再试`
        } else {
          errorMessage = error.response.data?.error ?? errorMessage
        }
      }
      showToast(errorMessage, 'error')
      refreshCaptcha()
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = (provider: 'github' | 'google') => {
    window.location.href = getOAuthLoginUrl(provider)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-purple-500/5 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative shadow-xl">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 overflow-hidden">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt="" className="w-10 h-10 object-contain" />
            ) : (
              <Wrench className="w-8 h-8 text-white" />
            )}
          </div>
          <CardTitle className="text-2xl">管理后台登录</CardTitle>
          <CardDescription>博客管理系统</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login">用户名/邮箱</Label>
              <Input
                id="login"
                type="text"
                required
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                placeholder="请输入用户名或邮箱"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="captcha">验证码</Label>
              <div className="flex items-center gap-3">
                {captchaLoading ? (
                  <Skeleton className="w-[120px] h-11 rounded-md" />
                ) : captchaImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={captchaImg}
                    alt="验证码"
                    className="w-[120px] h-11 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={refreshCaptcha}
                    title="点击刷新"
                  />
                ) : null}
                <Input
                  id="captcha"
                  type="text"
                  required
                  value={formData.captcha_code}
                  onChange={(e) => setFormData({ ...formData, captcha_code: e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) })}
                  className="w-28 h-11 text-center"
                  placeholder="验证码"
                  maxLength={4}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={refreshCaptcha}
                  title="刷新验证码"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button type="submit" variant="gradient" className="w-full h-11" disabled={loading}>
              {loading ? (
                '登录中...'
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  登录
                </>
              )}
            </Button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">或者使用</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Button
                variant="outline"
                onClick={() => handleOAuthLogin('github')}
                className="h-11"
              >
                <Github className="w-5 h-5 mr-2" />
                GitHub
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOAuthLogin('google')}
                className="h-11"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </Button>
              <Button
                variant="outline"
                onClick={() => showToast('微信登录暂未开放', 'info')}
                className="h-11"
              >
                <svg className="w-5 h-5 mr-2" fill="#07C160" viewBox="0 0 24 24">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.307-1.157a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                </svg>
                微信
              </Button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              返回首页
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
