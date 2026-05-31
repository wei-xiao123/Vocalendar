import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from './App'
import {
  createEvent,
  createGuestSession,
  deleteEvent,
  disconnectGoogleCalendar,
  getCurrentUser,
  getGitHubOAuthStartUrl,
  getGoogleConnectionStatus,
  getGoogleOAuthStartUrl,
  listEvents,
  sendAssistantCommand,
} from './lib/api'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'

vi.mock('./lib/api', () => ({
  createEvent: vi.fn(),
  createGuestSession: vi.fn(),
  deleteEvent: vi.fn(),
  disconnectGoogleCalendar: vi.fn(),
  getCurrentUser: vi.fn(),
  getGitHubOAuthStartUrl: vi.fn(() => 'http://localhost:8000/auth/github/start'),
  getGoogleConnectionStatus: vi.fn(),
  getGoogleOAuthStartUrl: vi.fn(),
  listEvents: vi.fn(),
  sendAssistantCommand: vi.fn(),
}))

vi.mock('./hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: vi.fn(),
}))

const createEventMock = vi.mocked(createEvent)
const createGuestSessionMock = vi.mocked(createGuestSession)
const deleteEventMock = vi.mocked(deleteEvent)
const disconnectGoogleCalendarMock = vi.mocked(disconnectGoogleCalendar)
const getCurrentUserMock = vi.mocked(getCurrentUser)
const getGitHubOAuthStartUrlMock = vi.mocked(getGitHubOAuthStartUrl)
const getGoogleConnectionStatusMock = vi.mocked(getGoogleConnectionStatus)
const getGoogleOAuthStartUrlMock = vi.mocked(getGoogleOAuthStartUrl)
const listEventsMock = vi.mocked(listEvents)
const sendAssistantCommandMock = vi.mocked(sendAssistantCommand)
const useSpeechRecognitionMock = vi.mocked(useSpeechRecognition)
const originalLocation = window.location
const oscillatorFrequencySetValueAtTimeMock = vi.fn()
const oscillatorConnectMock = vi.fn()
const oscillatorStartMock = vi.fn()
const oscillatorStopMock = vi.fn()
const gainConnectMock = vi.fn()
const gainSetValueAtTimeMock = vi.fn()
const gainLinearRampToValueAtTimeMock = vi.fn()
const gainExponentialRampToValueAtTimeMock = vi.fn()
const audioContextInstances: MockAudioContext[] = []

class MockAudioContext {
  state: AudioContextState = 'suspended'
  currentTime = 0
  destination = {}
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  close = vi.fn(async () => {})
  createOscillator = vi.fn(() => ({
    connect: oscillatorConnectMock,
    frequency: {
      setValueAtTime: oscillatorFrequencySetValueAtTimeMock,
    },
    start: oscillatorStartMock,
    stop: oscillatorStopMock,
    type: 'sine',
  }))
  createGain = vi.fn(() => ({
    connect: gainConnectMock,
    gain: {
      exponentialRampToValueAtTime: gainExponentialRampToValueAtTimeMock,
      linearRampToValueAtTime: gainLinearRampToValueAtTimeMock,
      setValueAtTime: gainSetValueAtTimeMock,
    },
  }))

