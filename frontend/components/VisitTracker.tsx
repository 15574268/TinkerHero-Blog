'use client'

import { useEffect } from 'react'
import { recordVisit } from '@/lib/api'

export default function VisitTracker({ postId }: { postId?: number }) {
  useEffect(() => {
    recordVisit(postId).catch(() => null)
  }, [postId])

  return null
}

