import { useState } from 'react'
import { complaintsAPI } from '../../api/complaints'

interface AttachmentUploadProps {
  complaintId: number
  onUploaded?: () => void
}

const AttachmentUpload = ({ complaintId, onUploaded }: AttachmentUploadProps) => {
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
      setError('')
    }
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Выберите файлы для загрузки')
      return
    }

    setIsUploading(true)
    setError('')

    try {
      // Загружаем файлы по одному
      for (const file of files) {
        // Определяем тип вложения по расширению
        let attachmentType = 'document'
        const extension = file.name.split('.').pop()?.toLowerCase()
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
          attachmentType = 'photo'
        } else if (['mp4', 'avi', 'mov', 'wmv'].includes(extension || '')) {
          attachmentType = 'video'
        }

        await complaintsAPI.uploadAttachment(complaintId, file, attachmentType)
      }

      setFiles([])
      if (onUploaded) onUploaded()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки файлов')
    } finally {
      setIsUploading(false)
    }
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Загрузить вложения</h2>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Фото/Видео/Документы
        </label>
        <input
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileChange}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          Можно выбрать несколько файлов. Поддерживаются изображения, видео и документы.
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Выбранные файлы:</p>
          {files.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
              <span className="text-xs text-gray-500 ml-2">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <button
                onClick={() => removeFile(index)}
                className="ml-2 p-1 text-red-600 hover:text-red-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={isUploading}
          className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? 'Загрузка...' : 'Загрузить файлы'}
        </button>
      )}
    </div>
  )
}

export default AttachmentUpload

