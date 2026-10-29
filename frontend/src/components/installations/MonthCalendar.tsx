import { ReactNode } from 'react'
import { isoDate } from '../../types/installations'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** Первый день месяца */
export const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

/** Первый и последний день сетки месяца (с хвостами соседних месяцев до полных недель) */
export const monthGridRange = (month: Date): [string, string] => {
  const days = gridDays(month)
  return [isoDate(days[0]), isoDate(days[days.length - 1])]
}

function gridDays(month: Date): Date[] {
  const first = monthStart(month)
  const shift = (first.getDay() + 6) % 7 // понедельник — первый день недели
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - shift)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  const tail = 6 - ((last.getDay() + 6) % 7)
  const total = shift + last.getDate() + tail
  return Array.from({ length: total }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

interface Props {
  month: Date
  onMonthChange: (month: Date) => void
  renderDay?: (day: string) => ReactNode
  dayClassName?: (day: string) => string
  onDayClick?: (day: string) => void
  compact?: boolean
}

/**
 * Календарь на месяц «как в Google-календаре»: дни с понедельника, в каждой
 * клетке — что передаст renderDay. Компактный вид — для выбора дат в окне
 * назначения.
 */
const MonthCalendar = ({ month, onMonthChange, renderDay, dayClassName, onDayClick, compact }: Props) => {
  const today = isoDate(new Date())
  const current = month.getMonth()
  const title = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  const shiftMonth = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shiftMonth(-1)}
          className="px-3 py-1 rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Предыдущий месяц">‹</button>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 capitalize">{title}</span>
          {!compact && (
            <button type="button" onClick={() => onMonthChange(monthStart(new Date()))}
              className="text-xs text-primary-600 hover:underline">сегодня</button>
          )}
        </div>
        <button type="button" onClick={() => shiftMonth(1)}
          className="px-3 py-1 rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Следующий месяц">›</button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-gray-50 text-center text-xs font-medium text-gray-500 py-1">{w}</div>
        ))}
        {gridDays(month).map((d) => {
          const day = isoDate(d)
          const outside = d.getMonth() !== current
          // Свой фон дня (занят / выбран) заменяет белый, а не спорит с ним
          const extra = dayClassName?.(day) || ''
          return (
            <div
              key={day}
              onClick={onDayClick ? () => onDayClick(day) : undefined}
              className={`${extra.includes('bg-') ? '' : 'bg-white'} ${compact ? 'min-h-[2.25rem] p-1' : 'min-h-[6rem] p-1'} ${
                onDayClick ? 'cursor-pointer hover:bg-primary-50' : ''
              } ${outside ? 'opacity-40' : ''} ${extra}`}
            >
              <div className={`text-xs ${compact ? 'text-center' : ''} ${
                day === today ? 'font-bold text-primary-600' : 'text-gray-500'
              }`}
              >
                {d.getDate()}
              </div>
              {renderDay?.(day)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MonthCalendar
