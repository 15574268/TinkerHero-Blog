'use client'

import { useRouter } from 'next/navigation'
import Pagination from '@/components/Pagination'

interface CategoryPaginationProps {
  slug: string
  currentPage: number
  totalPages: number
}

export default function CategoryPagination({ slug, currentPage, totalPages }: CategoryPaginationProps) {
  const router = useRouter()

  const handlePageChange = (page: number) => {
    const url = page <= 1 ? `/category/${slug}` : `/category/${slug}?page=${page}`
    router.push(url)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
}
