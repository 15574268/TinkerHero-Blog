'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import { getAllConfigs, batchUpdateConfigs, getPublicConfigs, uploadFile, getAIModels } from '@/lib/api'
import { SiteConfig } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Settings, Upload, Eye, EyeOff, X, ImageIcon, Info, RefreshCw } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in image field + MediaSelectorDialog below
import MediaSelectorDialog from '@/components/MediaSelectorDialog'
import { resolveUploadUrl } from '@/lib/utils'

interface GroupedConfigs {
  [key: string]: SiteConfig[]
}

const tabLabels: Record<string, string> = {
  general: '基本设置',
  content: '内容设置',
  seo: 'SEO 设置',
  appearance: '外观设置',
  ai: 'AI 配置',
  openapi: 'API 发布',
  // 以下为历史分组（已移除默认项，仅兼容旧数据展示）
  upload: '上传与媒体',
  email: '邮件配置',
  security: '安全设置',
}

const tabDescriptions: Record<string, string> = {
  general: '站点名称、地址、描述、Logo、页脚等（应用于前台）',
  content: '每页文章数、评论、目录与阅读时长等（应用于前台）',
  seo: 'SEO 标题后缀（应用于前台）',
  appearance: '主题色、公告、自定义 CSS/HTML（应用于前台）',
  ai: 'OpenAI API 配置（应用于后端 AI 写作辅助）',
  openapi: '免登录的内容发布接口（需开启并配置 API Key）',
  email: 'SMTP 发信配置（应用于后端评论通知等）',
  upload: '上传大小、水印等（应用于后台上传与媒体）',
  security: '限流与登录安全（应用于后端）',
}

/** 配置项应用范围：前台 = 公开站；后端 = 服务端逻辑 */
const CONFIG_SCOPE: Record<string, '前台' | '后端'> = {
  site_name: '前台', site_url: '前台', site_description: '前台', site_keywords: '前台',
  site_logo: '前台', site_slogan: '前台', site_favicon: '前台', site_footer: '前台', site_icp: '前台', site_public_security: '前台',
  posts_per_page: '前台', allow_comment: '前台',
  enable_toc: '前台', enable_reading_time: '前台', code_highlight_theme: '前台',
  seo_title_suffix: '前台',
  theme_color: '前台', site_announcement: '前台', custom_css: '前台', custom_head_html: '前台', custom_footer_html: '前台',
  ai_provider: '后端', image_provider: '后端', image_model: '后端',
  openai_api_key: '后端', openai_base_url: '后端', openai_model: '后端', wenxin_api_secret: '后端',
  smtp_host: '后端', smtp_port: '后端', smtp_user: '后端', smtp_from: '后端', smtp_password: '后端',
  upload_max_file_size_mb: '后端', upload_allowed_extensions: '后端', upload_cdn_enabled: '后端', upload_cdn_url: '后端',
  watermark_enabled: '后端', watermark_text: '后端', watermark_position: '后端',
  api_rate_limit_per_min: '后端', auth_rate_limit_per_min: '后端', login_max_attempts: '后端', login_lockout_minutes: '后端',
  enable_rate_limit: '后端', enable_captcha_comment: '后端', enable_ip_blacklist: '后端', enable_sensitive_filter: '后端',
  comment_need_audit: '后端', excerpt_length: '后端', default_post_status: '前台', auto_save_interval_sec: '前台',
  default_cover_image: '前台', seo_google_verification: '前台', seo_baidu_verification: '前台', seo_bing_verification: '前台',
  seo_sitemap_enabled: '后端', seo_robots_txt: '后端', seo_auto_description: '前台',
  api_publish_enabled: '后端', api_publish_key: '后端',
}

