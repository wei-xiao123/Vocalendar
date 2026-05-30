import { type FormEvent, useEffect, useState } from 'react'

import './App.css'
import {
  type AuthToken,
  type CalendarEvent,
  createEvent,
  createGuestSession,
  deleteEvent,
  getGitHubOAuthStartUrl,
  listEvents,
} from './lib/api'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const AUTH_STORAGE_KEY = 'vocalendar.auth'

type EventListState = {
  events: CalendarEvent[]
  error: string | null
}

const initialEventListState: EventListState = {
  events: [],
  error: null,
}

function App() {
  const [authToken, setAuthToken] = useState<AuthToken | null>(() => {
    const storedValue = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!storedValue) {
      return null
    }

    try {
      return JSON.parse(storedValue) as AuthToken
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
  })
  const [isCreatingGuest, setIsCreatingGuest] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (authToken) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authToken))
      return
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }, [authToken])

  async function handleGuestSession() {
    setIsCreatingGuest(true)
    setErrorMessage(null)

    try {
      setAuthToken(await createGuestSession())
    } catch {
      setErrorMessage('游客模式暂时不可用，请稍后重试。')
    } finally {
      setIsCreatingGuest(false)
    }
  }

  function handleGitHubLogin() {
    window.location.assign(getGitHubOAuthStartUrl())
  }

  function handleSignOut() {
    setAuthToken(null)
    setErrorMessage(null)
  }

  const displayName =
    authToken?.user.display_name ?? authToken?.user.username ?? 'Guest User'

  return (
    <main className="app-shell">
      <section className="workspace-panel" aria-labelledby="app-title">
        <div className="app-header">
          <div>
            <p className="eyebrow">Vocalendar</p>
            <h1 id="app-title">日程工作台</h1>
          </div>
          <div className="api-pill" title={apiUrl}>
            API
          </div>
        </div>

        {authToken ? (
          <>
            <section className="session-panel" aria-label="当前会话">
              <div>
                <p className="section-label">当前身份</p>
                <p className="session-name">{displayName}</p>
                <p className="session-meta">
                  {authToken.user.is_guest ? '游客会话' : 'GitHub 账号'}
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={handleSignOut}
              >
                退出
              </button>
            </section>

            <EventList
              accessToken={authToken.access_token}
              key={authToken.access_token}
            />
          </>
        ) : (
          <section className="auth-panel" aria-label="登录入口">
            <div>
              <p className="section-label">开始使用</p>
              <p className="auth-copy">
                选择 GitHub 登录或游客模式，进入后即可使用你的日程数据。
              </p>
            </div>
            <div className="auth-actions">
              <button
                className="primary-button"
                type="button"
                onClick={handleGitHubLogin}
              >
                GitHub 登录
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleGuestSession}
                disabled={isCreatingGuest}
              >
                {isCreatingGuest ? '正在进入...' : '游客模式'}
              </button>
            </div>
            {errorMessage ? (
              <p className="error-message" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </section>
        )}
      </section>
    </main>
  )
}

function EventList({ accessToken }: { accessToken: string }) {
  const [eventListState, setEventListState] = useState<EventListState>(
    initialEventListState,
  )
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingEventIds, setDeletingEventIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true

    listEvents(accessToken)
      .then((nextEvents) => {
        if (isCurrent) {
          setEventListState({
            events: nextEvents,
            error: null,
          })
        }
      })
      .catch(() => {
        if (isCurrent) {
          setEventListState({
            events: [],
            error: '日程列表加载失败，请稍后重试。',
          })
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingEvents(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [accessToken])

  const { events, error: eventsError } = eventListState
  const canCreateEvent = title.trim().length > 0 && startsAt.length > 0

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreateEvent) {
      return
    }

    setIsCreatingEvent(true)
    setCreateError(null)

    try {
      const createdEvent = await createEvent(
        {
          title: title.trim(),
          starts_at: startsAt,
        },
        accessToken,
      )
      setEventListState((current) => ({
        ...current,
        events: [...current.events, createdEvent].sort(compareEventsByStart),
      }))
      setTitle('')
      setStartsAt('')
    } catch {
      setCreateError('日程创建失败，请检查内容后重试。')
    } finally {
      setIsCreatingEvent(false)
    }
  }

  async function handleDeleteEvent(eventId: number) {
    setDeleteError(null)
    setDeletingEventIds((current) => new Set(current).add(eventId))

    try {
      await deleteEvent(eventId, accessToken)
      setEventListState((current) => ({
        ...current,
        events: current.events.filter((event) => event.id !== eventId),
      }))
    } catch {
      setDeleteError('日程删除失败，请稍后重试。')
    } finally {
      setDeletingEventIds((current) => {
        const nextIds = new Set(current)
        nextIds.delete(eventId)
        return nextIds
      })
    }
  }

  return (
    <section className="events-panel" aria-labelledby="events-title">
      <div className="section-header">
        <div>
          <p className="section-label">我的日程</p>
          <h2 id="events-title">即将开始</h2>
        </div>
        <span className="event-count">{events.length}</span>
      </div>

      <form className="event-form" onSubmit={handleCreateEvent}>
        <label>
          <span>标题</span>
          <input
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：产品评审"
            required
            type="text"
            value={title}
          />
        </label>
        <label>
          <span>开始时间</span>
          <input
            name="starts_at"
            onChange={(event) => setStartsAt(event.target.value)}
            required
            type="datetime-local"
            value={startsAt}
          />
        </label>
        <button
          className="primary-button"
          disabled={!canCreateEvent || isCreatingEvent}
          type="submit"
        >
          {isCreatingEvent ? '正在创建...' : '添加日程'}
        </button>
      </form>
      {createError ? (
        <p className="error-message form-error" role="alert">
          {createError}
        </p>
      ) : null}
      {deleteError ? (
        <p className="error-message form-error" role="alert">
          {deleteError}
        </p>
      ) : null}

      {isLoadingEvents ? (
        <p className="state-message">正在加载日程...</p>
      ) : eventsError ? (
        <p className="error-message" role="alert">
          {eventsError}
        </p>
      ) : events.length > 0 ? (
        <ul className="event-list" aria-label="日程列表">
          {events.map((event) => (
            <li className="event-item" key={event.id}>
              <div>
                <p className="event-title">{event.title}</p>
                <p className="event-time">
                  {formatEventTime(event.starts_at, event.ends_at)}
                </p>
              </div>
              <div className="event-actions">
                <span className="event-status">{event.status}</span>
                <button
                  aria-label={`删除 ${event.title}`}
                  className="danger-button"
                  disabled={deletingEventIds.has(event.id)}
                  onClick={() => void handleDeleteEvent(event.id)}
                  type="button"
                >
                  {deletingEventIds.has(event.id) ? '删除中...' : '删除'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="state-message">还没有日程。</p>
      )}
    </section>
  )
}

function compareEventsByStart(first: CalendarEvent, second: CalendarEvent) {
  return (
    new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime()
  )
}

function formatEventTime(startsAt: string, endsAt: string | null): string {
  const startText = formatDateTime(startsAt)
  if (!endsAt) {
    return startText
  }

  return `${startText} - ${formatDateTime(endsAt)}`
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default App
