import { useEffect, useRef, useState } from 'react'

import { Login } from './components/Login'
import { MainHub } from './components/MainHub'
import {
  type AssistantCommandResponse,
  type AuthToken,
  type CalendarEvent,
  createEvent,
  createGuestSession,
  deleteEvent,
  disconnectGoogleCalendar,
  getCurrentUser,
  getGitHubOAuthStartUrl,
  getGoogleConnectionStatus,
  getGoogleOAuthStartUrl,
  type GoogleConnectionStatus,
  listEvents,
  sendAssistantCommand,
} from './lib/api'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { type UiCalendarEvent } from './types'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const AUTH_STORAGE_KEY = 'vocalendar.auth'
const MAX_REMINDER_DELAY_MS = 2_147_483_647
const REMINDER_SOUND_UNLOCK_ERROR = '提醒音启用失败，请与页面交互后重试。'

type EventListState = {
  events: CalendarEvent[]
  error: string | null
}

type GoogleConnectionState = {
  calendarId: string | null
  connected: boolean
  error: string | null
  isLoading: boolean
  lastSyncedAt: string | null
}

type OAuthCallbackState = {
  eventListRefreshKey: number
  errorMessage: string | null
  shouldSuppressGooglePrompt: boolean
}

type ReminderSoundState = {
  enabled: boolean
  error: string | null
  isSupported: boolean
  isUnlocking: boolean
}

type AudioContextConstructor = {
  new (): AudioContext
}

const initialEventListState: EventListState = {
  error: null,
  events: [],
}

const initialGoogleConnectionState: GoogleConnectionState = {
  calendarId: null,
  connected: false,
  error: null,
  isLoading: false,
  lastSyncedAt: null,
}

