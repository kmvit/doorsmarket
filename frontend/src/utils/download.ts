/**
 * Прямое скачивание файла по URL — БЕЗ открытия встроенного просмотрщика.
 *
 * Качаем содержимое как blob и кликаем по временной ссылке, поэтому браузер
 * сохраняет файл, а не открывает его (актуально для КП в формате docx/pdf,
 * которые иначе открывались во вьюере и «подвешивали» окно).
 * Если fetch не удался (CORS/сеть) — запасной вариант: открыть в новой вкладке.
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  if (!url) return

  let u = url
  if (window.location.protocol === 'https:' && u.startsWith('http://')) {
    u = u.replace('http://', 'https://')
  }

  const nameFromUrl = u.split('/').pop()?.split('?')[0] || 'file'
  let downloadName = filename || nameFromUrl
  // Имя из пути/URL может быть percent-encoded (кириллица → %D0%BE…) —
  // декодируем, чтобы файл сохранялся под читаемым именем.
  try {
    downloadName = decodeURIComponent(downloadName)
  } catch {
    /* оставляем как есть, если строка не является валидным URI-компонентом */
  }

  try {
    const resp = await fetch(u, { credentials: 'include' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    saveBlob(blob, downloadName)
  } catch {
    // Не удалось скачать как blob — открываем в новой вкладке, чтобы текущее
    // окно не блокировалось.
    window.open(u, '_blank', 'noopener')
  }
}


export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
