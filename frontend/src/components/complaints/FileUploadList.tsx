// File здесь - это нативный File из браузера, не тип из complaints

interface FileUploadListProps {
  files: File[]
  onRemove: (index: number) => void
  onPreview?: (index: number) => void
  type?: 'attachments' | 'commercial_offers'
}

const FileUploadList = ({ files, onRemove, onPreview, type = 'attachments' }: FileUploadListProps) => {
  if (files.length === 0) return null

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Б'
    const k = 1024
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileType = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop()
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'Фото'
    if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext || '')) return 'Видео'
    if (['pdf'].includes(ext || '')) return 'PDF'
    if (['doc', 'docx'].includes(ext || '')) return 'Word'
    if (['xls', 'xlsx'].includes(ext || '')) return 'Excel'
    return 'Документ'
  }

  const getFileIcon = (fileType: string) => {
    if (fileType === 'Фото') {
      return (
        <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    }
    if (fileType === 'Видео') {
      return (
        <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )
    }
    return (
      <svg className="h-8 w-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )
  }

  const handlePreview = (index: number) => {
    if (!onPreview) return
    const file = files[index]
    if (!file) return
    
    const fileURL = URL.createObjectURL(file)
    const newTab = window.open(fileURL, '_blank')
    
    if (!newTab) {
      alert('Не удалось открыть файл. Разрешите всплывающие окна в браузере.')
      URL.revokeObjectURL(fileURL)
      return
    }
    
    newTab.onload = () => {
      URL.revokeObjectURL(fileURL)
    }
  }

  const bgColor = type === 'commercial_offers' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'

  return (
    <div className="mt-3 space-y-2">
      {files.map((file, index) => {
        const fileType = getFileType(file.name)
        const fileSize = formatFileSize(file.size)
        
        return (
          <div
            key={index}
            className={`flex items-center justify-between p-3 ${bgColor} rounded-lg border animate-fadeIn`}
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="flex-shrink-0">
                {getFileIcon(fileType)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {fileSize} • {fileType}
                  {type === 'commercial_offers' && ` • КП #${index + 1}`}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {onPreview && (
                <button
                  type="button"
                  onClick={() => handlePreview(index)}
                  className="flex items-center px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                  title="Открыть файл"
                >
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-10 4h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Открыть
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="ml-2 flex-shrink-0 text-red-600 hover:text-red-700 transition-colors"
                title="Удалить файл"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default FileUploadList

