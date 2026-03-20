'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface TextToSpeechProps {
  text: string
  lang?: string
}

export default function TextToSpeech({ text, lang = 'zh-CN' }: TextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [rate, setRate] = useState(1)
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // 加载可用语音
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      setVoices(availableVoices)
      
      // 选择匹配语言的语音
      const langVoice = availableVoices.find(v => v.lang.startsWith(lang.split('-')[0]))
      if (langVoice) {
        setSelectedVoice(langVoice)
      }
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      // 清理事件监听器，避免内存泄漏
      window.speechSynthesis.onvoiceschanged = null
      window.speechSynthesis.cancel()
    }
  }, [lang])

  // 清理纯文本
  const getPlainText = useCallback((markdownText: string) => {
    return markdownText
      .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接只保留文字
      .replace(/#{1,6}\s/g, '') // 移除标题标记
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // 移除粗体
      .replace(/(\*|_)(.*?)\1/g, '$2') // 移除斜体
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // 移除代码
      .replace(/>\s/g, '') // 移除引用
      .replace(/[-*+]\s/g, '') // 移除列表
      .replace(/\d+\.\s/g, '') // 移除有序列表
      .replace(/\n+/g, '。') // 换行转句号
      .replace(/\s+/g, ' ') // 合并空格
  }, [])

  const speak = useCallback(() => {
    if (!text) return

    // 停止当前播放
    window.speechSynthesis.cancel()

    const plainText = getPlainText(text)
    const utterance = new SpeechSynthesisUtterance(plainText)
    
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    
    utterance.lang = lang
    utterance.rate = rate

    utterance.onstart = () => {
      setIsSpeaking(true)
      setIsPaused(false)
    }

    utterance.onend = () => {
      setIsSpeaking(false)
      setIsPaused(false)
      currentUtteranceRef.current = null
    }

    utterance.onerror = () => {
      setIsSpeaking(false)
      setIsPaused(false)
    }

    currentUtteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [text, selectedVoice, lang, rate, getPlainText])

  const pause = useCallback(() => {
    window.speechSynthesis.pause()
    setIsPaused(true)
  }, [])

  const resume = useCallback(() => {
    window.speechSynthesis.resume()
    setIsPaused(false)
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setIsPaused(false)
    currentUtteranceRef.current = null
  }, [])

  // 过滤出当前语言的语音
  const filteredVoices = voices.filter(v => 
    v.lang.startsWith(lang.split('-')[0]) || v.lang === lang
  )

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* 播放/暂停按钮 */}
      {!isSpeaking ? (
        <button
          onClick={speak}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          title="开始朗读"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>朗读文章</span>
        </button>
      ) : (
        <>
          {isPaused ? (
            <button
              onClick={resume}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              <span>继续</span>
            </button>
          ) : (
            <button
              onClick={pause}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>暂停</span>
            </button>
          )}
          <button
            onClick={stop}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            <span>停止</span>
          </button>
        </>
      )}

      {/* 语速选择 */}
      <div className="flex items-center gap-2">
        <label htmlFor="speech-rate" className="text-sm text-gray-600">语速:</label>
        <select
          id="speech-rate"
          value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value))}
          className="px-2 py-1 border rounded text-sm"
          disabled={isSpeaking}
          aria-label="选择语速"
        >
          <option value={0.5}>0.5x</option>
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </div>

      {/* 语音选择 */}
      {filteredVoices.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="voice-select" className="text-sm text-gray-600">语音:</label>
          <select
            id="voice-select"
            value={selectedVoice?.name || ''}
            onChange={(e) => {
              const voice = voices.find(v => v.name === e.target.value)
              if (voice) setSelectedVoice(voice)
            }}
            className="px-2 py-1 border rounded text-sm"
            disabled={isSpeaking}
            aria-label="选择语音"
          >
            {filteredVoices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
