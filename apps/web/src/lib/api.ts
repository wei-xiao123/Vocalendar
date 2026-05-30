const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type AuthUser = {
  id: number
  is_guest: boolean
  username: string | null
  display_name: string | null
  avatar_url: string | null
  email: string | null
}

export type GuestUser = Pick<
  AuthUser,
  'id' | 'is_guest' | 'username' | 'display_name'
>

export type AuthToken = {
  access_token: string
  token_type: 'bearer'
  user: AuthUser
}

export type CalendarEvent = {
  id: number
  user_id: number
  title: string
  starts_at: string
  ends_at: string | null
  reminder_at: string | null
  status: string
  source_text: string | null
}

export type CreateEventPayload = {
  title: string
  starts_at: string
  ends_at?: string | null
  reminder_at?: string | null
  source_text?: string | null
}

export type ListEventsParams = {
  starts_from?: string
  starts_to?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(
    message: string,
    status: number,
    body: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function buildUrl(path: string, baseUrl = DEFAULT_API_BASE_URL): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString()
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildUrl(path), { ...options, headers })
  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.json()
  if (!response.ok) {
    throw new ApiError('API request failed', response.status, body)
  }
  return body as T
}

export function getGitHubOAuthStartUrl(
  baseUrl = DEFAULT_API_BASE_URL,
): string {
  return buildUrl('/auth/github/start', baseUrl)
}

export function createGuestSession(): Promise<GuestUser> {
  return request<GuestUser>('/auth/guest', { method: 'POST' })
}

export function getCurrentUser(accessToken: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/me', {}, accessToken)
}

export function createEvent(
  payload: CreateEventPayload,
  accessToken: string,
): Promise<CalendarEvent> {
  return request<CalendarEvent>(
    '/events',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function listEvents(
  accessToken: string,
  params: ListEventsParams = {},
): Promise<CalendarEvent[]> {
  const query = new URLSearchParams()
  if (params.starts_from) {
    query.set('starts_from', params.starts_from)
  }
  if (params.starts_to) {
    query.set('starts_to', params.starts_to)
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return request<CalendarEvent[]>(`/events${suffix}`, {}, accessToken)
}

export function deleteEvent(eventId: number, accessToken: string): Promise<void> {
  return request<void>(
    `/events/${eventId}`,
    {
      method: 'DELETE',
    },
    accessToken,
  )
}
