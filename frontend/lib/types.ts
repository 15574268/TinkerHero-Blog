// 用户相关类型
export interface User {
  id: number
  username: string
  email: string
  nickname?: string
  avatar?: string
  bio?: string
  website?: string
  role: 'admin' | 'author' | 'reader'
  is_active: boolean
  last_login_at?: string
  created_at: string
  updated_at: string
}

// 文章相关类型
export interface Post {
  id: number
  title: string
  slug: string
  content: string
  summary?: string
  cover_image?: string
  author_id: number
  author?: User
  category_id?: number
  category?: Category
  tags?: Tag[]
  view_count: number
  like_count: number
  comment_count: number
  status: 'draft' | 'published' | 'scheduled'
  is_top: boolean
  allow_comment: boolean
  password_hint?: string
  published_at?: string
  created_at: string
  updated_at: string
}

// 分类相关类型
export interface Category {
  id: number
  name: string
  slug: string
  description?: string
  parent_id?: number
  parent?: Category
  children?: Category[]
  sort_order: number
  created_at: string
  updated_at: string
}

// 标签相关类型
export interface Tag {
  id: number
  name: string
  slug: string
  created_at: string
  updated_at: string
}

// 评论相关类型
export interface Comment {
  id: number
  post_id: number
  post?: Post
  user_id?: number
  user?: User
  parent_id?: number
  parent?: Comment
  replies?: Comment[]
  author?: string
  email?: string
  website?: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

// 媒体文件类型
export interface Media {
  id: number
  user_id: number
  user?: User
  filename: string
  original_name: string
  file_type: 'image' | 'video' | 'file'
  mime_type: string
  size: number
  width?: number
  height?: number
  url: string
  thumbnail?: string
  alt?: string
  description?: string
  created_at: string
  updated_at: string
}

// 通知类型
export interface Notification {
  id: number
  user_id?: number
  type: 'comment' | 'like' | 'system'
  title: string
  content: string
  is_read: boolean
  created_at: string
}

// 统计数据类型
export interface DashboardStats {
  total_posts: number
  published_posts: number
  draft_posts: number
  total_users: number
  total_comments: number
  total_views: number
  today_views: number
}

// 分页响应类型
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  success?: boolean
  data?: T
  error?: string | { code?: string; message?: string; detail?: string }
  message?: string
  token?: string
  refresh_token?: string
  user?: User
}

// 搜索结果类型
export interface SearchResult {
  id: number
  title: string
  summary: string
  author: string
  category: string
  tags: string[]
  published_at: string
  title_highlight?: string
  content_highlight?: string
}

