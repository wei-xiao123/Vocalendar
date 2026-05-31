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

type StartRecognitionOptions = {
  resetTranscript?: boolean
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
  resetTranscript: () => void
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
  const restartTimeoutRef = useRef<number | null>(null)
  const startRecognitionRef = useRef<(options?: StartRecognitionOptions) => void>(
    () => {},
  )
  const shouldListenRef = useRef(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const getRecognitionConstructor = useCallback(() => {
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
  }, [])

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current === null) {
      return
    }
    window.clearTimeout(restartTimeoutRef.current)
    restartTimeoutRef.current = null
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
  }, [])

  const scheduleRecognitionRestart = useCallback(
    (recognition: SpeechRecognitionLike, delayMs = 250) => {
      clearRestartTimeout()
      restartTimeoutRef.current = window.setTimeout(() => {
        restartTimeoutRef.current = null
        if (!shouldListenRef.current || recognitionRef.current !== recognition) {
          return
        }

        recognition.onend = null
        recognition.onerror = null
        recognition.onresult = null
        recognition.abort()
        recognitionRef.current = null
        startRecognitionRef.current({ resetTranscript: false })
      }, delayMs)
    },
    [clearRestartTimeout],
  )

  const startRecognition = useCallback((options: StartRecognitionOptions = {}) => {
    const { resetTranscript: shouldResetTranscript = true } = options
    const RecognitionConstructor = getRecognitionConstructor()
    if (!RecognitionConstructor) {
      setStatus('unsupported')
      setErrorMessage('当前浏览器不支持语音识别。')
      return
    }

    shouldListenRef.current = true
    clearRestartTimeout()
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
      if (isTransientRecognitionError(event.error)) {
        setErrorMessage(null)
        setStatus('listening')
        scheduleRecognitionRestart(
          recognition,
          getRecognitionRestartDelayMs(event.error),
        )
        return
      }
      shouldListenRef.current = false
      clearRestartTimeout()
      setStatus('error')
      setErrorMessage(getSpeechRecognitionErrorMessage(event))
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) {
        return
      }
      if (shouldListenRef.current) {
        scheduleRecognitionRestart(recognition)
        return
      }
      recognitionRef.current = null
      setStatus((current) => (current === 'error' ? current : 'idle'))
    }

    recognitionRef.current = recognition
    if (shouldResetTranscript) {
      setTranscript('')
    }
    setInterimTranscript('')
    setErrorMessage(null)
    setStatus('listening')
    try {
      recognition.start()
    } catch (error) {
      recognitionRef.current = null
      shouldListenRef.current = false
      setStatus('error')
      setErrorMessage(getSpeechRecognitionStartErrorMessage(error))
    }
  }, [
    clearRestartTimeout,
    continuous,
    getRecognitionConstructor,
    interimResults,
    lang,
    scheduleRecognitionRestart,
  ])

  useEffect(() => {
    startRecognitionRef.current = startRecognition
  }, [startRecognition])

  const stop = useCallback(() => {
    shouldListenRef.current = false
    clearRestartTimeout()
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setStatus((current) => (current === 'unsupported' ? current : 'idle'))
  }, [clearRestartTimeout])

  const start = useCallback(() => {
    shouldListenRef.current = true
    startRecognition({ resetTranscript: true })
  }, [startRecognition])

  useEffect(() => {
    return () => {
      shouldListenRef.current = false
      clearRestartTimeout()
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [clearRestartTimeout])

  return {
    errorMessage,
    interimTranscript,
    isListening: status === 'listening',
    resetTranscript,
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
  if (isTransientRecognitionError(event.error)) {
    return '语音识别已中断，请重试。'
  }
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

function getSpeechRecognitionStartErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'InvalidStateError') {
    return '语音识别正在启动，请稍后再试。'
  }
  return '语音识别启动失败，请重试。'
}

function isTransientRecognitionError(error: string | undefined): boolean {
  return error === 'aborted' || error === 'network' || error === 'no-speech'
}

function getRecognitionRestartDelayMs(error: string | undefined): number {
  if (error === 'no-speech') {
    return 1000
  }
  return 250
}
