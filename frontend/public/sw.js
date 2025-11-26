// Service Worker для обработки push-уведомлений
// Этот файл будет объединен с Workbox при сборке

// Обработчик push-событий
self.addEventListener('push', (event) => {
  console.log('Push событие получено:', event)

  let notificationData = {
    title: 'Marketing Doors',
    body: 'У вас новое уведомление',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'notification',
    data: {},
  }

  // Пытаемся получить данные из push-события
  if (event.data) {
    try {
      const data = event.data.json()
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.message || data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        tag: data.tag || `notification-${data.id || Date.now()}`,
        data: {
          ...data,
          url: data.url || '/notifications',
        },
      }
    } catch (e) {
      console.error('Ошибка парсинга данных push-уведомления:', e)
      notificationData.body = event.data.text() || notificationData.body
    }
  }

  // Показываем уведомление
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData.data,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      actions: [
        {
          action: 'open',
          title: 'Открыть',
        },
        {
          action: 'close',
          title: 'Закрыть',
        },
      ],
    })
  )
})

// Обработчик клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  console.log('Клик по уведомлению:', event)

  event.notification.close()

  const action = event.action
  const data = event.notification.data

  if (action === 'close') {
    return
  }

  // Определяем URL для открытия
  let urlToOpen = '/notifications'
  if (data?.url) {
    urlToOpen = data.url
  } else if (data?.complaint_id) {
    urlToOpen = `/complaints/${data.complaint_id}`
  }

  // Открываем или фокусируем окно
  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // Если есть открытое окно, фокусируем его
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i]
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus()
          }
        }
        // Иначе открываем новое окно
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen)
        }
      })
  )
})

// Обработчик закрытия уведомления
self.addEventListener('notificationclose', (event) => {
  console.log('Уведомление закрыто:', event)
})

