'use client'

import { useCallback, useEffect, useState } from 'react'
import { PostVersion } from '@/lib/types'
import { getPostVersions, restorePostVersion } from '@/lib/api'
import { useToast } from '@/lib/hooks/useToast'
import { format } from 'date-fns'

interface VersionHistoryProps {
  postId: number
  onRestore?: () => void
}

export default function VersionHistory({ postId, onRestore }: VersionHistoryProps) {
  const [versions, setVersions] = useState<PostVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<PostVersion | null>(null)
  const { showToast } = useToast()

  const loadVersions = useCallback(async () => {
    try {
      const data = await getPostVersions(postId)
      setVersions(data)
    } catch (err) {
      console.error('Failed to load versions:', err)
      showToast('加载版本历史失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [postId, showToast])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  const handleRestore = async (version: number) => {
    if (!confirm(`确定要恢复到版本 ${version} 吗？当前内容将被保存为新版本。`)) return

    try {
      await restorePostVersion(postId, version)
      showToast('恢复成功', 'success')
      loadVersions()
      onRestore?.()
    } catch {
      showToast('恢复失败', 'error')
    }
  }

  if (loading) {
    return <div className="text-center py-4">加载版本历史...</div>
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        暂无版本历史。点击「立即保存」可创建自动保存版本；恢复某版本后会在此显示历史版本。
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-bold mb-4">版本历史</h3>

      <div className="space-y-3">
        {versions.map((version) => (
          <div
            key={version.id}
            className={`p-4 border rounded-lg cursor-pointer transition ${
              selectedVersion?.id === version.id
                ? 'border-primary bg-primary/5'
                : 'border-border/60 hover:border-border'
            }`}
            onClick={() => setSelectedVersion(version)}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">
                  {version.version === 0 ? '自动保存' : `版本 ${version.version}`}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {format(new Date(version.created_at), 'yyyy-MM-dd HH:mm:ss')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {version.editor?.username || '未知'}
                </span>
                {version.version > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRestore(version.version)
                    }}
                    className="text-primary hover:text-primary/80 text-sm"
                  >
                    恢复
                  </button>
                )}
              </div>
            </div>
            {version.change_log && (
              <p className="mt-1 text-sm text-muted-foreground">{version.change_log}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground truncate">{version.title}</p>
          </div>
        ))}
      </div>

      {selectedVersion && (
        <div className="mt-6 p-4 bg-muted/40 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">
              {selectedVersion.version === 0 ? '自动保存内容' : `版本 ${selectedVersion.version} 预览`}
            </h4>
            <button
              onClick={() => setSelectedVersion(null)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              关闭
            </button>
          </div>
          <div className="text-sm">
            <p className="font-medium mb-2">{selectedVersion.title}</p>
            <p className="text-muted-foreground mb-2">{selectedVersion.summary || '无摘要'}</p>
            <div className="bg-card p-3 rounded border border-border/60 max-h-60 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-xs">{selectedVersion.content.slice(0, 1000)}...</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
