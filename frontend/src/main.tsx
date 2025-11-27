import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initOfflineDB } from './services/offline'
import { initSync } from './services/sync'
import { useAuthStore } from './store/authStore'

// Регистрация Service Worker для PWA и push-уведомлений
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      console.log('[PWA] Service Worker зарегистрирован:', registration.scope)
    } catch (error) {
      console.error('[PWA] Не удалось зарегистрировать Service Worker:', error)
    }
  })
}

// Инициализация офлайн функциональности
initOfflineDB().then(() => {
  initSync()
})

// Проверка аутентификации при загрузке
const checkInitialAuth = async () => {
  const token = localStorage.getItem('access_token')
  if (token) {
    const { checkAuth } = useAuthStore.getState()
    // Проверяем только если есть токен, но не блокируем рендеринг
    checkAuth().catch((error) => {
      console.warn('[Main] Ошибка при начальной проверке аутентификации:', error)
    })
  }
}

// Рендерим приложение сразу, проверка аутентификации идет параллельно
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Запускаем проверку аутентификации после рендера
checkInitialAuth()

