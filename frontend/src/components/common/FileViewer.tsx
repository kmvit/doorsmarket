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

  // Определяем тип файла для правильного отображения
  const getFileType = (url: string): 'image' | 'video' | 'pdf' | 'other' => {
    const lowerUrl = url.toLowerCase()
    if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/)) return 'image'
    if (lowerUrl.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/)) return 'video'
    if (lowerUrl.match(/\.(pdf)$/)) return 'pdf'
    return 'other'
  }

  const fileType = getFileType(normalizedUrl)

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="relative w-full h-full flex items-center justify-center p-4">
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors"
          aria-label="Закрыть"
        >
          <svg
            className="h-6 w-6 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Контент файла */}
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          {fileType === 'image' && (
            <img
              src={normalizedUrl}
              alt={fileName || 'Изображение'}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          )}

          {fileType === 'video' && (
            <video
              src={normalizedUrl}
              controls
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
            >
              Ваш браузер не поддерживает воспроизведение видео.
            </video>
          )}

          {fileType === 'pdf' && (
            <iframe
              src={normalizedUrl}
              className="w-[90vw] h-[90vh] rounded-lg shadow-2xl bg-white"
              title={fileName || 'PDF документ'}
            />
          )}

          {fileType === 'other' && (
            <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md">
              <div className="text-center">
                <svg
                  className="h-16 w-16 mx-auto text-gray-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-lg font-semibold text-gray-900 mb-2">
                  {fileName || 'Файл'}
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  Этот тип файла не может быть отображен в просмотрщике
                </p>
                <a
                  href={normalizedUrl}
                  download={fileName}
                  className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <svg
                    className="h-5 w-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Скачать файл
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FileViewer
