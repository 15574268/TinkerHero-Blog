import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getMilestones } from '@/lib/api'
import type { Milestone } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Star, Calendar, FileText, Eye, MessageCircle, Users } from 'lucide-react'
import { format } from 'date-fns'
import type React from 'react'

export const revalidate = 300

export const metadata: Metadata = {
  title: '里程碑',
  description: '博客发展的重要里程碑和成就记录',
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  posts: FileText,
  views: Eye,
  comments: MessageCircle,
  subscribers: Users,
  years: Calendar,
}

export default async function MilestonesPage() {
  let milestones: Milestone[] = []
  try {
    milestones = await getMilestones()
  } catch {
    milestones = []
  }

  const achieved = milestones.filter((m) => m.is_achieved)
  const pending = milestones.filter((m) => !m.is_achieved)

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12 animate-fade-in-up">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">里程碑</h1>
            <p className="text-muted-foreground">用数据记录成长轨迹。</p>
          </div>

          {achieved.length > 0 ? (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-4 inline-flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                已达成
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {achieved.map((m) => {
                  const Icon = typeIcons[m.type] || Star
                  return (
                    <Card key={m.id} className="border-border/60 bg-card/60 backdrop-blur hover:shadow-xl transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Icon className="h-6 w-6 text-primary" />
                          </div>
                          <Badge variant="secondary">已达成</Badge>
                        </div>
                        <div className="mt-4 font-bold text-lg">{m.title}</div>
                        <div className="mt-2 text-sm text-muted-foreground">{m.description}</div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                          <span className="font-semibold">{Number(m.value || 0).toLocaleString()}+</span>
                          {m.achieved_at ? (
                            <span className="text-muted-foreground">{format(new Date(m.achieved_at), 'yyyy-MM-dd')}</span>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          ) : null}

          {pending.length > 0 ? (
            <section>
              <h2 className="text-xl font-bold mb-4 inline-flex items-center gap-2">
                <Star className="h-5 w-5 text-muted-foreground" />
                目标
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {pending.map((m) => {
                  const Icon = typeIcons[m.type] || Star
                  return (
                    <Card key={m.id} className="border-border/60 bg-card/40 backdrop-blur">
                      <CardContent className="p-6">
                        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                          <Icon className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="mt-4 font-bold text-lg">{m.title}</div>
                        <div className="mt-2 text-sm text-muted-foreground">{m.description}</div>
                        <div className="mt-4 text-sm text-muted-foreground">
                          目标：{Number(m.value || 0).toLocaleString()}+
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          ) : null}

          {milestones.length === 0 ? (
            <div className="text-center text-muted-foreground mt-12">暂无里程碑</div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  )
}

