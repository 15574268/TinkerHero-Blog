'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { updateProfile, changePassword, fetchMyPosts, fetchMyComments } from '@/lib/api'
import { Post, Comment } from '@/lib/types'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User, Lock, FileText, MessageSquare, Upload, ImageIcon, X, Loader2, Camera } from 'lucide-react'
import Pagination from '@/components/Pagination'
import MediaSelectorDialog from '@/components/MediaSelectorDialog'
import { uploadFile } from '@/lib/api'
import { resolveUploadUrl } from '@/lib/utils'
import { handleApiError } from '@/lib/utils/error'

function isErrorWithResponse(error: unknown): error is { response?: { data?: { error?: string } } } {
  return typeof error === 'object' && error !== null && 'response' in error
}

export default function AdminProfilePage() {
  const { user, updateUser } = useAuth()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState('info')
  const [loading, setLoading] = useState(false)

  const [profileForm, setProfileForm] = useState({
    nickname: '',
    bio: '',
    website: '',
    avatar: '',
  })

  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  })

  const [myPosts, setMyPosts] = useState<Post[]>([])
  const [myComments, setMyComments] = useState<Comment[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)

  const [postsPage, setPostsPage] = useState(1)
  const [postsTotal, setPostsTotal] = useState(0)
  const [commentsPage, setCommentsPage] = useState(1)
  const [commentsTotal, setCommentsTotal] = useState(0)
  const pageSize = 10

  const [showAvatarMedia, setShowAvatarMedia] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    setProfileForm({
      nickname: user.nickname || '',
      bio: user.bio || '',
      website: user.website || '',
      avatar: user.avatar || '',
    })
  }, [user])

  const loadMyPosts = useCallback(async (page: number) => {
    setPostsLoading(true)
    try {
      const res = await fetchMyPosts({ page, page_size: pageSize })
      setMyPosts(res.data || [])
      setPostsTotal(res.total || 0)
    } catch (error) {
      console.error('加载文章失败', error)
    } finally {
      setPostsLoading(false)
    }
  }, [])

  const loadMyComments = useCallback(async (page: number) => {
    setCommentsLoading(true)
    try {
      const res = await fetchMyComments({ page, page_size: pageSize })
      setMyComments(res.data || [])
      setCommentsTotal(res.total || 0)
    } catch (error) {
      console.error('加载评论失败', error)
    } finally {
      setCommentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    if (activeTab === 'posts') loadMyPosts(postsPage)
    else if (activeTab === 'comments') loadMyComments(commentsPage)
  }, [user, activeTab, postsPage, commentsPage, loadMyPosts, loadMyComments])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error')
      return
    }
    setAvatarUploading(true)
    try {
      const result = await uploadFile(file)
      setProfileForm((prev) => ({ ...prev, avatar: result.url }))
      showToast('头像上传成功', 'success')
    } catch (error) {
      handleApiError(error, showToast, '上传失败')
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const updated = await updateProfile(profileForm)
      updateUser(updated)
      showToast('更新成功', 'success')
    } catch (error: unknown) {
      const errorMessage = isErrorWithResponse(error) && error.response?.data?.error
        ? error.response.data.error
        : '更新失败'
      showToast(errorMessage, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showToast('两次密码输入不一致', 'error')
      return
    }
    setLoading(true)
    try {
      await changePassword(passwordForm.old_password, passwordForm.new_password)
      showToast('密码修改成功', 'success')
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' })
    } catch (error: unknown) {
      const errorMessage = isErrorWithResponse(error) && error.response?.data?.error
        ? error.response.data.error
        : '修改失败'
      showToast(errorMessage, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        请先登录
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 mx-auto mb-3 bg-primary/10 rounded-2xl flex items-center justify-center">
          <User className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">个人资料</h1>
        <p className="text-muted-foreground text-sm mt-1">管理您的资料与内容</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <TabsList className="w-full max-w-full flex flex-wrap h-auto gap-1 mb-6">
          <TabsTrigger value="info" className="flex items-center gap-2"><User className="h-4 w-4" />基本信息</TabsTrigger>
          <TabsTrigger value="password" className="flex items-center gap-2"><Lock className="h-4 w-4" />修改密码</TabsTrigger>
          <TabsTrigger value="posts" className="flex items-center gap-2"><FileText className="h-4 w-4" />我的文章</TabsTrigger>
          <TabsTrigger value="comments" className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />我的评论</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="flex items-center gap-5">
                  <div className="relative group">
                    <Avatar className="h-24 w-24 ring-2 ring-border">
                      {profileForm.avatar && (
                        <AvatarImage src={resolveUploadUrl(profileForm.avatar)} alt={user.username} />
                      )}
                      <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-primary-foreground text-2xl font-bold">
                        {(user.username || '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => avatarFileRef.current?.click()}
                        disabled={avatarUploading}
                        className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                        title="上传头像"
                      >
                        {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAvatarMedia(true)}
                        className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                        title="从媒体库选择"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>
                      {profileForm.avatar && (
                        <button
                          type="button"
                          onClick={() => setProfileForm((prev) => ({ ...prev, avatar: '' }))}
                          className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                          title="移除头像"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md pointer-events-none">
                      <Camera className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{user.username}</div>
                    <div className="text-muted-foreground text-sm">{user.email}</div>
                    <p className="text-xs text-muted-foreground mt-1">悬停头像可上传或从媒体库选择</p>
                  </div>
                </div>

                <input ref={avatarFileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                <MediaSelectorDialog
                  open={showAvatarMedia}
                  onOpenChange={setShowAvatarMedia}
                  onSelect={(url) => setProfileForm((prev) => ({ ...prev, avatar: url }))}
                  accept="image"
                />

                <div className="space-y-2">
                  <Label htmlFor="nickname">昵称</Label>
                  <Input id="nickname" value={profileForm.nickname} onChange={(e) => setProfileForm({ ...profileForm, nickname: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">个人网站</Label>
                  <Input id="website" type="url" value={profileForm.website} onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">个人简介</Label>
                  <Textarea id="bio" value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} rows={4} />
                </div>
                <Button type="submit" disabled={loading} className="w-full">{loading ? '保存中...' : '保存修改'}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleChangePassword} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="old_password">旧密码</Label>
                  <Input id="old_password" type="password" required value={passwordForm.old_password} onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_password">新密码</Label>
                  <Input id="new_password" type="password" required value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">确认新密码</Label>
                  <Input id="confirm_password" type="password" required value={passwordForm.confirm_password} onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })} />
                </div>
                <Button type="submit" disabled={loading} className="w-full">{loading ? '修改中...' : '修改密码'}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posts">
          <Card>
            <CardContent className="pt-6">
              {postsLoading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : myPosts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>暂无文章</p>
                  <Button variant="link" asChild><Link href="/admin/posts/create">去写文章</Link></Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myPosts.map((post) => (
                    <Card key={post.id} className="p-4 hover:bg-muted/50 transition-colors">
                      <Link href={`/posts/${post.id}`} className="font-medium hover:text-primary">
                        {post.title}
                      </Link>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                        <Badge variant={post.status === 'published' ? 'default' : 'secondary'}>{post.status === 'published' ? '已发布' : '草稿'}</Badge>
                        <span>{format(new Date(post.created_at), 'yyyy-MM-dd')}</span>
                        <span>{post.view_count} 阅读</span>
                        <span>{post.like_count} 点赞</span>
                      </div>
                    </Card>
                  ))}
                  <Pagination currentPage={postsPage} totalPages={Math.ceil(postsTotal / pageSize)} onPageChange={setPostsPage} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments">
          <Card>
            <CardContent className="pt-6">
              {commentsLoading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : myComments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">暂无评论</div>
              ) : (
                <div className="space-y-4">
                  {myComments.map((comment) => (
                    <Card key={comment.id} className="p-4">
                      <p className="text-foreground">{comment.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                        <Link href={`/posts/${comment.post_id}`} className="text-primary hover:underline">查看文章</Link>
                        <span>{format(new Date(comment.created_at), 'yyyy-MM-dd HH:mm')}</span>
                        <Badge variant={comment.status === 'approved' ? 'default' : comment.status === 'rejected' ? 'destructive' : 'secondary'}>
                          {comment.status === 'approved' ? '已通过' : comment.status === 'rejected' ? '已拒绝' : '待审核'}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                  <Pagination currentPage={commentsPage} totalPages={Math.ceil(commentsTotal / pageSize)} onPageChange={setCommentsPage} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
