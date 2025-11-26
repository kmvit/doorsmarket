import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initOfflineDB } from './services/offline'
import { initSync } from './services/sync'
import { useAuthStore } from './store/authStore'

// Инициализация офлайн функциональности
initOfflineDB().then(() => {
  initSync()
})

// Проверка аутентификации при загрузке
const checkInitialAuth = async () => {
  const { checkAuth } = useAuthStore.getState()
  await checkAuth()
}

// Выполняем проверку и рендерим приложение
checkInitialAuth().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})

