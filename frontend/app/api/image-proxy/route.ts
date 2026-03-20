import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
]

function stripApiSuffix(s: string): string {
  return s.replace(/\/api\/v1\/?$/, '').trim()
}

/** 允许的请求来源（与前端 NEXT_PUBLIC_API_URL 一致，仅做校验） */
function getAllowedOrigin(): string {
  const api = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || ''
  return stripApiSuffix(api)
}

/** 服务端实际请求后端的 base（Docker 内用 API_URL 如 http://backend:8080） */
function getFetchBase(): string {
  const api = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || ''
  return stripApiSuffix(api)
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  const allowed = getAllowedOrigin()
  if (!allowed) {
    return NextResponse.json({ error: 'Proxy not configured' }, { status: 503 })
  }

  const allowedOrigin = new URL(allowed.startsWith('http') ? allowed : `https://${allowed}`)
  if (targetUrl.origin !== allowedOrigin.origin) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }

  if (!targetUrl.pathname.startsWith('/uploads/')) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
  }

  const fetchBase = getFetchBase()
  const fetchUrl = `${fetchBase}${targetUrl.pathname}${targetUrl.search}`

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': request.headers.get('user-agent') || 'BlogImageProxy/1.0',
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Upstream error' }, { status: res.status })
    }

    const contentType = res.headers.get('content-type') || ''
    const [mediaType] = contentType.split(';')
    if (!ALLOWED_CONTENT_TYPES.includes(mediaType.trim())) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 415 })
    }

    const blob = await res.blob()
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch (e) {
    console.error('[image-proxy] fetch error:', e)
    return NextResponse.json({ error: 'Proxy fetch failed' }, { status: 502 })
  }
}