function App() {
  const oauthCallbackState = getOAuthCallbackState()
  const initialEventListRefreshKeyRef = useRef(
    oauthCallbackState.eventListRefreshKey,
  )
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
  const [isStartingGitHubLogin, setIsStartingGitHubLogin] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(
    oauthCallbackState.errorMessage,
  )
  const [eventListRefreshKey, setEventListRefreshKey] = useState(
    oauthCallbackState.eventListRefreshKey,
  )
  const [eventListState, setEventListState] = useState<EventListState>(
    initialEventListState,
  )
  const [eventListLoadingKey, setEventListLoadingKey] = useState<number | null>(
    authToken ? oauthCallbackState.eventListRefreshKey : null,
  )
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [googleConnectionState, setGoogleConnectionState] =
    useState<GoogleConnectionState>(initialGoogleConnectionState)
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(() => getInitialNotificationPermission())
  const audioContextRef = useRef<AudioContext | null>(null)
  const [reminderSoundState, setReminderSoundState] =
    useState<ReminderSoundState>(() => ({
      enabled: false,
      error: null,
      isSupported: getAudioContextConstructor() !== null,
      isUnlocking: false,
    }))
  const [isSendingCommand, setIsSendingCommand] = useState(false)
  const [assistantResponse, setAssistantResponse] =
    useState<AssistantCommandResponse | null>(null)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const voiceRecognition = useSpeechRecognition()

  useEffect(() => {
    if (authToken) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authToken))
      return
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }, [authToken])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authAccessToken = params.get('auth_access_token')
    const hasAuthError = params.has('auth_error')
    const hasGoogleCallback =
      params.has('google_connected') || params.has('google_error')

    if (!authAccessToken && !hasGoogleCallback && !hasAuthError) {
      return
    }

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('auth_access_token')
    nextUrl.searchParams.delete('auth_error')
    nextUrl.searchParams.delete('google_connected')
    nextUrl.searchParams.delete('google_error')
    window.history.replaceState({}, '', nextUrl.toString())

    if (!authAccessToken) {
      return
    }

    const requestKey = initialEventListRefreshKeyRef.current
    void getCurrentUser(authAccessToken)
      .then((user) => {
        setEventListLoadingKey(requestKey)
        setAuthToken({
          access_token: authAccessToken,
          token_type: 'bearer',
          user,
        })
        setErrorMessage(null)
      })
      .catch(() => {
        setErrorMessage('登录结果处理失败，请重试。')
      })
  }, [])

  useEffect(() => {
    if (!authToken) {
      return
    }

    const accessToken = authToken.access_token
    let isCurrent = true
    const requestKey = eventListRefreshKey

    listEvents(accessToken)
      .then((nextEvents) => {
        if (isCurrent) {
          setEventListState({
            error: null,
            events: nextEvents,
          })
        }
      })
      .catch(() => {
        if (isCurrent) {
          setEventListState({
            error: '日程列表加载失败，请稍后重试。',
            events: [],
          })
        }
      })
      .finally(() => {
        if (isCurrent) {
          setEventListLoadingKey((current) =>
            current === requestKey ? null : current,
          )
        }
      })

    return () => {
      isCurrent = false
    }
  }, [authToken, eventListRefreshKey])

  useEffect(() => {
    if (!authToken) {
      return
    }

    const accessToken = authToken.access_token
    let isCurrent = true

    async function loadGoogleConnectionStatus() {
      setGoogleConnectionState((current) => ({
        ...current,
        error: null,
        isLoading: true,
      }))

      try {
        const status = await getGoogleConnectionStatus(accessToken)
        if (!isCurrent) {
          return
        }
        setGoogleConnectionState(toGoogleConnectionState(status))
      } catch {
        if (!isCurrent) {
          return
        }
        setGoogleConnectionState({
          ...initialGoogleConnectionState,
          error: 'Google 日历状态加载失败。',
        })
      }
    }

    void loadGoogleConnectionStatus()

    return () => {
      isCurrent = false
    }
  }, [authToken, eventListRefreshKey])

  useEffect(() => {
    return () => {
      const audioContext = audioContextRef.current
      if (!audioContext) {
        return
      }
      void audioContext.close()
      audioContextRef.current = null
    }
  }, [])

  useReminderNotificationScheduler(
    eventListState.events,
    notificationPermission,
    playReminderSound,
  )

  async function handleGuestSession() {
    setIsCreatingGuest(true)
    setErrorMessage(null)

    try {
      const nextAuthToken = await createGuestSession()
      setEventListLoadingKey(eventListRefreshKey)
      setAuthToken(nextAuthToken)
    } catch {
      setErrorMessage('游客模式暂时不可用，请稍后重试。')
    } finally {
      setIsCreatingGuest(false)
    }
  }

  function handleGitHubLogin() {
    setIsStartingGitHubLogin(true)
    setErrorMessage(null)
    window.location.assign(getGitHubOAuthStartUrl(apiUrl, getCurrentPageUrl()))
  }

  function handleSignOut() {
    setAuthToken(null)
    setErrorMessage(null)
    setAssistantResponse(null)
    setAssistantError(null)
    setEventListState(initialEventListState)
    setGoogleConnectionState(initialGoogleConnectionState)
    setEventListLoadingKey(null)
  }

  function refreshEventList() {
    setEventListRefreshKey((current) => {
      const nextKey = current + 1
      setEventListLoadingKey(nextKey)
      return nextKey
    })
  }

  async function handleCreateEvent(payload: {
    reminderAt: string
    startsAt: string
    title: string
  }) {
    if (!authToken || !payload.title.trim() || !payload.startsAt) {
      return
    }

    setIsCreatingEvent(true)
    setCreateError(null)

    try {
      const createdEvent = await createEvent(
        {
          reminder_at: payload.reminderAt || null,
          starts_at: payload.startsAt,
          title: payload.title.trim(),
        },
        authToken.access_token,
      )
      setEventListState((current) => ({
        ...current,
        events: [...current.events, createdEvent].sort(compareEventsByStart),
      }))
    } catch {
      setCreateError('日程创建失败，请检查内容后重试。')
    } finally {
      setIsCreatingEvent(false)
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!authToken) {
      return
    }

    const numericEventId = Number(eventId)
    setDeleteError(null)
    setDeletingEventId(eventId)

    try {
      await deleteEvent(numericEventId, authToken.access_token)
      setEventListState((current) => ({
        ...current,
        events: current.events.filter((event) => event.id !== numericEventId),
      }))
    } catch {
      setDeleteError('日程删除失败，请稍后重试。')
    } finally {
      setDeletingEventId(null)
    }
  }

  async function handleAssistantCommand(commandText: string) {
    if (!authToken) {
      return
    }

    const normalizedCommandText = commandText.trim()
    if (!normalizedCommandText) {
      return
    }

    setIsSendingCommand(true)
    setAssistantError(null)

    try {
      const response = await sendAssistantCommand(
        normalizedCommandText,
        authToken.access_token,
      )
      setAssistantResponse(response)
      if (shouldRefreshEventsAfterAssistantResponse(response)) {
        refreshEventList()
      }
    } catch {
      setAssistantError('助手命令执行失败，请稍后重试。')
    } finally {
      setIsSendingCommand(false)
    }
  }

  async function handleGoogleCalendarConnect() {
    if (!authToken) {
      return
    }

    setGoogleConnectionState((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }))

    try {
      const authorizationUrl = await getGoogleOAuthStartUrl(
        authToken.access_token,
        getCurrentPageUrl(),
      )
      window.location.assign(authorizationUrl)
    } catch {
      setGoogleConnectionState((current) => ({
        ...current,
        error: 'Google 授权启动失败。',
        isLoading: false,
      }))
    }
  }

  async function handleGoogleCalendarDisconnect() {
    if (!authToken) {
      return
    }

    setGoogleConnectionState((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }))

    try {
      await disconnectGoogleCalendar(authToken.access_token)
      setGoogleConnectionState(initialGoogleConnectionState)
    } catch {
      setGoogleConnectionState((current) => ({
        ...current,
        error: 'Google 日历断开失败。',
        isLoading: false,
      }))
    }
  }

  async function handleRequestNotificationPermission() {
    if (!('Notification' in window) || notificationPermission !== 'default') {
      return
    }

    setNotificationPermission(await window.Notification.requestPermission())
  }

  async function playReminderSound() {
    const audioContext = audioContextRef.current
    if (!audioContext) {
      return
    }

    try {
      if (audioContext.state !== 'running') {
        await audioContext.resume()
      }
      scheduleReminderSound(audioContext)
      setReminderSoundState((current) => ({
        ...current,
        error: null,
      }))
    } catch {
      setReminderSoundState((current) => ({
        ...current,
        enabled: false,
        error: REMINDER_SOUND_UNLOCK_ERROR,
      }))
    }
  }

  async function handleEnableReminderSound() {
    const AudioContextCtor = getAudioContextConstructor()
    if (!AudioContextCtor) {
      setReminderSoundState({
        enabled: false,
        error: '当前浏览器不支持提醒音。',
        isSupported: false,
        isUnlocking: false,
      })
      return
    }

    setReminderSoundState((current) => ({
      ...current,
      error: null,
      isUnlocking: true,
    }))

    try {
      const audioContext = audioContextRef.current ?? new AudioContextCtor()
      audioContextRef.current = audioContext
      if (audioContext.state !== 'running') {
        await audioContext.resume()
      }
      setReminderSoundState({
        enabled: true,
        error: null,
        isSupported: true,
        isUnlocking: false,
      })
    } catch {
      setReminderSoundState({
        enabled: false,
        error: REMINDER_SOUND_UNLOCK_ERROR,
        isSupported: true,
        isUnlocking: false,
      })
    }
  }

  const uiEvents = eventListState.events.map(toUiCalendarEvent)
  const isLoadingEvents = eventListLoadingKey !== null

  if (!authToken) {
    return (
      <Login
        errorMessage={errorMessage}
        isCreatingGuest={isCreatingGuest}
        isStartingGitHubLogin={isStartingGitHubLogin}
        onGitHubLogin={handleGitHubLogin}
        onGuestSession={() => void handleGuestSession()}
      />
    )
  }

  return (
    <MainHub
      assistantError={assistantError}
      assistantResponse={assistantResponse}
      canCreateEvent={Boolean(authToken)}
      createError={createError}
      deletingEventId={deletingEventId}
      deleteError={deleteError}
      events={uiEvents}
      googleConnectionState={googleConnectionState}
      shouldPromptGoogleCalendar={
        !oauthCallbackState.shouldSuppressGooglePrompt
      }
      isCreatingEvent={isCreatingEvent}
      isGuest={authToken.user.is_guest}
      isLoadingEvents={isLoadingEvents}
      isSendingCommand={isSendingCommand}
      listError={eventListState.error}
      notificationPermission={notificationPermission}
      onCreateEvent={(payload) => void handleCreateEvent(payload)}
      onDeleteEvent={(eventId) => void handleDeleteEvent(eventId)}
      onDisconnectGoogleCalendar={() => void handleGoogleCalendarDisconnect()}
      onEnableReminderSound={() => void handleEnableReminderSound()}
      onGoogleCalendarConnect={() => void handleGoogleCalendarConnect()}
      onRequestNotificationPermission={() => void handleRequestNotificationPermission()}
      onSendAssistantCommand={(commandText) => void handleAssistantCommand(commandText)}
      onSignOut={handleSignOut}
      onStartListening={voiceRecognition.start}
      onStopListening={voiceRecognition.stop}
      onTestReminderSound={() => void playReminderSound()}
      reminderSoundState={reminderSoundState}
      user={authToken.user}
      voiceState={{
        errorMessage: voiceRecognition.errorMessage,
        interimTranscript: voiceRecognition.interimTranscript,
        isListening: voiceRecognition.isListening,
        isSupported: voiceRecognition.isSupported,
        status: voiceRecognition.status,
        transcript: voiceRecognition.transcript,
      }}
    />
  )
}

