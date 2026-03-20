'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose?: () => void
}

// 常用表情分类
const EMOJI_CATEGORIES = {
  '表情': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳'],
  '手势': ['👍', '👎', '👏', '🙌', '🤝', '🙏', '✌️', '🤞', '🖖', '👋', '🤙', '💪', '🦾', '🖕', '✋', '🤚', '🖐️', '👌', '🤌', '🤏'],
  '爱心': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  '动物': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂'],
  '食物': ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🥂', '🧊'],
  '符号': ['✨', '💫', '⭐', '🌟', '💥', '💢', '💦', '💨', '🎉', '🎊', '🎁', '🎈', '🔥', '💯', '⚠️', '❌', '⭕', '❓', '❗', '❌', '✅', '❎', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜'],
}

const CATEGORY_NAMES = Object.keys(EMOJI_CATEGORIES)

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState('表情')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentEmojis = EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES]

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
        setFocusedIndex(prev => Math.min(prev + 1, currentEmojis.length - 1))
        break
      case 'ArrowLeft':
        setFocusedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'ArrowDown':
        setFocusedIndex(prev => Math.min(prev + 8, currentEmojis.length - 1))
        break
      case 'ArrowUp':
        setFocusedIndex(prev => Math.max(prev - 8, 0))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        onSelect(currentEmojis[focusedIndex])
        onClose?.()
        break
      case 'Escape':
        onClose?.()
        break
    }
  }, [currentEmojis, focusedIndex, onSelect, onClose])

  // 初始聚焦
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus()
    }
  }, [])

  return (
    <div 
      ref={containerRef}
      className="bg-white rounded-lg shadow-lg border p-2 w-80"
      role="dialog"
      aria-label="表情选择器"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 分类标签 */}
      <div className="flex gap-1 mb-2 border-b pb-2 overflow-x-auto" role="tablist">
        {CATEGORY_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => {
              setActiveCategory(name)
              setFocusedIndex(0)
            }}
            role="tab"
            aria-selected={activeCategory === name}
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${
              activeCategory === name
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* 表情列表 */}
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto" role="grid">
        {currentEmojis.map((emoji, index) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji)
              onClose?.()
            }}
            onFocus={() => setFocusedIndex(index)}
            aria-label={`表情 ${emoji}`}
            tabIndex={index === focusedIndex ? 0 : -1}
            className={`w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded text-lg ${
              index === focusedIndex ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* 关闭按钮 */}
      <div className="mt-2 pt-2 border-t flex justify-end">
        <button
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          关闭
        </button>
      </div>
    </div>
  )
}

// 表情输入按钮
export function EmojiButton({ onInsert }: { onInsert: (emoji: string) => void }) {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="p-2 text-gray-500 hover:text-gray-700 rounded"
        title="插入表情"
        aria-label="打开表情选择器"
        aria-expanded={showPicker}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {showPicker && (
        <div className="absolute bottom-10 left-0 z-50">
          <EmojiPicker
            onSelect={onInsert}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  )
}
