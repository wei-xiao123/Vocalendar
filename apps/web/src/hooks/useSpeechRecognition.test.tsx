import { act, renderHook } from '@testing-library/react'

import { useSpeechRecognition } from './useSpeechRecognition'

type ResultLike = {
  isFinal: boolean
  transcript: string
}

type FakeResult = {
  isFinal: boolean
  length: number
  0: { transcript: string }
}

type FakeResultList = {
  length: number
  [index: number]: FakeResult
}

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null

  continuous = false
  interimResults = false
  lang = ''
  onend: (() => void) | null = null
  onerror: ((event: { error?: string; message?: string }) => void) | null = null
  onresult:
    | ((event: {
        resultIndex: number
        results: FakeResultList
      }) => void)
    | null = null
  started = false
  stopped = false
  aborted = false

  constructor() {
    FakeSpeechRecognition.latest = this
  }

  abort() {
    this.aborted = true
  }

  emitError(error: string) {
    this.onerror?.({ error })
  }

  emitResult(results: ResultLike[]) {
    const resultList: FakeResultList = { length: results.length }
    results.forEach((result, index) => {
      resultList[index] = {
        0: { transcript: result.transcript },
        isFinal: result.isFinal,
        length: 1,
      }
    })

    this.onresult?.({
      resultIndex: 0,
      results: resultList,
    })
  }

  end() {
    this.onend?.()
  }

  start() {
    this.started = true
  }

  stop() {
    this.stopped = true
    this.end()
  }
}

beforeEach(() => {
  FakeSpeechRecognition.latest = null
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: FakeSpeechRecognition,
  })
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: undefined,
  })
})

afterEach(() => {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
})

it('reports unsupported browsers', () => {
  delete window.SpeechRecognition

  const { result } = renderHook(() => useSpeechRecognition())

  expect(result.current.isSupported).toBe(false)

  act(() => {
    result.current.start()
  })

  expect(result.current.status).toBe('unsupported')
  expect(result.current.errorMessage).toBe('当前浏览器不支持语音识别。')
})

it('starts recognition with configured options', () => {
  const { result } = renderHook(() =>
    useSpeechRecognition({ continuous: false, interimResults: false, lang: 'en-US' }),
  )

  act(() => {
    result.current.start()
  })

  expect(result.current.status).toBe('listening')
  expect(FakeSpeechRecognition.latest).toMatchObject({
    continuous: false,
    interimResults: false,
    lang: 'en-US',
    started: true,
  })
})

it('captures interim and final transcripts', () => {
  const { result } = renderHook(() => useSpeechRecognition())

  act(() => {
    result.current.start()
  })
  act(() => {
    FakeSpeechRecognition.latest?.emitResult([
      { isFinal: false, transcript: '明天上午' },
    ])
  })

  expect(result.current.interimTranscript).toBe('明天上午')
  expect(result.current.transcript).toBe('')

  act(() => {
    FakeSpeechRecognition.latest?.emitResult([
      { isFinal: true, transcript: '明天上午开会' },
    ])
  })

  expect(result.current.interimTranscript).toBe('')
  expect(result.current.transcript).toBe('明天上午开会')
})

it('stops recognition and returns to idle', () => {
  const { result } = renderHook(() => useSpeechRecognition())

  act(() => {
    result.current.start()
  })
  const recognition = FakeSpeechRecognition.latest

  act(() => {
    result.current.stop()
  })

  expect(recognition?.stopped).toBe(true)
  expect(result.current.status).toBe('idle')
})

it('sets error status on recognition errors', () => {
  const { result } = renderHook(() => useSpeechRecognition())

  act(() => {
    result.current.start()
  })
  act(() => {
    FakeSpeechRecognition.latest?.emitError('not-allowed')
  })

  expect(result.current.status).toBe('error')
  expect(result.current.errorMessage).toBe(
    '麦克风权限被拒绝，请允许浏览器使用麦克风。',
  )
})

it('keeps listening after transient network recognition errors', () => {
  const { result } = renderHook(() => useSpeechRecognition())

  act(() => {
    result.current.start()
  })
  act(() => {
    FakeSpeechRecognition.latest?.emitError('network')
  })

  expect(result.current.status).toBe('listening')
  expect(result.current.errorMessage).toBeNull()
})

it('restarts recognition after aborted recognition sessions end', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useSpeechRecognition())

  act(() => {
    result.current.start()
  })
  const firstRecognition = FakeSpeechRecognition.latest
  act(() => {
    firstRecognition?.emitError('aborted')
  })

  expect(result.current.status).toBe('listening')
  expect(result.current.errorMessage).toBeNull()

  act(() => {
    firstRecognition?.end()
    vi.advanceTimersByTime(250)
  })

  expect(FakeSpeechRecognition.latest).not.toBe(firstRecognition)
  expect(FakeSpeechRecognition.latest?.started).toBe(true)
  expect(result.current.status).toBe('listening')
  vi.useRealTimers()
})
