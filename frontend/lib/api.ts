import { cache as reactCache } from 'react'
import axios, { AxiosRequestConfig } from 'axios'
import {
  User, Post, Category, Tag, Comment, Media, Notification, DashboardStats,
  PaginatedResponse, ApiResponse, SearchResult, FriendLink, Page, SiteConfig,
  SensitiveWord, IPBlacklist, Subscriber, CaptchaResponse, PostVersion,
  // 博客增强类型
  Series, SeriesPost, PostTemplate, Announcement, Resource, Changelog,
  Milestone, DeadLink, ReadingBehavior, AnalyticsStats, Shortcode,
  AutoLinkKeyword, AutoLinkConfig, DonationConfig,
  // 新增类型
  ArchiveItem, ImportResult, BackupInfo, PostPreview, FriendLinkApply,
  SharePlatform, SocialShareConfig, SocialShare,
  AdPlacement, AdContent, AdStats, AdClick, NavMenu,
  PostTranslation, Locale,
  AIGenerateRequest, AIGenerateResponse, AIProvidersResponse,
  SEOAnalysisResponse, GrammarCheckResponse, ModerationResponse
} from './types'

const API_BASE_URL =
  (typeof window === 'undefined'
    ? process.env.API_URL || process.env.NEXT_PUBLIC_API_URL
    : process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:8080/api/v1'

// ============ 缓存配置 ============
interface CacheItem<T> {
  data: T
  timestamp: number
  ttl: number
}

const MAX_CACHE_SIZE = 100 // 最大缓存条目数
/**
 * 模块级 LRU + TTL 缓存：在同一 Node.js 进程内跨请求共享。
 * ⚠️ 只应缓存公开只读数据（文章、分类、标签、配置等）。
 *    禁止缓存用户身份验证相关数据（如 /profile），否则不同用户间可能产生数据泄露。
 *    用户特定端点请使用 reactCache（per-request）或直接调用 api.get。
 */
const cache = new Map<string, CacheItem<unknown>>()
const DEFAULT_CACHE_TTL = 60 * 1000 // 默认缓存60秒

// 请求去重（预留：如需开启可在 cachedGet/requestWithRetry 中接入）

function getCached<T>(key: string): T | null {
  const item = cache.get(key)
  if (!item) return null
  if (Date.now() - item.timestamp > item.ttl) {
    cache.delete(key)
    return null
  }
  // Move to end of Map iteration order so LRU eviction works correctly
  cache.delete(key)
  cache.set(key, item)
  return item.data as T
}

function setCache<T>(key: string, data: T, ttl: number = DEFAULT_CACHE_TTL) {
  // LRU策略：超过大小时删除最旧的条目
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  })
}

// 清除缓存（支持模式匹配）
export function invalidateCache(pattern?: string) {
  if (!pattern) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key)
  }
}

// ============ 重试配置 ============
interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  skipRetry?: boolean // 跳过重试
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error | null = null

  // 计算实际重试次数（修正之前的bug：<= 应该是 <）
  const actualRetries = config.skipRetry ? 0 : config.maxRetries

  for (let i = 0; i <= actualRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // 不重试的情况：4xx 错误（除了 429）
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw error
        }
      }

      // 最后一次重试失败，抛出错误
      if (i === actualRetries) {
        throw error
      }

      // 指数退避
      const delay = Math.min(config.baseDelay * Math.pow(2, i), config.maxDelay)
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`请求失败，${delay}ms 后重试 (${i + 1}/${actualRetries})`)
      }
      await sleep(delay)
    }
  }

  throw lastError
}

// ============ Axios 实例 ============
// 默认 3 分钟，AI 类接口（生成标题/摘要/续写/润色等）可能较慢
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000,
  withCredentials: true,
})

// 请求拦截器（token 已通过 HttpOnly Cookie 自动携带，withCredentials: true 保证 Cookie 随请求发送）
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
)

// 响应拦截器 - 401 刷新 Token
let isRefreshing = false
let failedQueue: Array<{
  resolve: () => void
  reject: (error: Error) => void
}> = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(error)
      }

      // 没有已登录用户就别尝试刷新（直接返回 401）
      const hasSession = typeof window !== 'undefined' && !!localStorage.getItem('user')
      if (!hasSession) {
        return Promise.reject(error)
      }

      if (!isRefreshing) {
        isRefreshing = true
        originalRequest._retry = true

        try {
          // refresh_token 通过 HttpOnly Cookie 自动携带
          const refreshResp = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
            method: 'POST',
            credentials: 'include',
          })
          if (!refreshResp.ok) {
            throw new Error(`refresh-token failed: ${refreshResp.status}`)
          }

          // 重试等待队列
          failedQueue.forEach((promise) => promise.resolve())
          failedQueue = []

          return api(originalRequest)
        } catch (refreshError) {
          failedQueue.forEach((promise) => promise.reject(refreshError as Error))
          failedQueue = []

          if (typeof window !== 'undefined') {
            localStorage.removeItem('user')

            if (!window.location.pathname.includes('/login')) {
              window.location.href = '/admin/login'
            }
          }

          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      } else {
        // 等待 Token 刷新完成
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: () => resolve(api(originalRequest)),
            reject: (err) => reject(err),
          })
        })
      }
    }

    return Promise.reject(error)
  }
)

// ============ 辅助函数 ============

// 统一提取响应数据，处理后端 {success, data: {...}} 格式
function extractData<T>(response: { data: T | { data?: T } | null }): T {
  const respData = response.data as { data?: T } | null
  if (respData && typeof respData === 'object' && 'data' in respData) {
    return respData.data as T
  }
  return response.data as T
}

// 安全提取数组数据，处理 null/undefined 情况
function extractArrayData<T>(response: { data: T[] | { data?: T[] } | null }): T[] {
  const respData = response.data as { data?: T[] } | T[] | null
  if (respData && typeof respData === 'object' && 'data' in respData) {
    return respData.data || []
  }
  return (respData as T[]) || []
}

// ============ 缓存 GET 请求封装 ============
async function cachedGet<T>(url: string, config?: AxiosRequestConfig, ttl?: number): Promise<T> {
  const cacheKey = `${url}${JSON.stringify(config?.params || {})}`
  
  const cached = getCached<T>(cacheKey)
  if (cached) {
    return cached
  }
  
  const response = await api.get<T>(url, config)
  const data = extractData<T>(response)
  setCache(cacheKey, data, ttl)
  
  return data
}

// ============ 带重试的请求封装 ============
async function requestWithRetry<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  return withRetry(async () => {
    let response
    if (method === 'get' || method === 'delete') {
      response = await api[method]<T>(url, config)
    } else {
      response = await api[method]<T>(url, data, config)
    }
    return extractData<T>(response)
  })
}

// ==================== 认证相关 ====================

export async function login(login: string, password: string): Promise<{ user: User; token: string; refresh_token?: string }> {
  return requestWithRetry('post', '/auth/login', { login, password })
}

export async function getProfile(): Promise<User> {
  // 注意：不使用模块级 cachedGet 缓存用户特定数据，避免不同用户共用同一 Node.js 进程时出现数据泄露
  const response = await api.get('/profile')
  return extractData<User>(response)
}

