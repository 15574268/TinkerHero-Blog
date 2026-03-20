'use client'

import React, { useState, useEffect } from 'react'

interface TableOfContentsProps {
  content: string
}

interface TOCItem {
  id: string
  text: string
  level: number
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

const TableOfContents = React.memo(function TableOfContents({ content }: TableOfContentsProps) {
  const [items, setItems] = useState<TOCItem[]>([])
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      const headingElements = document.querySelectorAll('.prose h1, .prose h2, .prose h3, .classic-prose h1, .classic-prose h2, .classic-prose h3')
      const tocItems: TOCItem[] = []

      headingElements.forEach((el, index) => {
        const text = el.textContent || ''
        if (!el.id) {
          el.id = slugify(text) || `heading-${index}`
        }
        const tagName = el.tagName.toLowerCase()
        const level = tagName === 'h1' ? 1 : tagName === 'h2' ? 2 : 3
        tocItems.push({ id: el.id, text, level })
      })

      setItems(tocItems)
    }, 100)

    return () => clearTimeout(timer)
  }, [content])

  useEffect(() => {
    if (items.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0% -35% 0%' }
    )

    items.forEach((item) => {
      const element = document.getElementById(item.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <nav aria-label="文章目录">
      <h4 className="font-semibold text-foreground mb-3 text-sm flex items-center gap-1.5">
        <span className="w-1 h-4 rounded-full bg-primary inline-block" />
        目录
      </h4>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li
            key={item.id}
            style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
          >
            <a
              href={`#${item.id}`}
              className={`block py-1 rounded-md px-2 transition-all text-[13px] leading-relaxed hover:text-primary ${
                activeId === item.id
                  ? 'text-primary font-medium bg-primary/5'
                  : 'text-muted-foreground'
              }`}
              onClick={(e) => {
                e.preventDefault()
                const element = document.getElementById(item.id)
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' })
                }
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
})

export default TableOfContents
