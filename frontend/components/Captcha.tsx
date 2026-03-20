'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCaptcha, verifyCaptcha } from '@/lib/api'

interface CaptchaProps {
  onVerify?: (captchaId: string, code: string) => void
  onChange?: (captchaId: string, code: string) => void
}

export default function Captcha({ onVerify, onChange }: CaptchaProps) {
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshCaptcha = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCaptcha()
      setCaptchaId(data.captcha_id)
      setCaptchaImg(data.captcha_img)
      setCode('')
      setError('')
    } catch {
      setError('获取验证码失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshCaptcha()
  }, [refreshCaptcha])

  const handleCodeChange = (value: string) => {
    setCode(value)
    onChange?.(captchaId, value)
  }

  const handleVerify = useCallback(async () => {
    if (!code) {
      setError('请输入验证码')
      return false
    }
    try {
      const result = await verifyCaptcha(captchaId, code)
      if (result.valid) {
        onVerify?.(captchaId, code)
        return true
      } else {
        setError(result.error || '验证码错误')
        refreshCaptcha()
        return false
      }
    } catch {
      setError('验证失败')
      refreshCaptcha()
      return false
    }
  }, [captchaId, code, onVerify, refreshCaptcha])

  return (
    <div className="flex items-center gap-3" role="group" aria-label="验证码">
      <div className="flex-shrink-0">
        {loading ? (
          <div className="w-[120px] h-[40px] bg-muted rounded flex items-center justify-center" aria-busy="true">
            <span className="text-muted-foreground text-sm">加载中...</span>
          </div>
        ) : captchaImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={captchaImg}
            alt="验证码图片，点击刷新"
            className="w-[120px] h-[40px] rounded cursor-pointer hover:opacity-80"
            onClick={refreshCaptcha}
            title="点击刷新"
          />
        ) : null}
      </div>
      <label htmlFor="captcha-input" className="sr-only">验证码</label>
      <input
        id="captcha-input"
        type="text"
        value={code}
        onChange={(e) => handleCodeChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
        placeholder="验证码"
        className="w-24 px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary/30 outline-none text-center"
        maxLength={4}
        aria-required="true"
        aria-invalid={!!error}
        aria-describedby={error ? 'captcha-error' : undefined}
      />
      <button
        type="button"
        onClick={refreshCaptcha}
        className="text-primary hover:text-primary/80 text-sm whitespace-nowrap"
        aria-label="刷新验证码"
      >
        换一张
      </button>
      {error && <span id="captcha-error" className="text-red-500 text-sm" role="alert">{error}</span>}
    </div>
  )
}

// Hook for form integration
export function useCaptcha() {
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImg, setCaptchaImg] = useState('')
  const [code, setCode] = useState('')
  const [verified, setVerified] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await getCaptcha()
      setCaptchaId(data.captcha_id)
      setCaptchaImg(data.captcha_img)
      setCode('')
      setVerified(false)
    } catch (err) {
      console.error('Failed to get captcha:', err)
    }
  }, [])

  const verify = useCallback(async (): Promise<boolean> => {
    if (!code) return false
    try {
      const result = await verifyCaptcha(captchaId, code)
      setVerified(result.valid)
      return result.valid
    } catch {
      return false
    }
  }, [captchaId, code])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    captchaId,
    captchaImg,
    code,
    setCode,
    verified,
    refresh,
    verify,
    captchaProps: {
      captchaImg,
      code,
      setCode,
      refresh,
    },
  }
}
