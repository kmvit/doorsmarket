import { ComplaintAttachment } from '../../types/complaints'
import { complaintsAPI } from '../../api/complaints'
import { useState } from 'react'

interface AttachmentListProps {
  attachments: ComplaintAttachment[]
  complaintId: number
  canEdit?: boolean
  onUpdate?: () => void
}

const AttachmentList = ({ attachments, complaintId, canEdit = false, onUpdate }: AttachmentListProps) => {
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDelete = async (attachmentId: number) => {
    if (!confirm('Вы уверены, что хотите удалить это вложение?')) return

    setDeletingId(attachmentId)
    try {
      await complaintsAPI.deleteAttachment(complaintId, attachmentId)
      if (onUpdate) onUpdate()
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Ошибка удаления вложения')
    } finally {
      setDeletingId(null)
    }
  }

  const getFileIcon = (attachmentType: string) => {
    switch (attachmentType) {
      case 'photo':
        return (
          <svg className="h-12 w-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )
      case 'video':
        return (
          <svg className="h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )
      case 'commercial_offer':
        return (
          <svg className="h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      default:
        return (
          <svg className="h-12 w-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        )
    }
  }

  const regularAttachments = attachments.filter(a => a.attachment_type !== 'commercial_offer')
  const commercialOffers = attachments.filter(a => a.attachment_type === 'commercial_offer')

  return (
    <div className="space-y-6">
      {/* Обычные вложения */}
      {regularAttachments.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Вложения</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {regularAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors relative group"
              >
                <a
                  href={attachment.file_url || attachment.file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center"
                >
                  {getFileIcon(attachment.attachment_type)}
                  <p className="mt-2 text-sm font-medium text-gray-900 truncate">
                    {attachment.file?.split('/').pop() || 'Файл'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {attachment.file_size || ''}
                  </p>
                </a>
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      handleDelete(attachment.id)
                    }}
                    disabled={deletingId === attachment.id}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    title="Удалить"
                  >
                    {deletingId === attachment.id ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Коммерческие предложения */}
      {commercialOffers.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Коммерческие предложения</h2>
          <div className="space-y-2">
            {commercialOffers.map((attachment, index) => (
              <div key={attachment.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                <a
                  href={attachment.file_url || attachment.file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-sm text-primary-600 hover:text-primary-700 flex-1"
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  КП #{index + 1}
                  {attachment.file_size && (
                    <span className="ml-auto text-xs text-gray-500">{attachment.file_size}</span>
                  )}
                </a>
                {canEdit && (
                  <button
                    onClick={() => handleDelete(attachment.id)}
                    disabled={deletingId === attachment.id}
                    className="ml-2 p-1 text-red-600 hover:text-red-700"
                    title="Удалить"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AttachmentList

