import { useState, useEffect } from 'react'

import { isIosDevice } from '../../utils/isIosDevice'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Проверяем, установлено ли приложение
    const checkIfInstalled = () => {
      // Проверка для standalone режима (установленное PWA)
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true)
        return true
      }
      
      // Проверка для iOS
      if ((window.navigator as any).standalone === true) {
        setIsInstalled(true)
        return true
      }
      
      return false
    }

    if (checkIfInstalled()) {
      return
    }

    // Проверяем, было ли приложение отклонено ранее
    const installPromptDismissed = localStorage.getItem('installPromptDismissed')
    if (installPromptDismissed) {
      const dismissedTime = parseInt(installPromptDismissed, 10)
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24)
      
      // Показываем снова через 7 дней
      if (daysSinceDismissed < 7) {
        return
      }
    }

    // Слушаем событие beforeinstallprompt (для Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Показываем подсказку для iOS (если не установлено)
    if (!checkIfInstalled() && isIosDevice()) {
      // Задержка для iOS, чтобы пользователь увидел подсказку
      setTimeout(() => {
        setShowPrompt(true)
      }, 3000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Для iOS показываем инструкции
      if (isIosDevice()) {
        alert(
          'Для установки приложения на iPhone/iPad:\n\n' +
          '1. Нажмите кнопку "Поделиться" в Safari\n' +
          '2. Выберите "На экран Домой"\n\n' +
          'Приложение появится на главном экране.'
        )
        setShowPrompt(false)
        localStorage.setItem('installPromptDismissed', Date.now().toString())
        return
      }
      return
    }

    // Показываем промпт установки
    await deferredPrompt.prompt()

    // Ждём выбора пользователя
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      console.log('Пользователь установил приложение')
      setIsInstalled(true)
    } else {
      console.log('Пользователь отклонил установку')
      localStorage.setItem('installPromptDismissed', Date.now().toString())
    }

    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('installPromptDismissed', Date.now().toString())
  }

  if (isInstalled || !showPrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Установить приложение
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Установите Marketing Doors на свой телефон для быстрого доступа и работы offline
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleInstallClick}
            className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Установить
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
          >
            Позже
          </button>
        </div>
        {/iPhone|iPad|iPod/.test(navigator.userAgent) && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              💡 На iPhone: нажмите "Поделиться" → "На экран Домой"
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
