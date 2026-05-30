import { type FormEvent, useEffect, useRef, useState } from 'react'

import './App.css'
import {
  type AuthToken,
  type CalendarEvent,
  createEvent,
  createGuestSession,
  deleteEvent,
  getGitHubOAuthStartUrl,
  listEvents,
  sendAssistantCommand,
  type AssistantCommandResponse,
} from './lib/api'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'

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

const MAX_REMINDER_DELAY_MS = 2_147_483_647

function getInitialNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied'
  }
  return window.Notification.permission
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
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(() => getInitialNotificationPermission())

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
              notificationPermission={notificationPermission}
            />
            <VoiceInputControl />
            <AssistantPanel accessToken={authToken.access_token} />
            <NotificationPermissionPanel
              permission={notificationPermission}
              setPermission={setNotificationPermission}
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

function NotificationPermissionPanel({
  permission,
  setPermission,
}: {
  permission: NotificationPermission
  setPermission: (permission: NotificationPermission) => void
}) {
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const isSupported = 'Notification' in window
  const canRequestPermission = isSupported && permission === 'default'

  async function handleRequestPermission() {
    if (!canRequestPermission) {
      return
    }

    setIsRequestingPermission(true)
    try {
      setPermission(await window.Notification.requestPermission())
    } finally {
      setIsRequestingPermission(false)
    }
  }

  return (
    <section className="notification-panel" aria-labelledby="notification-title">
      <div className="section-header">
        <div>
          <p className="section-label">浏览器通知</p>
          <h2 id="notification-title">提醒权限</h2>
        </div>
        <span className="notification-status">
          {getNotificationStatusText(isSupported, permission)}
        </span>
      </div>
      <button
        className="secondary-button"
        disabled={!canRequestPermission || isRequestingPermission}
        onClick={() => void handleRequestPermission()}
        type="button"
      >
        {isRequestingPermission ? '请求中...' : '请求通知权限'}
      </button>
    </section>
  )
}

