import { useState } from 'react'
import {
  prefetchMeasurementsForOffline,
  getLastPrefetchAt,
  PrefetchProgress,
} from '../../services/prefetch'

// Кнопка «Скачать для офлайна»: СМ жмёт её перед выездом (дома, в офисе, на Wi-Fi),
// и все его замеры с проёмами, заказами и файлами оказываются в памяти телефона.
// Без неё офлайн-копия набиралась только из карточек, открытых вручную.
const OfflinePrefetchButton = () => {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<PrefetchProgress | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastAt, setLastAt] = useState<number | null>(getLastPrefetchAt())

  const formatMoment = (ts: number): string =>
    new Date(ts).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await prefetchMeasurementsForOffline(setProgress)
      setLastAt(getLastPrefetchAt())
      const summary = `Замеров — ${res.measurements}, файлов — ${res.files}`
      if (res.failed > 0) {
        // Частично не скачалось — молчать нельзя: СМ уедет и узнает об этом в поле
        setError(`${summary}. Не удалось загрузить: ${res.failed}. Повторите на устойчивой связи.`)
      } else {
        setResult(`Готово. ${summary}`)
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось подготовить офлайн-копию')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
          )}
          {busy ? 'Скачиваем…' : 'Скачать для офлайна'}
        </button>

        <div className="text-xs text-gray-500">
          {busy && progress ? (
            <span>
              {progress.stage}: {progress.done} из {progress.total}
            </span>
          ) : lastAt ? (
            <span>Офлайн-копия обновлена {formatMoment(lastAt)}</span>
          ) : (
            <span>Офлайн-копия ещё не скачивалась — сделайте это, пока есть связь</span>
          )}
        </div>
      </div>

      {result && <div className="mt-2 text-xs text-green-700">{result}</div>}
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  )
}

export default OfflinePrefetchButton
