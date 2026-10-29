import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicActAPI, apiErrorText } from '../../api/installations'
import { PublicActPage } from '../../types/installations'

/**
 * Страница клиента по ссылке из СМС (/m/{код}), без входа. Монтажу не
 * подписали акт на месте: здесь клиент смотрит акт и фото работ, подтверждает
 * выполнение, распечатывает акт, подписывает и прикладывает фото или скан.
 */
const ClientActPage = () => {
  const { code = '' } = useParams()
  const [page, setPage] = useState<PublicActPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    publicActAPI.get(code)
      .then(setPage)
      .catch((err) => setError(err?.response?.status === 404 ? 'Ссылка не найдена или устарела.' : 'Не удалось открыть страницу. Попробуйте позже.'))
  }, [code])

  const confirm = async () => {
    setBusy(true)
    try {
      setPage(await publicActAPI.confirm(code))
      setMessage('Спасибо! Теперь распечатайте акт, подпишите и приложите его фото или скан ниже.')
    } catch (err) {
      setMessage(apiErrorText(err, 'Не удалось сохранить подтверждение'))
    } finally {
      setBusy(false)
    }
  }

  const upload = async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setMessage(null)
    try {
      let last = page
      for (const f of files) last = await publicActAPI.upload(code, f)
      setPage(last)
      setMessage('Спасибо! Акт получен — монтажник проверит подпись.')
    } catch (err) {
      setMessage(apiErrorText(err, 'Не удалось загрузить файл'))
    } finally {
      setBusy(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <p className="text-center text-sm font-semibold text-primary-700 tracking-wide mb-4">Академия Дверей</p>
        {children}
      </div>
    </div>
  )

  if (error) return shell(<div className="bg-white rounded-2xl shadow-sm p-6 text-center text-gray-700">{error}</div>)
  if (!page) {
    return shell(
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>,
    )
  }

  const last = page.last_upload
  const waitingReview = last?.review_status === 'pending'

  return shell(
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Акт выполненных работ</h1>
        <p className="text-sm text-gray-600">Монтаж №{page.id} · {page.client_name}</p>
        {page.address && <p className="text-sm text-gray-500">{page.address}</p>}
        {page.work_description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{page.work_description}</p>}
      </div>

      {!page.awaiting_signature ? (
        <div className="bg-white rounded-2xl shadow-sm p-5 text-center text-gray-700">
          {page.signed || page.status === 'done'
            ? 'Акт подписан. Спасибо, что выбрали нас!'
            : 'Акт по этому монтажу сейчас не ждёт подписи.'}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-2">1. Посмотрите акт и фото работ</h2>
            <ul className="space-y-2">
              {page.documents.map((d) => (
                <li key={d.id}>
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                    {d.kind === 'act_unsigned' ? '📄 ' : '🖼 '}{d.kind === 'act_unsigned' ? 'Акт выполненных работ' : d.name}
                  </a>
                </li>
              ))}
            </ul>
            {!page.client_confirmed_at ? (
              <button type="button" onClick={confirm} disabled={busy}
                className="mt-4 w-full py-3 rounded-xl text-white font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
                Подтверждаю: работы выполнены
              </button>
            ) : (
              <p className="mt-3 text-sm text-green-700">✓ Вы подтвердили выполнение работ</p>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-1">2. Приложите подписанный акт</h2>
            <p className="text-sm text-gray-600 mb-3">
              Распечатайте акт, подпишите и сфотографируйте или отсканируйте его.
            </p>
            {last?.review_status === 'rejected' && (
              <p className="mb-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                Прошлый акт не принят: {last.review_comment}. Приложите, пожалуйста, ещё раз.
              </p>
            )}
            {waitingReview ? (
              <p className="text-sm text-green-700">✓ Акт получен, монтажник проверяет подпись.</p>
            ) : (
              <label className={`block w-full py-3 rounded-xl text-center font-medium border-2 border-dashed border-primary-300 text-primary-700 cursor-pointer hover:bg-primary-50 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                {busy ? 'Загрузка…' : '📷 Сфотографировать или выбрать файл'}
                <input type="file" accept="image/*,application/pdf" multiple className="hidden"
                  onChange={(e) => { upload(Array.from(e.target.files || [])); e.target.value = '' }} />
              </label>
            )}
          </div>
        </>
      )}

      {message && <p className="text-sm text-center text-gray-700">{message}</p>}
    </div>,
  )
}

export default ClientActPage
