/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any[] }

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

const navigationRoute = new NavigationRoute(createHandlerBoundToURL('/index.html'))
registerRoute(navigationRoute)

registerRoute(
  /^https:\/\/.*\/api\/v1\/.*/i,
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60,
      }),
    ],
  }),
  'GET',
)

registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
  'GET',
)

self.addEventListener('push', (event: PushEvent) => {
  console.log('[Service Worker] Push событие получено:', event)

  const defaultNotification = {
    title: 'Marketing Doors',
    body: 'У вас новое уведомление',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'notification',
    data: {} as Record<string, any>,
  }

  let notificationData = { ...defaultNotification }

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
    } catch (error) {
      console.error('[Service Worker] Ошибка парсинга данных push-уведомления:', error)
      notificationData = {
        ...notificationData,
        body: event.data?.text() || notificationData.body,
      }
    }
  }

  const notificationOptions: NotificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    data: notificationData.data,
    requireInteraction: false,
  }

  ;(notificationOptions as any).actions = [
    { action: 'open', title: 'Открыть' },
    { action: 'close', title: 'Закрыть' },
  ]

  event.waitUntil(self.registration.showNotification(notificationData.title, notificationOptions))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log('[Service Worker] Клик по уведомлению:', event)
  event.notification.close()

  if (event.action === 'close') {
    return
  }

  const data = event.notification.data as { url?: string; complaint_id?: string }
  let urlToOpen = '/notifications'

  if (data?.url) {
    urlToOpen = data.url
  } else if (data?.complaint_id) {
    urlToOpen = `/complaints/${data.complaint_id}`
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client && client.url.includes(urlToOpen)) {
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen)
        }
        return undefined
      })
      .catch((error) => console.error('[Service Worker] Ошибка при открытии окна:', error)),
  )
})

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  console.log('[Service Worker] Уведомление закрыто:', event)
})

