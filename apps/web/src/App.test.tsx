import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from './App'
import { createGuestSession, getGitHubOAuthStartUrl } from './lib/api'

vi.mock('./lib/api', () => ({
  createGuestSession: vi.fn(),
  getGitHubOAuthStartUrl: vi.fn(() => 'http://localhost:8000/auth/github/start'),
}))

const createGuestSessionMock = vi.mocked(createGuestSession)
const getGitHubOAuthStartUrlMock = vi.mocked(getGitHubOAuthStartUrl)

beforeEach(() => {
  window.localStorage.clear()
  createGuestSessionMock.mockReset()
  getGitHubOAuthStartUrlMock.mockReturnValue(
    'http://localhost:8000/auth/github/start',
  )
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
  fireEvent.click(screen.getByRole('button', { name: '退出' }))

  await waitFor(() => {
    expect(window.localStorage.getItem('vocalendar.auth')).toBeNull()
  })
  expect(screen.getByRole('button', { name: '游客模式' })).toBeInTheDocument()
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
