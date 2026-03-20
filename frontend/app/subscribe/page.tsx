import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SubscribeForm from '@/components/SubscribeForm'
import { Card, CardContent } from '@/components/ui/card'
import { Mail, BellRing } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function SubscribePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="joe-card overflow-hidden mb-8 animate-fade-in-up">
            <div className="h-28 gradient-hero relative">
              <div className="absolute inset-0 dot-pattern opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <BellRing className="w-8 h-8 mx-auto mb-2" />
                  <h1 className="text-2xl md:text-3xl font-bold">订阅更新</h1>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                有新文章发布时，通过邮件第一时间通知你。你也可以随时退订。
              </p>
            </div>
          </div>

          <Card className="border-border/60 bg-card/70 backdrop-blur">
            <CardContent className="p-6 md:p-8">
              <div className="flex items-start gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">输入邮箱</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    只推送新文章通知，不会滥发邮件。
                  </div>
                </div>
              </div>

              <SubscribeForm />

              <div className="mt-6 text-xs text-muted-foreground leading-relaxed">
                退订链接会发送到你的邮箱。如果你已经拿到 token，也可以访问
                <span className="mx-1 font-mono">/unsubscribe?token=...</span>
                直接退订。
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  )
}

