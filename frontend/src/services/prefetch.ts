// Подготовка данных к работе без связи.
//
// Раньше офлайн-копия набиралась «сама собой»: в IndexedDB попадало только то,
// что СМ успел открыть онлайн. В поле он открывает замер, который до этого видел
// лишь строкой в списке, — карточки в кеше нет, и замер не открывается вообще.
// Здесь мы выкачиваем всё нужное заранее, по кнопке: список замеров, карточку
// каждого замера с проёмами, заказ к нему и файлы (планы открывания, фото).
//
// ВАЖНО: запросы идём напрямую через apiClient, минуя withOfflineFallback.
// Фолбэк на ошибку сервера тихо отдаёт старые данные (или пустой список), и
// «скачивание» отрапортовало бы «Готово», ничего не скачав. Здесь любая ошибка
// должна быть видна: СМ уезжает на объект, полагаясь на эту кнопку.

import apiClient from '../api/client'
import { Measurement, MeasurementListItem } from '../types/measurements'
import { Order } from '../types/orders'
import { measurementUtils, orderUtils, cacheUtils } from './offline'

// Кеш файлов замера (планы открывания, фото, документы). Тем же именем
// пользуется service worker — см. src/sw.ts, маршрут на /media/.
export const MEDIA_CACHE = 'offline-media'

// Срок годности скачанного — 30 дней. Обычный кеш живёт 5 минут и вычищается
// при старте приложения (cacheUtils.clearExpired), а офлайн-копия должна
// пережить и неделю в разъездах.
const PREFETCH_TTL = 30 * 24 * 60 * 60 * 1000

// Сколько замеров тянем максимум: у менеджера в списке их могут быть сотни,
// а в поле нужны актуальные. Обработанные и неактуальные пропускаем.
const MAX_MEASUREMENTS = 200
// Файлы качаем ограниченно, чтобы не выгрести весь диск телефона
const MAX_FILES = 400
// Одновременных запросов: больше — быстрее, но мобильная сеть захлёбывается
const CONCURRENCY = 4

const LAST_PREFETCH_KEY = 'offline_prefetch_at'

export interface PrefetchProgress {
  stage: string
  done: number
  total: number
}

export interface PrefetchResult {
  measurements: number
  files: number
  failed: number
}

export const getLastPrefetchAt = (): number | null => {
  const raw = localStorage.getItem(LAST_PREFETCH_KEY)
  const value = raw ? Number(raw) : NaN
  return Number.isFinite(value) ? value : null
}

// Замеры, ради которых стоит тратить трафик: незакрытые и недавно закрытые.
// Обработанные менеджером в поле уже не редактируются.
const worthCaching = (m: MeasurementListItem): boolean =>
  m.id != null && !m.is_processed && !m.is_irrelevant

// Сначала то, что ближе к работе: незакрытые и с ближайшей датой замера
const byPriority = (a: MeasurementListItem, b: MeasurementListItem): number => {
  const rank = (m: MeasurementListItem): number => (m.is_done ? 1 : 0)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  const da = a.measurement_date ? Date.parse(a.measurement_date) : Number.MAX_SAFE_INTEGER
  const db = b.measurement_date ? Date.parse(b.measurement_date) : Number.MAX_SAFE_INTEGER
  return da - db
}

// Выполнить задачи пачками, не роняя всё из-за одной неудачной
const runPool = async <T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  onDone: () => void,
): Promise<number> => {
  let failed = 0
  let index = 0
  const next = async (): Promise<void> => {
    while (index < items.length) {
      const item = items[index++]
      try {
        await worker(item)
      } catch (error) {
        failed++
        console.warn('[Prefetch] Не удалось загрузить элемент:', error)
      }
      onDone()
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, next))
  return failed
}

// Файлы замера и его заказа: планы открывания, фото проёмов, подпись, документы.
// Видео пропускаем — они тяжёлые, а в поле не нужны.
const mediaUrls = (m: Measurement): string[] => {
  const urls: string[] = []
  for (const plan of m.opening_plan_urls || []) {
    if (plan?.url) urls.push(plan.url)
  }
  if (m.opening_plan_url) urls.push(m.opening_plan_url)
  if (m.signature_photo_url) urls.push(m.signature_photo_url)
  for (const a of m.attachments || []) {
    if (a.file_url) urls.push(a.file_url)
  }
  for (const op of m.openings || []) {
    for (const a of op.attachments || []) {
      if (a.file_url) urls.push(a.file_url)
    }
  }
  for (const a of m.order_attachments || []) {
    if (a.file_url && a.attachment_type !== 'video') urls.push(a.file_url)
  }
  return urls
}

