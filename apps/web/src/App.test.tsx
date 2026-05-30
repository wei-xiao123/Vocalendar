import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from './App'
import { createGuestSession, getGitHubOAuthStartUrl, listEvents } from './lib/api'

vi.mock('./lib/api', () => ({
  createGuestSession: vi.fn(),
  getGitHubOAuthStartUrl: vi.fn(() => 'http://localhost:8000/auth/github/start'),
  listEvents: vi.fn(),
}))

const createGuestSessionMock = vi.mocked(createGuestSession)
const getGitHubOAuthStartUrlMock = vi.mocked(getGitHubOAuthStartUrl)
const listEventsMock = vi.mocked(listEvents)

beforeEach(() => {
  window.localStorage.clear()
  createGuestSessionMock.mockReset()
  listEventsMock.mockReset()
  getGitHubOAuthStartUrlMock.mockReturnValue(
    'http://localhost:8000/auth/github/start',
  )
  listEventsMock.mockResolvedValue([])
})

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

  render(<App />)

  expect(await screen.findByText('还没有日程。')).toBeInTheDocument()
})

it('shows an event list error state', async () => {
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
  listEventsMock.mockRejectedValue(new Error('offline'))

  render(<App />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '日程列表加载失败，请稍后重试。',
  )
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
