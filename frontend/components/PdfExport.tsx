'use client'

import { useState, useCallback } from 'react'
import { useToast } from '@/lib/hooks/useToast'

interface PdfExportProps {
  title: string
  content: string
  author?: string
  date?: string
}

// HTML 转义函数，防止 XSS
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

export default function PdfExport({ title, content, author, date }: PdfExportProps) {
  const [exporting, setExporting] = useState(false)
  const { showToast } = useToast()

  const cleanMarkdown = useCallback((markdown: string) => {
    return markdown
      .replace(/!\[.*?\]\(.*?\)/g, '[图片]')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
      .replace(/>\s/g, '')
      .replace(/[-*+]\s/g, '• ')
      .replace(/\d+\.\s/g, '')
  }, [])

  const exportPdf = useCallback(async () => {
    setExporting(true)

    try {
      // 动态导入 jspdf
      const { jsPDF } = await import('jspdf')
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      // 设置中文字体支持（需要额外配置字体文件）
      // 这里使用默认字体，中文可能显示为方块
      // 实际使用时需要添加中文字体支持

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      const maxWidth = pageWidth - margin * 2
      let y = margin

      // 标题
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      const titleLines = doc.splitTextToSize(title, maxWidth)
      doc.text(titleLines, margin, y)
      y += titleLines.length * 10 + 10

      // 作者和日期
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      if (author) {
        doc.text(`作者: ${author}`, margin, y)
        y += 6
      }
      if (date) {
        doc.text(`日期: ${date}`, margin, y)
        y += 6
      }
      y += 10

      // 分隔线
      doc.setDrawColor(200)
      doc.line(margin, y, pageWidth - margin, y)
      y += 10

      // 内容
      doc.setFontSize(12)
      doc.setTextColor(0)
      const cleanContent = cleanMarkdown(content)
      const contentLines = doc.splitTextToSize(cleanContent, maxWidth)

      for (let i = 0; i < contentLines.length; i++) {
        // 检查是否需要换页
        if (y > pageHeight - margin) {
          doc.addPage()
          y = margin
        }

        doc.text(contentLines[i], margin, y)
        y += 7
      }

      // 页脚
      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFontSize(10)
        doc.setTextColor(150)
        doc.text(
          `第 ${i} 页 / 共 ${totalPages} 页`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        )
      }

      // 下载 PDF
      const filename = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.pdf`
      doc.save(filename)
    } catch (error) {
      console.error('PDF export failed:', error)
      showToast('导出 PDF 失败，请重试', 'error')
    } finally {
      setExporting(false)
    }
  }, [title, content, author, date, cleanMarkdown, showToast])

  // 使用浏览器打印功能导出 PDF（备用方案）
  const exportViaPrint = useCallback(() => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      showToast('请允许弹窗以导出 PDF', 'warning')
      return
    }

    // 清理内容并转义 HTML
    const cleanContent = escapeHtml(cleanMarkdown(content))
    const safeTitle = escapeHtml(title)
    const safeAuthor = author ? escapeHtml(author) : ''
    const safeDate = date ? escapeHtml(date) : ''

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${safeTitle}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.8;
            color: #333;
          }
          h1 {
            font-size: 28px;
            margin-bottom: 10px;
          }
          .meta {
            color: #666;
            font-size: 14px;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
          }
          .content {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <h1>${safeTitle}</h1>
        <div class="meta">
          ${safeAuthor ? `<span>作者: ${safeAuthor}</span> · ` : ''}
          ${safeDate ? `<span>日期: ${safeDate}</span>` : ''}
        </div>
        <div class="content">${cleanContent}</div>
      </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.print()
  }, [title, content, author, date, cleanMarkdown, showToast])

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportPdf}
        disabled={exporting}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>{exporting ? '生成中...' : '导出 PDF'}</span>
      </button>
      
      <button
        onClick={exportViaPrint}
        className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
        title="使用浏览器打印功能"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        <span>打印</span>
      </button>
    </div>
  )
}