export async function updateProfile(data: Partial<User>): Promise<User> {
  return requestWithRetry('put', '/profile', data)
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse> {
  return requestWithRetry('put', '/password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
}

// ==================== 文章相关 ====================

export async function fetchPosts(params?: {
  page?: number
  page_size?: number
  category_id?: number
  tag_id?: number
}): Promise<PaginatedResponse<Post>> {
  return cachedGet<PaginatedResponse<Post>>('/posts', { params }, 60 * 1000) // 缓存1分钟
}

/** 后台文章列表（支持草稿/过滤） */
export async function fetchAdminPosts(params?: {
  page?: number
  page_size?: number
  status?: 'draft' | 'published' | 'scheduled'
  my?: boolean
  category_id?: number
  tag_id?: number
}): Promise<PaginatedResponse<Post>> {
  const response = await api.get('/admin/posts', { params })
  return extractData<PaginatedResponse<Post>>(response)
}

export async function fetchPost(id: number | string, password?: string): Promise<Post> {
  // 密码保护文章：后端支持 ?password=...（向后兼容）或 X-Post-Password
  if (password) {
    const response = await api.get(`/posts/${id}`, { params: { password } })
    return extractData<Post>(response)
  }
  return cachedGet<Post>(`/posts/${id}`, undefined, 5 * 60 * 1000) // 缓存5分钟
}

/** 服务端用：同一 SSR 请求内多次调用（generateMetadata + 页面主体）只发一次请求 */
export const fetchPostCached = reactCache((id: number | string) => fetchPost(id))

// 密码保护文章：通过请求头携带 X-Post-Password（不做缓存）
export async function fetchPostWithPassword(id: number, password: string): Promise<Post> {
  const response = await api.get(`/posts/${id}`, {
    headers: { 'X-Post-Password': password },
  })
  return extractData<Post>(response)
}

export async function createPost(data: Partial<Post>): Promise<Post> {
  const result = await requestWithRetry<Post>('post', '/posts', data)
  invalidateCache('posts')
  return result
}

export async function updatePost(id: number, data: Partial<Post>): Promise<Post> {
  const result = await requestWithRetry<Post>('put', `/posts/${id}`, data)
  invalidateCache('posts')
  invalidateCache(`posts/${id}`)
  return result
}

export async function deletePost(id: number): Promise<void> {
  await requestWithRetry<void>('delete', `/posts/${id}`)
  invalidateCache('posts')
  invalidateCache(`posts/${id}`)
}

export async function likePost(id: number): Promise<ApiResponse> {
  return requestWithRetry('post', `/posts/${id}/like`)
}

// ==================== 分类和标签 ====================

export async function fetchCategories(): Promise<Category[]> {
  return cachedGet<Category[]>('/categories', undefined, 5 * 60 * 1000) // 缓存5分钟
}

/** 服务端用：同一 SSR 请求内 generateMetadata + 页面主体共享，避免重复请求 */
export const fetchCategoriesCached = reactCache(fetchCategories)

export async function createCategory(data: Partial<Category>): Promise<Category> {
  const response = await api.post('/admin/categories', data)
  return extractData<Category>(response)
}

export async function updateCategory(id: number, data: Partial<Category>): Promise<Category> {
  const response = await api.put(`/admin/categories/${id}`, data)
  return extractData<Category>(response)
}

export async function deleteCategory(id: number): Promise<void> {
  await api.delete(`/admin/categories/${id}`)
}

export async function fetchTags(): Promise<Tag[]> {
  return cachedGet<Tag[]>('/tags', undefined, 5 * 60 * 1000) // 缓存5分钟
}

/** 服务端用：同一 SSR 请求内 generateMetadata + 页面主体共享，避免重复请求 */
export const fetchTagsCached = reactCache(fetchTags)

export async function createTag(data: Partial<Tag>): Promise<Tag> {
  const response = await api.post('/admin/tags', data)
  return extractData<Tag>(response)
}

export async function updateTag(id: number, data: Partial<Tag>): Promise<Tag> {
  const response = await api.put(`/admin/tags/${id}`, data)
  return extractData<Tag>(response)
}

export async function deleteTag(id: number): Promise<void> {
  await api.delete(`/admin/tags/${id}`)
}

// ==================== 评论相关 ====================

export async function fetchComments(postId: number, signal?: AbortSignal): Promise<Comment[]> {
  const response = await api.get(`/posts/${postId}/comments`, { signal })
  // 后端返回分页格式：{ data: { data: [...], total, page, page_size } }
  const result = extractData<{ data: Comment[] }>(response)
  return result?.data || []
}

export async function createComment(data: {
  post_id: number
  parent_id?: number
  author?: string
  email?: string
  website?: string
  content: string
  captcha_id?: string
  captcha?: string
}): Promise<Comment> {
  const response = await api.post('/comments', data)
  return extractData<Comment>(response)
}

export async function deleteComment(id: number): Promise<void> {
  await api.delete(`/comments/${id}`)
}

export async function updateCommentStatus(id: number, status: 'pending' | 'approved' | 'rejected'): Promise<ApiResponse> {
  const response = await api.put(`/admin/comments/${id}/status`, { status })
  return extractData<ApiResponse>(response)
}

export async function fetchAllComments(params?: {
  page?: number
  status?: string
}): Promise<PaginatedResponse<Comment>> {
  const response = await api.get('/admin/comments', { params })
  return extractData<PaginatedResponse<Comment>>(response)
}

// ==================== 搜索相关 ====================

export async function search(keyword: string, page = 1, pageSize = 10): Promise<PaginatedResponse<SearchResult>> {
  const response = await api.get('/search', { params: { q: keyword, page, page_size: pageSize } })
  return extractData<PaginatedResponse<SearchResult>>(response)
}

export async function searchByTag(tag: string): Promise<SearchResult[]> {
  const response = await api.get(`/search/tag/${tag}`)
  const body = extractData<{ data?: SearchResult[] } | SearchResult[]>(response)
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) return body.data
  return []
}

export async function searchSuggest(prefix: string): Promise<string[]> {
  const response = await api.get('/search/suggest', { params: { q: prefix } })
  return extractArrayData<string>(response)
}

// ==================== 文件上传 ====================

export async function uploadFile(file: File): Promise<{ id: number; url: string; filename: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return extractData<{ id: number; url: string; filename: string }>(response)
}

export async function fetchMedia(params?: { page?: number }): Promise<PaginatedResponse<Media>> {
  const response = await api.get('/media', { params })
  return extractData<PaginatedResponse<Media>>(response)
}

export async function deleteMedia(id: number): Promise<void> {
  await api.delete(`/media/${id}`)
}

// ==================== 统计相关 ====================

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await api.get('/admin/dashboard/stats')
  return extractData<DashboardStats>(response)
}

export async function fetchPopularPosts(limit = 10): Promise<Post[]> {
  const response = await api.get('/stats/popular', { params: { limit } })
  return extractArrayData<Post>(response)
}

export async function fetchRecentPosts(limit = 10): Promise<Post[]> {
  const response = await api.get('/stats/recent', { params: { limit } })
  return extractArrayData<Post>(response)
}

export async function fetchCategoryStats(): Promise<{ category_name: string; post_count: number }[]> {
  const response = await api.get('/stats/category')
  return extractArrayData<{ category_name: string; post_count: number }>(response)
}

export async function fetchMonthlyStats(): Promise<{ month: string; post_count: number }[]> {
  const response = await api.get('/stats/monthly')
  return extractArrayData<{ month: string; post_count: number }>(response)
}

// 访问统计（公开接口）：用于 PV/访问趋势统计
export async function recordVisit(postId?: number): Promise<void> {
  await api.post('/stats/visit', null, { params: postId ? { post_id: postId } : undefined })
}

export async function getVisitStats(params?: { days?: number; start_date?: string; end_date?: string }): Promise<{ date: string; visit_count: number }[]> {
  const response = await api.get('/admin/stats/visits', { params })
  return extractArrayData<{ date: string; visit_count: number }>(response)
}

// ==================== 通知相关 ====================

export async function fetchNotifications(): Promise<Notification[]> {
  try {
    const response = await api.get('/notifications')
    return extractArrayData<Notification>(response)
  } catch (error) {
    // 未登录时后端可能返回 401，前端按“无通知”处理即可
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return []
    }
    throw error
  }
}

