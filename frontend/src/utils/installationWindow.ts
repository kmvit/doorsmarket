// Монтаж назначают интервалом «с … до …» в пределах одного дня:
// planned_installation_date — начало, planned_installation_end — конец.
// У старых рекламаций конца нет — показываем только время начала.

const pad = (n: number) => String(n).padStart(2, '0')

const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** «22.10.2026, 10:00–12:00» или «22.10.2026, 10:00» */
export const formatInstallationWindow = (start?: string | null, end?: string | null): string => {
  if (!start) return ''
  const s = new Date(start)
  const date = s.toLocaleDateString('ru-RU')
  return end ? `${date}, ${timeOf(s)}–${timeOf(new Date(end))}` : `${date}, ${timeOf(s)}`
}

/** Только время: «10:00–12:00» или «10:00» */
export const formatInstallationTime = (start?: string | null, end?: string | null): string => {
  if (!start) return ''
  return end ? `${timeOf(new Date(start))}–${timeOf(new Date(end))}` : timeOf(new Date(start))
}

export interface InstallationWindowValue {
  date: string // YYYY-MM-DD
  from: string // HH:MM
  to: string // HH:MM
}

export const emptyInstallationWindow: InstallationWindowValue = { date: '', from: '', to: '' }

/** Поля формы из сохранённого интервала (для «Перенести дату») */
export const installationWindowFromDates = (
  start?: string | null,
  end?: string | null,
): InstallationWindowValue => {
  if (!start) return emptyInstallationWindow
  const s = new Date(start)
  return {
    date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
    from: timeOf(s),
    to: end ? timeOf(new Date(end)) : '',
  }
}

/** Текст ошибки или null, если интервал заполнен правильно */
export const validateInstallationWindow = (w: InstallationWindowValue): string | null => {
  if (!w.date) return 'Укажите дату монтажа'
  if (!w.from || !w.to) return 'Укажите время монтажа: с какого и до какого часа'
  if (w.to <= w.from) return 'Время «до» должно быть позже времени «с»'
  return null
}

/** Локальные дата-время для API: { start: 'YYYY-MM-DDTHH:MM', end: ... } */
export const installationWindowToApi = (w: InstallationWindowValue) => ({
  start: `${w.date}T${w.from}`,
  end: `${w.date}T${w.to}`,
})
