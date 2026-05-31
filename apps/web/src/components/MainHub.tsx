import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  Clock,
  Headphones,
  Lightbulb,
  LogOut,
  RefreshCw,
  Send,
  Sun,
  Volume2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

import bgImage from '../assets/images/calendar-bg.png'
import { type AssistantCommandResponse, type AuthUser } from '../lib/api'
import { type UiCalendarEvent } from '../types'
import { CalendarDrawer } from './CalendarDrawer'
import { VoiceOrb } from './VoiceOrb'

const SCHEDULE_CHECK_INTERVAL_MS = 30_000
const SCHEDULE_TRIGGER_WINDOW_MS = 30_000
const COMMAND_HINTS = [
  { icon: 'calendar', text: '添加提醒 2026-06-01 09:30 产品评审' },
  { icon: 'calendar', text: '明天下午3点和张三开会' },
  { icon: 'calendar', text: '下周三上午10点产品评审' },
  { icon: 'calendar', text: '明天下午3点提前15分钟提醒我开会' },
  { icon: 'clock', text: '帮我定一个3分钟后的闹钟' },
  { icon: 'clock', text: '查看今天提醒' },
  { icon: 'clock', text: '明天有哪些日程？' },
  { icon: 'clock', text: '下周三有什么安排？' },
  { icon: 'list', text: '删除提醒 产品评审' },
  { icon: 'list', text: '删除明天的产品评审提醒' },
  { icon: 'list', text: '把刚刚添加的闹钟删掉' },
  { icon: 'list', text: '把刚刚那个响铃的日程给删掉' },
] as const

const COMMAND_HINT_COUNT = 3

type GoogleConnectionViewState = {
  calendarId: string | null
  connected: boolean
  error: string | null
  hasLoaded: boolean
  isLoading: boolean
  lastSyncedAt: string | null
}

type ReminderSoundViewState = {
  enabled: boolean
  error: string | null
  isSupported: boolean
  isUnlocking: boolean
}

type VoiceViewState = {
  errorMessage: string | null
  interimTranscript: string
  isListening: boolean
  isSupported: boolean
  status: string
  transcript: string
}

type ReminderHint = {
  eventId: string
  title: string
}

type ReminderToast = {
  eventId: string
  startTime: string
  title: string
}

type MainHubProps = {
  assistantError: string | null
  assistantResponse: AssistantCommandResponse | null
  canCreateEvent: boolean
  createError: string | null
  currentTimeMs: number
  deletingEventId: string | null
  deleteError: string | null
  events: UiCalendarEvent[]
  googleConnectionState: GoogleConnectionViewState
  isCreatingEvent: boolean
  isGuest: boolean
  isLoadingEvents: boolean
  isSendingCommand: boolean
  listError: string | null
  notificationPermission: NotificationPermission
  onCreateEvent: (payload: {
    reminderAt: string
    startsAt: string
    title: string
  }) => void
  onDeleteEvent: (eventId: string) => void
  onDisconnectGoogleCalendar: () => void
  onEnableReminderSound: () => void
  onGoogleCalendarConnect: () => void
  onRequestNotificationPermission: () => void
  onSendAssistantCommand: (commandText: string) => void
  onSignOut: () => void
  onStartListening: () => void
  onStopListening: () => void
  onTestReminderSound: () => void
  reminderSoundState: ReminderSoundViewState
  shouldPromptGoogleCalendar: boolean
  user: AuthUser
  voiceState: VoiceViewState
}