function shouldRefreshEventsAfterAssistantResponse(
  response: AssistantCommandResponse,
): boolean {
  return (
    response.event !== undefined &&
    (response.action === 'add_event' || response.action === 'delete_event')
  )
}

function toGoogleConnectionState(
  status: GoogleConnectionStatus,
): GoogleConnectionState {
  return {
    calendarId: status.calendar_id ?? null,
    connected: status.connected,
    error: status.sync_error ?? null,
    isLoading: false,
    lastSyncedAt: status.last_synced_at ?? null,
  }
}

function getInitialNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied'
  }
  return window.Notification.permission
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const audioWindow = window as Window & {
    webkitAudioContext?: AudioContextConstructor
  }
  if ('AudioContext' in window) {
    return window.AudioContext as AudioContextConstructor
  }
  return audioWindow.webkitAudioContext ?? null
}

function getCurrentPageUrl(): string {
  const fallback =
    (typeof window.location.href === 'string' && window.location.href) ||
    (typeof window.location.origin === 'string' && window.location.origin) ||
    'http://localhost/'
  const url = new URL(fallback)
  url.search = ''
  url.hash = ''
  return url.toString()
}

function getOAuthCallbackState(): OAuthCallbackState {
  const params = new URLSearchParams(window.location.search)
  if (params.get('auth_error')) {
    return {
      eventListRefreshKey: 0,
      errorMessage: 'GitHub 登录失败，请重试。',
      shouldSuppressGooglePrompt: false,
    }
  }
  if (params.get('google_error')) {
    return {
      eventListRefreshKey: 0,
      errorMessage: 'Google 日历同步失败，请稍后重试。',
      shouldSuppressGooglePrompt: true,
    }
  }
  const hasGoogleConnectedCallback = params.get('google_connected') === '1'
  return {
    eventListRefreshKey: hasGoogleConnectedCallback ? 1 : 0,
    errorMessage: null,
    shouldSuppressGooglePrompt: hasGoogleConnectedCallback,
  }
}

