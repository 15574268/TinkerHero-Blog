/** @type {import('next').NextConfig} */

// 从 NEXT_PUBLIC_SITE_URL 或 NEXT_PUBLIC_API_URL 推导生产域名
// 这两个变量在 docker-compose.prod.yml 中以 build arg 传入，构建时可读
function getSiteHostname() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ]
  for (const url of candidates) {
    if (!url) continue
    try {
      const normalized = url.startsWith('http') ? url : `https://${url}`
      const { hostname } = new URL(normalized)
      if (hostname && hostname !== 'localhost') return hostname
    } catch {
      // ignore invalid URL
    }
  }
  return null
}

const siteHostname = getSiteHostname()

const nextConfig = {
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400, // 24 小时，减少重复优化开销
    remotePatterns: [
      // 本地开发：后端直连 8080
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080',
        pathname: '/uploads/**',
      },
      // 本地开发：前端反向代理（无端口）
      {
        protocol: 'http',
        hostname: 'localhost',
        pathname: '/uploads/**',
      },
      // Docker 容器内部：frontend 容器访问 backend 服务
      {
        protocol: 'http',
        hostname: 'backend',
        port: '8080',
        pathname: '/uploads/**',
      },
      // 生产环境：从环境变量自动推导域名
      ...(siteHostname
        ? [{
            protocol: 'https',
            hostname: siteHostname,
            pathname: '/uploads/**',
          }]
        : []),
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1',
  },
  async rewrites() {
    // SSR 侧通过 Docker 内部网络访问后端；本地开发直连 localhost:8080
    const backendBase = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
      .replace(/\/api\/v1\/?$/, '')
    return [
      {
        source: '/uploads/:path*',
        destination: `${backendBase}/uploads/:path*`,
      },
    ]
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ]

    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      })
    }

    // Content-Security-Policy：防御 XSS 的最后防线
    // unsafe-inline 对 script-src 是必要的（Next.js 内联 hydration 脚本 + 主题切换脚本）
    // frame-src https: 允许文章内嵌任意 HTTPS 来源的 iframe（YouTube / Bilibili 等）
    const isProd = process.env.NODE_ENV === 'production'

    // 从 NEXT_PUBLIC_API_URL 推导 API 源，用于 CSP 放行。
    // Docker 开发环境 NODE_ENV=production 但 API 为 http://localhost:8080，
    // 必须显式放行，否则浏览器 CSP 会拦截所有客户端 API 调用。
    const apiOrigin = (() => {
      try {
        const raw = process.env.NEXT_PUBLIC_API_URL || ''
        if (!raw) return ''
        const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
        return u.origin
      } catch { return '' }
    })()
    const apiIsHttp = apiOrigin.startsWith('http://')

    const cspDirectives = isProd
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          `img-src 'self' data: blob: ${apiIsHttp ? apiOrigin + ' ' : ''}https:`,
          `media-src 'self' ${apiIsHttp ? apiOrigin + ' ' : ''}https: blob:`,
          "frame-src https:",
          `connect-src 'self' ${apiIsHttp ? apiOrigin + ' ' : ''}https: wss:`,
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          ...(apiIsHttp ? [] : ["upgrade-insecure-requests"]),
        ]
      : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob: http: https:",
          "media-src 'self' http: https: blob:",
          "frame-src https:",
          "connect-src 'self' http://localhost:8080 http://localhost:3200 https: wss:",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ]

    securityHeaders.push({
      key: 'Content-Security-Policy',
      value: cspDirectives.join('; '),
    })

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // 后台页面不应被搜索引擎索引
      {
        source: '/admin/(.*)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      // 搜索结果页属于薄内容，禁止索引防止重复内容扣分
      {
        source: '/search',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
    ]
  },
}

module.exports = nextConfig