export function MainHub({
  assistantError,
  assistantResponse,
  canCreateEvent,
  createError,
  currentTimeMs,
  deletingEventId,
  deleteError,
  events,
  googleConnectionState,
  isCreatingEvent,
  isGuest,
  isLoadingEvents,
  isSendingCommand,
  listError,
  notificationPermission,
  onCreateEvent,
  onDeleteEvent,
  onDisconnectGoogleCalendar,
  onEnableReminderSound,
  onGoogleCalendarConnect,
  onRequestNotificationPermission,
  onSendAssistantCommand,
  onSignOut,
  onStartListening,
  onStopListening,
  onTestReminderSound,
  reminderSoundState,
  shouldPromptGoogleCalendar,
  user,
  voiceState,
}: MainHubProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isGoogleModalManuallyOpen, setIsGoogleModalManuallyOpen] =
    useState(false)
  const [hasDismissedGooglePrompt, setHasDismissedGooglePrompt] =
    useState(false)
  const [commandText, setCommandText] = useState('')
  const [commandHintStartIndex, setCommandHintStartIndex] = useState(0)
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [activeReminderIds, setActiveReminderIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [completedReminderIds, setCompletedReminderIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [triggeredReminderIds, setTriggeredReminderIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [reminderHints, setReminderHints] = useState<ReminderHint[]>([])
  const [reminderToast, setReminderToast] = useState<ReminderToast | null>(null)
  const highlightedEventId = assistantResponse?.event?.id
    ? String(assistantResponse.event.id)
    : null
  const highlightedEventIds = useMemo(() => {
    if (assistantResponse?.action !== 'list_events') {
      return []
    }
    return (assistantResponse.events ?? []).map((event) => String(event.id))
  }, [assistantResponse])
  const todayEvents = useMemo(
    () => events.filter((event) => event.dateStr === 'Today'),
    [events],
  )
  const displayName = user.display_name ?? user.username ?? 'Guest User'
  const visibleVoiceCommand = [voiceState.transcript, voiceState.interimTranscript]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
  const hasVoiceText = visibleVoiceCommand.length > 0
  const canSendTypedCommand = commandText.trim().length > 0 && !isSendingCommand
  const canSendVoiceCommand = visibleVoiceCommand.length > 0 && !isSendingCommand
  const notificationStatus = getNotificationStatusText(notificationPermission)
  const voiceButtonLabel = voiceState.isListening ? '停止识别' : '开始识别'
  const canRequestNotificationPermission =
    'Notification' in window && notificationPermission === 'default'
  const isGoogleModalVisible =
    !googleConnectionState.connected &&
    (isGoogleModalManuallyOpen ||
      (shouldPromptGoogleCalendar && !isGuest && !hasDismissedGooglePrompt))

  useEffect(() => {
    function checkScheduleReminders() {
      const nowMs = Date.now()

      for (const event of todayEvents) {
        const startsAtMs = new Date(event.startsAt).getTime()
        if (Number.isNaN(startsAtMs)) {
          continue
        }

        if (completedReminderIds.has(event.id)) {
          continue
        }

        if (
          isSameMinute(nowMs, startsAtMs) &&
          !triggeredReminderIds.has(event.id)
        ) {
          setTriggeredReminderIds((current) => new Set(current).add(event.id))
          setActiveReminderIds((current) => new Set(current).add(event.id))
          setReminderHints((current) => {
            if (current.some((hint) => hint.eventId === event.id)) {
              return current
            }
            return [{ eventId: event.id, title: event.title }, ...current]
          })
          setReminderToast({
            eventId: event.id,
            startTime: event.startTime,
            title: event.title,
          })
          if (reminderSoundState.enabled) {
            onTestReminderSound()
          }
        }

        if (nowMs >= getEventCompletionTimeMs(event)) {
          setActiveReminderIds((current) => {
            if (!current.has(event.id)) {
              return current
            }
            const next = new Set(current)
            next.delete(event.id)
            return next
          })
          setCompletedReminderIds((current) => new Set(current).add(event.id))
          setReminderToast((current) =>
            current?.eventId === event.id ? null : current,
          )
        }
      }
    }

    checkScheduleReminders()
    const intervalId = window.setInterval(
      checkScheduleReminders,
      SCHEDULE_CHECK_INTERVAL_MS,
    )
    return () => window.clearInterval(intervalId)
  }, [
    completedReminderIds,
    onTestReminderSound,
    reminderSoundState.enabled,
    todayEvents,
    triggeredReminderIds,
  ])

  function handleOrbClick() {
    if (!voiceState.isSupported) {
      return
    }
    if (voiceState.isListening) {
      onStopListening()
      return
    }
    onStartListening()
  }

  function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedCommandText = commandText.trim()
    if (!normalizedCommandText) {
      return
    }

    handleAssistantCommandSend(normalizedCommandText)
    setCommandText('')
  }

  function handleAssistantCommandSend(command: string) {
    if (isListCommandText(command)) {
      setIsDrawerOpen(true)
    }
    onSendAssistantCommand(command)
  }

  async function handleNotificationPermissionRequest() {
    setIsRequestingPermission(true)
    try {
      await onRequestNotificationPermission()
    } finally {
      setIsRequestingPermission(false)
    }
  }

  function acknowledgeReminder(eventId: string) {
    setActiveReminderIds((current) => {
      const next = new Set(current)
      next.delete(eventId)
      return next
    })
    setCompletedReminderIds((current) => new Set(current).add(eventId))
    setReminderToast((current) =>
      current?.eventId === eventId ? null : current,
    )
  }

  return (
    <div className="relative flex h-screen max-h-screen flex-col justify-between overflow-hidden bg-[#F2EDE4] font-sans">
      <div className="pointer-events-none absolute inset-0 z-0 h-full w-full">
        <div
          className="h-full w-full bg-cover bg-center bg-no-repeat opacity-80"
          style={{ backgroundImage: `url(${bgImage})`, backgroundPosition: 'center 60%' }}
        />
        <div className="absolute inset-0 bg-[#F6EEDF]/50 backdrop-blur-[1px]" />
      </div>

      <header className="relative z-10 flex w-full shrink-0 items-center justify-between px-6 pt-6 sm:px-12">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
            <span className="font-serif text-2xl font-bold text-[#3D362D]">V</span>
          </div>
          <span className="text-[26px] font-semibold tracking-tight text-[#332F2A]">
            Vocalendar
          </span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <button
            aria-label="打开日历"
            className="rounded-full p-2 text-[#7A7268] transition-colors hover:text-[#5D554D]"
            onClick={() => setIsDrawerOpen((current) => !current)}
            type="button"
          >
            <CalendarIcon className="h-[22px] w-[22px] stroke-[1.5]" />
          </button>

          <div className="hidden flex-col items-end sm:flex">
            <span className="text-[10px] uppercase tracking-[0.1em] text-[#9A9287]">Status</span>
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  googleConnectionState.connected ? 'bg-[#7AA68B]' : 'bg-[#C1B7AA]'
                }`}
              />
              <span className="text-sm font-medium text-[#5D554D]">
                {googleConnectionState.connected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
          </div>

          <button
            aria-label="退出"
            className="rounded-full p-1.5 text-[#7A7268] transition-colors hover:text-[#5D554D]"
            onClick={onSignOut}
            title="退出"
            type="button"
          >
            <LogOut className="h-[22px] w-[22px] stroke-[1.5]" />
          </button>
          {user.avatar_url ? (
            <img
              alt={displayName}
              className="hidden h-11 w-11 rounded-full border-2 border-white/80 object-cover shadow-[0_2px_8px_rgba(0,0,0,0.05)] sm:block"
              src={user.avatar_url}
            />
          ) : null}
        </div>
      </header>

      <main className="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-4 md:px-12">
        <div className="mb-6 flex shrink-0 flex-col items-center text-center">
          <div className="mb-1.5 flex items-center gap-3">
            <Sun className="h-7 w-7 stroke-[1.5] text-[#E6935C]" />
            <h2 className="font-serif text-[32px] tracking-wide text-[#3D362D]">
              Hello, {getTimeGreeting()}!
            </h2>
          </div>
          <p className="mt-1 text-[14px] font-light tracking-widest text-[#554E48]">
            点击下方麦克风，或告诉我你的日程安排
          </p>
        </div>

        <div className="flex w-full max-w-[1240px] flex-col items-center justify-center gap-6 lg:flex-row lg:gap-8 xl:gap-14">
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="hidden w-[230px] shrink-0 flex-col rounded-[32px] border border-white/60 bg-[#F9F5EE] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.03)] lg:-mt-12 lg:flex xl:w-[280px] xl:p-6"
            initial={{ opacity: 0, x: -20 }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-5 flex items-center gap-2 text-[#72A684]">
              <Lightbulb className="h-4 w-4 stroke-2" />
              <h4 className="text-[14px] font-semibold tracking-wide text-[#3D362D]">演示教程</h4>
            </div>

            <div className="space-y-3">
              {reminderHints.map((hint) => (
                <div
                  className="rounded-[20px] border border-[#B7D8C4]/70 bg-white/55 p-3 text-[13px] leading-relaxed text-[#4F6858] shadow-[0_8px_28px_rgba(122,166,139,0.16)] backdrop-blur-md"
                  key={hint.eventId}
                >
                  💡 提醒：您的 <span className="font-semibold">{hint.title}</span> 已经到时间了。
                </div>
              ))}
              {getVisibleCommandHints(commandHintStartIndex).map((hint) => (
                <CommandHint
                  icon={getCommandHintIcon(hint.icon)}
                  key={hint.text}
                  text={hint.text}
                />
              ))}
            </div>

            <button
              className="mt-5 flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#72A684] transition-colors hover:text-[#5C896C]"
              onClick={() =>
                setCommandHintStartIndex(
                  (current) => (current + COMMAND_HINT_COUNT) % COMMAND_HINTS.length,
                )
              }
              type="button"
            >
              换一换
              <RefreshCw className="h-3 w-3" />
            </button>
          </motion.div>

          <div className="relative mb-6 flex min-w-[300px] shrink-0 flex-col items-center lg:mb-0 lg:mt-2 xl:min-w-[340px]">
            <div className="absolute left-[-20px] top-[30%] flex items-center gap-1 opacity-60 xl:left-[-40px]">
              {[1, 2, 4, 2, 5, 3, 1, 2, 1].map((height, index) => (
                <div
                  className="w-[3px] rounded-full bg-[#B2CFBC]"
                  key={index}
                  style={{ height: `${height * 4}px` }}
                />
              ))}
            </div>
            <div className="absolute right-[-20px] top-[30%] flex items-center gap-1 opacity-60 xl:right-[-40px]">
              {[1, 2, 3, 5, 2, 4, 2, 1, 1].map((height, index) => (
                <div
                  className="w-[3px] rounded-full bg-[#B2CFBC]"
                  key={index}
                  style={{ height: `${height * 4}px` }}
                />
              ))}
            </div>

            <div className="-my-10 flex scale-75 items-center justify-center lg:-my-8 lg:scale-90 xl:-my-4 xl:scale-[0.95]">
              <VoiceOrb
                isActive={voiceState.isListening || isSendingCommand}
                isGuest={isGuest}
                label={voiceButtonLabel}
                onClick={handleOrbClick}
              />
            </div>

            <GoogleStatusCapsule
              currentTimeMs={currentTimeMs}
              googleConnectionState={googleConnectionState}
              onConnect={() => setIsGoogleModalManuallyOpen(true)}
            />

            <form
              className="mt-4 flex w-[min(92vw,420px)] items-center gap-2 rounded-[100px] border border-white bg-[#F2F4ED] px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
              onSubmit={handleCommandSubmit}
            >
              <input
                aria-label="文本命令"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#3D362D] outline-none placeholder:text-[#9A9287]"
                onChange={(event) => setCommandText(event.target.value)}
                placeholder="例如：查看今天提醒"
                value={commandText}
              />
              <button
                aria-label="执行"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#87C0A0] text-white transition hover:bg-[#78B492] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSendTypedCommand}
                type="submit"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            <div className="mt-3 min-h-[72px] w-[min(92vw,420px)] rounded-[24px] border border-white/80 bg-[#FAF8F5]/90 px-5 py-4 text-center shadow-[0_6px_24px_rgba(0,0,0,0.03)]">
              <p className="text-sm font-medium text-[#5D554D]" aria-live="polite">
                {hasVoiceText ? (
                  isSendingCommand || assistantResponse ? (
                    assistantResponse ? (
                      assistantResponse.message ?? getAssistantFallbackMessage(assistantResponse)
                    ) : (
                      '正在执行命令...'
                    )
                  ) : (
                  <>
                    {voiceState.transcript}
                    {voiceState.interimTranscript ? (
                      <span className="text-[#9A9287]">{voiceState.interimTranscript}</span>
                    ) : null}
                  </>
                  )
                ) : assistantResponse ? (
                  assistantResponse.message ?? getAssistantFallbackMessage(assistantResponse)
                ) : (
                  getVoiceStatusText(voiceState.status)
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  className="rounded-full border border-[#E4DDD2] bg-white px-3 py-1.5 text-xs font-semibold text-[#5D554D] transition hover:text-[#3D362D] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canSendVoiceCommand}
                  onClick={() => handleAssistantCommandSend(visibleVoiceCommand)}
                  type="button"
                >
                  {isSendingCommand ? '执行中...' : '执行语音命令'}
                </button>
                {voiceState.errorMessage ? (
                  <span className="text-xs font-medium text-red-600" role="alert">
                    {voiceState.errorMessage}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <motion.div
            animate={{ opacity: 1, x: 32 }}
            className="hidden w-[250px] shrink-0 flex-col rounded-[32px] border border-white/60 bg-[#F9F5EE] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.03)] lg:-mt-12 lg:flex xl:w-[320px] xl:p-6"
            initial={{ opacity: 0, x: 52 }}
            transition={{ delay: 0.3 }}
          >
            <div className="mb-4 flex items-center gap-2 text-[#9A9287]">
              <CalendarIcon className="h-4 w-4 stroke-2" />
              <h4 className="text-[14px] font-semibold tracking-wide text-[#3D362D]">今日概览</h4>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] tracking-wider text-[#9A9287] before:h-1 before:w-1 before:rounded-full before:bg-[#D4CECBC2]">
                  今日日期 · Today
                </div>
                <div className="text-[18px] font-semibold text-[#3D362D]">
                  {formatTodayDate()}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#DBE7D9]/80 bg-[#EAF1E7] p-2.5 text-[12px] font-medium text-[#55695D]">
                  <CheckCircle2 className="h-4 w-4 text-[#7AA68B]" />
                  今天一切顺利！
                </div>
              </div>

              <div className="border-t border-[#EAE4DC] pt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] tracking-wider text-[#9A9287] before:h-1 before:w-1 before:rounded-full before:bg-[#D4CECBC2]">
                  今日日程 · Today
                </div>
                <div className="mb-3 text-[15px] font-semibold text-[#3D362D]">
                  <span className="sr-only">{todayEvents.length}</span>
                  {todayEvents.length} 个日程安排
                </div>

                <div className="space-y-2.5">
                  {todayEvents.slice(0, 3).map((event) => {
                    const isReminderActive = activeReminderIds.has(event.id)
                    const isReminderCompleted = completedReminderIds.has(event.id)

                    return (
                      <div
                        aria-label={`${event.startTime} ${event.title}`}
                        className={[
                          'flex gap-2.5 rounded-2xl border p-3 shadow-[0_4px_16px_rgba(0,0,0,0.015)] transition',
                          isReminderActive
                            ? 'animate-pulse border-[#7AA68B] bg-white'
                            : 'border-[#EBE3D7]/50 bg-white',
                          isReminderCompleted ? 'opacity-55 grayscale' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        key={event.id}
                      >
                        <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${event.color}`} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[11px] font-medium leading-none text-[#9A9287]">
                            {event.startTime}
                          </span>
                          <span
                            aria-hidden="true"
                            className="mb-0.5 mt-1 truncate text-[14px] font-semibold leading-tight text-[#3D362D]"
                          >
                            <SplitText text={event.title} />
                          </span>
                          <span className="truncate text-[11px] leading-none text-[#9A9287]">
                            <SplitText text={event.location ?? event.status ?? 'scheduled'} />
                          </span>
                          {event.syncText ? (
                            <span className="mt-1 truncate text-[10px] leading-none text-[#7AA68B]">
                              <SplitText text={event.syncText} />
                            </span>
                          ) : null}
                          {isReminderActive ? (
                            <button
                              className="mt-2 w-max rounded-full border border-[#B7D8C4] bg-[#F2F7F3] px-2.5 py-1 text-[10px] font-semibold text-[#5F8B6E] transition hover:bg-[#E6F1EA]"
                              onClick={() => acknowledgeReminder(event.id)}
                              type="button"
                            >
                              我知道了
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                  {todayEvents.length === 0 ? (
                    <p className="rounded-2xl bg-white px-3 py-4 text-center text-[12px] text-[#9A9287]">
                      今天还没有日程。
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-[#EAE4DC] pt-4">
                <ControlRow
                  icon={<Headphones className="h-4 w-4" />}
                  label="浏览器通知"
                  value={notificationStatus}
                />
                <ControlRow
                  icon={<Volume2 className="h-4 w-4" />}
                  label="提醒声音"
                  value={getReminderSoundStatusText(reminderSoundState)}
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="rounded-2xl border border-[#E4DDD2] bg-white px-3 py-2 text-xs font-semibold text-[#5D554D] transition hover:bg-[#FAF8F5] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canRequestNotificationPermission || isRequestingPermission}
                    onClick={() => void handleNotificationPermissionRequest()}
                    type="button"
                  >
                    {isRequestingPermission ? '请求中...' : '请求通知权限'}
                  </button>
                  <button
                    aria-label={
                      googleConnectionState.connected ? '断开连接' : '连接 Google 日历'
                    }
                    className="rounded-2xl border border-[#E4DDD2] bg-white px-3 py-2 text-xs font-semibold text-[#5D554D] transition hover:bg-[#FAF8F5] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={googleConnectionState.isLoading}
                    onClick={
                      googleConnectionState.connected
                        ? onDisconnectGoogleCalendar
                        : onGoogleCalendarConnect
                    }
                    type="button"
                  >
                    {googleConnectionState.connected ? '断开连接' : '连接 Google 日历'}
                  </button>
                  <button
                    className="rounded-2xl border border-[#E4DDD2] bg-white px-3 py-2 text-xs font-semibold text-[#5D554D] transition hover:bg-[#FAF8F5] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !reminderSoundState.isSupported ||
                      reminderSoundState.enabled ||
                      reminderSoundState.isUnlocking
                    }
                    onClick={onEnableReminderSound}
                    type="button"
                  >
                    {reminderSoundState.isUnlocking
                      ? '启用中...'
                      : reminderSoundState.enabled
                        ? '已启用提醒音'
                        : '启用提醒音'}
                  </button>
                  <button
                    className="col-span-2 rounded-2xl border border-[#E4DDD2] bg-white px-3 py-2 text-xs font-semibold text-[#5D554D] transition hover:bg-[#FAF8F5] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!reminderSoundState.enabled}
                    onClick={onTestReminderSound}
                    type="button"
                  >
                    测试提醒音
                  </button>
                </div>
                {assistantError || googleConnectionState.error || reminderSoundState.error ? (
                  <p className="mt-3 text-xs font-medium text-red-600" role="alert">
                    {assistantError ?? googleConnectionState.error ?? reminderSoundState.error}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <AnimatePresence>
        {reminderToast ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="pointer-events-none fixed inset-x-4 top-5 z-40 flex justify-center lg:inset-x-auto lg:right-8 lg:top-8"
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
          >
            <div className="pointer-events-auto w-full max-w-[360px] rounded-[24px] border border-[#B7D8C4]/80 bg-[#FAF8F5]/95 p-4 shadow-[0_18px_48px_rgba(61,54,45,0.14)] backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF1E7] text-[#6F9B7E]">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-[#7B746C]">
                    日程提醒 · {reminderToast.startTime}
                  </div>
                  <div className="mt-1 truncate text-[16px] font-semibold text-[#3D362D]">
                    {reminderToast.title}
                  </div>
                  <div className="mt-1 text-[12px] text-[#7B746C]">
                    这个日程已经到时间了。
                  </div>
                </div>
              </div>
              <button
                className="mt-3 w-full rounded-full border border-[#B7D8C4] bg-[#F2F7F3] px-3 py-2 text-[12px] font-semibold text-[#5F8B6E] transition hover:bg-[#E6F1EA]"
                onClick={() => acknowledgeReminder(reminderToast.eventId)}
                type="button"
              >
                我知道了
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <footer className="relative z-10 flex w-full shrink-0 items-end justify-between px-10 pb-6 text-[#9A9287]">
        <div className="mb-2 hidden items-center gap-2 font-mono text-[11px] tracking-widest sm:flex">
          <span aria-hidden="true">LOCK</span> ENCRYPTED CONNECTION
        </div>
        <div className="mx-auto mb-2 font-mono text-[11px] tracking-widest sm:mx-0">
          {displayName}
        </div>
      </footer>

      <CalendarDrawer
        canCreateEvent={canCreateEvent}
        createError={createError}
        deletingEventId={deletingEventId}
        deleteError={deleteError}
        events={events}
        highlightedEventId={highlightedEventId}
        highlightedEventIds={highlightedEventIds}
        isCreatingEvent={isCreatingEvent}
        isLoadingEvents={isLoadingEvents}
        isOpen={isDrawerOpen}
        listError={listError}
        onCreateEvent={onCreateEvent}
        onDeleteEvent={onDeleteEvent}
        onToggle={() => setIsDrawerOpen((current) => !current)}
      />

      <span className="sr-only">
        {isGuest
          ? `游客会话，${getGoogleConnectionText(googleConnectionState, currentTimeMs)}`
          : ''}
      </span>
      <AssistantResultText
        includeMessage={hasVoiceText}
        response={assistantResponse}
      />

      <AnimatePresence>
        {isGoogleModalVisible ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#2B2824]/40 p-4 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-[32px] border border-white bg-[#FAF8F5] p-8 text-center shadow-2xl"
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] border border-[#EAE4DC] bg-white shadow-sm">
                <CalendarIcon className="h-8 w-8 text-[#5D554D]" />
              </div>

              <h2 className="mb-3 text-2xl font-semibold text-[#3D362D]">连接 Google 日历</h2>
              <p className="mb-8 text-sm leading-relaxed text-[#7A7268]">
                为了实现语音创建、修改和删除日程，我们需要您授权访问 Google 日历。
              </p>

              <div className="flex w-full flex-col gap-3">
                <button
                  className="w-full rounded-full bg-[#87C0A0] py-3.5 font-medium text-white shadow-[0_8px_20px_rgba(135,192,160,0.3)] transition hover:bg-[#78B492] active:scale-95 disabled:cursor-wait disabled:opacity-70"
                  disabled={googleConnectionState.isLoading}
                  onClick={onGoogleCalendarConnect}
                  type="button"
                >
                  {googleConnectionState.isLoading ? '跳转中...' : '继续并授权'}
                </button>
                {googleConnectionState.connected ? (
                  <button
                    className="w-full py-3.5 font-medium text-[#9A9287] transition hover:text-[#5D554D]"
                    disabled={googleConnectionState.isLoading}
                    onClick={onDisconnectGoogleCalendar}
                    type="button"
                  >
                    断开连接
                  </button>
                ) : null}
                <button
                  className="w-full py-3.5 font-medium text-[#9A9287] transition hover:text-[#5D554D]"
                  onClick={() => {
                    setHasDismissedGooglePrompt(true)
                    setIsGoogleModalManuallyOpen(false)
                  }}
                  type="button"
                >
                  稍后连接
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function CommandHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex cursor-pointer gap-2.5 rounded-[20px] border border-white/80 bg-[#FAF9F6] p-3 text-[13px] leading-relaxed text-[#5D554D] shadow-[0_4px_16px_rgba(0,0,0,0.02)] transition-all hover:bg-white">
      <span className="mt-[1px] shrink-0 text-[#B6AFA5]">{icon}</span>
      “{text}”
    </div>
  )
}

function getVisibleCommandHints(startIndex: number) {
  return Array.from({ length: COMMAND_HINT_COUNT }, (_, offset) => {
    return COMMAND_HINTS[(startIndex + offset) % COMMAND_HINTS.length]
  })
}

function isListCommandText(command: string): boolean {
  const hasListIntent = ['查看', '列出', '有哪些', '有什么', '查一下', '看看'].some(
    (keyword) => command.includes(keyword),
  )
  const hasListObject = ['提醒', '日程', '安排'].some((keyword) =>
    command.includes(keyword),
  )
  return hasListIntent && hasListObject
}

function getCommandHintIcon(icon: (typeof COMMAND_HINTS)[number]['icon']) {
  switch (icon) {
    case 'calendar':
      return <CalendarIcon className="h-4 w-4" />
    case 'list':
      return <ClipboardList className="h-4 w-4" />
    case 'clock':
      return <Clock className="h-4 w-4" />
  }
}

function isSameMinute(leftMs: number, rightMs: number): boolean {
  return Math.floor(leftMs / 60_000) === Math.floor(rightMs / 60_000)
}

function getEventCompletionTimeMs(event: UiCalendarEvent): number {
  const endsAtMs = event.endsAt ? new Date(event.endsAt).getTime() : Number.NaN
  if (!Number.isNaN(endsAtMs)) {
    return endsAtMs
  }
  const startsAtMs = new Date(event.startsAt).getTime()
  if (Number.isNaN(startsAtMs)) {
    return Number.POSITIVE_INFINITY
  }
  return startsAtMs + SCHEDULE_TRIGGER_WINDOW_MS
}

function ControlRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-xs">
      <span className="flex items-center gap-2 font-semibold text-[#5D554D]">
        <span className="text-[#9A9287]">{icon}</span>
        {label}
      </span>
      <span className="font-medium text-[#7AA68B]">{value}</span>
    </div>
  )
}

function SplitText({ text }: { text: string }) {
  return (
    <>
      {[...text].map((character, index) => (
        <span key={`${character}-${index}`}>{character}</span>
      ))}
    </>
  )
}

function AssistantResultText({
  includeMessage,
  response,
}: {
  includeMessage: boolean
  response: AssistantCommandResponse | null
}) {
  if (!response) {
    return <span className="sr-only">还没有助手回复。</span>
  }

  const resultEvents = [
    ...(response.event ? [response.event] : []),
    ...(response.events ?? []),
  ]

  return (
    <div className="sr-only">
      {includeMessage && response.message ? <span>{response.message}</span> : null}
      <span>{response.action}</span>
      {resultEvents.map((event) => (
        <span key={event.id}>{event.title}</span>
      ))}
      {resultEvents.map((event) =>
        event.reminder_at ? (
          <span key={`${event.id}-reminder`}>
            {formatReminderTime(event.reminder_at)}
          </span>
        ) : null,
      )}
    </div>
  )
}

function GoogleStatusCapsule({
  currentTimeMs,
  googleConnectionState,
  onConnect,
}: {
  currentTimeMs: number
  googleConnectionState: GoogleConnectionViewState
  onConnect: () => void
}) {
  return (
    <button
      className="mt-4 flex w-[260px] items-center gap-3 rounded-[100px] border border-white bg-[#F2F4ED] px-5 py-3 text-left shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
      onClick={onConnect}
      type="button"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-[13px] font-bold text-white shadow-sm">
        31
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-[12px] font-semibold tracking-wide text-[#3D362D]">
          {googleConnectionState.connected ? '已连接到 Google 日历' : '连接 Google 日历'}
        </span>
        <span className="text-[10px] text-[#9A9287]">
          {getGoogleConnectionText(googleConnectionState, currentTimeMs)}
        </span>
      </div>
      <CheckCircle2
        className={`h-5 w-5 ${
          googleConnectionState.connected ? 'text-[#7AA68B]' : 'text-[#C1B7AA]'
        }`}
      />
    </button>
  )
}

function getGoogleConnectionText(
  state: GoogleConnectionViewState,
  currentTimeMs: number,
): string {
  if (state.isLoading) {
    return '处理中'
  }
  if (!state.connected) {
    return '尚未连接 Google Calendar'
  }
  return `最后同步：${formatDateTime(currentTimeMs)}`
}

function getAssistantFallbackMessage(response: AssistantCommandResponse): string {
  if (response.action === 'unknown') {
    return '暂未识别该命令。'
  }
  return '命令已解析。'
}

function getNotificationStatusText(permission: NotificationPermission): string {
  if (!('Notification' in window)) {
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

function getReminderSoundStatusText(state: ReminderSoundViewState): string {
  if (!state.isSupported) {
    return '不支持'
  }
  if (state.isUnlocking) {
    return '启用中'
  }
  if (state.enabled) {
    return '已启用'
  }
  return '未启用'
}

function getVoiceStatusText(status: string): string {
  switch (status) {
    case 'listening':
      return '正在聆听...'
    case 'unsupported':
      return '当前浏览器不支持语音识别。'
    case 'error':
      return '语音识别异常。'
    default:
      return '等待语音输入。'
  }
}

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) {
    return '夜深好'
  }
  if (hour < 12) {
    return '上午好'
  }
  if (hour < 18) {
    return '下午好'
  }
  return '晚上好'
}

function formatTodayDate(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date())
}

function formatDateTime(value: number | string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

function formatReminderTime(reminderAt: string): string {
  return `提醒：${formatDateTime(reminderAt)}`
}