function AssistantPanel({ accessToken }: { accessToken: string }) {
  const [commandText, setCommandText] = useState('')
  const [isSendingCommand, setIsSendingCommand] = useState(false)
  const [assistantResponse, setAssistantResponse] =
    useState<AssistantCommandResponse | null>(null)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const canSendCommand = commandText.trim().length > 0

  async function handleAssistantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSendCommand) {
      return
    }

    setIsSendingCommand(true)
    setAssistantError(null)

    try {
      setAssistantResponse(await sendAssistantCommand(commandText.trim(), accessToken))
      setCommandText('')
    } catch {
      setAssistantError('助手命令执行失败，请稍后重试。')
    } finally {
      setIsSendingCommand(false)
    }
  }

  return (
    <section className="assistant-panel" aria-labelledby="assistant-title">
      <div className="section-header">
        <div>
          <p className="section-label">助手</p>
          <h2 id="assistant-title">命令结果</h2>
        </div>
        {assistantResponse ? (
          <span className="assistant-action">{assistantResponse.action}</span>
        ) : null}
      </div>
      <form className="assistant-form" onSubmit={handleAssistantSubmit}>
        <label>
          <span>文本命令</span>
          <input
            name="assistant-command"
            onChange={(event) => setCommandText(event.target.value)}
            placeholder="例如：查看今天提醒"
            type="text"
            value={commandText}
          />
        </label>
        <button
          className="primary-button"
          disabled={!canSendCommand || isSendingCommand}
          type="submit"
        >
          {isSendingCommand ? '执行中...' : '执行'}
        </button>
      </form>
      {assistantError ? (
        <p className="error-message form-error" role="alert">
          {assistantError}
        </p>
      ) : null}
      {assistantResponse ? (
        <div className="assistant-result" aria-live="polite">
          <p>{assistantResponse.message ?? getAssistantFallbackMessage(assistantResponse)}</p>
          {assistantResponse.event ? (
            <AssistantEventSummary event={assistantResponse.event} />
          ) : null}
          {assistantResponse.events && assistantResponse.events.length > 0 ? (
            <ul className="assistant-event-list" aria-label="助手返回日程">
              {assistantResponse.events.map((event) => (
                <li key={event.id}>
                  <AssistantEventSummary event={event} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="state-message">还没有助手回复。</p>
      )}
    </section>
  )
}

function AssistantEventSummary({
  event,
}: {
  event: NonNullable<AssistantCommandResponse['event']>
}) {
  return (
    <div className="assistant-event">
      <p className="event-title">{event.title}</p>
      <p className="event-time">{formatEventTime(event.starts_at, event.ends_at ?? null)}</p>
    </div>
  )
}

function getAssistantFallbackMessage(response: AssistantCommandResponse): string {
  if (response.action === 'unknown') {
    return '暂未识别该命令。'
  }
  return '命令已解析。'
}

function getNotificationStatusText(
  isSupported: boolean,
  permission: NotificationPermission,
): string {
  if (!isSupported) {
    return '不支持'
  }
  if (permission === 'granted') {
    return '已允许'
  }
  if (permission === 'denied') {
    return '已拒绝'
  }
  return '未决定'
}

function VoiceInputControl() {
  const {
    errorMessage,
    interimTranscript,
    isListening,
    isSupported,
    start,
    status,
    stop,
    transcript,
  } = useSpeechRecognition()
  const hasTranscript = transcript.length > 0 || interimTranscript.length > 0

  function handleToggleListening() {
    if (isListening) {
      stop()
      return
    }

    start()
  }

  return (
    <section className="voice-panel" aria-labelledby="voice-title">
      <div className="section-header">
        <div>
          <p className="section-label">语音输入</p>
          <h2 id="voice-title">麦克风</h2>
        </div>
        <span className="voice-status">{getVoiceStatusText(status)}</span>
      </div>
      <button
        className="voice-button"
        disabled={!isSupported}
        onClick={handleToggleListening}
        type="button"
      >
        {isListening ? '停止识别' : '开始识别'}
      </button>
      {errorMessage ? (
        <p className="error-message voice-message" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <p className="voice-transcript" aria-live="polite">
        {hasTranscript ? (
          <>
            {transcript}
            {interimTranscript ? (
              <span className="interim-transcript">{interimTranscript}</span>
            ) : null}
          </>
        ) : (
          '等待语音输入。'
        )}
      </p>
    </section>
  )
}

function EventList({
  accessToken,
  notificationPermission,
}: {
  accessToken: string
  notificationPermission: NotificationPermission
}) {
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
  useReminderNotificationScheduler(events, notificationPermission)

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

function getVoiceStatusText(status: string): string {
  switch (status) {
    case 'listening':
      return '识别中'
    case 'unsupported':
      return '不支持'
    case 'error':
      return '异常'
    default:
      return '待机'
  }
}

function useReminderNotificationScheduler(
  events: CalendarEvent[],
  permission: NotificationPermission,
) {
  const notifiedEventIdsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!('Notification' in window) || permission !== 'granted') {
      return
    }

    const timeoutIds = events.flatMap((event) => {
      if (notifiedEventIdsRef.current.has(event.id)) {
        return []
      }

      const notifyAt = event.reminder_at ?? event.starts_at
      const delay = new Date(notifyAt).getTime() - Date.now()
      if (Number.isNaN(delay) || delay < 0 || delay > MAX_REMINDER_DELAY_MS) {
        return []
      }

      const timeoutId = window.setTimeout(() => {
        if (notifiedEventIdsRef.current.has(event.id)) {
          return
        }

        new window.Notification(event.title, {
          body: formatEventTime(event.starts_at, event.ends_at),
          tag: `vocalendar-event-${event.id}`,
        })
        notifiedEventIdsRef.current.add(event.id)
      }, delay)
      return [timeoutId]
    })

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [events, permission])
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
