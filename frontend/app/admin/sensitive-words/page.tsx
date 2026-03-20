'use client'

import { useEffect, useState, useCallback } from 'react'
import { SensitiveWord } from '@/lib/types'
import { getSensitiveWords, createSensitiveWord, deleteSensitiveWord } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, X, ShieldAlert, Trash2 } from 'lucide-react'

const categoryOptions = [
  { value: '', label: '全部' },
  { value: 'politics', label: '政治' },
  { value: 'porn', label: '色情' },
  { value: 'violence', label: '暴力' },
  { value: 'ad', label: '广告' },
  { value: 'other', label: '其他' },
]

const levelLabels: Record<number, string> = {
  1: '替换',
  2: '审核',
  3: '拦截',
}

export default function SensitiveWordsPage() {
  const [words, setWords] = useState<SensitiveWord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { showToast } = useToast()

  const fetchWords = useCallback(async () => {
    try {
      const params: { page?: number; category?: string } = { page: 1 }
      if (category) params.category = category
      const data = await getSensitiveWords(params)
      setWords(Array.isArray(data.data) ? data.data : [])
    } catch {
      showToast('获取敏感词列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [category, showToast])

  useEffect(() => {
    fetchWords()
  }, [fetchWords])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      word: formData.get('word') as string,
      category: formData.get('category') as string,
      level: parseInt(formData.get('level') as string),
    }

    setSubmitting(true)
    try {
      await createSensitiveWord(data)
      showToast('添加成功', 'success')
      setShowForm(false)
      fetchWords()
    } catch {
      showToast('添加失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个敏感词吗？')) return

    try {
      await deleteSensitiveWord(id)
      showToast('删除成功', 'success')
      fetchWords()
    } catch {
      showToast('删除失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card><CardContent className="p-0">{[...Array(5)].map((_, i) => <div key={i} className="flex gap-4 p-4 border-b"><Skeleton className="h-5 flex-1" /></div>)}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">敏感词管理</h1>
          <p className="text-muted-foreground">配置评论与内容审核敏感词</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'default'}>
          {showForm ? <><X className="mr-2 h-4 w-4" />取消</> : <><Plus className="mr-2 h-4 w-4" />添加敏感词</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="word">敏感词</Label>
                <Input id="word" name="word" required placeholder="敏感词" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">分类</Label>
                <select
                  id="category"
                  name="category"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="politics">政治</option>
                  <option value="porn">色情</option>
                  <option value="violence">暴力</option>
                  <option value="ad">广告</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">级别</Label>
                <select
                  id="level"
                  name="level"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="1">替换为 *</option>
                  <option value="2">需要审核</option>
                  <option value="3">直接拦截</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? '添加中...' : '添加'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {categoryOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={category === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>敏感词</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>级别</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {words.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ShieldAlert className="h-8 w-8" />
                      <p>暂无敏感词</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                words.map((word) => (
                  <TableRow key={word.id}>
                    <TableCell className="font-medium">{word.word}</TableCell>
                    <TableCell className="text-muted-foreground">{word.category}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          word.level === 1 ? 'secondary' : word.level === 2 ? 'default' : 'destructive'
                        }
                      >
                        {levelLabels[word.level as keyof typeof levelLabels]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(word.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(word.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
