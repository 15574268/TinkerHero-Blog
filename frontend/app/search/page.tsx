'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { search, searchSuggest, fetchTags } from '@/lib/api'
import { SearchResult, Tag } from '@/lib/types'
import Link from 'next/link'
import { format } from 'date-fns'
import Pagination from '@/components/Pagination'
import { renderHighlightSafely } from '@/lib/utils/sanitize'
import { Suspense } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search as SearchIcon,
  User,
  FolderOpen,
  Calendar,
  Tag as TagIcon,
  X,
  Clock,
  TrendingUp,
  Sparkles,
  ArrowRight,
  FileSearch,
  Lightbulb,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10
const MAX_HISTORY = 8
const HISTORY_KEY = 'blog_search_history'

function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

function saveSearchHistory(keyword: string) {
  if (typeof window === 'undefined') return
  const history = getSearchHistory().filter((h) => h !== keyword)
  history.unshift(keyword)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
}

function clearSearchHistory() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(HISTORY_KEY)
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function SearchContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const keyword = searchParams.get('q') || ''
  const pageFromUrl = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(pageFromUrl)
  const [searchInput, setSearchInput] = useState(keyword)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [focusedSuggestion, setFocusedSuggestion] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debouncedInput = useDebounce(searchInput, 300)

  useEffect(() => {
    setHistory(getSearchHistory())
    fetchTags()
      .then((t) => setTags(t.slice(0, 12)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (debouncedInput.trim().length >= 2 && !keyword) {
      searchSuggest(debouncedInput.trim())
        .then((s) => {
          setSuggestions(s)
          setShowSuggestions(s.length > 0)
        })
        .catch(() => setSuggestions([]))
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [debouncedInput, keyword])

  const performSearch = useCallback(
    async (q: string, page: number) => {
      setLoading(true)
      setShowSuggestions(false)
      try {
        const data = await search(q, page)
        setResults(data.data || [])
        setTotal(data.total || 0)
        setCurrentPage(page)
      } catch (error) {
        console.error('Search failed:', error)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (keyword) {
      setSearchInput(keyword)
      saveSearchHistory(keyword)
      setHistory(getSearchHistory())
      setCurrentPage(pageFromUrl)
      performSearch(keyword, pageFromUrl)
    }
  }, [keyword, pageFromUrl, performSearch])

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = searchInput.trim()
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  const handleQuickSearch = (q: string) => {
    setSearchInput(q)
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  const handlePageChange = (page: number) => {
    const url = page <= 1
      ? `/search?q=${encodeURIComponent(keyword)}`
      : `/search?q=${encodeURIComponent(keyword)}&page=${page}`
    router.push(url)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleClearHistory = () => {
    clearSearchHistory()
    setHistory([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedSuggestion((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedSuggestion((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
    } else if (e.key === 'Enter' && focusedSuggestion >= 0) {
      e.preventDefault()
      handleQuickSearch(suggestions[focusedSuggestion])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleGlobalKeydown)
    return () => document.removeEventListener('keydown', handleGlobalKeydown)
  }, [])

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total])
  const hasResults = results.length > 0
  const showInitialState = !keyword && !loading

  const hasSuggestions = showSuggestions && suggestions.length > 0
  const activeSuggestionId =
    focusedSuggestion >= 0 && focusedSuggestion < suggestions.length
      ? `search-suggestion-${focusedSuggestion}`
      : undefined

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 gradient-hero opacity-95" />
          <div className="absolute inset-0 dot-pattern opacity-10" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[hsl(var(--page-bg))]" />

          <div className="relative container mx-auto px-4 pt-20 pb-28 max-w-3xl">
            <div className="text-center mb-10 animate-fade-in-down">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-sm mb-5">
                <Sparkles className="w-3.5 h-3.5" />
                探索博客内容
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3 tracking-tight">
                搜索文章
              </h1>
              <p className="text-white/70 text-base md:text-lg">
                输入关键词，发现感兴趣的内容
              </p>
            </div>

            {/* Search Input */}
            <div className="relative animate-fade-in-up" ref={suggestionsRef}>
              <form onSubmit={handleSearch} className="relative">
                <div className="relative group">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60 group-focus-within:text-primary transition-colors pointer-events-none z-10" />
                  <input
                    ref={inputRef}
                    role="combobox"
                    type="text"
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value)
                      setFocusedSuggestion(-1)
                      if (e.target.value.trim().length >= 2) {
                        setShowSuggestions(true)
                      }
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true)
                    }}
                    onKeyDown={handleKeyDown}
                    aria-autocomplete="list"
                    aria-expanded={hasSuggestions}
                    aria-controls={hasSuggestions ? 'search-suggestions' : undefined}
                    aria-activedescendant={activeSuggestionId}
                    placeholder="搜索文章标题、内容、标签..."
                    className="w-full h-14 md:h-16 pl-12 pr-32 text-base md:text-lg rounded-2xl border-0 bg-white dark:bg-[hsl(224,28%,12%)] shadow-xl shadow-black/10 dark:shadow-black/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:shadow-2xl transition-all duration-300 text-foreground placeholder:text-muted-foreground/50"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput('')
                          inputRef.current?.focus()
                        }}
                        className="p-1.5 rounded-lg hover:bg-muted/80 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <Button
                      type="submit"
                      size="lg"
                      className="rounded-xl h-10 md:h-11 px-5 md:px-6 shadow-md hover:shadow-lg transition-all"
                    >
                      <SearchIcon className="w-4 h-4 mr-2" />
                      搜索
                    </Button>
                  </div>
                </div>

                {/* Keyboard shortcut hint */}
                <div className="hidden md:flex items-center justify-center gap-1 mt-3 text-white/40 text-xs">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono text-[11px]">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono text-[11px]">K</kbd>
                  <span className="ml-1">快速聚焦搜索</span>
                </div>
              </form>

              {/* Suggestions Dropdown */}
              {hasSuggestions && (
                <div
                  id="search-suggestions"
                  role="listbox"
                  aria-label="搜索建议"
                  className="absolute top-full left-0 right-0 mt-2 py-2 bg-white dark:bg-[hsl(224,28%,12%)] rounded-xl shadow-2xl border border-border/50 z-50 animate-fade-in-down overflow-hidden"
                >
                  {suggestions.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => handleQuickSearch(s)}
                      id={`search-suggestion-${i}`}
                      role="option"
                      aria-selected={i === focusedSuggestion}
                      className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors ${
                        i === focusedSuggestion
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted/60'
                      }`}
                    >
                      <SearchIcon className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                      <span className="truncate">{s}</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/30 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="container mx-auto px-4 -mt-8 pb-16 max-w-4xl relative z-10">
          {/* Initial State */}
          {showInitialState && (
            <div className="space-y-6 animate-fade-in-up">
              {/* Search History */}
              {history.length > 0 && (
                <div className="joe-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      最近搜索
                    </div>
                    <button
                      onClick={handleClearHistory}
                      className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors"
                    >
                      清除
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {history.map((h) => (
                      <button
                        key={h}
                        onClick={() => handleQuickSearch(h)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm bg-muted/60 hover:bg-primary/10 hover:text-primary text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                      >
                        <Clock className="w-3 h-3" />
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular Tags */}
              {tags.length > 0 && (
                <div className="joe-card p-6">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-4">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    热门标签
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleQuickSearch(tag.name)}
                        className="tag-pill"
                      >
                        <TagIcon className="w-3 h-3 mr-1" />
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Tips */}
              <div className="joe-card p-6">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-4">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  搜索技巧
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { tip: '使用精确的关键词可获得更好的结果', example: '如 "React Hooks" 而非 "r"' },
                    { tip: '搜索支持文章标题与正文内容', example: '关键词会在结果中高亮显示' },
                    { tip: '点击标签可快速搜索相关内容', example: '标签是找到相关文章的捷径' },
                    { tip: '搜索结果按相关度排序', example: '最匹配的结果会排在前面' },
                  ].map((item, i) => (
                    <div
                      key={`search-tip-${i}`}
                      className="flex gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm text-foreground/90">{item.tip}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.example}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={`search-skeleton-${i}`}
                  className="joe-card p-6 animate-fade-in-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <div className="flex gap-4 pt-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {!loading && keyword && (
            <div className="animate-fade-in">
              {/* Result Count Bar */}
              <div className="flex items-center justify-between mb-6 px-1">
                <p className="text-sm text-muted-foreground">
                  找到{' '}
                  <span className="font-semibold text-primary tabular-nums">{total}</span>{' '}
                  条与{' '}
                  <span className="font-medium text-foreground">&ldquo;{keyword}&rdquo;</span>{' '}
                  相关的结果
                </p>
                {totalPages > 1 && (
                  <span className="text-xs text-muted-foreground/60">
                    第 {currentPage} / {totalPages} 页
                  </span>
                )}
              </div>

              {hasResults ? (
                <>
                  <div className="space-y-3">
                    {results.map((result, index) => (
                      <Link href={`/posts/${result.id}`} key={result.id} className="block group">
                        <div
                          className="joe-card post-card p-5 md:p-6 transition-all duration-300 hover:shadow-lg hover:border-primary/20 animate-fade-in-up"
                          style={{ animationDelay: `${index * 60}ms` }}
                        >
                          <h2
                            className="text-lg md:text-xl font-bold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-1 [&_mark]:bg-primary/15 [&_mark]:text-primary [&_mark]:px-0.5 [&_mark]:rounded"
                            dangerouslySetInnerHTML={{
                              __html: renderHighlightSafely(
                                result.title_highlight || result.title
                              ),
                            }}
                          />
                          <p
                            className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed [&_mark]:bg-primary/15 [&_mark]:text-primary [&_mark]:px-0.5 [&_mark]:rounded"
                            dangerouslySetInnerHTML={{
                              __html: renderHighlightSafely(
                                result.summary || result.content_highlight || ''
                              ),
                            }}
                          />
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                            {result.author && (
                              <span className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" />
                                {result.author}
                              </span>
                            )}
                            {result.category && (
                              <span className="flex items-center gap-1.5">
                                <FolderOpen className="w-3.5 h-3.5" />
                                {result.category}
                              </span>
                            )}
                            {result.published_at && (
                              <span className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(result.published_at), 'yyyy-MM-dd')}
                              </span>
                            )}
                            {result.tags && result.tags.length > 0 && (
                              <div className="flex items-center gap-1.5 ml-auto">
                                {result.tags.slice(0, 3).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="text-[11px] px-2 py-0 h-5 font-normal"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                                {result.tags.length > 3 && (
                                  <span className="text-muted-foreground/50 text-[11px]">
                                    +{result.tags.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-10">
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="joe-card text-center py-20 px-6">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted/60 mb-6">
                    <FileSearch className="w-10 h-10 text-muted-foreground/40" />
                  </div>
                  <p className="text-lg font-medium text-foreground mb-2">没有找到相关结果</p>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    没有找到与 &ldquo;{keyword}&rdquo; 相关的文章，试试换个关键词或使用更通用的搜索词
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {tags.slice(0, 6).map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleQuickSearch(tag.name)}
                        className="tag-pill"
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col bg-[hsl(var(--page-bg))]">
          <Header />
          <main className="flex-1">
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 gradient-hero opacity-95" />
              <div className="absolute inset-0 dot-pattern opacity-10" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[hsl(var(--page-bg))]" />
              <div className="relative container mx-auto px-4 pt-20 pb-28 max-w-3xl">
                <div className="text-center mb-10">
                  <Skeleton className="h-8 w-32 mx-auto mb-4 bg-white/10" />
                  <Skeleton className="h-5 w-48 mx-auto bg-white/10" />
                </div>
                <Skeleton className="h-14 md:h-16 w-full rounded-2xl bg-white/10" />
              </div>
            </div>
            <div className="container mx-auto px-4 -mt-8 pb-16 max-w-4xl">
              <div className="joe-card p-6">
                <Skeleton className="h-4 w-24 mb-4" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </main>
          <Footer />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  )
}
