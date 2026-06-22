import { useEffect } from 'react'

interface FileViewerProps {
  fileUrl: string | null
  fileName?: string
  onClose: () => void
}

const FileViewer = ({ fileUrl, fileName, onClose }: FileViewerProps) => {
  useEffect(() => {
    if (fileUrl) {
      // Блокируем скролл body при открытом модальном окне
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = 'unset'
      }
    }
  }, [fileUrl])

  if (!fileUrl) return null

  // Нормализуем URL: если страница загружена по HTTPS, а URL файла по HTTP, заменяем на HTTPS
  const normalizeUrl = (url: string): string => {
    // Если URL относительный, возвращаем как есть
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return url
    }
    
    // Если страница загружена по HTTPS, а URL файла по HTTP, заменяем на HTTPS
    if (window.location.protocol === 'https:' && url.startsWith('http://')) {
      return url.replace('http://', 'https://')
    }
    
    return url
  }

  const normalizedUrl = normalizeUrl(fileUrl)

  // Определяем тип файла. Берём расширение в первую очередь из ИМЕНИ файла —
  // у blob-URL (URL.createObjectURL при создании) расширения нет, а у обычных
  // ссылок может быть query-строка (?token=...), ломающая якорь $. Поэтому
  // отрезаем query/hash и проверяем сначала имя, затем сам URL.
  const detectType = (s: string): 'image' | 'video' | 'pdf' | 'other' | null => {
    const v = s.toLowerCase().split('?')[0].split('#')[0]
    if (v.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif|avif)$/)) return 'image'
    if (v.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/)) return 'video'
    if (v.match(/\.(pdf)$/)) return 'pdf'
    return null
  }

  const fileType: 'image' | 'video' | 'pdf' | 'other' =
    detectType(fileName || '') || detectType(normalizedUrl) || 'other'

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black bg-opacity-90"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Шапка — всегда поверх контента, iframe не может её перекрыть */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 shrink-0">
        <span className="text-sm text-gray-300 truncate max-w-[60vw]">{fileName || 'Файл'}</span>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {/* Скачать — для любого типа файла */}
          <a
            href={normalizedUrl}
            download={fileName || true}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 active:bg-primary-800"
            aria-label="Скачать"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Скачать
          </a>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-100 active:bg-gray-200"
            aria-label="Закрыть"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Закрыть
          </button>
        </div>
      </div>

      {/* Контент файла */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        onClick={handleBackdropClick}
      >
        {fileType === 'image' && (
          <img
            src={normalizedUrl}
            alt={fileName || 'Изображение'}
            className="max-w-full max-h-full object-contain"
          />
        )}

        {fileType === 'video' && (
          <video
            src={normalizedUrl}
            controls
            className="max-w-full max-h-full"
          >
            Ваш браузер не поддерживает воспроизведение видео.
          </video>
        )}

        {fileType === 'pdf' && (
          <iframe
            src={normalizedUrl}
            className="w-full h-full bg-white"
            title={fileName || 'PDF документ'}
          />
        )}

        {fileType === 'other' && (
          <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md mx-4">
            <div className="text-center">
              <svg className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-semibold text-gray-900 mb-2">{fileName || 'Файл'}</p>
              <p className="text-sm text-gray-600 mb-4">Этот тип файла не может быть отображен в просмотрщике</p>
              <a
                href={normalizedUrl}
                download={fileName}
                className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Скачать файл
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FileViewer
