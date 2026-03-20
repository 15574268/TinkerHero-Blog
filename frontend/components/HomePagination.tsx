'use client'

import { useRouter } from 'next/navigation'
import Pagination from '@/components/Pagination'

interface HomePaginationProps {
  currentPage: number
  totalPages: number
}

export default function HomePagination({ currentPage, totalPages }: HomePaginationProps) {
  const router = useRouter()

  const handlePageChange = (page: number) => {
    const url = page === 1 ? '/' : `/?page=${page}`
    router.push(url)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
}