function useReminderNotificationScheduler(
  events: CalendarEvent[],
  permission: NotificationPermission,
  onReminderTriggered: () => Promise<void>,
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
        void onReminderTriggered()
      }, delay)
      return [timeoutId]
    })

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [events, onReminderTriggered, permission])
}

function toUiCalendarEvent(event: CalendarEvent): UiCalendarEvent {
  return {
    color: getEventColor(event.id),
    dateStr: getRelativeDateLabel(event.starts_at),
    endTime: event.ends_at ? formatClock(event.ends_at) : '',
    hasMeetingLink: false,
    id: String(event.id),
    location: event.source_text ?? event.status,
    reminderText: event.reminder_at ? formatReminderTime(event.reminder_at) : null,
    startTime: event.ends_at
      ? `${formatClock(event.starts_at)} - ${formatClock(event.ends_at)}`
      : formatClock(event.starts_at),
    status: event.status,
    title: event.title,
  }
}

function getEventColor(eventId: number): string {
  const colors = ['bg-[#7AA68B]', 'bg-[#E6935C]', 'bg-blue-500', 'bg-emerald-500']
  return colors[eventId % colors.length]
}

function getRelativeDateLabel(value: string): string {
  const eventDate = new Date(value)
  const today = startOfDay(new Date())
  const target = startOfDay(eventDate)
  const dayDifference = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  )

  if (dayDifference === 0) {
    return 'Today'
  }
  if (dayDifference === 1) {
    return 'Tomorrow'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    month: '2-digit',
  }).format(eventDate)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
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

function formatReminderTime(reminderAt: string): string {
  return `提醒：${formatDateTime(reminderAt)}`
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

function formatClock(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function scheduleReminderSound(audioContext: AudioContext) {
  const beepOffsets = [0, 0.22, 0.44]
  const frequencies = [880, 1174, 1568]
  const startAt = audioContext.currentTime + 0.02

  for (const [index, offset] of beepOffsets.entries()) {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const beepStart = startAt + offset
    const beepEnd = beepStart + 0.16

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(
      frequencies[index % frequencies.length],
      beepStart,
    )
    gainNode.gain.setValueAtTime(0.0001, beepStart)
    gainNode.gain.linearRampToValueAtTime(0.22, beepStart + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, beepEnd)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(beepStart)
    oscillator.stop(beepEnd)
  }
}

export default App
