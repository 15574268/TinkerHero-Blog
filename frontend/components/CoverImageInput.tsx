'use client'

import { useState, useRef } from 'react'
import { uploadFile } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import MediaSelectorDialog from '@/components/MediaSelectorDialog'
import { Upload, ImageIcon, X, Loader2 } from 'lucide-react'
import { resolveUploadUrl } from '@/lib/utils'

interface CoverImageInputProps {
  value: string
  onChange: (url: string) => void
  name?: string
  label?: string
}

export default function CoverImageInput({
  value,
  onChange,
  name = 'cover_image',
  label = '封面图',
}: CoverImageInputProps) {
  const [showMediaDialog, setShowMediaDialog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error')
      return
    }

    setUploading(true)
    try {
      const result = await uploadFile(file)
      onChange(result.url)
      showToast('上传成功', 'success')
    } catch (error) {
      handleApiError(error, showToast, '上传失败')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          name={name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="上传图片"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowMediaDialog(true)}
          title="从媒体库选择"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange('')}
            title="清除"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {value && (
        <div className="relative w-full max-w-xs rounded-lg overflow-hidden border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveUploadUrl(value)}
            alt="封面预览"
            className="w-full h-auto max-h-40 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />

      <MediaSelectorDialog
        open={showMediaDialog}
        onOpenChange={setShowMediaDialog}
        onSelect={(url) => onChange(url)}
        accept="image"
      />
    </div>
  )
}
