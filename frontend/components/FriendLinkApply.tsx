'use client'

import { useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import { Search } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审核', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400' },
  approved: { label: '已通过', color: 'text-green-600 bg-green-50 dark:bg-green-950/30 dark:text-green-400' },
  rejected: { label: '已拒绝', color: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400' },
}

function FriendLinkStatusQuery() {
  const [queryUrl, setQueryUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ name: string; url: string; status: string; reason?: string; created_at: string } | null>(null)
  const [notFound, setNotFound] = useState(false)

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!queryUrl.trim()) return
    setLoading(true)
    setResult(null)
    setNotFound(false)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/friend-links/apply/status?url=${encodeURIComponent(queryUrl.trim())}`
      )
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      const data = await res.json()
      setResult(data.data ?? data)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "flex-1 px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary outline-none placeholder:text-muted-foreground/60 transition-colors text-sm"

  return (
    <div className="joe-card space-y-4 p-5 md:p-6 mt-4">
      <h3 className="text-base md:text-lg font-semibold flex items-center gap-2">
        <div className="w-1 h-5 bg-primary rounded-full" />
        查询申请状态
      </h3>
      <form onSubmit={handleQuery} className="flex gap-2">
        <input
          type="url"
          value={queryUrl}
          onChange={(e) => setQueryUrl(e.target.value)}
          className={inputClass}
          placeholder="输入您申请时填写的网站地址"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition disabled:opacity-50 text-sm whitespace-nowrap"
        >
          <Search className="w-4 h-4" />
          {loading ? '查询中' : '查询'}
        </button>
      </form>

      {notFound && (
        <p className="text-sm text-muted-foreground text-center py-2">
          未找到该网址的申请记录，请确认网址是否正确
        </p>
      )}

      {result && (
        <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{result.name}</span>
            {STATUS_MAP[result.status] && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_MAP[result.status].color}`}>
                {STATUS_MAP[result.status].label}
              </span>
            )}
          </div>
          <p className="text-muted-foreground break-all">{result.url}</p>
          {result.reason && (
            <p className="text-muted-foreground">
              <span className="font-medium">原因：</span>{result.reason}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            申请时间：{new Date(result.created_at).toLocaleDateString('zh-CN')}
          </p>
        </div>
      )}
    </div>
  )
}

export default function FriendLinkApply() {
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { showToast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    logo: '',
    description: '',
    email: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/friend-links/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '申请失败')
      }

      showToast('申请已提交，请等待审核', 'success')
      setSubmitted(true)
    } catch (error: unknown) {
      const err = error as Error
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="joe-card border border-green-200 dark:border-green-800 rounded-lg p-6 text-center bg-green-50 dark:bg-green-950/30">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-lg font-bold text-green-700 dark:text-green-400 mb-2">申请已提交</h3>
        <p className="text-green-600 dark:text-green-500">我们会在审核通过后通过邮件通知您</p>
      </div>
    )
  }

  const inputClass = "w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary outline-none placeholder:text-muted-foreground/60 transition-colors"

  return (
    <>
    <form onSubmit={handleSubmit} className="joe-card space-y-4 p-5 md:p-6">
      <h3 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2">
        <div className="w-1 h-5 bg-primary rounded-full" />
        申请友链
      </h3>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          网站名称 *
        </label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={inputClass}
          placeholder="您的网站名称"
          maxLength={50}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          网站地址 *
        </label>
        <input
          type="url"
          required
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          className={inputClass}
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Logo 地址
        </label>
        <input
          type="url"
          value={formData.logo}
          onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
          className={inputClass}
          placeholder="https://example.com/logo.png"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          网站描述
        </label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className={inputClass}
          placeholder="简短描述您的网站"
          maxLength={200}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          联系邮箱 *
        </label>
        <input
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className={inputClass}
          placeholder="your@email.com"
        />
        <p className="mt-1 text-xs text-muted-foreground">用于接收审核结果通知</p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-primary-foreground py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? '提交中...' : '提交申请'}
      </button>
    </form>

    <FriendLinkStatusQuery />
    </>
  )
}
