'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { getPublicConfigs } from '@/lib/api'

export type SiteConfigMap = Record<string, string>

interface SiteConfigContextValue {
  config: SiteConfigMap
  loading: boolean
  refresh: () => Promise<void>
}

const defaultConfig: SiteConfigMap = {}
const SiteConfigContext = createContext<SiteConfigContextValue>({
  config: defaultConfig,
  loading: true,
  refresh: async () => {},
})

export function SiteConfigProvider({
  children,
  initialConfig,
}: {
  children: ReactNode
  initialConfig?: SiteConfigMap | null
}) {
  const [config, setConfig] = useState<SiteConfigMap>(
    initialConfig && typeof initialConfig === 'object' ? initialConfig : defaultConfig
  )
  const hasInitial = initialConfig !== undefined
  const [loading, setLoading] = useState(!hasInitial)

  const load = useCallback(async () => {
    try {
      const data = await getPublicConfigs()
      setConfig(data && typeof data === 'object' ? data : {})
    } catch {
      setConfig({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 如果 initialConfig 有实际数据，直接使用，无需客户端再次请求
    if (initialConfig !== undefined && Object.keys(initialConfig ?? {}).length > 0) {
      setLoading(false)
      return
    }
    // initialConfig 为 undefined（未传）或为空对象（服务端请求失败的兜底），均需客户端重新拉取
    load()
  }, [initialConfig, load])

  const value: SiteConfigContextValue = {
    config,
    loading,
    refresh: load,
  }

  return (
    <SiteConfigContext.Provider value={value}>
      {children}
    </SiteConfigContext.Provider>
  )
}

export function useSiteConfig() {
  const ctx = useContext(SiteConfigContext)
  return ctx
}

/** 从配置中取字符串，空则返回默认值 */
export function getConfigStr(config: SiteConfigMap, key: string, fallback = ''): string {
  const v = config[key]
  return typeof v === 'string' ? v : fallback
}

/** 从配置中取布尔（'true' 为 true） */
export function getConfigBool(config: SiteConfigMap, key: string, fallback = true): boolean {
  const v = config[key]
  if (v === undefined || v === '') return fallback
  return v === 'true'
}

/** 从配置中取整数 */
export function getConfigInt(config: SiteConfigMap, key: string, fallback: number): number {
  const v = config[key]
  if (v === undefined || v === '') return fallback
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}
