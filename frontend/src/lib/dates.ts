export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

const SHORT_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function weekdayOf(iso: string): number {
  const jsDay = fromISODate(iso).getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

export function shortWeekday(iso: string): string {
  return SHORT_WEEKDAYS[weekdayOf(iso)]
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(fromISODate(iso))
}

export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(fromISODate(iso))
}

export function normalizeTime(time: string): string {
  return time.slice(0, 5)
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = normalizeTime(time).split(':').map(Number)
  const total = hours * 60 + mins + minutes
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

export function buildDateStrip(anchor: string, count = 7): string[] {
  return Array.from({ length: count }, (_, index) => addDays(anchor, index))
}
