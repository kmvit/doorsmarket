import { useEffect, useState } from 'react'
import { requestQueue } from '../services/sync'
import { complaintUtils } from '../services/offline'

const Offline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queueLength, setQueueLength] = useState(0)
  const [cachedComplaintsCount, setCachedComplaintsCount] = useState(0)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const unsubscribe = requestQueue.onQueueChange((count) => {
      setQueueLength(count)
    })

    // Загружаем количество кешированных рекламаций
    complaintUtils.getList().then((list) => {
      setCachedComplaintsCount(list.length)
    })

    requestQueue.getQueueLength().then(setQueueLength)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      unsubscribe()
    }
  }, [])

  const handleRetry = async () => {
    if (navigator.onLine) {
      await requestQueue.processQueue()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          {isOnline ? (
            <svg
              className="w-24 h-24 mx-auto text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-24 h-24 mx-auto text-yellow-500"
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
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {isOnline ? 'Подключение восстановлено' : 'Нет подключения к интернету'}
        </h1>

        <p className="text-gray-600 mb-6">
          {isOnline
            ? 'Попытка синхронизации данных...'
            : 'Вы работаете в офлайн режиме. Некоторые функции могут быть недоступны.'}
        </p>

        {cachedComplaintsCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              В кеше сохранено: <strong>{cachedComplaintsCount}</strong> рекламаций
            </p>
          </div>
        )}

        {queueLength > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              В очереди: <strong>{queueLength}</strong> запросов на синхронизацию
            </p>
          </div>
        )}

        {isOnline && queueLength > 0 && (
          <button
            onClick={handleRetry}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Синхронизировать сейчас
          </button>
        )}

        {!isOnline && (
          <div className="mt-6">
            <p className="text-sm text-gray-500">
              Данные будут автоматически синхронизированы при восстановлении подключения
            </p>
          </div>
        )}

        <button
          onClick={() => window.history.back()}
          className="mt-6 text-blue-600 hover:text-blue-700 text-sm"
        >
          ← Вернуться назад
        </button>
      </div>
    </div>
  )
}

export default Offline

