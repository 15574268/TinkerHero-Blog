'use client'

import { useState, useEffect } from 'react'
import { Trophy, FileText, Eye, MessageCircle, Users, Calendar, Star } from 'lucide-react'
import { getMilestones } from '@/lib/api'

interface Milestone {
  id: number
  title: string
  description: string
  icon: string
  type: 'posts' | 'views' | 'comments' | 'subscribers' | 'years'
  value: number
  achieved_at?: string
  is_achieved: boolean
  sort_order: number
  created_at: string
}

const typeIcons = {
  posts: FileText,
  views: Eye,
  comments: MessageCircle,
  subscribers: Users,
  years: Calendar,
}

const typeColors = {
  posts: 'from-blue-500 to-cyan-500',
  views: 'from-green-500 to-emerald-500',
  comments: 'from-purple-500 to-pink-500',
  subscribers: 'from-orange-500 to-amber-500',
  years: 'from-red-500 to-rose-500',
}

export default function MilestoneWall() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMilestones()
  }, [])

  const fetchMilestones = async () => {
    try {
      const data = await getMilestones()
      setMilestones(data as unknown as Milestone[])
    } catch (error) {
      console.error('获取里程碑失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="animate-pulse grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-gray-200 dark:bg-gray-700 h-48 rounded-lg" />
        ))}
      </div>
    )
  }

  const achievedMilestones = milestones.filter((m) => m.is_achieved)
  const pendingMilestones = milestones.filter((m) => !m.is_achieved)

  return (
    <div className="space-y-8">
      {/* 已达成 */}
      {achievedMilestones.length > 0 && (
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Trophy className="w-6 h-6 text-yellow-500" />
            已达成的成就
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {achievedMilestones.map((milestone) => {
              const Icon = typeIcons[milestone.type] || Star
              const gradient = typeColors[milestone.type] || 'from-gray-500 to-gray-600'

              return (
                <div
                  key={milestone.id}
                  className="relative bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden group"
                >
                  {/* 背景渐变 */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-15 transition-opacity`}
                  />

                  {/* 图标/emoji */}
                  <div className="relative p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-2xl shadow-lg`}
                      >
                        {milestone.icon || <Icon className="w-6 h-6" />}
                      </div>
                      <div className="flex items-center gap-1 text-yellow-500">
                        <Star className="w-5 h-5 fill-yellow-500" />
                        <Star className="w-5 h-5 fill-yellow-500" />
                        <Star className="w-5 h-5 fill-yellow-500" />
                      </div>
                    </div>

                    <h4 className="font-bold text-lg mb-1 dark:text-white">
                      {milestone.title}
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      {milestone.description}
                    </p>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {milestone.value.toLocaleString()}+
                      </span>
                      {milestone.achieved_at && (
                        <span className="text-green-600 dark:text-green-400">
                          {formatDate(milestone.achieved_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 成就角标 */}
                  <div className="absolute top-0 right-0 w-0 h-0 border-t-[40px] border-t-yellow-500 border-l-[40px] border-l-transparent" />
                  <div className="absolute top-1 right-1 text-white">
                    <Trophy className="w-4 h-4" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 待达成 */}
      {pendingMilestones.length > 0 && (
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Star className="w-6 h-6 text-gray-400" />
            目标征程
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingMilestones.map((milestone) => {
              const Icon = typeIcons[milestone.type] || Star

              return (
                <div
                  key={milestone.id}
                  className="relative bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden opacity-80"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 text-2xl">
                        {milestone.icon || <Icon className="w-6 h-6" />}
                      </div>
                      <div className="text-gray-400 text-sm">未解锁</div>
                    </div>

                    <h4 className="font-bold text-lg mb-1 text-gray-600 dark:text-gray-300">
                      {milestone.title}
                    </h4>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                      {milestone.description}
                    </p>

                    <div className="text-gray-400 text-sm">
                      目标: {milestone.value.toLocaleString()}+
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {milestones.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          暂无成就
        </div>
      )}
    </div>
  )
}
