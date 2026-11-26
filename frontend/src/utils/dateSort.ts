export type SortDirection = 'ascending' | 'descending'

const timestamp = (value?: string | null): number | null => {
  if (!value) return null
  // Дата без времени — начало календарного дня в часовом поясе интерфейса.
  const time = Date.parse(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isFinite(time) ? time : null
}

export const compareDates = (
  left: string | null | undefined,
  right: string | null | undefined,
  direction: SortDirection,
): number => {
  const a = timestamp(left)
  const b = timestamp(right)
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return direction === 'ascending' ? a - b : b - a
}
