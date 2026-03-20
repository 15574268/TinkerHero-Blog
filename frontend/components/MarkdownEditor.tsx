'use client'

import { useState, useRef, useCallback } from 'react'
import { uploadFile } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import MediaSelectorDialog from '@/components/MediaSelectorDialog'
import ArticleContent from '@/components/ArticleContent'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  name?: string
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 15,
  name,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [showMediaDialog, setShowMediaDialog] = useState(false)
  const [mediaAccept, setMediaAccept] = useState<'image' | 'video' | 'all'>('all')
  const { showToast } = useToast()

  const insertAtCursor = useCallback(
    (prefix: string, suffix: string = '') => {
      const textarea = textareaRef.current
      if (!textarea) {
        onChange(value + prefix + suffix)
        return
      }

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selectedText = value.substring(start, end)
      const newText =
        value.substring(0, start) + prefix + selectedText + suffix + value.substring(end)

      onChange(newText)

      setTimeout(() => {
        textarea.focus()
        textarea.selectionStart = start + prefix.length
        textarea.selectionEnd = end + prefix.length
      }, 0)
    },
    [value, onChange]
  )

  const insertLink = () => {
    const url = prompt('请输入链接地址：')
    if (!url) return
    const text = prompt('请输入链接文本：', url)
    insertAtCursor(`[${text || url}](${url})`)
  }

  const insertCodeBlock = () => {
    const lang = prompt('请输入代码语言：', 'javascript')
    insertAtCursor(`\n\`\`\`${lang || ''}\n`, '\n```\n')
  }

  const insertTable = () => {
    const table = `\n| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容 | 内容 | 内容 |\n`
    insertAtCursor(table)
  }

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          const maxWidth = 1920
          const maxHeight = 1080
          let { width, height } = img

          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }

          canvas.width = width
          canvas.height = height
          ctx?.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name, { type: 'image/jpeg' }))
              } else {
                resolve(file)
              }
            },
            'image/jpeg',
            0.8
          )
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('图片大小不能超过10MB', 'error')
      return
    }

    setUploading(true)
    try {
      const compressedFile = await compressImage(file)
      const result = await uploadFile(compressedFile)
      insertAtCursor(`![${file.name}](${result.url})`)
      showToast('图片上传成功', 'success')
    } catch {
      showToast('图片上传失败', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      showToast('请选择视频文件', 'error')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('视频大小不能超过50MB', 'error')
      return
    }

    setUploading(true)
    try {
      const result = await uploadFile(file)
      insertAtCursor(
        `\n<video controls width="100%">\n  <source src="${result.url}" type="${file.type}">\n</video>\n`
      )
      showToast('视频上传成功', 'success')
    } catch {
      showToast('视频上传失败', 'error')
    } finally {
      setUploading(false)
      if (videoInputRef.current) videoInputRef.current.value = ''
    }
  }

  const handleMediaSelect = (url: string, media: { file_type?: string; mime_type?: string }) => {
    const isVideo =
      media.file_type === 'video' || media.mime_type?.startsWith('video/')
    if (isVideo) {
      insertAtCursor(
        `\n<video controls width="100%">\n  <source src="${url}" type="${media.mime_type || 'video/mp4'}">\n</video>\n`
      )
    } else {
      insertAtCursor(`![image](${url})`)
    }
  }

  const openMediaLibrary = (type: 'image' | 'video' | 'all') => {
    setMediaAccept(type)
    setShowMediaDialog(true)
  }

  const toolbarGroups = [
    [
      { icon: 'H1', title: '标题1', action: () => insertAtCursor('# ', '') },
      { icon: 'H2', title: '标题2', action: () => insertAtCursor('## ', '') },
      { icon: 'H3', title: '标题3', action: () => insertAtCursor('### ', '') },
    ],
    [
      { icon: 'B', title: '粗体', action: () => insertAtCursor('**', '**') },
      { icon: 'I', title: '斜体', action: () => insertAtCursor('*', '*') },
      { icon: 'S', title: '删除线', action: () => insertAtCursor('~~', '~~') },
    ],
    [
      { icon: '—', title: '分割线', action: () => insertAtCursor('\n---\n', '') },
      { icon: '•', title: '无序列表', action: () => insertAtCursor('- ', '') },
      { icon: '1.', title: '有序列表', action: () => insertAtCursor('1. ', '') },
      { icon: '☑', title: '任务列表', action: () => insertAtCursor('- [ ] ', '') },
    ],
    [
      { icon: '🔗', title: '链接', action: insertLink },
      { icon: '📷', title: '上传图片', action: () => fileInputRef.current?.click() },
      { icon: '🎬', title: '上传视频', action: () => videoInputRef.current?.click() },
      { icon: '🖼️', title: '媒体库', action: () => openMediaLibrary('all') },
    ],
    [
      { icon: '💻', title: '代码块', action: insertCodeBlock },
      { icon: '📊', title: '表格', action: insertTable },
      { icon: '❝', title: '引用', action: () => insertAtCursor('> ', '') },
    ],
  ]

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      setUploading(true)
      try {
        const compressedFile = await compressImage(file)
        const result = await uploadFile(compressedFile)
        insertAtCursor(`![${file.name}](${result.url})`)
        showToast('图片上传成功', 'success')
      } catch {
        showToast('图片上传失败', 'error')
      } finally {
        setUploading(false)
      }
    } else if (file.type.startsWith('video/')) {
      setUploading(true)
      try {
        const result = await uploadFile(file)
        insertAtCursor(
          `\n<video controls width="100%">\n  <source src="${result.url}" type="${file.type}">\n</video>\n`
        )
        showToast('视频上传成功', 'success')
      } catch {
        showToast('视频上传失败', 'error')
      } finally {
        setUploading(false)
      }
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return

        setUploading(true)
        try {
          const compressedFile = await compressImage(file)
          const result = await uploadFile(compressedFile)
          insertAtCursor(`![image](${result.url})`)
          showToast('图片上传成功', 'success')
        } catch {
          showToast('图片上传失败', 'error')
        } finally {
          setUploading(false)
        }
        break
      }
    }
  }

  return (
    <div className="border border-input rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="bg-muted/50 border-b border-input px-3 py-2 flex items-center gap-0.5 flex-wrap">
        {toolbarGroups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-5 bg-border mx-1" />}
            {group.map((btn, bi) => (
              <button
                key={bi}
                type="button"
                onClick={btn.action}
                className="px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
                title={btn.title}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        ))}

        <div className="flex-1" />

        {uploading && (
          <span className="text-sm text-primary animate-pulse">上传中...</span>
        )}
      </div>

      {/* Editor/Preview Tabs */}
      <Tabs defaultValue="write" className="w-full">
        <div className="border-b border-input px-3">
          <TabsList className="h-9 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="write"
              className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1"
            >
              编辑
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1"
            >
              预览
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="write" className="m-0">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            name={name}
            className="w-full px-4 py-3 focus:outline-none font-mono text-sm resize-y min-h-[200px] bg-background"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onPaste={handlePaste}
          />
        </TabsContent>

        <TabsContent value="preview" className="m-0">
          <div
            className="px-4 py-3 overflow-auto"
            style={{ minHeight: `${rows * 1.5}rem` }}
          >
            {value ? (
              <ArticleContent content={value} />
            ) : (
              <p className="text-muted-foreground italic">暂无内容</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg"
        onChange={handleVideoUpload}
        className="hidden"
      />

      {/* Media library dialog */}
      <MediaSelectorDialog
        open={showMediaDialog}
        onOpenChange={setShowMediaDialog}
        onSelect={handleMediaSelect}
        accept={mediaAccept}
      />
    </div>
  )
}
