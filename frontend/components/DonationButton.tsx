'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getDonationConfig } from '@/lib/api'
import type { DonationConfig } from '@/lib/types'

interface DonationButtonProps {
  authorId: number
  postId?: number
}

type Method = 'alipay' | 'wechat' | 'paypal'

const METHOD_CONFIG: Record<Method, { label: string; color: string; activeColor: string }> = {
  alipay:  { label: '支付宝', color: 'border-blue-200 text-blue-600',   activeColor: 'border-blue-500 bg-blue-50 text-blue-600' },
  wechat:  { label: '微信',   color: 'border-green-200 text-green-600', activeColor: 'border-green-500 bg-green-50 text-green-600' },
  paypal:  { label: 'PayPal', color: 'border-indigo-200 text-indigo-600',activeColor: 'border-indigo-500 bg-indigo-50 text-indigo-600' },
}

export default function DonationButton({ authorId }: DonationButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [config, setConfig] = useState<DonationConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [method, setMethod] = useState<Method>('alipay')

  const loadConfig = useCallback(async () => {
    if (config) return
    setLoading(true)
    try {
      const data = await getDonationConfig(authorId)
      if (data) {
        setConfig(data)
        // 默认选中第一个可用方式
        if (data.alipay_qr) setMethod('alipay')
        else if (data.wechat_qr) setMethod('wechat')
        else if (data.paypal_link) setMethod('paypal')
      }
    } finally {
      setLoading(false)
    }
  }, [authorId, config])

  useEffect(() => {
    if (showModal) loadConfig()
  }, [showModal, loadConfig])

  // 关闭时 Esc 键
  useEffect(() => {
    if (!showModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showModal])

  const availableMethods = config
    ? ([
        config.alipay_qr  ? 'alipay'  : null,
        config.wechat_qr  ? 'wechat'  : null,
        config.paypal_link? 'paypal'   : null,
      ].filter(Boolean) as Method[])
    : []

  const currentQR =
    method === 'alipay'  ? config?.alipay_qr :
    method === 'wechat'  ? config?.wechat_qr :
    method === 'paypal'  ? config?.paypal_link : undefined

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg hover:from-yellow-500 hover:to-orange-600 transition shadow-md"
      >
        <span className="text-lg">☕</span>
        <span>请作者喝杯咖啡</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-card rounded-2xl shadow-2xl max-w-xs w-full border border-border overflow-hidden">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-2xl">💝</span>
                <div>
                  <h3 className="font-bold text-foreground">支持作者</h3>
                  {config?.custom_message && (
                    <p className="text-xs text-muted-foreground mt-0.5">{config.custom_message}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : !config || availableMethods.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">作者暂未开启打赏功能</p>
              ) : (
                <>
                  {/* 支付方式选项卡 */}
                  {availableMethods.length > 1 && (
                    <div className="flex gap-2 mb-4">
                      {availableMethods.map((m) => (
                        <button
                          key={m}
                          onClick={() => setMethod(m)}
                          className={`flex-1 py-1.5 rounded-lg border-2 text-sm font-medium transition-all ${
                            method === m ? METHOD_CONFIG[m].activeColor : METHOD_CONFIG[m].color + ' bg-transparent hover:opacity-80'
                          }`}
                        >
                          {METHOD_CONFIG[m].label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 二维码 / PayPal 链接 */}
                  <div className="flex flex-col items-center gap-3">
                    {method === 'paypal' ? (
                      <a
                        href={currentQR}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-center font-medium transition"
                      >
                        通过 PayPal 支持
                      </a>
                    ) : currentQR ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={currentQR}
                          alt={`${METHOD_CONFIG[method].label}收款码`}
                          className="w-48 h-48 rounded-xl border border-border object-cover"
                        />
                        <p className="text-sm text-muted-foreground">
                          打开 {METHOD_CONFIG[method].label} 扫码支持
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm py-4">暂无收款码</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
