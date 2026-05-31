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
} from './api'

function mockFetch(response: Partial<Response> & { payload?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: vi.fn().mockResolvedValue(response.payload ?? {}),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('builds the GitHub OAuth start URL', () => {
  expect(getGitHubOAuthStartUrl('http://localhost:8000')).toBe(
    'http://localhost:8000/auth/github/start',
  )
  expect(
    getGitHubOAuthStartUrl('http://localhost:8000', 'http://localhost:5175/'),
  ).toBe(
    'http://localhost:8000/auth/github/start?redirect_to=http%3A%2F%2Flocalhost%3A5175%2F',
  )
})

it('creates a guest session', async () => {
  const fetchMock = mockFetch({
    payload: {
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
    },
  })

  await expect(createGuestSession()).resolves.toMatchObject({
    access_token: 'guest-token',
    user: {
      id: 1,
      is_guest: true,
    },
  })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:8000/auth/guest',
    expect.objectContaining({ method: 'POST' }),
  )
})

it('sends bearer token when fetching current user', async () => {
  const fetchMock = mockFetch({
    payload: {
      id: 1,
      is_guest: false,
      username: 'octocat',
      display_name: 'The Octocat',
      avatar_url: null,
      email: null,
    },
  })

  await getCurrentUser('app-token')

  const [, options] = fetchMock.mock.calls[0]
  expect(options.headers.get('Authorization')).toBe('Bearer app-token')
})

it('creates an event with JSON body', async () => {
  const fetchMock = mockFetch({
    payload: {
      id: 1,
      user_id: 1,
      title: 'Team sync',
      starts_at: '2026-05-31T09:00:00',
      ends_at: null,
      reminder_at: null,
      status: 'scheduled',
      source_text: null,
    },
  })

  await createEvent(
    {
      title: 'Team sync',
      starts_at: '2026-05-31T09:00:00',
    },
    'app-token',
  )

  const [, options] = fetchMock.mock.calls[0]
  expect(options.method).toBe('POST')
  expect(options.headers.get('Content-Type')).toBe('application/json')
  expect(JSON.parse(options.body as string)).toMatchObject({ title: 'Team sync' })
})

it('lists events with optional start range params', async () => {
  const fetchMock = mockFetch({ payload: [] })

  await listEvents('app-token', {
    starts_from: '2026-05-31T00:00:00',
    starts_to: '2026-06-01T00:00:00',
  })

  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:8000/events?starts_from=2026-05-31T00%3A00%3A00&starts_to=2026-06-01T00%3A00%3A00',
  )
})

it('handles empty delete response', async () => {
  const fetchMock = mockFetch({ status: 204 })

  await expect(deleteEvent(7, 'app-token')).resolves.toBeUndefined()
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/events/7')
  expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
})

it('sends an assistant command with bearer token', async () => {
  const fetchMock = mockFetch({
    payload: {
      action: 'list_events',
      confidence: 0.8,
      text: '查看提醒',
      parameters: {},
      message: '找到 0 个日程。',
      events: [],
    },
  })

  await expect(sendAssistantCommand('查看提醒', 'app-token')).resolves.toMatchObject({
    action: 'list_events',
    message: '找到 0 个日程。',
  })

  const [, options] = fetchMock.mock.calls[0]
  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:8000/assistant/commands',
  )
  expect(options.method).toBe('POST')
  expect(options.headers.get('Authorization')).toBe('Bearer app-token')
  expect(JSON.parse(options.body as string)).toEqual({ text: '查看提醒' })
})

it('throws ApiError for non-ok responses', async () => {
  mockFetch({
    ok: false,
    status: 401,
    payload: { detail: 'Not authenticated' },
  })

  await expect(getCurrentUser('bad-token')).rejects.toMatchObject({
    status: 401,
    body: { detail: 'Not authenticated' },
  })
})

it('requests Google OAuth authorization URL with bearer token', async () => {
  const fetchMock = mockFetch({
    payload: {
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    },
  })

  await expect(
    getGoogleOAuthStartUrl('app-token', 'http://localhost:5175/'),
  ).resolves.toBe('https://accounts.google.com/o/oauth2/v2/auth')

  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:8000/integrations/google/start?redirect_to=http%3A%2F%2Flocalhost%3A5175%2F',
  )
  expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe(
    'Bearer app-token',
  )
})

it('fetches Google connection status', async () => {
  const fetchMock = mockFetch({
    payload: {
      connected: true,
      provider: 'google',
      calendar_id: 'primary',
    },
  })

  await getGoogleConnectionStatus('app-token')

  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:8000/integrations/google/status',
  )
})

it('disconnects Google Calendar', async () => {
  const fetchMock = mockFetch({ status: 204 })

  await expect(disconnectGoogleCalendar('app-token')).resolves.toBeUndefined()
  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:8000/integrations/google/connection',
  )
  expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
})