  constructor() {
    audioContextInstances.push(this)
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  })
  window.history.replaceState({}, '', '/')
  window.localStorage.clear()
  vi.useRealTimers()
  audioContextInstances.length = 0
  oscillatorFrequencySetValueAtTimeMock.mockReset()
  oscillatorConnectMock.mockReset()
  oscillatorStartMock.mockReset()
  oscillatorStopMock.mockReset()
  gainConnectMock.mockReset()
  gainSetValueAtTimeMock.mockReset()
  gainLinearRampToValueAtTimeMock.mockReset()
  gainExponentialRampToValueAtTimeMock.mockReset()
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: MockAudioContext,
  })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: vi.fn(),
  })
  Object.assign(window.Notification, {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  })
  createEventMock.mockReset()
  createGuestSessionMock.mockReset()
  deleteEventMock.mockReset()
  disconnectGoogleCalendarMock.mockReset()
  getCurrentUserMock.mockReset()
  listEventsMock.mockReset()
  sendAssistantCommandMock.mockReset()
  useSpeechRecognitionMock.mockReset()
  getGitHubOAuthStartUrlMock.mockReturnValue(
    'http://localhost:8000/auth/github/start',
  )
  getGoogleConnectionStatusMock.mockResolvedValue({
    connected: false,
    provider: 'google',
  })
  getGoogleOAuthStartUrlMock.mockResolvedValue(
    'https://accounts.google.com/o/oauth2/v2/auth',
  )
  deleteEventMock.mockResolvedValue(undefined)
  listEventsMock.mockResolvedValue([])
  sendAssistantCommandMock.mockResolvedValue({
    action: 'unknown',
    confidence: 0,
    text: '未知命令',
    parameters: {},
    message: '暂未识别该命令。',
  })
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '',
    isListening: false,
    resetTranscript: vi.fn(),
    isSupported: true,
    start: vi.fn(),
    status: 'idle',
    stop: vi.fn(),
    transcript: '',
  })
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'AudioContext')
  Reflect.deleteProperty(window, 'Notification')
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
  await waitFor(() => {
    expect(listEventsMock).toHaveBeenCalledWith('guest-token')
    expect(getGoogleConnectionStatusMock).toHaveBeenCalledWith('guest-token')
  })
  expect(window.localStorage.getItem('vocalendar.auth')).toContain('guest-token')
})

it('restores a stored session and can sign out', async () => {
  storeSession()

  render(<App />)

  expect(screen.getByText('The Octocat')).toBeInTheDocument()
  expect(listEventsMock).toHaveBeenCalledWith('stored-token')
  expect(getGoogleConnectionStatusMock).toHaveBeenCalledWith('stored-token')
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
  expect(screen.getByText('已结束')).toBeInTheDocument()
  expect(screen.getByText('1')).toBeInTheDocument()
})

it('renders Google Calendar connection controls for signed in users', async () => {
  storeSession()

  render(<App />)

  expect(await screen.findByText('尚未连接 Google Calendar')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '连接 Google 日历' })).toBeInTheDocument()
})

it('does not reopen the Google authorization modal after a successful callback', async () => {
  storeSession()
  window.history.replaceState({}, '', '/?google_connected=1')

  render(<App />)

  expect(await screen.findByText('尚未连接 Google Calendar')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: '继续并授权' }),
  ).not.toBeInTheDocument()
})

it('does not show the Google authorization modal when the stored session is connected', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-31T13:08:00').getTime())
  storeSession()
  getGoogleConnectionStatusMock.mockResolvedValue({
    calendar_id: 'primary',
    connected: true,
    last_synced_at: '2026-05-31T11:03:00',
    provider: 'google',
  })

  render(<App />)

  expect(await screen.findByText('已连接到 Google 日历')).toBeInTheDocument()
  expect(screen.getByText('最后同步：05/31 13:08')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: '继续并授权' }),
  ).not.toBeInTheDocument()
})

it('renders Google Calendar connection controls for guest users', async () => {
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

  expect(await screen.findByText('Guest User')).toBeInTheDocument()
  expect(
    screen.getByText('游客会话，尚未连接 Google Calendar'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '连接 Google 日历' })).toBeInTheDocument()
})

it('starts Google OAuth from a guest session', async () => {
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
  const assignMock = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: assignMock },
  })

  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '游客模式' }))
  expect(await screen.findByText('Guest User')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '连接 Google 日历' }))

  await waitFor(() => {
    expect(getGoogleOAuthStartUrlMock).toHaveBeenCalledWith(
      'guest-token',
      expect.any(String),
    )
  })
  expect(assignMock).toHaveBeenCalledWith(
    'https://accounts.google.com/o/oauth2/v2/auth',
  )
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
      reminder_at: null,
    },
    'stored-token',
  )
  expect(await screen.findByText('客户电话')).toBeInTheDocument()
})

