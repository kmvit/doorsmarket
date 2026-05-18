import { useState } from 'react'
import { OrderAttachment } from '../../types/orders'
import { ordersAPI } from '../../api/orders'
import FileViewer from '../common/FileViewer'

const TYPE_LABEL: Record<string, string> = {
  photo: 'Фото',
  video: 'Видео',
  document: 'Документ',
}

interface OrderAttachmentsBlockProps {
  orderId: number
  attachments: OrderAttachment[]
  canEdit?: boolean
  orderItemId?: number | null
  title?: string
  onUpdate?: () => void
  readOnly?: boolean
}

const OrderAttachmentsBlock = ({
  orderId,
  attachments,
  canEdit = false,
  orderItemId = null,
  title,
  onUpdate,
  readOnly = false,
}: OrderAttachmentsBlockProps) => {
  const [viewingFile, setViewingFile] = useState<{ url: string; name?: string } | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)

  const documents = attachments.filter((a) => a.attachment_type === 'document')
  const media = attachments.filter((a) => a.attachment_type === 'photo' || a.attachment_type === 'video')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await ordersAPI.uploadAttachment(orderId, file, orderItemId)
      }
      onUpdate?.()
    } catch {
      alert('Не удалось загрузить файл')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить вложение?')) return
    setDeletingId(id)
    try {
      await ordersAPI.deleteAttachment(id)
      onUpdate?.()
    } catch {
      alert('Не удалось удалить файл')
    } finally {
      setDeletingId(null)
    }
  }

  const renderList = (items: OrderAttachment[]) => {
    if (items.length === 0) return <p className="text-sm text-gray-400">Нет файлов</p>
    return (
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2 group">
            <button
              type="button"
              onClick={() => setViewingFile({ url: a.file_url || '', name: a.name || 'Файл' })}
              className="text-sm text-primary-600 hover:underline truncate text-left flex-1"
            >
              {a.name || 'Файл'}
              <span className="text-gray-400 ml-1 text-xs">
                ({TYPE_LABEL[a.attachment_type] || 'файл'}{a.file_size ? `, ${a.file_size}` : ''})
              </span>
            </button>
            {canEdit && !readOnly && (
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={deletingId === a.id}
                className="text-xs text-red-600 opacity-0 group-hover:opacity-100 hover:underline shrink-0"
              >
                удалить
              </button>
            )}
          </li>
        ))}
      </ul>
    )
  }

  const showUpload = canEdit && !readOnly

  return (
    <div className="space-y-3">
      {title && <p className="text-xs font-medium text-gray-500 uppercase">{title}</p>}

      <div>
        <p className="text-xs text-gray-500 mb-1">Документы</p>
        {renderList(documents)}
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1">Фото / видео</p>
        {renderList(media)}
      </div>

      {showUpload && (
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-primary-600 hover:underline">
          <input
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
          {uploading ? 'Загрузка…' : '+ Добавить файлы'}
        </label>
      )}

      <FileViewer
        fileUrl={viewingFile?.url || null}
        fileName={viewingFile?.name}
        onClose={() => setViewingFile(null)}
      />
    </div>
  )
}

export default OrderAttachmentsBlock
