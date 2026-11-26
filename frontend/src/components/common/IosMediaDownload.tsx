import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { saveBlob } from '../../utils/download'

interface Props {
  url: string
  name?: string
  className: string
  children: ReactNode
}

export default function IosMediaDownload({ url, name, className, children }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  const prepareFile = async () => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (controller.signal.aborted) return
      const pathName = new URL(url, window.location.href).pathname.split('/').pop()
      setFile(new File([blob], name || pathName || 'Файл', { type: blob.type }))
    } catch {
      if (!controller.signal.aborted) setError('Не удалось загрузить файл. Попробуйте ещё раз.')
    } finally {
      request.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  const saveFile = async () => {
    if (!file) return
    setError('')
    try {
      // Вызываем системное меню сразу по нажатию: загрузка может занять
      // больше времени, чем действует разрешение браузера на navigator.share.
      const data = { files: [file] }
      if (navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data)
      } else {
        saveBlob(file, file.name)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Не удалось сохранить файл. Попробуйте ещё раз.')
    }
  }

  return (
    <div className="relative">
      <button type="button" className={className} disabled={loading} onClick={file ? saveFile : prepareFile}>
        {children}
        {loading ? 'Загрузка…' : file ? 'Сохранить' : 'Скачать'}
      </button>
      {error && (
        <p role="alert" className="absolute right-0 top-full z-10 mt-2 w-56 rounded-lg bg-gray-900 p-2 text-sm text-white">
          {error}
        </p>
      )}
    </div>
  )
}