it('creates an event with a custom reminder time', async () => {
  storeSession()
  createEventMock.mockResolvedValue({
    id: 9,
    user_id: 2,
    title: '产品评审',
    starts_at: '2026-05-31T10:00',
    ends_at: null,
    reminder_at: '2026-05-31T09:45',
    status: 'scheduled',
    source_text: null,
  })

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.change(screen.getByLabelText('标题'), {
    target: { value: '产品评审' },
  })
  fireEvent.change(screen.getByLabelText('开始时间'), {
    target: { value: '2026-05-31T10:00' },
  })
  fireEvent.change(screen.getByLabelText('提醒时间'), {
    target: { value: '2026-05-31T09:45' },
  })
  fireEvent.click(screen.getByRole('button', { name: '添加日程' }))

  expect(createEventMock).toHaveBeenCalledWith(
    {
      title: '产品评审',
      starts_at: '2026-05-31T10:00',
      reminder_at: '2026-05-31T09:45',
    },
    'stored-token',
  )
  expect(await screen.findByText('产品评审')).toBeInTheDocument()
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
  const resetTranscript = vi.fn()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '',
    isListening: false,
    resetTranscript,
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
  expect(resetTranscript).toHaveBeenCalledOnce()
})

it('shows voice transcripts and enables voice command execution', async () => {
  storeSession()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '明天下午',
    isListening: true,
    resetTranscript: vi.fn(),
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
  expect(
    screen.getByRole('button', { name: '执行语音命令' }),
  ).toBeEnabled()
  expect(sendAssistantCommandMock).not.toHaveBeenCalled()
})

it('sends a final voice transcript as an assistant command', async () => {
  storeSession()
  const resetTranscript = vi.fn()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '',
    isListening: false,
    resetTranscript,
    isSupported: true,
    start: vi.fn(),
    status: 'idle',
    stop: vi.fn(),
    transcript: '查看提醒',
  })
  sendAssistantCommandMock.mockResolvedValue({
    action: 'list_events',
    confidence: 0.8,
    text: '查看提醒',
    parameters: {},
    message: '找到 0 个日程。',
    events: [],
  })

  render(<App />)

  expect(await screen.findByText('查看提醒')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '执行语音命令' }))

  expect(sendAssistantCommandMock).toHaveBeenCalledWith('查看提醒', 'stored-token')
  expect(resetTranscript).toHaveBeenCalledOnce()
  expect(await screen.findAllByText('找到 0 个日程。')).not.toHaveLength(0)
})

it('sends a visible interim voice transcript as an assistant command', async () => {
  storeSession()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '帮我定一个二分钟后响的闹铃我要去开会。',
    isListening: true,
    resetTranscript: vi.fn(),
    isSupported: true,
    start: vi.fn(),
    status: 'listening',
    stop: vi.fn(),
    transcript: '',
  })

  render(<App />)

  expect(
    await screen.findByText('帮我定一个二分钟后响的闹铃我要去开会。'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '执行语音命令' }))

  expect(sendAssistantCommandMock).toHaveBeenCalledWith(
    '帮我定一个二分钟后响的闹铃我要去开会。',
    'stored-token',
  )
})

it('shows the assistant response after executing a visible voice transcript', async () => {
  storeSession()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '帮我定一个三分钟后的闹钟。',
    isListening: false,
    resetTranscript: vi.fn(),
    isSupported: true,
    start: vi.fn(),
    status: 'idle',
    stop: vi.fn(),
    transcript: '',
  })
  sendAssistantCommandMock.mockResolvedValue({
    action: 'add_event',
    confidence: 0.85,
    text: '帮我定一个三分钟后的闹钟。',
    parameters: {},
    message: '已创建日程。',
    event: {
      id: 10,
      title: '闹钟',
      starts_at: '2026-05-31T19:43:00',
      status: 'scheduled',
    },
  })

  render(<App />)

  expect(await screen.findByText('帮我定一个三分钟后的闹钟。')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '执行语音命令' }))

  expect(await screen.findAllByText('已创建日程。')).not.toHaveLength(0)
})

it('renders assistant command controls for signed in users', async () => {
  storeSession()

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
  expect(screen.getByLabelText('文本命令')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '执行' })).toBeDisabled()
  expect(screen.getByText('还没有助手回复。')).toBeInTheDocument()
})

