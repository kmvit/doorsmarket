export function formatMeasurementTime(
  start: string | null | undefined,
  end?: string | null,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
) {
  if (!start) return '—'
  const first = new Date(start)
  const label = first.toLocaleString('ru-RU', options)
  if (!end) return label
  const last = new Date(end)
  const sameDay = first.toDateString() === last.toDateString()
  return label + '–' + last.toLocaleString('ru-RU', {
    ...(sameDay ? {} : { dateStyle: 'short' }), timeStyle: 'short',
  })
}
