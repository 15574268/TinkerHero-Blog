'use client'

import { useEffect, useRef } from 'react'

interface FloatingItem {
  id: number
  emoji: string
  x: number
  size: number
  duration: number
  delay: number
}

interface LikeFloatingEffectProps {
  trigger: number
  anchorRef: React.RefObject<HTMLElement | null>
}

const EMOJIS = ['👍', '🎉', '❤️', '✨', '🌟', '💫', '🎊', '🔥']

let idCounter = 0

export default function LikeFloatingEffect({ trigger, anchorRef }: LikeFloatingEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (trigger === 0) return

    const container = containerRef.current
    const anchor = anchorRef.current
    if (!container || !anchor) return

    const anchorRect = anchor.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const count = Math.floor(Math.random() * 4) + 5

    const items: FloatingItem[] = Array.from({ length: count }, () => ({
      id: ++idCounter,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      x: anchorRect.left - containerRect.left + Math.random() * anchorRect.width,
      size: Math.floor(Math.random() * 14) + 18,
      duration: Math.random() * 600 + 700,
      delay: Math.random() * 300,
    }))

    items.forEach((item) => {
      const el = document.createElement('span')
      el.textContent = item.emoji
      el.style.cssText = `
        position: fixed;
        left: ${anchorRect.left + Math.random() * anchorRect.width - 10}px;
        top: ${anchorRect.top}px;
        font-size: ${item.size}px;
        pointer-events: none;
        z-index: 9999;
        user-select: none;
        will-change: transform, opacity;
        animation: likeFloat ${item.duration}ms ease-out ${item.delay}ms forwards;
      `
      document.body.appendChild(el)

      setTimeout(() => {
        el.remove()
      }, item.duration + item.delay + 100)
    })
  }, [trigger, anchorRef])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    />
  )
}
