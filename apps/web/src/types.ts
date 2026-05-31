export type UiCalendarEvent = {
  color?: string
  dateStr: string
  endTime: string
  hasMeetingLink?: boolean
  id: string
  location?: string
  reminderText?: string | null
  startTime: string
  startsAt: string
  endsAt?: string | null
  status?: string
  syncText?: string | null
  title: string
}
