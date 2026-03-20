'use client'

import { useRouter } from 'next/navigation'
import Pagination from '@/components/Pagination'

interface TagPaginationProps {
  slug: string
  currentPage: number
  totalPages: number
}

export default function TagPagination({ slug, currentPage, totalPages }: TagPaginationProps) {
  const router = useRouter()

  const handlePageChange = (page: number) => {
    const url = page <= 1 ? `/tag/${slug}` : `/tag/${slug}?page=${page}`
    router.push(url)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
}
