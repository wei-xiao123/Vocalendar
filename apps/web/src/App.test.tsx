import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from './App'
import {
  createEvent,
  createGuestSession,
  deleteEvent,
  getGitHubOAuthStartUrl,
  listEvents,
} from './lib/api'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'

vi.mock('./lib/api', () => ({
  createEvent: vi.fn(),
  createGuestSession: vi.fn(),
  deleteEvent: vi.fn(),
  getGitHubOAuthStartUrl: vi.fn(() => 'http://localhost:8000/auth/github/start'),
  listEvents: vi.fn(),
}))

vi.mock('./hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: vi.fn(),
}))

const createEventMock = vi.mocked(createEvent)
const createGuestSessionMock = vi.mocked(createGuestSession)
const deleteEventMock = vi.mocked(deleteEvent)
const getGitHubOAuthStartUrlMock = vi.mocked(getGitHubOAuthStartUrl)
const listEventsMock = vi.mocked(listEvents)
const useSpeechRecognitionMock = vi.mocked(useSpeechRecognition)

beforeEach(() => {
  window.localStorage.clear()
  createEventMock.mockReset()
  createGuestSessionMock.mockReset()
  deleteEventMock.mockReset()
  listEventsMock.mockReset()
  useSpeechRecognitionMock.mockReset()
  getGitHubOAuthStartUrlMock.mockReturnValue(
    'http://localhost:8000/auth/github/start',
  )
  deleteEventMock.mockResolvedValue(undefined)
  listEventsMock.mockResolvedValue([])
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '',
    isListening: false,
    isSupported: true,
    start: vi.fn(),
    status: 'idle',
    stop: vi.fn(),
    transcript: '',
  })
})

function storeSession() {
  window.localStorage.setItem(
    'vocalendar.auth',
    JSON.stringify({
      access_token: 'stored-token',
      token_type: 'bearer',
      user: {
        id: 2,
        is_guest: false,
        username: 'octocat',
        display_name: 'The Octocat',
        avatar_url: null,
        email: null,
      },
    }),
  )
}

it('renders auth entry actions', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: '日程工作台' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'GitHub 登录' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '游客模式' })).toBeInTheDocument()
})

it('creates and stores a guest session', async () => {
  createGuestSessionMock.mockResolvedValue({
    access_token: 'guest-token',
    token_type: 'bearer',
    user: {
      id: 1,
      is_guest: true,
      username: null,
      display_name: 'Guest User',
      avatar_url: null,
      email: null,
    },
  })

  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '游客模式' }))

  expect(createGuestSessionMock).toHaveBeenCalledOnce()
  expect(await screen.findByText('Guest User')).toBeInTheDocument()
  expect(listEventsMock).toHaveBeenCalledWith('guest-token')
  expect(window.localStorage.getItem('vocalendar.auth')).toContain('guest-token')
})

it('restores a stored session and can sign out', async () => {
  storeSession()

  render(<App />)

  expect(screen.getByText('The Octocat')).toBeInTheDocument()
  expect(listEventsMock).toHaveBeenCalledWith('stored-token')
  fireEvent.click(screen.getByRole('button', { name: '退出' }))

  await waitFor(() => {
    expect(window.localStorage.getItem('vocalendar.auth')).toBeNull()
  })
  expect(screen.getByRole('button', { name: '游客模式' })).toBeInTheDocument()
})

it('lists events for the restored session', async () => {
  storeSession()
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-05-31T09:30:00',
      ends_at: null,
      reminder_at: null,
      status: 'scheduled',
      source_text: null,
    },
  ])

  render(<App />)

  expect(await screen.findByText('产品评审')).toBeInTheDocument()
  expect(screen.getByText('scheduled')).toBeInTheDocument()
  expect(screen.getByText('1')).toBeInTheDocument()
})

it('shows an empty event state', async () => {
  storeSession()

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
})

it('shows an event list error state', async () => {
  storeSession()
  listEventsMock.mockRejectedValue(new Error('offline'))

  render(<App />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '日程列表加载失败，请稍后重试。',
  )
})

