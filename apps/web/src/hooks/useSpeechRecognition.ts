import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechRecognitionAlternativeLike = {
  transcript: string
}

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionResultListLike = {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}

type SpeechRecognitionResultEventLike = {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

type SpeechRecognitionErrorEventLike = {
  readonly error?: string
  readonly message?: string
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  abort: () => void
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export type SpeechRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'unsupported'
  | 'error'

export type UseSpeechRecognitionOptions = {
  continuous?: boolean
  interimResults?: boolean
  lang?: string
}

export type UseSpeechRecognitionResult = {
  errorMessage: string | null
  interimTranscript: string
  isListening: boolean
  isSupported: boolean
  start: () => void
  status: SpeechRecognitionStatus
  stop: () => void
  transcript: string
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
  const {
    continuous = true,
    interimResults = true,
    lang = 'zh-CN',
  } = options
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const getRecognitionConstructor = useCallback(() => {
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setStatus((current) => (current === 'unsupported' ? current : 'idle'))
  }, [])

  const start = useCallback(() => {
    const RecognitionConstructor = getRecognitionConstructor()
    if (!RecognitionConstructor) {
      setStatus('unsupported')
      setErrorMessage('当前浏览器不支持语音识别。')
      return
    }

    recognitionRef.current?.abort()

    const recognition = new RecognitionConstructor()
    recognition.continuous = continuous
    recognition.interimResults = interimResults
    recognition.lang = lang
    recognition.onresult = (event) => {
      const nextTranscriptParts: string[] = []
      const nextInterimParts: string[] = []

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          nextTranscriptParts.push(text)
        } else {
          nextInterimParts.push(text)
        }
      }

      if (nextTranscriptParts.length > 0) {
        setTranscript((current) =>
          [current, nextTranscriptParts.join('')].filter(Boolean).join(' '),
        )
      }
      setInterimTranscript(nextInterimParts.join(''))
    }
    recognition.onerror = (event) => {
      setStatus('error')
      setErrorMessage(getSpeechRecognitionErrorMessage(event))
    }
    recognition.onend = () => {
      setStatus((current) => (current === 'error' ? current : 'idle'))
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    setTranscript('')
    setInterimTranscript('')
    setErrorMessage(null)
    setStatus('listening')
    recognition.start()
  }, [continuous, getRecognitionConstructor, interimResults, lang])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  return {
    errorMessage,
    interimTranscript,
    isListening: status === 'listening',
    isSupported: getRecognitionConstructor() !== null,
    start,
    status,
    stop,
    transcript,
  }
}

function getSpeechRecognitionErrorMessage(
  event: SpeechRecognitionErrorEventLike,
): string {
  if (event.message) {
    return event.message
  }

  switch (event.error) {
    case 'network':
      return '语音识别网络连接失败，请检查浏览器语音服务或网络后重试。'
    case 'not-allowed':
    case 'service-not-allowed':
      return '麦克风权限被拒绝，请允许浏览器使用麦克风。'
    case 'no-speech':
      return '没有检测到语音，请重试。'
    case 'audio-capture':
      return '没有检测到可用麦克风。'
    default:
      return event.error || '语音识别失败。'
  }
}
