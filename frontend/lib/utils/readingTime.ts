// 计算阅读时间
// 中文约 400 字/分钟，英文约 200 词/分钟

/**
 * 基于内容长度的快速阅读时间估算，不运行正则，适用于列表页等对精度要求低的场景。
 * 假设平均字符密度：约 1.5 个字节对应一个中文字符，2000 个字符约 1 分钟阅读时间。
 */
export function estimateReadingTime(content: string): number {
  if (!content) return 1
  return Math.max(1, Math.ceil(content.length / 2000))
}

export function calculateReadingTime(content: string): number {
  if (!content) return 0

  // 移除 Markdown 标记
  const plainText = content
    .replace(/!\[.*?\]\(.*?\)/g, '') // 图片
    .replace(/\[.*?\]\(.*?\)/g, '') // 链接
    .replace(/#{1,6}\s/g, '') // 标题
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // 粗体
    .replace(/(\*|_)(.*?)\1/g, '$2') // 斜体
    .replace(/`{1,3}.*?`{1,3}/g, '') // 代码
    .replace(/>\s/g, '') // 引用
    .replace(/[-*+]\s/g, '') // 列表
    .replace(/\d+\.\s/g, '') // 有序列表
    .replace(/\n/g, ' ') // 换行

  // 计算中文字符数
  const chineseChars = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length

  // 计算英文单词数
  const englishWords = plainText
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0).length

  // 计算阅读时间（分钟）
  const readingTime = Math.ceil(chineseChars / 400 + englishWords / 200)

  return Math.max(1, readingTime)
}

// 格式化阅读时间
export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return '不到1分钟'
  if (minutes < 60) return `约 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (mins === 0) return `约 ${hours} 小时`
  return `约 ${hours} 小时 ${mins} 分钟`
}

// 计算字数
export function calculateWordCount(content: string): { chinese: number; english: number; total: number } {
  if (!content) return { chinese: 0, english: 0, total: 0 }

  const plainText = content
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/`{1,3}.*?`{1,3}/g, '')
    .replace(/\n/g, ' ')

  const chinese = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length
  const english = plainText
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0).length

  return {
    chinese,
    english,
    total: chinese + english,
  }
}

// 格式化字数
export function formatWordCount(count: { chinese: number; english: number; total: number }): string {
  const parts = []
  if (count.chinese > 0) parts.push(`${count.chinese} 字`)
  if (count.english > 0) parts.push(`${count.english} 词`)
  return parts.length > 0 ? parts.join(' / ') : '0 字'
}
