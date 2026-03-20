'use client'

import { useEffect, useState, useCallback } from 'react'
import { Media } from '@/lib/types'
import { fetchMedia as fetchMediaApi, uploadFile, deleteMedia, aiImageGenerate, aiStream } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { handleApiError } from '@/lib/utils/error'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ImageIcon, Upload, Copy, Trash2, MoreHorizontal, Sparkles, Loader2 } from 'lucide-react'
import { resolveUploadUrl } from '@/lib/utils'

export default function MediaLibrary() {
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiEnhancing, setAiEnhancing] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiResultImage, setAiResultImage] = useState<string | null>(null)
  const { showToast } = useToast()

  const fetchMedia = useCallback(async () => {
    try {
      const result = await fetchMediaApi()
      setMedia(result?.data || [])
    } catch (error) {
      handleApiError(error, showToast, '获取媒体列表失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await uploadFile(file)
      showToast('上传成功', 'success')
      fetchMedia()
    } catch (error) {
      handleApiError(error, showToast, '上传失败')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个文件吗？')) return

    try {
      await deleteMedia(id)
      showToast('删除成功', 'success')
      fetchMedia()
    } catch (error) {
      handleApiError(error, showToast, '删除失败')
    }
  }

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      showToast('链接已复制', 'success')
    } catch {
      showToast('复制失败', 'error')
    }
  }

  const handleEnhancePrompt = async () => {
    if (!aiPrompt.trim()) {
      showToast('请先输入描述', 'info')
      return
    }
    setAiEnhancing(true)
    try {
      const full = await aiStream(
        { action: 'enhance_prompt', prompt: aiPrompt },
        {}
      )
      const resultMatch = full.match(/最终结果[：:]\s*([\s\S]*)/)
      const result = (resultMatch ? resultMatch[1].trim() : full.trim())
      if (result) setAiPrompt(result)
      showToast(result ? '已增强提示词' : '未返回结果', result ? 'success' : 'info')
    } catch (e) {
      handleApiError(e, showToast, '增强提示词失败')
    } finally {
      setAiEnhancing(false)
    }
  }

  const handleAIGenerateImage = async () => {
    if (!aiPrompt.trim()) {
      showToast('请先输入描述', 'info')
      return
    }
    setAiGenerating(true)
    setAiResultImage(null)
    try {
      const res = await aiImageGenerate({ prompt: aiPrompt })
      const first = res?.images?.[0]
      if (first?.url) {
        setAiResultImage(first.url)
      } else if (first?.b64_json) {
        setAiResultImage(`data:image/png;base64,${first.b64_json}`)
      } else {
        showToast('未返回图片', 'info')
      }
    } catch (e) {
      handleApiError(e, showToast, '生成图片失败')
    } finally {
      setAiGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">媒体库</h1>
          <p className="text-muted-foreground">上传与管理图片资源</p>
        </div>
        <Button asChild>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              上传文件
            </span>
          </label>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4" />
            <h2 className="font-medium">AI 生成图片</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="描述想要的图片，如：a sunset over mountains"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="max-w-md"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleEnhancePrompt} disabled={aiEnhancing || aiGenerating}>
              {aiEnhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              增强提示词
            </Button>
            <Button type="button" size="sm" onClick={handleAIGenerateImage} disabled={aiEnhancing || aiGenerating}>
              {aiGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              生成
            </Button>
          </div>
          {aiResultImage && (
            <div className="mt-4 flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aiResultImage} alt="AI生成" className="rounded-lg border max-h-48 object-contain" />
              <div className="flex flex-col gap-2">
                {aiResultImage.startsWith('http') && (
                  <Button variant="outline" size="sm" onClick={() => handleCopyUrl(aiResultImage!)}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />复制链接
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">生成后可将链接用于封面或正文</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {media.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-4">暂无文件，点击上方按钮上传</p>
            <Button asChild>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  上传图片
                </span>
              </label>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map((item) => (
            <Card key={item.id} className="group overflow-hidden">
              <AspectRatio ratio={4 / 3}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveUploadUrl(item.url)}
                  alt={item.original_name}
                  className="w-full h-full object-cover"
                />
              </AspectRatio>
              <CardContent className="p-3">
                <div className="text-sm font-medium truncate mb-2">{item.original_name}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {(item.size / 1024).toFixed(1)} KB
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleCopyUrl(resolveUploadUrl(item.url))}>
                        <Copy className="mr-2 h-4 w-4" />复制链接
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
