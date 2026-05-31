import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from './App'
import {
  createEvent,
  createGuestSession,
  deleteEvent,
  getGitHubOAuthStartUrl,
  listEvents,
  sendAssistantCommand,
} from './lib/api'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'

vi.mock('./lib/api', () => ({
  createEvent: vi.fn(),
  createGuestSession: vi.fn(),
  deleteEvent: vi.fn(),
  getGitHubOAuthStartUrl: vi.fn(() => 'http://localhost:8000/auth/github/start'),
  listEvents: vi.fn(),
  sendAssistantCommand: vi.fn(),
}))

vi.mock('./hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: vi.fn(),
}))

const createEventMock = vi.mocked(createEvent)
const createGuestSessionMock = vi.mocked(createGuestSession)
const deleteEventMock = vi.mocked(deleteEvent)
const getGitHubOAuthStartUrlMock = vi.mocked(getGitHubOAuthStartUrl)
const listEventsMock = vi.mocked(listEvents)
const sendAssistantCommandMock = vi.mocked(sendAssistantCommand)
const useSpeechRecognitionMock = vi.mocked(useSpeechRecognition)

beforeEach(() => {
  window.localStorage.clear()
  vi.useRealTimers()
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
  listEventsMock.mockReset()
  sendAssistantCommandMock.mockReset()
  useSpeechRecognitionMock.mockReset()
  getGitHubOAuthStartUrlMock.mockReturnValue(
    'http://localhost:8000/auth/github/start',
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
    isSupported: true,
    start: vi.fn(),
    status: 'idle',
    stop: vi.fn(),
    transcript: '',
  })
})

afterEach(() => {
  vi.useRealTimers()
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

it('shows voice transcripts and enables voice command execution', async () => {
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
  expect(
    screen.getByRole('button', { name: '执行语音命令' }),
  ).toBeEnabled()
  expect(sendAssistantCommandMock).not.toHaveBeenCalled()
})

it('sends a final voice transcript as an assistant command', async () => {
  storeSession()
  useSpeechRecognitionMock.mockReturnValue({
    errorMessage: null,
    interimTranscript: '',
    isListening: false,
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
  expect(await screen.findByText('找到 0 个日程。')).toBeInTheDocument()
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
  await screen.findByText('还没有日程。')

  fireEvent.change(screen.getByLabelText('文本命令'), {
    target: { value: '查看提醒' },
  })
  fireEvent.click(screen.getByRole('button', { name: '执行' }))

  expect(sendAssistantCommandMock).toHaveBeenCalledWith('查看提醒', 'stored-token')
  expect(await screen.findByText('找到 1 个日程。')).toBeInTheDocument()
  expect(screen.getByText('产品评审')).toBeInTheDocument()
  expect(screen.getByText('list_events')).toBeInTheDocument()
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

  expect(notificationMock).not.toHaveBeenCalled()
  await act(async () => {
    vi.advanceTimersByTime(60_000)
  })

  expect(notificationMock).toHaveBeenCalledWith('产品评审', {
    body: expect.any(String),
    tag: 'vocalendar-event-7',
  })
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
