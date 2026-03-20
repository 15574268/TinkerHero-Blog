'use client'

import { useState, useMemo, useCallback } from 'react'

interface MindMapProps {
  content: string
  title: string
}

interface Node {
  id: string
  text: string
  level: number
  children: Node[]
  collapsed?: boolean
}

export default function MindMap({ content, title }: MindMapProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // 解析 Markdown 内容生成思维导图结构
  const tree = useMemo(() => {
    const lines = content.split('\n')
    const headings: { id: string; text: string; level: number }[] = []

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        headings.push({
          id: `node-${index}`,
          text: match[2].trim(),
          level: match[1].length,
        })
      }
    })

    // 构建树结构
    const root: Node = {
      id: 'root',
      text: title,
      level: 0,
      children: [],
    }

    const stack: Node[] = [root]

    headings.forEach((heading) => {
      const node: Node = {
        id: heading.id,
        text: heading.text,
        level: heading.level,
        children: [],
      }

      // 找到合适的父节点
      while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
        stack.pop()
      }

      stack[stack.length - 1].children.push(node)
      stack.push(node)
    })

    return root
  }, [content, title])

  // 切换节点展开状态
  const toggleNode = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // 全部展开
  const expandAll = useCallback(() => {
    const collectIds = (node: Node): string[] => {
      const ids = [node.id]
      node.children.forEach((child) => {
        ids.push(...collectIds(child))
      })
      return ids
    }
    setExpandedIds(new Set(collectIds(tree)))
  }, [tree])

  // 全部收起
  const collapseAll = useCallback(() => {
    setExpandedIds(new Set(['root']))
  }, [])

  // 渲染节点
  const renderNode = (node: Node, depth: number = 0) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.has(node.id)

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition ${
            depth === 0
              ? 'bg-blue-100 text-blue-800 font-bold'
              : depth === 1
              ? 'bg-gray-100 text-gray-800 font-medium'
              : 'hover:bg-gray-50 text-gray-700'
          }`}
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => hasChildren && toggleNode(node.id)}
        >
          {/* 展开/收起图标 */}
          {hasChildren && (
            <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}
          {!hasChildren && <span className="w-4" />}

          {/* 节点文本 */}
          <span className="flex-1 truncate">{node.text}</span>

          {/* 子节点数量 */}
          {hasChildren && (
            <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
              {node.children.length}
            </span>
          )}
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      {/* 标题和操作按钮 */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <h3 className="font-bold text-lg text-gray-900">📚 文章结构</h3>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            全部展开
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={collapseAll}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            全部收起
          </button>
        </div>
      </div>

      {/* 思维导图内容 */}
      <div className="max-h-[500px] overflow-y-auto">
        {tree.children.length > 0 ? (
          renderNode(tree)
        ) : (
          <div className="text-center py-8 text-gray-400">
            文章暂无标题结构
          </div>
        )}
      </div>

      {/* 图形化思维导图（简化版） */}
      <div className="mt-4 pt-4 border-t">
        <h4 className="text-sm font-medium text-gray-600 mb-3">图形视图</h4>
        <div className="overflow-x-auto">
          <svg width="100%" height="200" className="bg-gray-50 rounded">
            {(() => {
              const nodes: Array<{
                id: string
                text: string
                x: number
                y: number
                width: number
              }> = []
              const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

              // 布局计算
              const levelGroups: Record<number, Node[]> = { 0: [tree] }
              const collectByLevel = (node: Node) => {
                if (!levelGroups[node.level]) levelGroups[node.level] = []
                levelGroups[node.level].push(node)
                node.children.forEach(collectByLevel)
              }
              tree.children.forEach(collectByLevel)

              const levelGap = 150
              const startY = 20

              let maxNodes = 0
              Object.values(levelGroups).forEach((nodes) => {
                if (nodes.length > maxNodes) maxNodes = nodes.length
              })

              Object.entries(levelGroups).forEach(([level, groupNodes]) => {
                const levelNum = parseInt(level)
                const gap = (200 - startY * 2) / Math.max(groupNodes.length - 1, 1)

                groupNodes.forEach((node, idx) => {
                  const x = 50 + levelNum * levelGap
                  const y = groupNodes.length === 1 ? 100 : startY + idx * gap

                  nodes.push({
                    id: node.id,
                    text: node.text.slice(0, 10) + (node.text.length > 10 ? '...' : ''),
                    x,
                    y,
                    width: Math.min(100, node.text.length * 10 + 20),
                  })
                })
              })

              return (
                <>
                  {/* 连接线 */}
                  {lines.map((line, i) => (
                    <line
                      key={i}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke="#ddd"
                      strokeWidth="1"
                    />
                  ))}
                  {/* 节点 */}
                  {nodes.map((node) => (
                    <g key={node.id}>
                      <rect
                        x={node.x - node.width / 2}
                        y={node.y - 12}
                        width={node.width}
                        height={24}
                        rx={4}
                        fill="#3b82f6"
                        opacity="0.9"
                      />
                      <text
                        x={node.x}
                        y={node.y + 4}
                        textAnchor="middle"
                        fill="white"
                        fontSize="10"
                      >
                        {node.text}
                      </text>
                    </g>
                  ))}
                </>
              )
            })()}
          </svg>
        </div>
      </div>
    </div>
  )
}
