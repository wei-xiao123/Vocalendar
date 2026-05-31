import { ChevronUp, Plus, Trash2, Video } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type FormEvent, useEffect, useRef, useState } from 'react'

import { type UiCalendarEvent } from '../types'

type CalendarDrawerProps = {
  canCreateEvent: boolean
  createError: string | null
  deletingEventId: string | null
  deleteError: string | null
  events: UiCalendarEvent[]
  highlightedEventId: string | null
  highlightedEventIds: string[]
  isCreatingEvent: boolean
  isLoadingEvents: boolean
  isOpen: boolean
  listError: string | null
  onCreateEvent: (payload: {
    reminderAt: string
    startsAt: string
    title: string
  }) => void
  onDeleteEvent: (eventId: string) => void
  onToggle: () => void
}

export function CalendarDrawer({
  canCreateEvent,
  createError,
  deletingEventId,
  deleteError,
  events,
  highlightedEventId,
  highlightedEventIds,
  isCreatingEvent,
  isLoadingEvents,
  isOpen,
  listError,
  onCreateEvent,
  onDeleteEvent,
  onToggle,
}: CalendarDrawerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [reminderAt, setReminderAt] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [title, setTitle] = useState('')
  const canSubmit = canCreateEvent && title.trim().length > 0 && startsAt.length > 0

  useEffect(() => {
    const targetEventId = highlightedEventIds[0] ?? highlightedEventId
    if (isOpen && targetEventId && scrollRef.current) {
      const element = document.getElementById(`event-${targetEventId}`)
      if (element) {
        window.setTimeout(() => {
          element.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }
  }, [highlightedEventId, highlightedEventIds, isOpen])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    onCreateEvent({
      reminderAt,
      startsAt,
      title: title.trim(),
    })
    setTitle('')
    setStartsAt('')
    setReminderAt('')
  }

  const todayEvents = events.filter((event) => event.dateStr === 'Today')
  const tomorrowEvents = events.filter((event) => event.dateStr === 'Tomorrow')
  const upcomingEvents = events.filter(
    (event) => event.dateStr !== 'Today' && event.dateStr !== 'Tomorrow',
  )

  return (
    <motion.div
      animate={{ y: isOpen ? 0 : 'calc(100% - 48px)' }}
      className="pointer-events-none absolute bottom-0 left-0 right-0 z-40 flex flex-col items-center"
      initial={{ y: '100%' }}
      transition={{ damping: 30, stiffness: 300, type: 'spring' }}
    >
      <div className="pointer-events-auto flex h-[68vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[24px] border border-black/[0.03] bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
        <button
          className="h-[60px] w-full shrink-0 flex-col items-center justify-center transition-colors hover:bg-neutral-50/50"
          onClick={onToggle}
          type="button"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300 shadow-inner" />
          <div className="relative flex w-full items-center justify-center">
            <div className="mx-4 h-[1px] w-24 bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />
            <div className="flex items-center gap-1 font-sans text-[10px] font-medium tracking-widest text-neutral-500 sm:text-[11px]">
              查看我的日历时间轴
              <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
                <ChevronUp className="h-3 w-3" />
              </motion.div>
            </div>
            <div className="mx-4 h-[1px] w-24 bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />
          </div>
        </button>

        <div className="mt-2 flex-1 overflow-y-auto px-5 pb-20 custom-scrollbar" ref={scrollRef}>
          <form
            className="mb-6 grid gap-3 rounded-[20px] border border-[#EAE4DC] bg-[#FAF8F5] p-4"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-1.5 text-xs font-semibold tracking-wide text-[#5D554D]">
                标题
                <input
                  className="h-11 rounded-2xl border border-[#E4DDD2] bg-white px-3 text-sm font-medium text-[#3D362D] outline-none transition focus:border-[#87C0A0] focus:ring-2 focus:ring-[#87C0A0]/20"
                  name="title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：产品评审"
                  required
                  type="text"
                  value={title}
                />
              </label>
              <button
                className="mt-auto flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#87C0A0] px-4 text-sm font-semibold text-white transition hover:bg-[#78B492] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSubmit || isCreatingEvent}
                type="submit"
              >
                <Plus className="h-4 w-4" />
                {isCreatingEvent ? '正在创建...' : '添加日程'}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateTimeField
                label="开始时间"
                name="starts_at"
                onChange={setStartsAt}
                placeholder="选择开始时间"
                required
                value={startsAt}
              />
              <DateTimeField
                label="提醒时间"
                name="reminder_at"
                onChange={setReminderAt}
                placeholder="可选提醒时间"
                value={reminderAt}
              />
            </div>
          </form>

          {createError || deleteError || listError ? (
            <p className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
              {createError ?? deleteError ?? listError}
            </p>
          ) : null}

          {isLoadingEvents ? (
            <p className="rounded-2xl bg-[#FAF8F5] px-4 py-5 text-center text-sm text-[#9A9287]">
              正在加载日程...
            </p>
          ) : events.length === 0 ? (
            <p className="rounded-2xl bg-[#FAF8F5] px-4 py-5 text-center text-sm text-[#9A9287]">
              还没有日程。
            </p>
          ) : (
            <div aria-label="日程列表" role="list">
              <EventSection
                deletingEventId={deletingEventId}
                events={todayEvents}
                highlightedEventId={highlightedEventId}
                highlightedEventIds={highlightedEventIds}
                label="Today"
                markerClassName="bg-blue-500"
                onDeleteEvent={onDeleteEvent}
              />
              <EventSection
                deletingEventId={deletingEventId}
                events={tomorrowEvents}
                highlightedEventId={highlightedEventId}
                highlightedEventIds={highlightedEventIds}
                label="Tomorrow"
                markerClassName="bg-emerald-500"
                onDeleteEvent={onDeleteEvent}
              />
              <EventSection
                deletingEventId={deletingEventId}
                events={upcomingEvents}
                highlightedEventId={highlightedEventId}
                highlightedEventIds={highlightedEventIds}
                label="Upcoming"
                markerClassName="bg-[#C1B7AA]"
                onDeleteEvent={onDeleteEvent}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function DateTimeField({
  label,
  name,
  onChange,
  placeholder,
  required = false,
  value,
}: {
  label: string
  name: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
  value: string
}) {
  const inputId = `calendar-${name}`

  return (
    <div className="grid gap-1.5 text-xs font-semibold tracking-wide text-[#5D554D]">
      <label htmlFor={inputId}>{label}</label>
      <span className="relative block">
        <input
          className="peer h-11 w-full rounded-2xl border border-[#E4DDD2] bg-white px-3 pr-11 text-sm text-transparent caret-[#3D362D] outline-none transition focus:border-[#87C0A0] focus:ring-2 focus:ring-[#87C0A0]/20"
          id={inputId}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type="datetime-local"
          value={value}
        />
        <span className="pointer-events-none absolute inset-y-0 left-3 right-11 flex items-center truncate text-sm font-medium text-[#3D362D] peer-focus:text-[#3D362D]">
          {value ? formatDateTimeInputValue(value) : (
            <span className="text-[#AAA39A]">{placeholder}</span>
          )}
        </span>
      </span>
    </div>
  )
}

function formatDateTimeInputValue(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function EventSection({
  deletingEventId,
  events,
  highlightedEventId,
  highlightedEventIds,
  label,
  markerClassName,
  onDeleteEvent,
}: {
  deletingEventId: string | null
  events: UiCalendarEvent[]
  highlightedEventId: string | null
  highlightedEventIds: string[]
  label: string
  markerClassName: string
  onDeleteEvent: (eventId: string) => void
}) {
  if (events.length === 0) {
    return null
  }

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-800">
        <span className={`h-2.5 w-2.5 rounded-full shadow-sm ${markerClassName}`} />
        {label}
      </div>
      <div className="relative ml-1.5 space-y-4 border-l border-neutral-200 pl-5">
        <AnimatePresence>
          {events.map((event) => (
            <EventCard
              event={event}
              isDeleting={event.id === deletingEventId}
              isHighlighted={
                event.id === highlightedEventId ||
                highlightedEventIds.includes(event.id)
              }
              key={event.id}
              onDelete={() => onDeleteEvent(event.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function EventCard({
  event,
  isDeleting,
  isHighlighted,
  onDelete,
}: {
  event: UiCalendarEvent
  isDeleting: boolean
  isHighlighted: boolean
  onDelete: () => void
}) {
  return (
    <motion.div
      animate={
        isDeleting
          ? { opacity: 0, scale: 0.8, transition: { delay: 0.5, duration: 0.4 }, x: 20 }
          : isHighlighted
            ? {
                backgroundColor: [
                  'rgba(255,255,255,1)',
                  'rgba(254,242,242,1)',
                  'rgba(255,255,255,1)',
                ],
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
                transition: { duration: 0.8 },
              }
            : {
                backgroundColor: 'rgba(255,255,255,1)',
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
              }
      }
      className={[
        'relative flex items-center justify-between overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]',
        isHighlighted ? 'border-red-300 ring-2 ring-red-100' : 'border-neutral-100',
      ].join(' ')}
      exit={{ height: 0, marginBottom: 0, opacity: 0, scale: 0.8, transition: { duration: 0.3 } }}
      id={`event-${event.id}`}
      initial={{ opacity: 0, y: 10 }}
      layout
      role="listitem"
    >
      <div
        className={`absolute bottom-0 left-0 top-0 w-[4px] ${
          isHighlighted ? 'bg-red-500' : event.color || 'bg-blue-500'
        }`}
      />

      <div className="min-w-0 pl-2">
        <h3
          className={`truncate text-sm tracking-wide ${
            isDeleting
              ? 'text-red-500 line-through'
              : isHighlighted
                ? 'font-semibold text-red-600'
                : 'font-medium text-neutral-800'
          }`}
        >
          {event.title}
        </h3>
        {event.status ? <span className="sr-only">{event.status}</span> : null}
        <p className="mt-1 font-mono text-xs tracking-tight text-neutral-400">
          {event.startTime}
          {event.endTime ? ` - ${event.endTime}` : ''}
        </p>
        {event.reminderText ? (
          <p className="mt-1 text-xs text-[#7AA68B]">{event.reminderText}</p>
        ) : null}
        {event.syncText ? (
          <p className="mt-1 text-xs text-[#7AA68B]">{event.syncText}</p>
        ) : null}
      </div>

      <div className="ml-3 flex shrink-0 items-center gap-2">
        {event.hasMeetingLink && !isDeleting ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-100 bg-neutral-50 text-neutral-400 shadow-sm">
            <Video className="h-3.5 w-3.5" />
          </div>
        ) : null}
        <button
          aria-label={`删除 ${event.title}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-500 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
          disabled={isDeleting}
          onClick={onDelete}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  )
}
