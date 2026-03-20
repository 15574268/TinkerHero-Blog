import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getChangelogs } from '@/lib/api'
import type { Changelog } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Wrench, Zap, AlertCircle, CheckCircle2, NotebookText } from 'lucide-react'
import { format } from 'date-fns'
import type React from 'react'

export const revalidate = 300

export const metadata: Metadata = {
  title: '更新日志',
  description: '博客系统的版本更新记录与功能变更',
}

const typeMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  release: { label: '正式发布', icon: CheckCircle2, variant: 'secondary' },
  feature: { label: '新功能', icon: Zap, variant: 'default' },
  fix: { label: 'Bug 修复', icon: AlertCircle, variant: 'destructive' },
  improvement: { label: '优化改进', icon: Wrench, variant: 'outline' },
}

export default async function ChangelogsPage() {
  let logs: Changelog[] = []
  try {
    logs = await getChangelogs()
  } catch {
    logs = []
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12 animate-fade-in-up">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
              <NotebookText className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">更新日志</h1>
            <p className="text-muted-foreground">记录每一次迭代，让变化可追溯。</p>
          </div>

          <div className="space-y-4">
            {logs.map((l) => {
              const meta = typeMeta[l.type] || typeMeta.release
              const Icon = meta.icon
              const dateStr = l.published_at ? format(new Date(l.published_at), 'yyyy-MM-dd') : '-'
              return (
                <Card key={l.id} className="border-border/60 bg-card/70 backdrop-blur">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">v{l.version}</span>
                          <Badge variant={meta.variant} className="inline-flex items-center gap-1">
                            <Icon className="h-3.5 w-3.5" />
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="mt-2 font-semibold text-lg">{l.title}</div>
                      </div>
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1 flex-shrink-0">
                        <Calendar className="h-3.5 w-3.5" />
                        {dateStr}
                      </div>
                    </div>

                    {l.content ? (
                      <div className="mt-4 prose prose-slate dark:prose-invert dark:prose-zinc prose-sm max-w-none">
                        {String(l.content).split('\n').filter(Boolean).map((line: string, i: number) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {logs.length === 0 ? (
            <div className="text-center text-muted-foreground mt-12">暂无更新日志</div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  )
}