it('sends an assistant command and displays the result', async () => {
  storeSession()
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-06-01T09:30:00',
      ends_at: null,
      reminder_at: null,
      status: 'scheduled',
      source_text: null,
    },
  ])
  sendAssistantCommandMock.mockResolvedValue({
    action: 'list_events',
    confidence: 0.8,
    text: '查看提醒',
    parameters: {},
    message: '找到 1 个日程。',
    events: [
      {
        id: 7,
        title: '产品评审',
        starts_at: '2026-06-01T09:30:00',
        status: 'scheduled',
      },
    ],
  })

  render(<App />)
  await screen.findByText('产品评审')

  fireEvent.change(screen.getByLabelText('文本命令'), {
    target: { value: '查看提醒' },
  })
  fireEvent.click(screen.getByRole('button', { name: '执行' }))

  expect(sendAssistantCommandMock).toHaveBeenCalledWith('查看提醒', 'stored-token')
  expect(await screen.findByText('找到 1 个日程。')).toBeInTheDocument()
  expect(screen.getAllByText('产品评审')).not.toHaveLength(0)
  expect(screen.getByText('list_events')).toBeInTheDocument()
  expect(screen.getByRole('list', { name: '日程列表' })).toBeInTheDocument()
  const highlightedEvent = screen.getByRole('listitem')
  expect(highlightedEvent.className).toContain('border-red-300')
  expect(highlightedEvent.className).toContain('ring-red-100')
})

it('refreshes the event list after an assistant add command succeeds', async () => {
  storeSession()
  const createdEvent = {
    id: 9,
    user_id: 2,
    title: '语音会议',
    starts_at: '2026-06-01T11:00:00',
    ends_at: null,
    reminder_at: null,
    status: 'scheduled',
    source_text: '添加提醒 2026-06-01 11:00 语音会议',
  }
  listEventsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([createdEvent])
  sendAssistantCommandMock.mockResolvedValue({
    action: 'add_event',
    confidence: 0.95,
    text: '添加提醒 2026-06-01 11:00 语音会议',
    parameters: {},
    message: '已添加日程。',
    event: {
      id: createdEvent.id,
      title: createdEvent.title,
      starts_at: createdEvent.starts_at,
      status: createdEvent.status,
    },
  })

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.change(screen.getByLabelText('文本命令'), {
    target: { value: '添加提醒 2026-06-01 11:00 语音会议' },
  })
  fireEvent.click(screen.getByRole('button', { name: '执行' }))

  expect(await screen.findByText('已添加日程。')).toBeInTheDocument()
  await waitFor(() => {
    expect(listEventsMock).toHaveBeenCalledTimes(2)
  })
  expect(screen.getByRole('list', { name: '日程列表' })).toHaveTextContent(
    '语音会议',
  )
})

it('refreshes the event list after an assistant delete command succeeds', async () => {
  storeSession()
  const existingEvent = {
    id: 7,
    user_id: 2,
    title: '产品评审',
    starts_at: '2026-06-01T09:30:00',
    ends_at: null,
    reminder_at: null,
    status: 'scheduled',
    source_text: null,
  }
  listEventsMock.mockResolvedValueOnce([existingEvent]).mockResolvedValueOnce([])
  sendAssistantCommandMock.mockResolvedValue({
    action: 'delete_event',
    confidence: 0.9,
    text: '删除提醒 产品评审',
    parameters: {},
    message: '已删除日程。',
    event: {
      id: existingEvent.id,
      title: existingEvent.title,
      starts_at: existingEvent.starts_at,
      status: existingEvent.status,
    },
  })

  render(<App />)
  expect(await screen.findByText('产品评审')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('文本命令'), {
    target: { value: '删除提醒 产品评审' },
  })
  fireEvent.click(screen.getByRole('button', { name: '执行' }))

  expect(await screen.findByText('已删除日程。')).toBeInTheDocument()
  await waitFor(() => {
    expect(listEventsMock).toHaveBeenCalledTimes(2)
  })
  expect(screen.getByText('还没有日程。')).toBeInTheDocument()
})

