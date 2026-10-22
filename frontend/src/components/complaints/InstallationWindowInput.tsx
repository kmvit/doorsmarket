import { InstallationWindowValue } from '../../utils/installationWindow'

interface Props {
  value: InstallationWindowValue
  onChange: (value: InstallationWindowValue) => void
  label?: string
  /** Классы рамки фокуса — у каждой формы свой цвет */
  focusClass?: string
}

// Дата и интервал времени монтажа: «с» и «до» в пределах одного дня
const InstallationWindowInput = ({
  value,
  onChange,
  label = 'Дата и время монтажа',
  focusClass = 'focus:ring-orange-500',
}: Props) => {
  const field = `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${focusClass}`
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label} <span className="text-red-500">*</span>
      </label>
      <input
        type="date"
        value={value.date}
        onChange={(e) => onChange({ ...value, date: e.target.value })}
        required
        className={field}
      />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">с</label>
          <input
            type="time"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            required
            className={field}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">до</label>
          <input
            type="time"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            required
            className={field}
          />
        </div>
      </div>
    </div>
  )
}

export default InstallationWindowInput
