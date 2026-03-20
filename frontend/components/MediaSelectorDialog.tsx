'use client'

import { useEffect, useState, useCallback } from 'react'
import { Media } from '@/lib/types'
import { fetchMedia as fetchMediaApi, uploadFile } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Button } from '@/components/ui/button'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Upload, ImageIcon, Film, Check, Loader2 } from 'lucide-react'
import { resolveUploadUrl } from '@/lib/utils'

interface MediaSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (url: string, media: Media) => void
  accept?: 'image' | 'video' | 'all'
}

export default function MediaSelectorDialog({
  open,
  onOpenChange,
  onSelect,
  accept = 'all',
}: MediaSelectorDialogProps) {
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { showToast } = useToast()

  const fetchMedia = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchMediaApi()
      let items = result?.data || []
      if (accept === 'image') {
        items = items.filter((m: Media) => m.file_type === 'image')
      } else if (accept === 'video') {
        items = items.filter((m: Media) => m.file_type === 'video')
      }
      setMedia(items)
    } catch (error) {
      handleApiError(error, showToast, '获取媒体列表失败')
    } finally {
      setLoading(false)
    }
  }, [showToast, accept])

  useEffect(() => {
    if (open) {
      fetchMedia()
      setSelectedId(null)
    }
  }, [open, fetchMedia])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await uploadFile(file)
      showToast('上传成功', 'success')
      await fetchMedia()
      const fullUrl = resolveUploadUrl(result.url)
      onSelect(fullUrl, { id: result.id, url: result.url, filename: result.filename } as Media)
      onOpenChange(false)
    } catch (error) {
      handleApiError(error, showToast, '上传失败')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleConfirm = () => {
    const selected = media.find((m) => m.id === selectedId)
    if (selected) {
      onSelect(resolveUploadUrl(selected.url), selected)
      onOpenChange(false)
    }
  }

  const getAcceptString = () => {
    if (accept === 'image') return 'image/*'
    if (accept === 'video') return 'video/mp4,video/webm,video/ogg'
    return 'image/*,video/mp4,video/webm,video/ogg'
  }

  const isVideo = (item: Media) =>
    item.file_type === 'video' || item.mime_type?.startsWith('video/')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>媒体库</span>
            <Button asChild size="sm" disabled={uploading}>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept={getAcceptString()}
                  onChange={handleUpload}
                  className="hidden"
                />
                <span className="flex items-center gap-2">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? '上传中...' : '上传文件'}
                </span>
              </label>
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3 p-1">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/3] rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : media.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">暂无文件，点击上方按钮上传</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3 p-1">
              {media.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    selectedId === item.id
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                >
                  <AspectRatio ratio={4 / 3}>
                    {isVideo(item) ? (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Film className="h-10 w-10 text-muted-foreground" />
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={resolveUploadUrl(item.url)}
                        alt={item.original_name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </AspectRatio>
                  {selectedId === item.id && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white px-2 py-1 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.original_name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId}>
            确认选择
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
