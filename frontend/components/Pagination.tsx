'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = []
  const maxVisible = 5

  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
  const endPage = Math.min(totalPages, startPage + maxVisible - 1)

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i)
  }

  return (
    <nav className="flex items-center justify-center gap-2 mt-8" aria-label="分页导航">
      {/* 上一页 */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="上一页"
        aria-disabled={currentPage === 1}
        className="px-2 py-2 border border-border/60 rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* 第一页 */}
      {startPage > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            aria-label="第 1 页"
            aria-current={currentPage === 1 ? 'page' : undefined}
            className="px-3 py-2 border border-border/60 rounded-md hover:bg-muted"
          >
            1
          </button>
          {startPage > 2 && <span className="px-2" aria-hidden="true">...</span>}
        </>
      )}

      {/* 页码 */}
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          aria-label={`第 ${page} 页`}
          aria-current={currentPage === page ? 'page' : undefined}
          className={`px-3 py-2 border border-border/60 rounded-md ${
            currentPage === page
              ? 'bg-primary text-primary-foreground border-primary'
              : 'hover:bg-muted'
          }`}
        >
          {page}
        </button>
      ))}

      {/* 最后一页 */}
      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span className="px-2" aria-hidden="true">...</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            aria-label={`第 ${totalPages} 页`}
            aria-current={currentPage === totalPages ? 'page' : undefined}
            className="px-3 py-2 border border-border/60 rounded-md hover:bg-muted"
          >
            {totalPages}
          </button>
        </>
      )}

      {/* 下一页 */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="下一页"
        aria-disabled={currentPage === totalPages}
        className="px-2 py-2 border border-border/60 rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  )
}
