import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AboutHero from './AboutHero'
import AboutContact from './AboutContact'
import { PersonJsonLd } from '@/components/JsonLd'
import { getPublicConfigsCached } from '@/lib/api'
import { SITE_URL, DEFAULT_SITE_NAME } from '@/lib/constants'
import { resolveAbsoluteUploadUrl } from '@/lib/utils'
import {
  Code2,
  Heart,
  Calendar,
  Rocket,
  Server,
  Globe,
  BookOpen,
} from 'lucide-react'

export async function generateMetadata(): Promise<Metadata> {
  let siteName = DEFAULT_SITE_NAME
  let ogImage: string | undefined
  try {
    const c = await getPublicConfigsCached()
    if (c?.site_name?.trim()) siteName = c.site_name.trim()
    if (c?.site_logo) ogImage = resolveAbsoluteUploadUrl(c.site_logo)
    else if (c?.site_favicon) ogImage = resolveAbsoluteUploadUrl(c.site_favicon)
  } catch { /* use defaults */ }
  const url = `${SITE_URL}/about`
  const description = `了解 ${siteName} 博主和这个博客背后的故事`
  return {
    title: '关于',
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `关于 - ${siteName}`,
      description,
      url,
      type: 'profile',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary',
      title: `关于 - ${siteName}`,
      description,
    },
  }
}

export default async function AboutPage({
  // 与首页保持一致的签名；当前页面目前不需要用到，但为通过类型检查保留该参数
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>
}) {
  // 避免未使用参数的 TypeScript/ESLint 报错，同时让该参数可选以兼容 Next.js 调用签名
  if (searchParams) {
    await searchParams
  }

  let siteName = DEFAULT_SITE_NAME
  let siteDescription = ''
  let authorAvatar: string | undefined
  try {
    const c = await getPublicConfigsCached()
    if (c?.site_name?.trim()) siteName = c.site_name.trim()
    if (c?.site_description?.trim()) siteDescription = c.site_description.trim()
    if (c?.site_logo) authorAvatar = resolveAbsoluteUploadUrl(c.site_logo)
  } catch { /* use defaults */ }
  const skills = [
    'Go', 'Python', 'TypeScript', 'Bash',
    'Next.js', 'React', 'Tailwind CSS', 'Docker',
    'PostgreSQL', 'Redis', 'Elasticsearch', 'Nginx',
    'Linux', 'Git', 'CI/CD', 'Kubernetes',
  ]

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <PersonJsonLd
        name={siteName}
        url={`${SITE_URL}/about`}
        description={siteDescription || undefined}
        image={authorAvatar}
      />
      <Header />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <AboutHero />

        {/* My Story */}
        <div className="joe-card p-6 md:p-8 mb-6 animate-fade-in-up delay-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">我的故事</h2>
          </div>
          <div className="text-muted-foreground leading-relaxed space-y-4">
            <p>
              从第一次接触计算机开始，我就被这个充满无限可能的数字世界深深吸引。
              编程对我来说不仅是工作，更是探索世界的方式。
            </p>
            <p>
              我热衷于折腾各种技术，从前端到后端，从运维到架构，永远在学习的路上。
              这个博客就是我折腾的成果之一 —— 使用 Go 和 Next.js 从零搭建，每一行代码都是我对技术的热爱。
            </p>
            <p>
              除了写代码，我也喜欢阅读、摄影和探索新事物。生活中的点滴灵感，
              往往会转化为新的技术实践和创意项目。
            </p>
          </div>
        </div>

        {/* Skills */}
        <div className="joe-card p-6 md:p-8 mb-6 animate-fade-in-up delay-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Code2 className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">技术栈</h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {skills.map((skill) => (
              <span
                key={skill}
                className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium border border-primary/15 hover:bg-primary/15 transition-colors"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="joe-card p-6 md:p-8 mb-6 animate-fade-in-up delay-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">博客历程</h2>
          </div>
          <div className="relative">
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
            <div className="space-y-6">
              {[
                { date: '现在', title: '持续折腾中', desc: '博客持续更新，分享技术与生活' },
                { date: '2024', title: '基于 Go + Next.js 构建博客', desc: '全新技术栈重构，追求极致性能与体验' },
                { date: '2023', title: '深入后端与运维领域', desc: '学习 Go 语言，积累服务器运维经验' },
                { date: '2022', title: '开始技术写作之旅', desc: '记录学习笔记与实践经验，分享给更多人' },
              ].map((item, index) => (
                <div key={index} className="relative flex gap-4 pl-0">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0 z-10 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="text-xs text-primary font-semibold mb-1">{item.date}</div>
                    <h3 className="font-bold text-foreground mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hobbies */}
        <div className="joe-card p-6 md:p-8 mb-6 animate-fade-in-up delay-400">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <Rocket className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-2xl font-bold">我的爱好</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: Code2, title: '编程折腾', desc: '探索各种技术栈，从前端到后端，乐此不疲' },
              { icon: BookOpen, title: '阅读学习', desc: '技术书籍、博客文章，保持持续学习的状态' },
              { icon: Server, title: '服务器运维', desc: '折腾 Linux 服务器、Docker、各种开源项目' },
              { icon: Globe, title: '网络冲浪', desc: '探索互联网上有趣的内容和前沿技术' },
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground text-sm">{item.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <AboutContact />
      </main>

      <Footer />
    </div>
  )
}