it('shows an error when assistant command execution fails', async () => {
  storeSession()
  sendAssistantCommandMock.mockRejectedValue(new Error('offline'))

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.change(screen.getByLabelText('文本命令'), {
    target: { value: '查看提醒' },
  })
  fireEvent.click(screen.getByRole('button', { name: '执行' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '助手命令执行失败，请稍后重试。',
  )
})

it('renders browser notification permission controls', async () => {
  storeSession()

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
  expect(screen.getByText('未决定')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: '请求通知权限' }),
  ).toBeInTheDocument()
})

it('renders reminder sound controls for signed in users', async () => {
  storeSession()

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
  expect(screen.getByText('未启用')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: '启用提醒音' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '测试提醒音' })).toBeDisabled()
})

it('enables reminder sound after user interaction', async () => {
  storeSession()

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.click(screen.getByRole('button', { name: '启用提醒音' }))

  await waitFor(() => {
    expect(screen.getByText('已启用')).toBeInTheDocument()
  })
  expect(audioContextInstances).toHaveLength(1)
  expect(audioContextInstances[0].resume).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '测试提醒音' })).toBeEnabled()
  expect(window.localStorage.getItem('vocalendar.reminderSoundEnabled')).toBe(
    'true',
  )
})

it('keeps reminder sound enabled after reloading the page', async () => {
  storeSession()
  window.localStorage.setItem('vocalendar.reminderSoundEnabled', 'true')

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
  expect(screen.getByText('已启用')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: '已启用提醒音' }),
  ).toBeDisabled()
  expect(screen.getByRole('button', { name: '测试提醒音' })).toBeEnabled()
})

it('plays reminder sound after restoring the enabled state from storage', async () => {
  storeSession()
  window.localStorage.setItem('vocalendar.reminderSoundEnabled', 'true')

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.click(screen.getByRole('button', { name: '测试提醒音' }))

  await waitFor(() => {
    expect(audioContextInstances).toHaveLength(1)
  })
  expect(audioContextInstances[0].resume).toHaveBeenCalledOnce()
  expect(oscillatorStartMock).toHaveBeenCalled()
  expect(oscillatorStopMock).toHaveBeenLastCalledWith(5.02)
})

it('renders reminder times in event and assistant results', async () => {
  storeSession()
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-05-31T09:30:00',
      ends_at: null,
      reminder_at: '2026-05-31T09:15:00',
      status: 'scheduled',
      source_text: null,
    },
  ])
  sendAssistantCommandMock.mockResolvedValue({
    action: 'add_event',
    confidence: 0.95,
    text: '添加提醒',
    parameters: {},
    message: '已添加日程。',
    event: {
      id: 8,
      title: '客户电话',
      starts_at: '2026-05-31T10:00:00',
      reminder_at: '2026-05-31T09:45:00',
      status: 'scheduled',
    },
  })

  render(<App />)
  expect(await screen.findByText('产品评审')).toBeInTheDocument()
  expect(screen.getByText('提醒：05/31 09:15')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('文本命令'), {
    target: { value: '添加提醒' },
  })
  fireEvent.click(screen.getByRole('button', { name: '执行' }))

  expect(await screen.findByText('客户电话')).toBeInTheDocument()
  expect(screen.getByText('提醒：05/31 09:45')).toBeInTheDocument()
})

it('requests browser notification permission', async () => {
  storeSession()
  const requestPermission = vi.fn().mockResolvedValue('granted')
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: vi.fn(),
  })
  Object.assign(window.Notification, {
    permission: 'default',
    requestPermission,
  })

  render(<App />)
  await screen.findByText('还没有日程。')

  fireEvent.click(screen.getByRole('button', { name: '请求通知权限' }))

  expect(requestPermission).toHaveBeenCalledOnce()
  expect(await screen.findByText('已允许')).toBeInTheDocument()
})