/** 需要下拉选择的配置项：key -> { value, label }[] */
const CONFIG_SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  ai_provider: [
    { value: 'openai', label: 'OpenAI (GPT)' },
    { value: 'dashscope', label: '通义千问 (阿里)' },
    { value: 'zhipu', label: '智谱 AI (ChatGLM)' },
    { value: 'moonshot', label: '月之暗面 (Kimi)' },
    { value: 'doubao', label: '豆包 (字节)' },
    { value: 'wenxin', label: '文心一言 (百度)' },
    { value: 'siliconflow', label: '硅基流动 (SiliconFlow)' },
    { value: 'deepseek', label: 'DeepSeek 官方' },
  ],
  image_provider: [
    { value: '', label: '留空（复用主 AI 厂商）' },
    { value: 'openai', label: 'OpenAI (DALL·E)' },
    { value: 'siliconflow', label: '硅基流动 (SiliconFlow)' },
    { value: 'zhipu', label: '智谱 AI (CogView)' },
    { value: 'stability', label: 'Stability AI' },
  ],
  image_model: [
    { value: '', label: '留空（按厂商自动选默认模型）' },
    // OpenAI
    { value: 'dall-e-3', label: 'DALL·E 3 (OpenAI)' },
    { value: 'dall-e-2', label: 'DALL·E 2 (OpenAI)' },
    // SiliconFlow
    { value: 'Kwai-Kolors/Kolors', label: 'Kolors (硅基流动，默认)' },
    { value: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1-schnell 免费 (硅基流动)' },
    { value: 'black-forest-labs/FLUX.1-dev', label: 'FLUX.1-dev (硅基流动)' },
    { value: 'Pro/black-forest-labs/FLUX.1-schnell', label: 'FLUX.1-schnell Pro (硅基流动)' },
    { value: 'Pro/black-forest-labs/FLUX.1-pro', label: 'FLUX.1-pro (硅基流动)' },
    { value: 'stabilityai/stable-diffusion-3-5-large', label: 'SD 3.5 Large (硅基流动)' },
    { value: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL 1.0 (硅基流动)' },
    // ZhiPu CogView
    { value: 'cogview-3-plus', label: 'CogView-3-Plus (智谱)' },
    { value: 'cogview-3', label: 'CogView-3 (智谱)' },
  ],
  code_highlight_theme: [
    { value: 'github', label: 'GitHub' },
    { value: 'github-dark', label: 'GitHub Dark' },
    { value: 'monokai', label: 'Monokai' },
    { value: 'dracula', label: 'Dracula' },
    { value: 'nord', label: 'Nord' },
    { value: 'one-dark', label: 'One Dark' },
    { value: 'vs2015', label: 'VS2015' },
    { value: 'atom-one-light', label: 'Atom One Light' },
  ],
  openai_model: [
    { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (OpenAI)' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (OpenAI)' },
    { value: 'qwen-turbo', label: 'qwen-turbo (通义)' },
    { value: 'qwen-plus', label: 'qwen-plus (通义)' },
    { value: 'qwen-max', label: 'qwen-max (通义)' },
    { value: 'glm-4-flash', label: 'glm-4-flash (智谱)' },
    { value: 'glm-4-plus', label: 'glm-4-plus (智谱)' },
    { value: 'glm-4', label: 'glm-4 (智谱)' },
    { value: 'moonshot-v1-8k', label: 'moonshot-v1-8k (Kimi)' },
    { value: 'moonshot-v1-32k', label: 'moonshot-v1-32k (Kimi)' },
    { value: 'ep-xxxxxxxx', label: '豆包 (填写 Ark 控制台端点 ID)' },
    { value: 'ernie-bot-turbo', label: 'ernie-bot-turbo (文心)' },
    { value: 'ernie-bot', label: 'ernie-bot (文心)' },
    { value: 'ernie-bot-4', label: 'ernie-bot-4 (文心)' },
    { value: 'deepseek-chat', label: 'deepseek-chat (DeepSeek)' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner (DeepSeek)' },
    { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3 (硅基流动)' },
    { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1 (硅基流动)' },
    { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B (硅基流动)' },
    { value: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B (硅基流动)' },
  ],
  smtp_port: [
    { value: '25', label: '25 (SMTP)' },
    { value: '465', label: '465 (SMTPS)' },
    { value: '587', label: '587 (Submission)' },
  ],
  watermark_position: [
    { value: 'top-left', label: '左上' },
    { value: 'top-right', label: '右上' },
    { value: 'bottom-left', label: '左下' },
    { value: 'bottom-right', label: '右下' },
    { value: 'center', label: '居中' },
  ],
  default_post_status: [
    { value: 'draft', label: '草稿' },
    { value: 'published', label: '已发布' },
  ],
}

export default function SettingsPage() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [configs, setConfigs] = useState<GroupedConfigs>({})
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({})
  const [aiModels, setAiModels] = useState<Array<{ id: string }>>([])
  const [aiModelsLoading, setAiModelsLoading] = useState(false)

  const fetchAIModels = useCallback(async () => {
    setAiModelsLoading(true)
    try {
      const res = await getAIModels()
      setAiModels(res?.models ?? [])
      if ((res?.models?.length ?? 0) > 0) {
        showToast(`已获取 ${res!.models!.length} 个模型`, 'success')
      } else {
        showToast('未获取到模型，请先保存 API Key 后重试', 'info')
      }
    } catch {
      showToast('获取模型列表失败，请确认已保存 API Key 与服务商', 'error')
      setAiModels([])
    } finally {
      setAiModelsLoading(false)
    }
  }, [showToast])

  const loadConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllConfigs()
      const safeData = data && typeof data === 'object' ? data : {}
      setConfigs(safeData)
      const initialValues: Record<string, string> = {}
      Object.values(safeData).flat().forEach((config: SiteConfig) => {
        initialValues[config.key] = config.value
      })
      setEditedValues(initialValues)
      setOriginalValues(initialValues)
    } catch {
      try {
        const publicConfigs = await getPublicConfigs()
        setConfigs({
          general: Object.entries(publicConfigs).map(([key, value]) => ({
            id: 0,
            key,
            value: value as string,
            type: 'text',
            group: 'general',
            description: '',
          })),
        })
        setEditedValues(publicConfigs as Record<string, string>)
      } catch {
        showToast('加载配置失败', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  // 配置加载后尝试从当前已保存的厂商拉取模型列表（若已配置 API Key）
  useEffect(() => {
    if (loading || !configs.ai?.length) return
    fetchAIModels()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅配置加载后执行一次
  }, [loading, !!configs.ai?.length])

  const getSelectOptions = (key: string): { value: string; label: string }[] => {
    // 文字模型和图片模型共享同一厂商的模型列表（image_provider 留空时复用 ai_provider）
    if ((key === 'openai_model' || key === 'image_model') && aiModels.length > 0) {
      return aiModels.map((m) => ({ value: m.id, label: m.id }))
    }
    return CONFIG_SELECT_OPTIONS[key] ?? []
  }

  const handleValueChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    const changedValues: Record<string, string> = {}
    for (const [key, value] of Object.entries(editedValues)) {
      if (value !== originalValues[key]) {
        changedValues[key] = value
      }
    }
    if (Object.keys(changedValues).length === 0) {
      showToast('没有修改', 'info')
      return
    }
    setSaving(true)
    try {
      await batchUpdateConfigs(changedValues)
      showToast('设置保存成功', 'success')
      loadConfigs()
    } catch {
      showToast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by MediaSelectorDialog open/onSelect
  const [mediaDialogKey, setMediaDialogKey] = useState<string | null>(null)

  const generateApiKey = () => {
    // 32 bytes -> base64url without padding
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const b64 = btoa(String.fromCharCode(...bytes))
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  const handleImageUpload = async (configKey: string, file: File) => {
    setUploading((prev) => ({ ...prev, [configKey]: true }))
    try {
      const res = await uploadFile(file)
      handleValueChange(configKey, res.url)
      showToast('图片上传成功', 'success')
    } catch {
      showToast('图片上传失败', 'error')
    } finally {
      setUploading((prev) => ({ ...prev, [configKey]: false }))
    }
  }

  const renderConfigField = (config: SiteConfig) => {
    const value = editedValues[config.key] ?? config.value
    const label = config.description || config.key
    const scope = CONFIG_SCOPE[config.key]

    // 有预定义选项的配置项统一用下拉（覆盖 type）；openai_model 优先使用从厂商拉取的列表
    const baseOptions = getSelectOptions(config.key)
    if (baseOptions.length > 0 || CONFIG_SELECT_OPTIONS[config.key]) {
      // Radix Select 不允许 value="" 的 SelectItem，用哨兵值代替空字符串
      const EMPTY_SENTINEL = '__auto__'
      const toSelectVal = (v: string) => v === '' ? EMPTY_SENTINEL : v
      const fromSelectVal = (v: string) => v === EMPTY_SENTINEL ? '' : v
      const mappedOptions = baseOptions.map((o) =>
        o.value === '' ? { ...o, value: EMPTY_SENTINEL } : o
      )
      const selectValue = toSelectVal(value)
      const options =
        value && !baseOptions.some((o) => o.value === value)
          ? [...mappedOptions, { value: selectValue, label: `${value}（当前）` }]
          : mappedOptions
      return (
        <div className="space-y-2 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Label htmlFor={config.key}>{label}</Label>
            {scope && <Badge variant="secondary" className="text-xs font-normal">{scope}</Badge>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={selectValue || undefined}
              onValueChange={(v) => handleValueChange(config.key, fromSelectVal(v))}
            >
              <SelectTrigger id={config.key} className="max-w-full sm:max-w-md">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(config.key === 'openai_model' || config.key === 'image_model') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aiModelsLoading}
                onClick={fetchAIModels}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${aiModelsLoading ? 'animate-spin' : ''}`} />
                {aiModelsLoading ? '获取中...' : '从厂商获取模型'}
              </Button>
            )}
          </div>
        </div>
      )
    }

    switch (config.type) {
      case 'boolean':
        return (
          <div className="flex items-center justify-between py-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="font-medium">{label}</Label>
                {scope && <Badge variant="secondary" className="text-xs font-normal">{scope}</Badge>}
              </div>
              {config.description && config.description !== label && (
                <p className="text-sm text-muted-foreground">{config.description}</p>
              )}
            </div>
            <Switch
              checked={value === 'true'}
              onCheckedChange={(checked) => handleValueChange(config.key, checked ? 'true' : 'false')}
            />
          </div>
        )
      case 'number':
        return (
          <div className="space-y-2 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label htmlFor={config.key}>{label}</Label>
              {scope && <Badge variant="secondary" className="text-xs font-normal">{scope}</Badge>}
            </div>
            <Input
              id={config.key}
              type="number"
              value={value}
              onChange={(e) => handleValueChange(config.key, e.target.value)}
              className="w-32"
            />
          </div>
        )
      case 'textarea':
        return (
          <div className="space-y-2 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label htmlFor={config.key}>{label}</Label>
              {scope && <Badge variant="secondary" className="text-xs font-normal">{scope}</Badge>}
            </div>
            <Textarea
              id={config.key}
              value={value}
              onChange={(e) => handleValueChange(config.key, e.target.value)}
              rows={3}
            />
          </div>
        )
      case 'image':
        return (
          <div className="space-y-2 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label>{label}</Label>
              {scope && <Badge variant="secondary" className="text-xs font-normal">{scope}</Badge>}
            </div>
            <div className="flex items-center gap-4">
              {value && (
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveUploadUrl(value)}
                    alt={config.key}
                    className="h-16 w-16 rounded-md border object-cover"
                  />
                  <button
                    type="button"
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleValueChange(config.key, '')}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    value={value}
                    onChange={(e) => handleValueChange(config.key, e.target.value)}
                    placeholder="输入图片 URL 或点击上传"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading[config.key]}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*'
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0]
                        if (file) handleImageUpload(config.key, file)
                      }
                      input.click()
                    }}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    {uploading[config.key] ? '上传中...' : '上传'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMediaDialogKey(config.key)}
                  >
                    <ImageIcon className="w-4 h-4 mr-1" />
                    媒体库
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      case 'password':
        return (
          <div className="space-y-2 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label htmlFor={config.key}>{label}</Label>
              {scope && <Badge variant="secondary" className="text-xs font-normal">{scope}</Badge>}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                id={config.key}
                type={showPasswords[config.key] ? 'text' : 'password'}
                value={value}
                onChange={(e) => handleValueChange(config.key, e.target.value)}
                className="flex-1 max-w-sm"
              />
              {config.key === 'api_publish_key' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const k = generateApiKey()
                    handleValueChange(config.key, k)
                    showToast('已生成新的 API Key（记得保存设置）', 'success')
                  }}
                >
                  生成
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswords((prev) => ({ ...prev, [config.key]: !prev[config.key] }))}
              >
                {showPasswords[config.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )
      default:
        return (
          <div className="space-y-2 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label htmlFor={config.key}>{label}</Label>
              {scope && <Badge variant="secondary" className="text-xs font-normal">{scope}</Badge>}
            </div>
            <Input
              id={config.key}
              type="text"
              value={value}
              onChange={(e) => handleValueChange(config.key, e.target.value)}
              className="max-w-full sm:max-w-md"
            />
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  // 选项卡顺序与广告管理一致：基本设置、内容设置、上传与媒体、SEO、邮件、外观、安全（含 AI）
  const tabOrder = ['general', 'content', 'upload', 'seo', 'email', 'appearance', 'security', 'openapi', 'ai']
  const allTabs = Object.keys(configs)
  const tabs = allTabs.length > 0
    ? tabOrder.filter((t) => allTabs.includes(t)).concat(allTabs.filter((t) => !tabOrder.includes(t)))
    : ['general']

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
        <p className="text-muted-foreground">站点与系统配置，修改后请点击保存。</p>
      </div>

      <div className="flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
        <div>
          <strong className="text-foreground">应用说明：</strong>
          <span className="text-muted-foreground">
            {' '}<strong>应用范围：</strong>标为「前台」的配置通过 <code className="text-xs bg-muted px-1 rounded">/api/v1/configs</code> 提供给公开站（页头、页脚、SEO、列表与文章页等）；标为「后端」的配置用于服务端（AI 写作、邮件 SMTP、上传限制、限流与登录安全、水印等）。保存后立即生效，无需重启。
          </span>
        </div>
      </div>

      <Tabs defaultValue={tabs[0]}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tabLabels[tab] ?? tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tabLabels[tab] ?? tab}</CardTitle>
                {tabDescriptions[tab] && (
                  <CardDescription>{tabDescriptions[tab]}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {configs[tab]?.length > 0 ? (
                  <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
                    {configs[tab].map((config) => (
                      <div
                        key={config.id || config.key}
                        className={
                          config.type === 'textarea' || config.type === 'image'
                            ? 'lg:col-span-2'
                            : ''
                        }
                      >
                        {renderConfigField(config)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">暂无配置项</div>
                )}

                <div className="sticky bottom-0 flex items-center gap-3 border-t pt-6 bg-card">
                  <Button onClick={handleSave} disabled={saving}>
                    <Settings className="mr-2 h-4 w-4" />
                    {saving ? '保存中...' : '保存设置'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    保存所有已修改的配置项
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <MediaSelectorDialog
        open={!!mediaDialogKey}
        onOpenChange={(open) => { if (!open) setMediaDialogKey(null) }}
        onSelect={(url) => {
          if (mediaDialogKey) {
            handleValueChange(mediaDialogKey, url)
            setMediaDialogKey(null)
          }
        }}
        accept="image"
      />
    </div>
  )
}
