'use client'

import { useState } from 'react'

interface PasswordModalProps {
  hint?: string
  onSubmit: (password: string) => void
  onCancel?: () => void
}

export default function PasswordModal({ hint, onSubmit, onCancel }: PasswordModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('请输入密码')
      return
    }
    onSubmit(password)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h3 id="password-modal-title" className="text-lg font-bold text-gray-900 mb-4">该文章需要密码访问</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="password-input" className="sr-only">访问密码</label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              placeholder="请输入访问密码"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
              aria-describedby={hint ? 'password-hint' : undefined}
              aria-invalid={!!error}
              aria-errormessage={error ? 'password-error' : undefined}
            />
            {hint && (
              <p id="password-hint" className="mt-2 text-sm text-gray-500">提示：{hint}</p>
            )}
            {error && (
              <p id="password-error" className="mt-2 text-sm text-red-500" role="alert">{error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
            >
              确认
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 transition"
              >
                取消
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