// Положить файл в кеш. Когда страницей управляет service worker, достаточно
// обычного fetch — маршрут на /media/ сам сохранит ответ (и учтёт срок хранения).
// Без service worker (первый запуск, отключён) кладём в тот же кеш вручную.
const cacheFile = async (url: string): Promise<void> => {
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`)
  if (navigator.serviceWorker?.controller) return
  if (!('caches' in window)) return
  const cache = await caches.open(MEDIA_CACHE)
  await cache.put(url, response)
}

// Выгрузить в офлайн-кеш всё, что нужно для работы по замерам без связи.
export const prefetchMeasurementsForOffline = async (
  onProgress?: (progress: PrefetchProgress) => void,
): Promise<PrefetchResult> => {
  if (!navigator.onLine) {
    throw new Error('Нет связи — подключитесь к интернету и повторите')
  }

  const report = (stage: string, done: number, total: number) =>
    onProgress?.({ stage, done, total })

  report('Список замеров', 0, 1)
  let list: MeasurementListItem[]
  try {
    const response = await apiClient.get('/measurements/')
    list = Array.isArray(response.data) ? response.data : (response.data.results || [])
  } catch (error: any) {
    throw new Error(
      `Не удалось получить список замеров: ${error?.message || 'сервер недоступен'}`,
    )
  }
  await measurementUtils.saveList(list)
  await cacheUtils.set(`measurements_list_${JSON.stringify({})}`, list, PREFETCH_TTL)

  // Счётчики папок офлайн-фолбэка не имеют — греем их кеш здесь
  await Promise.all(
    [
      { key: 'measurements_folder_counts_all', params: {} },
      { key: 'measurements_folder_counts_mine', params: { mine: 'true' } },
    ].map(async ({ key, params }) => {
      try {
        const response = await apiClient.get('/measurements/folder_counts/', { params })
        const data = Array.isArray(response.data) ? response.data : []
        await cacheUtils.set(key, data, PREFETCH_TTL)
      } catch {
        /* счётчики не критичны — без них список всё равно работает */
      }
    }),
  )
  report('Список замеров', 1, 1)

  const targets = list.filter(worthCaching).sort(byPriority).slice(0, MAX_MEASUREMENTS)

  const files = new Set<string>()
  const orderIds = new Set<number>()
  let loadedMeasurements = 0
  let done = 0

  const failedDetails = await runPool(
    targets,
    async (item) => {
      const response = await apiClient.get(`/measurements/${item.id}/`)
      const detail: Measurement = response.data
      await measurementUtils.saveDetail(detail)
      await cacheUtils.set(`measurement_detail_${detail.id}`, detail, PREFETCH_TTL)
      // Проёмы кладём и в отдельную таблицу: офлайн-правка проёма ищет его там
      await measurementUtils.saveOpenings(detail.id, detail.openings || [])
      await cacheUtils.set(
        `measurement_openings_${detail.id}`, detail.openings || [], PREFETCH_TTL,
      )
      loadedMeasurements++
      for (const url of mediaUrls(detail)) files.add(url)
      if (detail.order_id) orderIds.add(detail.order_id)
    },
    () => report('Карточки замеров', ++done, targets.length),
  )

  // Заказ к замеру: СМ по ссылке из карточки смотрит позиции КП
  done = 0
  const orders = Array.from(orderIds)
  const failedOrders = await runPool(
    orders,
    async (orderId) => {
      const response = await apiClient.get(`/orders/${orderId}/`)
      const order: Order = response.data
      await orderUtils.saveDetail(order)
      await cacheUtils.set(`order_detail_${orderId}`, order, PREFETCH_TTL)
    },
    () => report('Заказы', ++done, orders.length),
  )

  done = 0
  const fileList = Array.from(files).slice(0, MAX_FILES)
  const failedFiles = await runPool(
    fileList,
    (url) => cacheFile(url),
    () => report('Файлы и планы открывания', ++done, fileList.length),
  )

  localStorage.setItem(LAST_PREFETCH_KEY, String(Date.now()))

  return {
    measurements: loadedMeasurements,
    files: fileList.length - failedFiles,
    failed: failedDetails + failedOrders + failedFiles,
  }
}
