/**
 * 错误处理工具函数
 * 统一处理 API 错误响应
 */

/**
 * 检查错误是否包含 response 属性
 * 用于处理 axios/fetch 错误
 */
export function isErrorWithResponse(error: unknown): error is { 
  response?: { 
    data?: { 
      error?: unknown
      message?: unknown 
    } 
    status?: number
  } 
} {
  return (
    typeof error === 'object' && 
    error !== null && 
    'response' in error
  )
}

/**
 * 检查错误是否包含 message 属性
 * 用于处理标准 Error 对象
 */
export function isErrorWithMessage(error: unknown): error is { 
  message: string 
  name?: string
} {
  return (
    typeof error === 'object' && 
    error !== null && 
    'message' in error
  )
}

/**
 * 从错误对象中提取用户友好的错误消息
 * @param error 捕获的错误对象
 * @param fallback 默认错误消息
 * @returns 用户友好的错误消息字符串
 */
export function getErrorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  // 优先检查 API 错误响应
  if (isErrorWithResponse(error) && error.response?.data) {
    const { error: errorVal, message: messageVal } = error.response.data

    const pick = (v: unknown): string | null => {
      if (!v) return null
      if (typeof v === 'string') return v
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>
        if (typeof obj.message === 'string') return obj.message
        if (typeof obj.error === 'string') return obj.error
        if (typeof obj.code === 'string' && typeof obj.message === 'string') return obj.message
      }
      try {
        return JSON.stringify(v)
      } catch {
        return null
      }
    }

    return pick(errorVal) || pick(messageVal) || fallback
  }
  
  // 检查标准错误消息
  if (isErrorWithMessage(error)) {
    // 过滤掉技术性错误消息
    const technicalErrors = [
      'Network Error',
      'timeout',
      'CORS',
      'Failed to fetch',
    ]
    
    if (!technicalErrors.some(e => error.message.includes(e))) {
      return error.message
    }
  }
  
  return fallback
}

/**
 * 标准化的错误处理函数
 * @param error 捕获的错误
 * @param showToast 显示 toast 的函数
 * @param fallback 默认错误消息
 */
export function handleApiError(
  error: unknown, 
  showToast: (message: string, type: 'error' | 'success' | 'info') => void,
  fallback = '操作失败，请重试'
): void {
  const message = getErrorMessage(error, fallback)
  console.error('API Error:', error)
  showToast(message, 'error')
}
