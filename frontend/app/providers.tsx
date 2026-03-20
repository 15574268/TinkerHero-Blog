'use client'

import { ReactNode, useEffect } from 'react'
import { AuthProvider } from '@/lib/hooks/useAuth'
import { ToastProvider } from '@/lib/hooks/useToast'
import { I18nProvider } from '@/lib/i18n/config'
import { ThemeProvider } from '@/components/ThemeProvider'
import { SiteConfigProvider } from '@/lib/contexts/SiteConfigContext'
import { NavMenuProvider } from '@/lib/contexts/NavMenuContext'
import AnnouncementBar from '@/components/AnnouncementBar'
import SiteConfigInjector from '@/components/SiteConfigInjector'
import { PageErrorBoundary } from '@/components/ErrorBoundary'
import type { NavMenu } from '@/lib/types'
import type { SiteConfigMap } from '@/lib/contexts/SiteConfigContext'

interface ProvidersProps {
  children: ReactNode
  initialConfig?: SiteConfigMap | null
  initialNavMenus?: NavMenu[] | null
}

export default function Providers({ children, initialConfig, initialNavMenus }: ProvidersProps) {
  useEffect(() => {
    // Dev-only: prevent stale Service Worker caching causing hydration mismatch
    if (process.env.NODE_ENV === 'production') return
    if (!('serviceWorker' in navigator)) return

    ;(async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))

        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  return (
    <ThemeProvider>
      <SiteConfigProvider initialConfig={initialConfig}>
        <NavMenuProvider initialMenus={initialNavMenus}>
          <I18nProvider>
            <AuthProvider>
              <ToastProvider>
                <SiteConfigInjector />
                <AnnouncementBar />
                <PageErrorBoundary>
                  {children}
                </PageErrorBoundary>
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </NavMenuProvider>
      </SiteConfigProvider>
    </ThemeProvider>
  )
}
