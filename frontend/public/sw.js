const CACHE_NAME = 'blog-cache-v1'
const OFFLINE_URL = '/offline.html'

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
]

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 使用 Promise.allSettled 忽略单个文件失败
      return Promise.allSettled(
        STATIC_ASSETS.map(url => 
          fetch(url).then(response => {
            if (response.ok) {
              return cache.put(url, response)
            }
          }).catch(() => {
            // 忽略错误，继续处理其他文件
          })
        )
      )
    })
  )
  self.skipWaiting()
})

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// 请求拦截 - 网络优先策略
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API 请求 - 网络优先
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // 静态资源 - 缓存优先
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 页面请求 - 网络优先，离线时返回缓存
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  // 其他请求 - 网络优先
  event.respondWith(networkFirst(request))
})

// 缓存优先策略
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    return new Response('Network error', { status: 408 })
  }
}

// 网络优先策略
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    // 只缓存 GET 请求（Cache API 不支持 POST 等方法）
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }
    return new Response('Network error', { status: 408 })
  }
}

// 网络优先 + 离线回退
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request)
    // 只缓存 GET 请求（Cache API 不支持 POST 等方法）
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }
    // 返回离线页面
    const offlinePage = await caches.match(OFFLINE_URL)
    if (offlinePage) {
      return offlinePage
    }
    return new Response('离线状态', { 
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}

// 判断是否为静态资源
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(pathname)
}

// 后台同步
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPosts())
  }
})

// 推送通知
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  const title = data.title || '新消息'
  const options = {
    body: data.body || '您有新的消息',
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/icon-72x72.svg',
    data: data.url || '/',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 点击通知
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data)
  )
})

// 同步文章（示例）
async function syncPosts() {
  // 这里可以实现离线时保存的文章同步逻辑
  console.log('Syncing posts...')
}
