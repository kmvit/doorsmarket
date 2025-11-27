/**
 * Утилиты для отладки проблем с навигацией и аутентификацией
 */

export const debugAuth = () => {
  const token = localStorage.getItem('access_token')
  const refreshToken = localStorage.getItem('refresh_token')
  const user = localStorage.getItem('user')
  
  console.log('=== DEBUG AUTH ===')
  console.log('Token:', token ? token.substring(0, 20) + '...' : 'отсутствует')
  console.log('Refresh Token:', refreshToken ? 'присутствует' : 'отсутствует')
  console.log('User:', user ? JSON.parse(user).username : 'отсутствует')
  console.log('Current path:', window.location.pathname)
  console.log('==================')
}

export const debugPush = () => {
  console.log('=== DEBUG PUSH ===')
  console.log('Service Worker support:', 'serviceWorker' in navigator)
  console.log('Push Manager support:', 'PushManager' in window)
  console.log('Notification permission:', Notification.permission)
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      console.log('Service Worker registrations:', registrations.length)
      registrations.forEach((reg, idx) => {
        console.log(`SW ${idx}:`, reg.scope, reg.active?.state)
      })
    })
  }
  
  console.log('==================')
}

