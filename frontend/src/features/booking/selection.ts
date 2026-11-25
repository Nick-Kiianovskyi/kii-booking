export interface SlotSelection {
  date: string
  start: string
  end: string
}

export function selectionParam(selection: SlotSelection): string {
  return encodeURIComponent(JSON.stringify(selection))
}

export function readSelection(raw: string | null): SlotSelection | null {
  if (!raw) return null
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<SlotSelection>
    if (!value.date || !value.start || !value.end) return null
    return { date: value.date, start: value.start, end: value.end }
  } catch {
    return null
  }
}
