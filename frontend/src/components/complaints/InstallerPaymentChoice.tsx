export default function InstallerPaymentChoice({ value, onChange }: {
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  return (
    <label className="block mb-3 text-sm font-medium text-gray-700">
      Оплата работы монтажника
      <select
        className="mt-1 block w-full rounded-lg border-gray-300 bg-white"
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value ? e.target.value === 'true' : null)}
      >
        <option value="">Выберите вариант</option>
        <option value="true">Оплачивается</option>
        <option value="false">Не оплачивается</option>
      </select>
    </label>
  )
}