// 友情链接类型
export interface FriendLink {
  id: number
  name: string
  url: string
  logo?: string
  desc?: string
  status: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// 自定义页面类型
export interface Page {
  id: number
  title: string
  slug: string
  content: string
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

// 文章翻译类型
export interface PostTranslation {
  id: number
  post_id: number
  language: string
  title: string
  content: string
  summary?: string
  is_auto_translated: boolean
  created_at: string
  updated_at: string
}

// 语言包类型
export interface Locale {
  language: string
  translations: Record<string, unknown>
}

// 归档项类型
export interface ArchiveItem {
  year: number
  month: number
  count: number
  posts: Post[]
}

// 访问统计类型
export interface VisitStats {
  date: string
  visit_count: number
}

// 点赞/收藏响应
export interface LikeFavoriteResponse {
  message: string
  liked?: boolean
  favorited?: boolean
}

// AI 功能请求/响应类型
export interface AIGenerateRequest {
  content: string
  lang?: string
  topic?: string
}

export interface AIGenerateResponse {
  titles?: string
  summary?: string
  continuation?: string
  polished?: string
  translation?: string
  outline?: string
}

export interface AIProvider {
  id: string
  name: string
}

export interface AIProvidersResponse {
  providers: AIProvider[]
  default: string
}

// SEO 分析类型
export interface SEOSuggestion {
  category: string
  issue: string
  score: number
  tips: string[]
}

export interface SEOAnalysisResponse {
  score: number
  suggestions: SEOSuggestion[]
}

// 语法检查类型
export interface GrammarError {
  type: string
  message: string
  suggestion: string
  position: number
  length: number
}

export interface GrammarCheckResponse {
  errors: GrammarError[]
  count: number
}

// 内容审核类型
export interface ModerationResult {
  category: string
  confidence: number
  is_violation: boolean
  description: string
}

export interface ModerationResponse {
  is_safe: boolean
  results: ModerationResult[]
  suggestions: string[]
}

// 版本历史类型
export interface PostVersion {
  id: number
  post_id: number
  title: string
  content: string
  summary?: string
  editor_id: number
  editor?: User
  version: number
  change_log?: string
  created_at: string
}

// 系统配置类型
export interface SiteConfig {
  id: number
  key: string
  value: string
  type: 'text' | 'number' | 'boolean' | 'json' | 'image' | 'textarea' | 'password'
  group: string
  description: string
  created_at?: string
  updated_at?: string
}

// 敏感词类型
export interface SensitiveWord {
  id: number
  word: string
  category: string
  level: number
  created_at: string
}

// IP黑名单类型
export interface IPBlacklist {
  id: number
  ip_address: string
  reason: string
  expired_at?: string
  created_at: string
}

// 订阅者类型
export interface Subscriber {
  id: number
  email: string
  is_active: boolean
  created_at: string
}

// 验证码响应
export interface CaptchaResponse {
  captcha_id: string
  captcha_img: string
}

// 预览链接类型
export interface PostPreview {
  id: number
  post_id: number
  token: string
  created_by: number
  expired_at: string
  view_count: number
  created_at: string
}

// 友链申请类型
export interface FriendLinkApply {
  id: number
  name: string
  url: string
  logo?: string
  description?: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  applied_by?: number
  created_at: string
  updated_at: string
}

// 备份信息类型（列表接口可能不返回 id）
export interface BackupInfo {
  id?: number
  filename: string
  size: number
  type?: string
  created_at?: string
}

// 导入结果类型
export interface ImportResult {
  success: number
  failed: number
  posts: Array<{
    title: string
    slug: string
    status: string
    post_id?: number
  }>
  errors: Array<{
    filename: string
    error: string
  }>
}

// 打赏类型
export interface Donation {
  id: number
  post_id?: number
  user_id?: number
  user?: User
  amount: number
  currency: string
  method: 'alipay' | 'wechat' | 'paypal'
  message?: string
  anonymous: boolean
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  trade_no?: string
  created_at: string
}

// 打赏配置类型
export interface DonationConfig {
  id: number
  user_id: number
  enabled: boolean
  alipay_qr?: string
  wechat_qr?: string
  paypal_link?: string
  default_amount: number
  custom_message?: string
  show_donors: boolean
}

// 打赏统计类型
export interface DonationStats {
  total_amount: number
  total_count: number
  today_amount: number
  today_count: number
  month_amount: number
  month_count: number
}

// ============ 博客增强类型 ============

// 文章合集/专栏
export interface Series {
  id: number
  title: string
  slug: string
  description: string
  cover_image?: string
  author_id: number
  author?: User
  post_count: number
  view_count: number
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

// 合集文章关联
export interface SeriesPost {
  id: number
  series_id: number
  series?: Series
  post_id: number
  post?: Post
  sort_order: number
  created_at: string
}

// 文章模板
export interface PostTemplate {
  id: number
  name: string
  description: string
  category: 'tutorial' | 'review' | 'news' | 'tech'
  content: string
  is_default: boolean
  author_id: number
  created_at: string
  updated_at: string
}

// 公告
export interface Announcement {
  id: number
  title: string
  content: string
  type: 'info' | 'warning' | 'success' | 'error'
  link?: string
  start_time?: string
  end_time?: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// 资源/书单
export interface Resource {
  id: number
  title: string
  description: string
  url: string
  cover_image?: string
  category: 'book' | 'tool' | 'website' | 'course'
  tags: string
  rating: number
  is_recommended: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// 更新日志
export interface Changelog {
  id: number
  version: string
  title: string
  content: string
  type: 'release' | 'feature' | 'fix' | 'improvement'
  published_at: string
  is_published: boolean
  created_at: string
  updated_at: string
}

// 里程碑/成就
export interface Milestone {
  id: number
  title: string
  description: string
  icon: string
  type: 'posts' | 'views' | 'comments' | 'subscribers' | 'years'
  value: number
  achieved_at?: string
  is_achieved: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// 死链记录
export interface DeadLink {
  id: number
  url: string
  source_type: 'post' | 'page' | 'comment'
  source_id: number
  status_code: number
  error_msg: string
  is_fixed: boolean
  checked_at: string
  fixed_at?: string
  created_at: string
}

// 阅读行为记录
export interface ReadingBehavior {
  id: number
  post_id: number
  visitor_id: string
  session_id: string
  ip_address: string
  user_agent: string
  referrer: string
  device: 'mobile' | 'tablet' | 'desktop'
  browser: string
  os: string
  country: string
  region: string
  city: string
  time_on_page: number
  scroll_depth: number
  is_bounce: boolean
  entered_at: string
  exited_at?: string
  created_at: string
}

// 分析统计
export interface AnalyticsStats {
  total_views: number
  unique_visitors: number
  avg_time_on_page: number
  avg_scroll_depth: number
  bounce_rate: number
  device_stats: Array<{ device: string; count: number }>
  browser_stats: Array<{ browser: string; count: number }>
  os_stats: Array<{ os: string; count: number }>
}

// 短代码
export interface Shortcode {
  name: string
  description: string
  example: string
}

// 自动内链关键词
export interface AutoLinkKeyword {
  id: number
  keyword: string
  link: string
  title?: string
  target: string
  rel?: string
  priority: number
  max_count: number
}

// 自动内链配置
export interface AutoLinkConfig {
  enabled: boolean
  link_posts: boolean
  link_categories: boolean
  link_tags: boolean
  link_keywords: boolean
  max_links_per_post: number
  min_keyword_length: number
  exclude_headings: boolean
  exclude_code_blocks: boolean
  exclude_links: boolean
}

// ============ 社交分享类型 ============

// 社交分享记录
export interface SocialShare {
  id: number
  post_id: number
  platform: string
  share_url: string
  created_at: string
}

// 社交分享配置
export interface SocialShareConfig {
  id: number
  platform: string
  enabled: boolean
  app_id: string
  redirect_uri: string
  default_hashtags: string
  default_via: string
  share_count: number
  show_count: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// 分享平台
export interface SharePlatform {
  key: string
  name: string
  icon: string
  color: string
  share_count?: number
  url_template?: string
}

// ============ 广告位类型 ============

// 广告位
export interface AdPlacement {
  id: number
  name: string
  code: string
  description: string
  location: string
  type: string
  width: number
  height: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  ads?: AdContent[]
}

// 广告内容
export interface AdContent {
  id: number
  placement_id: number
  placement?: AdPlacement
  title: string
  image_url: string
  link_url: string
  html_code: string
  adsense_code: string
  type: string
  start_date?: string
  end_date?: string
  view_count: number
  click_count: number
  click_rate: number
  priority: number
  is_active: boolean
  device_target: string
  sort_order: number
  created_at: string
  updated_at: string
}

// 广告点击记录
export interface AdClick {
  id: number
  ad_id: number
  ad?: AdContent
  ip_address: string
  user_agent: string
  referrer: string
  device: string
  created_at: string
}

// 导航菜单
export interface NavMenu {
  id: number
  parent_id: number | null
  label: string
  link_type: 'category' | 'page' | 'external' | 'group'
  link_value: string
  icon: string
  sort_order: number
  is_visible: boolean
  open_new: boolean
  children?: NavMenu[]
  created_at: string
  updated_at: string
}

// 广告统计
export interface AdStats {
  total_views: number
  total_clicks: number
  avg_click_rate: number
  ad_stats: Array<{
    id: number
    title: string
    view_count: number
    click_count: number
    click_rate: number
    placement_id: number
    placement: string
  }>
}