it('creates an event and adds it to the list', async () => {
  storeSession()
  createEventMock.mockResolvedValue({
    id: 8,
    user_id: 2,
    title: '客户电话',
    starts_at: '2026-05-31T10:00',
    ends_at: null,
    reminder_at: null,
    status: 'scheduled',
    source_text: null,
  })

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.change(screen.getByLabelText('标题'), {
    target: { value: '客户电话' },
  })
  fireEvent.change(screen.getByLabelText('开始时间'), {
    target: { value: '2026-05-31T10:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: '添加日程' }))

  expect(createEventMock).toHaveBeenCalledWith(
    {
      title: '客户电话',
      starts_at: '2026-05-31T10:00',
    },
    'stored-token',
  )
  expect(await screen.findByText('客户电话')).toBeInTheDocument()
})

it('shows an error when event creation fails', async () => {
  storeSession()
  createEventMock.mockRejectedValue(new Error('bad input'))

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.change(screen.getByLabelText('标题'), {
    target: { value: '客户电话' },
  })
  fireEvent.change(screen.getByLabelText('开始时间'), {
    target: { value: '2026-05-31T10:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: '添加日程' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '日程创建失败，请检查内容后重试。',
  )
})

it('deletes an event from the list', async () => {
  storeSession()
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-05-31T09:30:00',
      ends_at: null,
      reminder_at: null,
      status: 'scheduled',
      source_text: null,
    },
  ])

  render(<App />)
  expect(await screen.findByText('产品评审')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '删除 产品评审' }))

  expect(deleteEventMock).toHaveBeenCalledWith(7, 'stored-token')
  await waitFor(() => {
    expect(screen.queryByText('产品评审')).not.toBeInTheDocument()
  })
  expect(screen.getByText('还没有日程。')).toBeInTheDocument()
})

it('shows an error when event deletion fails', async () => {
  storeSession()
  deleteEventMock.mockRejectedValue(new Error('offline'))
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-05-31T09:30:00',
      ends_at: null,
      reminder_at: null,
      status: 'scheduled',
      source_text: null,
    },
  ])

  render(<App />)
  expect(await screen.findByText('产品评审')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '删除 产品评审' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '日程删除失败，请稍后重试。',
  )
  expect(screen.getByText('产品评审')).toBeInTheDocument()
})

it('renders voice input controls for signed in users', async () => {
  storeSession()

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '开始识别' })).toBeInTheDocument()
  expect(screen.getByText('等待语音输入。')).toBeInTheDocument()
})

it('starts voice recognition from the microphone control', async () => {
  storeSession()
  const start = vi.fn()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '',
    isListening: false,
    isSupported: true,
    start,
    status: 'idle',
    stop: vi.fn(),
    transcript: '',
  })

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.click(screen.getByRole('button', { name: '开始识别' }))

  expect(start).toHaveBeenCalledOnce()
})

it('shows voice transcripts without executing commands', async () => {
  storeSession()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '明天下午',
    isListening: true,
    isSupported: true,
    start: vi.fn(),
    status: 'listening',
    stop: vi.fn(),
    transcript: '添加提醒',
  })

  render(<App />)

  expect(await screen.findByText('添加提醒')).toBeInTheDocument()
  expect(screen.getByText('明天下午')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '停止识别' })).toBeInTheDocument()
})

it('navigates to GitHub OAuth start', () => {
  const assignMock = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: assignMock },
  })

  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'GitHub 登录' }))

  expect(getGitHubOAuthStartUrlMock).toHaveBeenCalledOnce()
  expect(assignMock).toHaveBeenCalledWith(
    'http://localhost:8000/auth/github/start',
  )
})

it('shows an error when guest session creation fails', async () => {
  createGuestSessionMock.mockRejectedValue(new Error('offline'))

  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '游客模式' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '游客模式暂时不可用，请稍后重试。',
  )
})
