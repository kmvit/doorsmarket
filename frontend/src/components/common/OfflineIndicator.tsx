import { useEffect, useState } from 'react'
import { requestQueue, syncFailures } from '../../services/sync'
import { SyncFailure } from '../../services/offline'

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queueLength, setQueueLength] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [failures, setFailures] = useState<SyncFailure[] | null>(null)

  useEffect(() => {
    const unsubscribeFailures = syncFailures.onChange(setFailedCount)
    syncFailures.count().then(setFailedCount)
    return unsubscribeFailures
  }, [])

  useEffect(() => {
    // Обновляем статус при изменении онлайн/офлайн
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Подписываемся на изменения очереди
    const unsubscribe = requestQueue.onQueueChange((count) => {
      setQueueLength(count)
    })

    // Получаем начальное количество запросов в очереди
    requestQueue.getQueueLength().then(setQueueLength)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      unsubscribe()
    }
  }, [])

  if (isOnline && queueLength === 0 && failedCount === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Действия, которые сервер отклонил при синхронизации — молча терять их нельзя */}
      {failedCount > 0 && (
        <div className="bg-red-600 text-white rounded-lg shadow-lg max-w-sm">
          <button
            type="button"
            onClick={async () => setFailures(failures ? null : await syncFailures.getAll())}
            className="px-4 py-2 flex items-center gap-2 text-left w-full"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-2.99l-6.93-12a2 2 0 00-3.48 0l-6.93 12A2 2 0 005.07 19z" />
            </svg>
            <span>Не отправлено действий: {failedCount}</span>
          </button>
          {failures && (
            <div className="px-4 pb-3 space-y-2 border-t border-red-500">
              {failures.map((f) => (
                <div key={f.id} className="text-xs pt-2">
                  <div className="font-semibold">{f.title}</div>
                  <div className="opacity-90">{f.reason}</div>
                </div>
              ))}
              <button
                type="button"
                onClick={async () => {
                  await syncFailures.clear()
                  setFailures(null)
                }}
                className="mt-2 w-full bg-white/20 hover:bg-white/30 rounded px-3 py-1 text-xs"
              >
                Понятно, скрыть
              </button>
            </div>
          )}
        </div>
      )}
      {!isOnline ? (
        <div className="bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
          <span>Офлайн режим</span>
        </div>
      ) : queueLength > 0 ? (
        <button
          type="button"
          onClick={() => requestQueue.processQueue()}
          title="Нажмите, чтобы отправить сейчас"
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2"
        >
          <svg
            className="w-5 h-5 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Синхронизация: {queueLength} запросов</span>
        </button>
      ) : null}
    </div>
  )
}

export default OfflineIndicator

