import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchCategories } from '@/lib/api'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FolderOpen, ArrowRight } from 'lucide-react'
import { SITE_URL } from '@/lib/constants'

export const revalidate = 300

export const metadata: Metadata = {
  title: '分类浏览',
  description: '按分类查找感兴趣的内容，发现更多精彩文章',
  alternates: { canonical: `${SITE_URL}/categories` },
  openGraph: {
    title: '分类浏览',
    description: '按分类查找感兴趣的内容，发现更多精彩文章',
    url: `${SITE_URL}/categories`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '分类浏览',
    description: '按分类查找感兴趣的内容，发现更多精彩文章',
  },
}

export default async function CategoriesPage() {
  let categories: Awaited<ReturnType<typeof fetchCategories>> = []
  try {
    categories = await fetchCategories()
  } catch {
    // show empty state
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="container mx-auto px-4 py-12">
        {/* Hero Header */}
        <div className="joe-card overflow-hidden mb-8 max-w-4xl mx-auto animate-fade-in-up">
          <div className="h-28 gradient-hero relative">
            <div className="absolute inset-0 dot-pattern opacity-20" />
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <div className="text-center">
                <FolderOpen className="w-8 h-8 mx-auto mb-2" />
                <h1 className="text-2xl md:text-3xl font-bold">分类浏览</h1>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-sm text-muted-foreground">按分类查找感兴趣的内容，发现更多精彩文章</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          {categories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {categories.map((category, index) => (
                <Link href={`/category/${category.slug}`} key={category.id}>
                  <Card
                    className="joe-card group h-full hover:shadow-xl transition-all duration-300 hover:border-primary/20 cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <FolderOpen className="w-6 h-6 text-primary" />
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                      <CardTitle className="text-xl mt-4">{category.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="line-clamp-2">
                        {category.description || '暂无描述'}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="joe-card text-center py-20">
              <CardContent>
                <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground text-lg mb-2">暂无分类</p>
                <p className="text-muted-foreground/70">敬请期待更多内容</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