export async function markNotificationAsRead(id: number): Promise<ApiResponse> {
  const response = await api.put(`/notifications/${id}/read`)
  return extractData<ApiResponse>(response)
}

export async function markAllNotificationsAsRead(): Promise<ApiResponse> {
  const response = await api.put('/notifications/read-all')
  return extractData<ApiResponse>(response)
}

export async function getUnreadCount(): Promise<{ count: number }> {
  try {
    const response = await api.get('/notifications/unread-count')
    return extractData<{ count: number }>(response)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return { count: 0 }
    }
    throw error
  }
}

// ==================== 用户管理（管理员） ====================

export async function fetchAllUsers(params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<User>> {
  const response = await api.get('/admin/users', { params })
  return extractData<PaginatedResponse<User>>(response)
}

export async function updateUserRole(id: number, role: 'admin' | 'author' | 'reader'): Promise<ApiResponse> {
  const response = await api.put(`/admin/users/${id}/role`, { role })
  return extractData<ApiResponse>(response)
}

export async function updateUserStatus(id: number, isActive: boolean): Promise<ApiResponse> {
  const response = await api.put(`/admin/users/${id}/status`, { is_active: isActive })
  return extractData<ApiResponse>(response)
}

export async function deleteUser(id: number): Promise<ApiResponse> {
  const response = await api.delete(`/admin/users/${id}`)
  return extractData<ApiResponse>(response)
}

export async function refreshToken(): Promise<{ token: string }> {
  const response = await api.post('/auth/refresh-token')
  return extractData<{ token: string }>(response)
}

// ==================== 友链相关 ====================

export async function fetchFriendLinks(): Promise<FriendLink[]> {
  const response = await api.get('/links')
  return extractArrayData<FriendLink>(response)
}

export async function fetchFriendLinksAdmin(): Promise<FriendLink[]> {
  const response = await api.get('/admin/links')
  return extractArrayData<FriendLink>(response)
}

export async function createFriendLink(data: Omit<FriendLink, 'id' | 'created_at' | 'updated_at'>): Promise<FriendLink> {
  const response = await api.post('/admin/links', data)
  return extractData<FriendLink>(response)
}

export async function updateFriendLink(id: number, data: Partial<Omit<FriendLink, 'id' | 'created_at' | 'updated_at'>>): Promise<FriendLink> {
  const response = await api.put(`/admin/links/${id}`, data)
  return extractData<FriendLink>(response)
}

export async function deleteFriendLink(id: number): Promise<void> {
  await api.delete(`/admin/links/${id}`)
}

// ==================== 页面相关 ====================

export async function fetchPage(slug: string): Promise<Page> {
  const response = await api.get(`/pages/${slug}`)
  return extractData<Page>(response)
}

export async function createPage(data: Omit<Page, 'id' | 'created_at' | 'updated_at'>): Promise<Page> {
  const response = await api.post('/admin/pages', data)
  return extractData<Page>(response)
}

export async function updatePage(id: number, data: Partial<Omit<Page, 'id' | 'created_at' | 'updated_at'>>): Promise<Page> {
  const response = await api.put(`/admin/pages/${id}`, data)
  return extractData<Page>(response)
}

export async function deletePage(id: number): Promise<void> {
  await api.delete(`/admin/pages/${id}`)
}

// ==================== 用户中心相关 ====================

export async function fetchMyPosts(params?: {
  page?: number
  page_size?: number
  status?: string
}): Promise<PaginatedResponse<Post>> {
  const response = await api.get('/posts', { params: { ...params, my: true } })
  return extractData<PaginatedResponse<Post>>(response)
}

export async function fetchMyComments(params?: {
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<Comment>> {
  const response = await api.get('/profile/comments', { params })
  return extractData<PaginatedResponse<Comment>>(response)
}

// ==================== 归档相关 ====================

export async function fetchArchives(): Promise<ArchiveItem[]> {
  const response = await api.get('/archives')
  return extractArrayData<ArchiveItem>(response)
}

export async function fetchArchivesByYear(year: string): Promise<ArchiveItem[]> {
  const response = await api.get(`/archives/year/${year}`)
  return extractArrayData<ArchiveItem>(response)
}

export async function fetchArchiveStats(): Promise<{ year: number; count: number }[]> {
  const response = await api.get('/archives/stats')
  return extractArrayData<{ year: number; count: number }>(response)
}

// ==================== 推荐相关 ====================

export async function fetchRelatedPosts(postId: number, limit = 5): Promise<Post[]> {
  const response = await api.get(`/posts/${postId}/related`, { params: { limit } })
  return extractArrayData<Post>(response)
}

export async function fetchTrendingPosts(): Promise<Post[]> {
  const response = await api.get('/posts/trending')
  return extractArrayData<Post>(response)
}

// ==================== OAuth 登录 ====================

// OAuth 登录 - 直接跳转到后端 OAuth 入口
export function getOAuthLoginUrl(provider: 'github' | 'google'): string {
  return `${API_BASE_URL}/auth/${provider}/login`
}

// OAuth 登录回调处理
export async function oauthLogin(provider: string, code: string): Promise<{ token: string; refresh_token?: string; user: User }> {
  const response = await api.post(`/auth/${provider}/callback`, { code })
  return extractData<{ token: string; refresh_token?: string; user: User }>(response)
}

// 获取 OAuth 重定向 URL
export function getOAuthRedirectUrl(provider: 'github' | 'google'): string {
  return getOAuthLoginUrl(provider)
}

// ==================== 验证码 ====================

export async function getCaptcha(): Promise<CaptchaResponse> {
  const response = await api.get('/captcha')
  return extractData<CaptchaResponse>(response)
}

export async function verifyCaptcha(captchaId: string, code: string): Promise<{ valid: boolean; error?: string }> {
  const response = await api.post('/captcha/verify', { captcha_id: captchaId, code })
  return extractData<{ valid: boolean; error?: string }>(response)
}

// ==================== 系统配置 ====================

export async function getPublicConfigs(): Promise<Record<string, string>> {
  const response = await api.get('/configs')
  return extractData<Record<string, string>>(response)
}

/** 服务端用：同一请求内多次调用只发一次请求（供 layout + generateMetadata 复用） */
export const getPublicConfigsCached = reactCache(getPublicConfigs)

export async function getAllConfigs(): Promise<Record<string, SiteConfig[]>> {
  const response = await api.get('/admin/system/configs')
  return extractData<Record<string, SiteConfig[]>>(response)
}

export async function updateConfig(key: string, value: string): Promise<SiteConfig> {
  const response = await api.put(`/admin/system/configs/${key}`, { value })
  return extractData<SiteConfig>(response)
}

export async function batchUpdateConfigs(configs: Record<string, string>): Promise<ApiResponse> {
  const response = await api.post('/admin/system/configs/batch', configs)
  return extractData<ApiResponse>(response)
}

// ==================== 敏感词管理 ====================

export async function getSensitiveWords(params?: { page?: number; category?: string }): Promise<PaginatedResponse<SensitiveWord>> {
  const response = await api.get('/admin/sensitive-words', { params })
  return extractData<PaginatedResponse<SensitiveWord>>(response)
}

export async function createSensitiveWord(data: { word: string; category: string; level: number }): Promise<SensitiveWord> {
  const response = await api.post('/admin/sensitive-words', data)
  return extractData<SensitiveWord>(response)
}

export async function deleteSensitiveWord(id: number): Promise<void> {
  await api.delete(`/admin/sensitive-words/${id}`)
}

// ==================== IP黑名单管理 ====================

export async function getIPBlacklist(params?: { page?: number }): Promise<PaginatedResponse<IPBlacklist>> {
  const response = await api.get('/admin/ip-blacklist', { params })
  return extractData<PaginatedResponse<IPBlacklist>>(response)
}

export async function addToIPBlacklist(data: { ip_address: string; reason: string; expired_at?: string }): Promise<IPBlacklist> {
  const response = await api.post('/admin/ip-blacklist', data)
  return extractData<IPBlacklist>(response)
}

export async function removeFromIPBlacklist(id: number): Promise<void> {
  await api.delete(`/admin/ip-blacklist/${id}`)
}

// ==================== 订阅者管理 ====================

/** 订阅结果：成功 或 已订阅（含 token 用于退订） */
export type SubscribeResult =
  | { message?: string }
  | { already_subscribed: true; token: string }

export async function subscribe(email: string): Promise<SubscribeResult> {
  const response = await api.post('/subscribe', { email })
  return extractData<SubscribeResult>(response)
}

export async function unsubscribe(token: string): Promise<void> {
  await api.get(`/unsubscribe?token=${token}`)
}

export async function getSubscribers(params?: { page?: number }): Promise<PaginatedResponse<Subscriber>> {
  const response = await api.get('/admin/subscribers', { params })
  return extractData<PaginatedResponse<Subscriber>>(response)
}

/** 管理员：按类型导出数据 (posts|comments|users|subscribers 等)，带认证触发下载 */
export async function exportData(type: string): Promise<void> {
  await downloadBlobWithAuth(`/admin/export/${type}`, { defaultFilename: `export-${type}.json` })
}

// ==================== 版本管理 ====================

export async function getPostVersions(postId: number): Promise<PostVersion[]> {
  const response = await api.get(`/posts/${postId}/versions`)
  return extractArrayData<PostVersion>(response)
}

export async function getPostVersion(postId: number, version: number): Promise<PostVersion> {
  const response = await api.get(`/posts/${postId}/versions/${version}`)
  return extractData<PostVersion>(response)
}

export async function restorePostVersion(postId: number, version: number): Promise<{ message: string; post: Post }> {
  const response = await api.post(`/posts/${postId}/versions/restore/${version}`)
  return extractData<{ message: string; post: Post }>(response)
}

export async function autoSavePost(postId: number, data: { title: string; content: string; summary: string }): Promise<PostVersion> {
  const response = await api.post(`/posts/${postId}/autosave`, data)
  const result = extractData<{ message?: string; version?: PostVersion }>(response)
  return (result && typeof result === 'object' && result.version) || (result as unknown as PostVersion)
}

export async function getAutoSave(postId: number): Promise<PostVersion> {
  const response = await api.get(`/posts/${postId}/autosave`)
  return extractData<PostVersion>(response)
}

export async function compareVersions(postId: number, v1: number, v2: number): Promise<{ diff?: string; content1?: string; content2?: string }> {
  const response = await api.get(`/posts/${postId}/versions/compare`, { params: { v1, v2 } })
  return extractData<{ diff?: string; content1?: string; content2?: string }>(response)
}

export async function deletePostVersion(postId: number, version: number): Promise<void> {
  await api.delete(`/posts/${postId}/versions/${version}`)
}

// ==================== 文章多语言 ====================

export async function getPostTranslations(postId: number): Promise<PostTranslation[]> {
  const response = await api.get(`/posts/${postId}/translations`)
  return extractArrayData<PostTranslation>(response)
}

export async function getPostTranslation(postId: number, lang: string): Promise<PostTranslation> {
  const response = await api.get(`/posts/${postId}/translations/${lang}`)
  return extractData<PostTranslation>(response)
}

export async function createPostTranslation(postId: number, data: { language: string; title: string; content: string; summary?: string }): Promise<PostTranslation> {
  const response = await api.post(`/posts/${postId}/translations`, data)
  return extractData<PostTranslation>(response)
}

export async function autoTranslatePost(postId: number, targetLang: string): Promise<PostTranslation> {
  const response = await api.post(`/posts/${postId}/translations/auto`, { target_lang: targetLang })
  return extractData<PostTranslation>(response)
}

export async function updatePostTranslation(translationId: number, data: Partial<Pick<PostTranslation, 'title' | 'content' | 'summary'>>): Promise<PostTranslation> {
  const response = await api.put(`/translations/${translationId}`, data)
  return extractData<PostTranslation>(response)
}

export async function deletePostTranslation(translationId: number): Promise<void> {
  await api.delete(`/translations/${translationId}`)
}

// ==================== 批量操作 ====================

export async function batchDeletePosts(ids: number[]): Promise<ApiResponse> {
  const response = await api.post('/admin/posts/batch/delete', { ids })
  return extractData<ApiResponse>(response)
}

export async function batchUpdatePostStatus(ids: number[], status: 'draft' | 'published'): Promise<ApiResponse> {
  const response = await api.post('/admin/posts/batch/status', { ids, status })
  return extractData<ApiResponse>(response)
}

export async function batchMoveCategory(ids: number[], categoryId: number | null): Promise<ApiResponse> {
  const response = await api.post('/admin/posts/batch/move', { ids, category_id: categoryId })
  return extractData<ApiResponse>(response)
}

export async function batchDeleteComments(ids: number[]): Promise<ApiResponse> {
  const response = await api.post('/admin/comments/batch/delete', { ids })
  return extractData<ApiResponse>(response)
}

export async function batchApproveComments(ids: number[]): Promise<ApiResponse> {
  const response = await api.post('/admin/comments/batch/approve', { ids })
  return extractData<ApiResponse>(response)
}

// ==================== 定时发布 ====================

export async function schedulePost(postId: number, publishAt: Date): Promise<ApiResponse> {
  const response = await api.post(`/admin/posts/${postId}/schedule`, { publish_at: publishAt })
  return extractData<ApiResponse>(response)
}

export async function cancelSchedule(postId: number): Promise<ApiResponse> {
  const response = await api.delete(`/admin/posts/${postId}/schedule`)
  return extractData<ApiResponse>(response)
}

export async function getScheduledPosts(params?: { page?: number }): Promise<PaginatedResponse<Post>> {
  const response = await api.get('/admin/scheduled-posts', { params })
  return extractData<PaginatedResponse<Post>>(response)
}

// ==================== 文章导入导出 ====================

export async function importPosts(formData: FormData): Promise<ImportResult> {
  const response = await api.post('/admin/posts/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return extractData<ImportResult>(response)
}

/** 使用 api 请求获取 blob 并触发下载（携带认证令牌，避免 window.location.href 无 token） */
async function downloadBlobWithAuth(
  urlPath: string,
  options: { params?: Record<string, string>; defaultFilename?: string } = {}
): Promise<void> {
  const { params, defaultFilename = 'download' } = options
  const response = await api.get<Blob>(urlPath, { params, responseType: 'blob' })
  const blob = response.data
  const disposition = response.headers['content-disposition'] as string | undefined
  const filenameMatch = disposition?.match(/filename=(.+?)(?:;|$)/)
  const filename = filenameMatch
    ? filenameMatch[1].trim().replace(/^["']|["']$/g, '')
    : defaultFilename
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

/** 导出文章（使用 api 请求以携带认证令牌，再触发下载） */
export async function exportPosts(format: string = 'markdown'): Promise<void> {
  await downloadBlobWithAuth('/admin/posts/export', {
    params: { format },
    defaultFilename: format === 'json' ? 'posts.json' : 'posts-markdown.zip',
  })
}

// ==================== 数据备份 ====================

export async function createBackup(type: string = 'full'): Promise<{ message: string; filename: string; size: number }> {
  const response = await api.post('/admin/backups', null, { params: { type } })
  return extractData<{ message: string; filename: string; size: number }>(response)
}

export async function getBackups(): Promise<BackupInfo[]> {
  const response = await api.get('/admin/backups')
  return extractArrayData<BackupInfo>(response)
}

/** 下载备份文件（带认证触发下载） */
export async function downloadBackup(filename: string): Promise<void> {
  await downloadBlobWithAuth(`/admin/backups/${filename}`, { defaultFilename: filename })
}

export async function deleteBackup(filename: string): Promise<ApiResponse> {
  const response = await api.delete(`/admin/backups/${filename}`)
  return extractData<ApiResponse>(response)
}

export async function restoreBackup(filename: string): Promise<{ message: string; restored: string[] }> {
  const response = await api.post(`/admin/backups/${filename}/restore`)
  return extractData<{ message: string; restored: string[] }>(response)
}

// ==================== 水印配置 ====================

export interface WatermarkConfig {
  enabled?: boolean
  text?: string
  position?: string
  opacity?: number
  [key: string]: unknown
}

export async function getWatermarkConfig(): Promise<WatermarkConfig> {
  const response = await api.get('/admin/watermark')
  return extractData<WatermarkConfig>(response)
}

export async function updateWatermarkConfig(data: Partial<WatermarkConfig>): Promise<WatermarkConfig> {
  const response = await api.put('/admin/watermark', data)
  return extractData<WatermarkConfig>(response)
}

export async function uploadWithWatermark(file: File): Promise<{ id: number; url: string; filename: string }> {
  const formData = new FormData()
  formData.append('file', file)
  // 后端路由为 /api/v1/admin/upload/watermark（管理员权限）
  const response = await api.post('/admin/upload/watermark', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return extractData<{ id: number; url: string; filename: string }>(response)
}

// ==================== 语言包 ====================

export async function getAllLocales(): Promise<string[]> {
  const response = await api.get('/admin/locales')
  const data = extractData<{ language?: string }[] | { languages?: string[] } | string[]>(response)
  if (Array.isArray(data)) {
    // 后端返回 [{ language: "zh", translations: {...} }, ...]
    const langs = data
      .map((x: { language?: string }) => x?.language)
      .filter((s): s is string => typeof s === 'string')
    return langs
  }
  return (data && typeof data === 'object' && 'languages' in data && data.languages) || []
}

export async function getLocale(lang: string): Promise<Locale> {
  const response = await api.get(`/admin/locales/${lang}`)
  return extractData<Locale>(response)
}

export async function createLocale(lang: string, translations: Record<string, unknown>): Promise<Locale> {
  const response = await api.post('/admin/locales', { language: lang, translations })
  return extractData<Locale>(response)
}

export async function updateLocale(lang: string, translations: Record<string, unknown>): Promise<Locale> {
  const response = await api.put(`/admin/locales/${lang}`, { translations })
  return extractData<Locale>(response)
}

export async function deleteLocale(lang: string): Promise<void> {
  await api.delete(`/admin/locales/${lang}`)
}

/** 导出多语言（带认证触发下载） */
export async function exportLocales(): Promise<void> {
  await downloadBlobWithAuth('/admin/locales/export', { defaultFilename: 'locales.json' })
}

export async function importLocales(formData: FormData): Promise<ApiResponse> {
  const response = await api.post('/admin/locales/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  return extractData<ApiResponse>(response)
}

// ==================== 草稿预览 ====================

export async function createPreviewLink(postId: number, expiresIn: number = 24): Promise<{ preview_id: number; token: string; preview_url: string; expired_at: string }> {
  const response = await api.post('/previews', { post_id: postId, expires_in: expiresIn })
  return extractData<{ preview_id: number; token: string; preview_url: string; expired_at: string }>(response)
}

export async function getPreviewLinks(postId: number): Promise<PostPreview[]> {
  const response = await api.get(`/posts/${postId}/previews`)
  return extractArrayData<PostPreview>(response)
}

export async function deletePreviewLink(id: number): Promise<void> {
  await api.delete(`/previews/${id}`)
}

export async function getPreviewByToken(token: string): Promise<Post> {
  const response = await api.get(`/preview/${token}`)
  return extractData<Post>(response)
}

// ==================== 友链申请 ====================

export async function applyFriendLink(data: { name: string; url: string; logo?: string; description?: string; email: string }): Promise<ApiResponse> {
  const response = await api.post('/friend-links/apply', data)
  return extractData<ApiResponse>(response)
}

/** 公开：查询友链申请状态 */
export async function getFriendLinkApplyStatus(applyId: string): Promise<{ status: string; message?: string }> {
  const response = await api.get(`/friend-links/apply/${applyId}/status`)
  return extractData<{ status: string; message?: string }>(response)
}

export async function getFriendLinkApplies(params?: { page?: number; status?: string }): Promise<PaginatedResponse<FriendLinkApply>> {
  const response = await api.get('/admin/friend-link-applies', { params })
  return extractData<PaginatedResponse<FriendLinkApply>>(response)
}

export async function handleFriendLinkApply(id: number, status: 'approved' | 'rejected', reason?: string): Promise<ApiResponse> {
  const response = await api.put(`/admin/friend-link-applies/${id}`, { status, reason })
  return extractData<ApiResponse>(response)
}

export async function deleteFriendLinkApply(id: number): Promise<void> {
  await api.delete(`/admin/friend-link-applies/${id}`)
}

// ==================== AI（需要登录） ====================

export async function getAIProviders(): Promise<AIProvidersResponse> {
  const response = await api.get('/ai/providers')
  return extractData<AIProvidersResponse>(response)
}

/** 从当前配置的 AI 厂商拉取可用模型列表（需先保存 API Key） */
export interface AIModelItem {
  id: string
}
export async function getAIModels(): Promise<{ models: AIModelItem[] }> {
  const response = await api.get('/ai/models')
  return extractData<{ models: AIModelItem[] }>(response)
}

export async function aiGenerateTitle(data: AIGenerateRequest): Promise<AIGenerateResponse> {
  const response = await api.post('/ai/generate-title', data)
  return extractData<AIGenerateResponse>(response)
}

export async function aiGenerateSummary(data: AIGenerateRequest): Promise<AIGenerateResponse> {
  const response = await api.post('/ai/generate-summary', data)
  return extractData<AIGenerateResponse>(response)
}

/** 可选请求配置（如 signal 用于停止请求） */
export type AIRequestConfig = { signal?: AbortSignal }

/** 流式 AI 请求参数（与后端 POST /ai/stream 一致） */
export type AIStreamPayload = {
  action: 'continue' | 'polish' | 'translate' | 'outline' | 'grammar' | 'spell' | 'meta' | 'title' | 'summary' | 'seo_analyze' | 'slug' | 'tags_category' | 'comment_reply' | 'batch_generate' | 'enhance_prompt'
  content?: string
  title?: string
  lang?: string
  topic?: string
  category_names?: string[]
  tag_names?: string[]
  generate?: string[]
  comment_content?: string
  post_title?: string
  prompt?: string
}

/**
 * 调用流式 AI 接口，通过 onChunk 逐块推送内容；signal 用于停止。
 * 返回完整拼接内容；若中途取消或失败则抛出。
 */
export async function aiStream(
  payload: AIStreamPayload,
  options: { signal?: AbortSignal; onChunk?: (chunk: string) => void }
): Promise<string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''
  const url = `${typeof window === 'undefined' ? process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8080/api/v1' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')}/ai/stream`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: options.signal,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    const apiError = err.error
    const msg = typeof apiError?.message === 'string' ? apiError.message : `HTTP ${res.status}`
    throw new Error(msg)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No body')
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.startsWith('data: ') ? line.slice(6).trim() : ''
      if (t === '' || t === '[DONE]') continue
      try {
        const obj = JSON.parse(t) as { content?: string }
        if (typeof obj.content === 'string') {
          full += obj.content
          options.onChunk?.(obj.content)
        }
      } catch {
        // ignore non-JSON lines
      }
    }
  }
  if (buf.startsWith('data: ') && buf.slice(6).trim() !== '[DONE]') {
    try {
      const obj = JSON.parse(buf.slice(6).trim()) as { content?: string }
      if (typeof obj.content === 'string') {
        full += obj.content
        options.onChunk?.(obj.content)
      }
    } catch {
      // ignore
    }
  }
  return full
}

export async function aiContinueWriting(data: AIGenerateRequest, config?: AIRequestConfig): Promise<AIGenerateResponse> {
  const response = await api.post('/ai/continue-writing', data, config)
  return extractData<AIGenerateResponse>(response)
}

export async function aiPolishText(data: AIGenerateRequest, config?: AIRequestConfig): Promise<AIGenerateResponse> {
  const response = await api.post('/ai/polish-text', data, config)
  return extractData<AIGenerateResponse>(response)
}

export async function aiTranslateText(data: AIGenerateRequest, config?: AIRequestConfig): Promise<AIGenerateResponse> {
  const response = await api.post('/ai/translate', data, config)
  return extractData<AIGenerateResponse>(response)
}

export async function aiGenerateOutline(data: AIGenerateRequest, config?: AIRequestConfig): Promise<AIGenerateResponse> {
  const response = await api.post('/ai/generate-outline', data, config)
  return extractData<AIGenerateResponse>(response)
}

/** AI 根据标题生成 URL 别名（slug） */
export async function aiGenerateSlug(data: { title: string }): Promise<{ slug: string }> {
  const response = await api.post('/ai/generate-slug', data)
  return extractData<{ slug: string }>(response)
}

/** AI 一键生成：勾选要生成的项，一次返回（摘要、标题、URL 别名、分类与标签） */
export async function aiBatchGenerate(data: {
  content: string
  title?: string
  category_names?: string[]
  tag_names?: string[]
  generate: ('summary' | 'title' | 'slug' | 'tags_category')[]
}): Promise<{
  summary?: string
  title?: string
  titles?: string
  slug?: string
  category_name?: string
  tags?: string[]
}> {
  const response = await api.post('/ai/batch-generate', data)
  return extractData(response)
}

/** AI 推荐标签与分类（写作时采纳） */
export async function aiSuggestTagsCategory(data: {
  title?: string
  content: string
  category_names?: string[]
  tag_names?: string[]
}): Promise<{ category_name: string; tags: string[] }> {
  const response = await api.post('/ai/suggest-tags-category', data)
  return extractData<{ category_name: string; tags: string[] }>(response)
}

/** AI 建议回复（评论管理用） */
export async function aiSuggestCommentReply(data: {
  comment_content: string
  post_title?: string
}): Promise<{ reply: string }> {
  const response = await api.post('/ai/suggest-comment-reply', data)
  return extractData<{ reply: string }>(response)
}

export async function aiImageGenerate(data: { prompt: string; size?: string; n?: number; model?: string }): Promise<{ images: Array<{ url?: string; b64_json?: string }>; raw?: unknown }> {
  const response = await api.post('/ai/image/generate', data)
  return extractData<{ images: Array<{ url?: string; b64_json?: string }>; raw?: unknown }>(response)
}

export async function aiEnhancePrompt(data: { prompt: string }): Promise<{ prompt: string }> {
  const response = await api.post('/ai/image/enhance-prompt', data)
  return extractData<{ prompt: string }>(response)
}

export async function aiSeoAnalyze(data: { content: string; title?: string; url?: string }): Promise<SEOAnalysisResponse> {
  const response = await api.post('/ai/seo/analyze', data)
  return extractData<SEOAnalysisResponse>(response)
}

export async function aiSeoMetaTags(data: { title: string; content: string; url?: string }, config?: AIRequestConfig): Promise<{ meta: Record<string, string> }> {
  const response = await api.post('/ai/seo/meta-tags', data, config)
  return extractData<{ meta: Record<string, string> }>(response)
}

export async function aiGrammarCheck(data: { content: string; lang?: string }, config?: AIRequestConfig): Promise<GrammarCheckResponse> {
  const response = await api.post('/ai/grammar/check', data, config)
  return extractData<GrammarCheckResponse>(response)
}

export async function aiSpellCheck(data: { content: string; lang?: string }, config?: AIRequestConfig): Promise<GrammarCheckResponse> {
  const response = await api.post('/ai/grammar/spell', data, config)
  return extractData<GrammarCheckResponse>(response)
}

export async function aiModerationCheck(data: { content: string; lang?: string }): Promise<ModerationResponse> {
  const response = await api.post('/ai/moderation/check', data)
  return extractData<ModerationResponse>(response)
}

// ==================== 打赏功能 ====================

export async function getDonationConfig(authorId: number): Promise<DonationConfig> {
  const response = await api.get(`/donation/config?author_id=${authorId}`)
  return extractData<DonationConfig>(response)
}

export async function getDonationConfigAdmin(): Promise<DonationConfig> {
  const response = await api.get('/admin/donation/config')
  return extractData<DonationConfig>(response)
}

export async function updateDonationConfig(data: Partial<DonationConfig>): Promise<DonationConfig> {
  const response = await api.put('/admin/donation/config', data)
  const result = extractData<{ message?: string; config?: DonationConfig }>(response)
  return (result && typeof result === 'object' && 'config' in result && result.config) || (result as DonationConfig)
}

// ==================== 文章合集/专栏 ====================

/** 公开：已发布的合集列表 */
export async function getSeriesList(): Promise<Series[]> {
  const response = await api.get('/series')
  return extractArrayData<Series>(response)
}

/** 管理员：全部合集列表 */
export async function getAdminSeriesList(): Promise<Series[]> {
  const response = await api.get('/admin/series')
  const result = extractData<PaginatedResponse<Series>>(response)
  return result?.data || []
}

/** 管理员：获取合集详情（含文章列表，任意状态） */
export async function getAdminSeriesDetail(id: number): Promise<{ series: Series; posts: SeriesPost[] }> {
  const response = await api.get(`/admin/series/${id}`)
  const raw = extractData<{ series: Series; posts: SeriesPost[] }>(response)
  return { series: raw!.series, posts: raw!.posts || [] }
}

export async function getSeriesBySlug(slug: string): Promise<Series & { posts: SeriesPost[] }> {
  const response = await api.get(`/series/${slug}`)
  return extractData<Series & { posts: SeriesPost[] }>(response)
}

export async function createSeries(data: Partial<Series> & { post_ids?: number[] }): Promise<Series> {
  const response = await api.post('/admin/series', data)
  return extractData<Series>(response)
}

export async function updateSeries(id: number, data: Partial<Series>): Promise<Series> {
  const response = await api.put(`/admin/series/${id}`, data)
  return extractData<Series>(response)
}

export async function deleteSeries(id: number): Promise<void> {
  await api.delete(`/admin/series/${id}`)
}

export async function addPostToSeries(seriesId: number, postId: number, sortOrder?: number): Promise<void> {
  await api.post(`/admin/series/${seriesId}/posts`, { post_id: postId, sort_order: sortOrder })
}

export async function removePostFromSeries(seriesId: number, postId: number): Promise<void> {
  await api.delete(`/admin/series/${seriesId}/posts/${postId}`)
}

/** 调整合集中文章顺序 */
export async function reorderSeriesPosts(seriesId: number, postIds: number[]): Promise<void> {
  await api.put(`/admin/series/${seriesId}/reorder`, { post_ids: postIds })
}

// ==================== 文章模板 ====================

export async function getTemplates(): Promise<PostTemplate[]> {
  const response = await api.get('/templates')
  return extractArrayData<PostTemplate>(response)
}

export async function getTemplate(id: number): Promise<PostTemplate> {
  const response = await api.get(`/templates/${id}`)
  return extractData<PostTemplate>(response)
}

export async function createTemplate(data: Partial<PostTemplate>): Promise<PostTemplate> {
  const response = await api.post('/admin/templates', data)
  return extractData<PostTemplate>(response)
}

export async function updateTemplate(id: number, data: Partial<PostTemplate>): Promise<PostTemplate> {
  const response = await api.put(`/admin/templates/${id}`, data)
  return extractData<PostTemplate>(response)
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/admin/templates/${id}`)
}

// ==================== 公告 ====================

export async function getActiveAnnouncements(): Promise<Announcement[]> {
  const response = await api.get('/announcements')
  return extractArrayData<Announcement>(response)
}

export async function createAnnouncement(data: Partial<Announcement>): Promise<Announcement> {
  const response = await api.post('/admin/announcements', data)
  return extractData<Announcement>(response)
}

export async function updateAnnouncement(id: number, data: Partial<Announcement>): Promise<Announcement> {
  const response = await api.put(`/admin/announcements/${id}`, data)
  return extractData<Announcement>(response)
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await api.delete(`/admin/announcements/${id}`)
}

// ==================== 资源/书单 ====================

export async function getResources(params?: { category?: string; recommended?: boolean }): Promise<Resource[]> {
  const response = await api.get('/resources', { params })
  return extractArrayData<Resource>(response)
}

export async function createResource(data: Partial<Resource>): Promise<Resource> {
  const response = await api.post('/admin/resources', data)
  return extractData<Resource>(response)
}

export async function updateResource(id: number, data: Partial<Resource>): Promise<Resource> {
  const response = await api.put(`/admin/resources/${id}`, data)
  return extractData<Resource>(response)
}

export async function deleteResource(id: number): Promise<void> {
  await api.delete(`/admin/resources/${id}`)
}

// ==================== 更新日志 ====================

export async function getChangelogs(): Promise<Changelog[]> {
  const response = await api.get('/changelogs')
  return extractArrayData<Changelog>(response)
}

export async function createChangelog(data: Partial<Changelog>): Promise<Changelog> {
  const response = await api.post('/admin/changelogs', data)
  return extractData<Changelog>(response)
}

export async function updateChangelog(id: number, data: Partial<Changelog>): Promise<Changelog> {
  const response = await api.put(`/admin/changelogs/${id}`, data)
  return extractData<Changelog>(response)
}

export async function deleteChangelog(id: number): Promise<void> {
  await api.delete(`/admin/changelogs/${id}`)
}

// ==================== 里程碑/成就 ====================

export async function getMilestones(params?: { achieved?: boolean }): Promise<Milestone[]> {
  const response = await api.get('/milestones', { params })
  return extractArrayData<Milestone>(response)
}

export async function createMilestone(data: Partial<Milestone>): Promise<Milestone> {
  const response = await api.post('/admin/milestones', data)
  return extractData<Milestone>(response)
}

export async function updateMilestone(id: number, data: Partial<Milestone>): Promise<Milestone> {
  const response = await api.put(`/admin/milestones/${id}`, data)
  return extractData<Milestone>(response)
}

export async function deleteMilestone(id: number): Promise<void> {
  await api.delete(`/admin/milestones/${id}`)
}

// ==================== 分析统计 ====================

export async function recordReadingBehavior(data: Partial<ReadingBehavior>): Promise<void> {
  await api.post('/analytics/behavior', data)
}

export async function getAnalyticsStats(params?: { start_date?: string; end_date?: string }): Promise<AnalyticsStats> {
  const response = await api.get('/analytics/stats', { params })
  return extractData<AnalyticsStats>(response)
}

// ==================== 死链检测 ====================

export async function checkDeadLinks(): Promise<{ checked: number; found: number }> {
  const response = await api.post('/admin/dead-links/check')
  return extractData<{ checked: number; found: number }>(response)
}

export async function getDeadLinks(params?: { is_fixed?: boolean }): Promise<DeadLink[]> {
  const response = await api.get('/admin/dead-links', { params })
  return extractArrayData<DeadLink>(response)
}

export async function fixDeadLink(id: number): Promise<void> {
  await api.put(`/admin/dead-links/${id}/fix`)
}

// ==================== 短代码 ====================

export async function getShortcodes(): Promise<Shortcode[]> {
  const response = await api.get('/admin/shortcodes')
  return extractArrayData<Shortcode>(response)
}

export async function parseShortcode(content: string): Promise<{ html: string }> {
  const response = await api.post('/admin/shortcodes/parse', { content })
  return extractData<{ html: string }>(response)
}

export async function previewShortcode(shortcode: string): Promise<{ html: string }> {
  const response = await api.post('/admin/shortcodes/preview', { shortcode })
  return extractData<{ html: string }>(response)
}

export async function registerCustomShortcode(data: { name: string; description?: string; example?: string; template: string }): Promise<ApiResponse> {
  const response = await api.post('/admin/shortcodes/custom', data)
  return extractData<ApiResponse>(response)
}

/** 导出 Shortcodes（带认证触发下载） */
export async function exportShortcodes(): Promise<void> {
  await downloadBlobWithAuth('/admin/shortcodes/export', { defaultFilename: 'shortcodes.json' })
}

// ==================== 自动内链 ====================

export async function getAutoLinkKeywords(): Promise<AutoLinkKeyword[]> {
  const response = await api.get('/admin/auto-links/keywords')
  return extractArrayData<AutoLinkKeyword>(response)
}

export async function createAutoLinkKeyword(data: Partial<AutoLinkKeyword>): Promise<AutoLinkKeyword> {
  const response = await api.post('/admin/auto-links/keywords', data)
  return extractData<AutoLinkKeyword>(response)
}

export async function updateAutoLinkKeyword(id: number, data: Partial<AutoLinkKeyword>): Promise<AutoLinkKeyword> {
  const response = await api.put(`/admin/auto-links/keywords/${id}`, data)
  return extractData<AutoLinkKeyword>(response)
}

export async function deleteAutoLinkKeyword(id: number): Promise<void> {
  await api.delete(`/admin/auto-links/keywords/${id}`)
}

export async function batchImportKeywords(keywords: Partial<AutoLinkKeyword>[]): Promise<{ count: number }> {
  const response = await api.post('/admin/auto-links/keywords/batch', keywords)
  return extractData<{ count: number }>(response)
}

export async function previewAutoLink(content: string, config: AutoLinkConfig, currentPostId?: number): Promise<{
  original: string
  processed: string
  added_links: number
}> {
  const response = await api.post('/admin/auto-links/preview', { content, config, current_post_id: currentPostId })
  return extractData<{ original: string; processed: string; added_links: number }>(response)
}

export async function getAutoLinkStats(): Promise<{
  keyword_count: number
  post_count: number
  category_count: number
  tag_count: number
}> {
  const response = await api.get('/admin/auto-links/stats')
  return extractData<{ keyword_count: number; post_count: number; category_count: number; tag_count: number }>(response)
}

export async function suggestKeywords(): Promise<Array<{ word: string; count: number }>> {
  const response = await api.get('/admin/auto-links/suggest')
  return extractArrayData<{ word: string; count: number }>(response)
}

/** 导出自动内链关键词（带认证触发下载） */
export async function exportAutoLinkKeywords(): Promise<void> {
  await downloadBlobWithAuth('/admin/auto-links/export', { defaultFilename: 'auto-link-keywords.json' })
}

export async function getAutoLinkConfig(): Promise<AutoLinkConfig> {
  const response = await api.get('/admin/auto-links/config')
  return extractData<AutoLinkConfig>(response)
}

export async function updateAutoLinkConfig(config: AutoLinkConfig): Promise<AutoLinkConfig> {
  const response = await api.put('/admin/auto-links/config', config)
  return extractData<AutoLinkConfig>(response)
}

// ==================== 社交分享 ====================

export async function getSharePlatforms(): Promise<SharePlatform[]> {
  const response = await api.get('/social/platforms')
  const data = extractData<{ platforms: SharePlatform[] }>(response)
  return data.platforms || []
}

export async function generateShareURL(data: {
  platform: string
  url: string
  title: string
  image?: string
}): Promise<{ type: string; share_url?: string; qrcode_url?: string; copy_text?: string }> {
  const response = await api.post('/social/share-url', data)
  return extractData<{ type: string; share_url?: string; qrcode_url?: string; copy_text?: string }>(response)
}

export async function recordShare(postId: number, platform: string, shareUrl: string): Promise<void> {
  await api.post('/social/share/record', { post_id: postId, platform, share_url: shareUrl })
}

export async function getShareStats(postId?: number): Promise<{
  total: number
  platform_stats: Array<{ platform: string; count: number }>
}> {
  const response = await api.get('/social/share/stats', { params: { post_id: postId } })
  return extractData<{ total: number; platform_stats: Array<{ platform: string; count: number }> }>(response)
}

export async function getShareConfigs(): Promise<SocialShareConfig[]> {
  const response = await api.get('/admin/social/configs')
  return extractArrayData<SocialShareConfig>(response)
}

export async function updateShareConfig(id: number, data: Partial<SocialShareConfig>): Promise<SocialShareConfig> {
  const response = await api.put(`/admin/social/configs/${id}`, data)
  return extractData<SocialShareConfig>(response)
}

export async function getShareHistory(params?: { post_id?: number; platform?: string; page?: number }): Promise<PaginatedResponse<SocialShare>> {
  const response = await api.get('/admin/social/history', { params })
  return extractData<PaginatedResponse<SocialShare>>(response)
}

export async function getOpenGraphTags(params: { post_id?: string; url?: string }): Promise<Record<string, string>> {
  const response = await api.get('/social/og-tags', { params })
  return extractData<Record<string, string>>(response)
}

export async function getTwitterCardTags(params: { post_id?: string; url?: string }): Promise<Record<string, string>> {
  const response = await api.get('/social/twitter-card', { params })
  return extractData<Record<string, string>>(response)
}

/** 认证：SEO 元数据分析 */
export async function analyzeSEOMetadata(url: string, html?: string): Promise<{ score?: number; suggestions?: unknown[] }> {
  const response = await api.post('/seo/analyze', { url, html })
  return extractData<{ score?: number; suggestions?: unknown[] }>(response)
}

/** 公开：结构化数据 (JSON-LD) */
export async function getStructuredData(): Promise<unknown> {
  const response = await api.get('/seo/structured-data')
  return extractData<unknown>(response)
}

// ==================== 广告位管理 ====================

export async function getAdPlacements(): Promise<AdPlacement[]> {
  const response = await api.get('/ads/placements')
  return extractArrayData<AdPlacement>(response)
}

export async function getAdPlacementByCode(code: string): Promise<{ placement: AdPlacement; ads: AdContent[] }> {
  const response = await api.get(`/ads/placement/${code}`)
  return extractData<{ placement: AdPlacement; ads: AdContent[] }>(response)
}

export async function createAdPlacement(data: Partial<AdPlacement>): Promise<AdPlacement> {
  const response = await api.post('/admin/ads/placements', data)
  return extractData<AdPlacement>(response)
}

export async function updateAdPlacement(id: number, data: Partial<AdPlacement>): Promise<AdPlacement> {
  const response = await api.put(`/admin/ads/placements/${id}`, data)
  return extractData<AdPlacement>(response)
}

export async function deleteAdPlacement(id: number): Promise<void> {
  await api.delete(`/admin/ads/placements/${id}`)
}

export async function getAds(placementId?: number): Promise<AdContent[]> {
  const response = await api.get('/admin/ads', { params: { placement_id: placementId } })
  return extractArrayData<AdContent>(response)
}

export async function getAd(id: number): Promise<AdContent> {
  const response = await api.get(`/admin/ads/${id}`)
  return extractData<AdContent>(response)
}

export async function createAd(data: Partial<AdContent>): Promise<AdContent> {
  const response = await api.post('/admin/ads', data)
  return extractData<AdContent>(response)
}

export async function updateAd(id: number, data: Partial<AdContent>): Promise<AdContent> {
  const response = await api.put(`/admin/ads/${id}`, data)
  return extractData<AdContent>(response)
}

export async function deleteAd(id: number): Promise<void> {
  await api.delete(`/admin/ads/${id}`)
}

export async function recordAdView(adId: number): Promise<void> {
  await api.post('/ads/view', { ad_id: adId })
}

export async function recordAdClick(adId: number): Promise<{ redirect_url?: string }> {
  const response = await api.post('/ads/click', { ad_id: adId })
  return extractData<{ redirect_url?: string }>(response)
}

export async function getAdStats(params?: { ad_id?: number; placement_id?: number }): Promise<AdStats> {
  const response = await api.get('/admin/ads/stats', { params })
  return extractData<AdStats>(response)
}

export async function getAdClickHistory(adId?: number): Promise<PaginatedResponse<AdClick>> {
  const response = await api.get('/admin/ads/clicks', { params: { ad_id: adId } })
  return extractData<PaginatedResponse<AdClick>>(response)
}

// ==================== 管理后台 Cookie 认证请求帮助函数 ====================

/**
 * 管理后台专用 fetch 函数，自动使用 Cookie 认证
 * 使用方法: adminFetch('/admin/xxx', { method: 'POST', body: JSON.stringify(data) })
 */
export async function adminFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T; ok: boolean; status: number }> {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`
  
  const response = await fetch(fullUrl, {
    ...options,
    credentials: 'include', // 自动发送 HttpOnly Cookie
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const ok = response.ok
  const status = response.status

  // 对于 401，返回空数据而不是抛出错误
  if (status === 401) {
    return { data: null as T, ok: false, status }
  }

  // 尝试解析 JSON
  let data: T = null as T
  try {
    const result = await response.json()
    // 处理后端返回的 {data: ..., success: true} 格式
    data = result?.data !== undefined ? result.data : result
  } catch {
    // 响应可能为空
  }

  return { data, ok, status }
}

// ==================== 导航菜单管理 ====================

export async function fetchNavMenus(): Promise<NavMenu[]> {
  const response = await api.get('/nav-menus')
  return extractArrayData<NavMenu>(response)
}

/** 服务端用：同一请求内只拉一次（与 config 一起在 layout 拉取，供 Header 首屏用） */
export const getPublicNavMenusCached = reactCache(async (): Promise<NavMenu[]> => {
  try {
    return await fetchNavMenus()
  } catch {
    return []
  }
})

export async function fetchAdminNavMenus(): Promise<NavMenu[]> {
  const response = await api.get('/admin/nav-menus')
  return extractArrayData<NavMenu>(response)
}

export async function createNavMenu(data: Partial<NavMenu>): Promise<NavMenu> {
  const response = await api.post('/admin/nav-menus', data)
  return extractData<NavMenu>(response)
}

export async function updateNavMenu(id: number, data: Partial<NavMenu>): Promise<NavMenu> {
  const response = await api.put(`/admin/nav-menus/${id}`, data)
  return extractData<NavMenu>(response)
}

export async function deleteNavMenu(id: number): Promise<void> {
  await api.delete(`/admin/nav-menus/${id}`)
}

export async function sortNavMenus(items: { id: number; sort_order: number; parent_id: number | null }[]): Promise<void> {
  await api.post('/admin/nav-menus/sort', { items })
}

export default api