it('schedules reminders while the page is open after notification permission is granted', async () => {
  vi.useFakeTimers()
  storeSession()
  const notificationMock = vi.fn()
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: notificationMock,
  })
  Object.assign(window.Notification, {
    permission: 'granted',
    requestPermission: vi.fn(),
  })
  const now = new Date('2026-05-31T09:00:00').getTime()
  vi.setSystemTime(now)
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-05-31T09:30:00',
      ends_at: null,
      reminder_at: '2026-05-31T09:01:00',
      status: 'scheduled',
      source_text: null,
    },
  ])

  render(<App />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(screen.getByText('产品评审')).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '启用提醒音' }))
    await Promise.resolve()
  })
  expect(screen.getByText('已启用')).toBeInTheDocument()

  expect(notificationMock).not.toHaveBeenCalled()
  await act(async () => {
    vi.advanceTimersByTime(60_000)
  })

  expect(notificationMock).toHaveBeenCalledWith('产品评审', {
    body: expect.any(String),
    tag: 'vocalendar-event-7',
  })
  expect(oscillatorStartMock).toHaveBeenCalledTimes(13)
  expect(oscillatorStopMock).toHaveBeenCalledTimes(13)
  expect(oscillatorStopMock).toHaveBeenLastCalledWith(5.02)
})

it('highlights due today events and appends an inline reminder card', async () => {
  vi.useFakeTimers()
  storeSession()
  vi.setSystemTime(new Date('2026-05-31T09:29:45').getTime())
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-05-31T09:30:00',
      ends_at: '2026-05-31T09:31:00',
      reminder_at: null,
      status: 'scheduled',
      source_text: null,
    },
  ])

  render(<App />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(screen.getByText('产品评审')).toBeInTheDocument()

  await act(async () => {
    vi.advanceTimersByTime(30_000)
  })

  expect(
    screen.getByText((_, node) => {
      return node?.textContent === '💡 提醒：您的 产品评审 已经到时间了。'
    }),
  ).toBeInTheDocument()
  const eventCard = screen.getByLabelText(/09:30 - 09:31 产品评审/)
  expect(eventCard.className).toContain('animate-pulse')
  expect(eventCard.className).toContain('border-[#7AA68B]')
  expect(screen.getByText('日程提醒 · 09:30 - 09:31')).toBeInTheDocument()
  expect(screen.getAllByText('产品评审')).toHaveLength(3)
  expect(screen.getByText('这个日程已经到时间了。')).toBeInTheDocument()

  fireEvent.click(screen.getAllByRole('button', { name: '我知道了' }).at(-1)!)

  expect(eventCard.className).not.toContain('animate-pulse')
  expect(eventCard.className).toContain('opacity-55')
})

it('does not schedule reminders before notification permission is granted', async () => {
  vi.useFakeTimers()
  storeSession()
  const notificationMock = vi.fn()
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: notificationMock,
  })
  Object.assign(window.Notification, {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  })
  vi.setSystemTime(new Date('2026-05-31T09:00:00').getTime())
  listEventsMock.mockResolvedValue([
    {
      id: 7,
      user_id: 2,
      title: '产品评审',
      starts_at: '2026-05-31T09:30:00',
      ends_at: null,
      reminder_at: '2026-05-31T09:01:00',
      status: 'scheduled',
      source_text: null,
    },
  ])

  render(<App />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(screen.getByText('产品评审')).toBeInTheDocument()

  await act(async () => {
    vi.advanceTimersByTime(60_000)
  })

  expect(notificationMock).not.toHaveBeenCalled()
})

it('disables notification permission request when unsupported', async () => {
  storeSession()
  Reflect.deleteProperty(window, 'Notification')

  render(<App />)

  expect(await screen.findByText('不支持')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '请求通知权限' })).toBeDisabled()
})

it('disables reminder sound controls when audio is unsupported', async () => {
  storeSession()
  Reflect.deleteProperty(window, 'AudioContext')

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
  expect(screen.getAllByText('不支持')).toHaveLength(1)
  expect(screen.getByRole('button', { name: '启用提醒音' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '测试提醒音' })).toBeDisabled()
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
    expect.stringContaining('http://localhost:8000/auth/github/start'),
  )
  expect(screen.getByRole('button', { name: '跳转中...' })).toBeDisabled()
})

it('shows an error when guest session creation fails', async () => {
  createGuestSessionMock.mockRejectedValue(new Error('offline'))

  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '游客模式' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '游客模式暂时不可用，请稍后重试。',
  )
})

it('shows GitHub OAuth callback errors on the login screen', async () => {
  window.history.replaceState({}, '', '/?auth_error=github_login_failed')

  render(<App />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'GitHub 登录失败，请重试。',
  )
  expect(window.location.search).toBe('')
})
