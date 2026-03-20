import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { fetchPage } from '@/lib/api'
import { resolveContentMediaUrls } from '@/lib/utils'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let page
  try {
    page = await fetchPage(slug)
  } catch {
    notFound()
  }

  if (!page) notFound()

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{page.title}</h1>
          </div>

          <Card className="border-border/60 bg-card/70 backdrop-blur">
            <CardContent className="p-6 md:p-10">
              <div className="prose prose-slate prose-lg max-w-none dark:prose-invert dark:prose-zinc prose-headings:scroll-mt-24">
                <ReactMarkdown>{resolveContentMediaUrls(page.content || '')}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  )
}

