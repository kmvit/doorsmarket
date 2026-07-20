import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { measurementsAPI } from '../../api/measurements'
import { Measurement, MeasurementOpening } from '../../types/measurements'

/**
 * Печатная версия бланка замера. Рендерится на клиенте из кешированных данных,
 * поэтому работает и в офлайн-режиме: СМ на объекте может открыть бланк,
 * распечатать его или сохранить в PDF через системный диалог печати.
 */

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v))

const fmtSize = (h: number | null, w: number | null, d?: number | null) => {
  if (h == null && w == null) return '—'
  let s = `${dash(h)}×${dash(w)}`
  if (d) s += `×${d}`
  return s
}

// Пометка «доработать проём»: по высоте допускается отклонение до 10 мм включительно
const needsRework = (op: MeasurementOpening): boolean =>
  Boolean(
    (op.recommended_opening_height && op.actual_height
      && Math.abs(op.recommended_opening_height - op.actual_height) > 10)
    || (op.recommended_opening_width && op.actual_width
      && op.recommended_opening_width !== op.actual_width),
  )

const HideOnError = ({ src, alt, className }: { src: string; alt: string; className?: string }) => {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

const MeasurementBlankPrint = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [m, setM] = useState<Measurement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    measurementsAPI
      .getById(Number(id))
      .then(setM)
      .catch(() => setError('Замер не найден. В офлайн-режиме доступны только замеры, открытые ранее на этом устройстве.'))
  }, [id])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-5 rounded-xl max-w-md text-center">
          <p className="mb-3">{error}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-red-600 hover:underline">← Назад</button>
        </div>
      </div>
    )
  }

  if (!m) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  const smName = m.service_manager_name || '—'
  const openingImages = m.attachments.filter(
    (a) => a.file_url && /\.(jpe?g|png|gif|webp|bmp)$/i.test(a.file_url.split('?')[0]),
  )

  return (
    <div className="bg-white min-h-screen">
      {/* Стили печати */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .blank-page { padding: 0 !important; max-width: none !important; box-shadow: none !important; }
          .photo-page { page-break-before: always; }
        }
        @page { size: A4; margin: 14mm 12mm; }
        table.openings th, table.openings td { border: 1px solid #bbb; padding: 3px 4px; font-size: 10px; text-align: center; vertical-align: top; overflow-wrap: break-word; }
        table.openings th { background: #eef2f7; font-weight: 700; }
        table.openings td.left { text-align: left; }
      `}</style>

      {/* Панель управления (не печатается) */}
      <div className="no-print sticky top-0 z-10 bg-gray-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/measurements/${m.id}`)} className="text-sm text-gray-300 hover:text-white">
            ← К замеру
          </button>
          <span className="text-sm font-medium">Бланк замера №{m.id}</span>
          {!navigator.onLine && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500 text-white">📡 офлайн</span>
          )}
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 text-sm font-semibold bg-primary-600 hover:bg-primary-700 rounded-lg"
        >
          🖨 Печать / Сохранить в PDF
        </button>
      </div>

      <div className="blank-page max-w-4xl mx-auto p-8 text-[13px] text-gray-900">
        {/* Шапка */}
        <div className="flex justify-between items-start border-b-2 border-gray-800 pb-3 mb-4">
          <div>
            <h1 className="text-xl font-bold m-0">Замеры дверных проёмов</h1>
            <div className="text-xs text-gray-500">
              к договору № {dash(m.kp_number)}
              {m.kp_date ? ` от ${new Date(m.kp_date).toLocaleDateString('ru-RU')}` : ''}
            </div>
          </div>
          <div className="text-xs text-gray-500 text-right">
            {m.measurement_date && (
              <>Дата замера: <b className="text-gray-900">{new Date(m.measurement_date).toLocaleString('ru-RU')}</b><br /></>
            )}
            Сервис-менеджер: <b className="text-gray-900">{smName}</b>
          </div>
        </div>

        {/* Информация о заказе */}
        <table className="w-full mb-4 text-[13px]">
          <tbody>
            <tr>
              <td className="text-gray-500 pr-2 py-0.5 whitespace-nowrap">Клиент</td>
              <td className="font-semibold py-0.5">{dash(m.client_name)}</td>
              <td className="text-gray-500 pr-2 py-0.5 whitespace-nowrap">Контактное лицо</td>
              <td className="font-semibold py-0.5">
                {dash(m.contact_name)}{m.contact_position ? ` (${m.contact_position})` : ''}
              </td>
            </tr>
            <tr>
              <td className="text-gray-500 pr-2 py-0.5">Адрес</td>
              <td className="font-semibold py-0.5">{dash(m.address)}</td>
              <td className="text-gray-500 pr-2 py-0.5">Телефон</td>
              <td className="font-semibold py-0.5">{dash(m.contact_phone)}</td>
            </tr>
            <tr>
              <td className="text-gray-500 pr-2 py-0.5">Лифт</td>
              <td className="font-semibold py-0.5">{m.lift_available === true ? 'есть' : m.lift_available === false ? 'нет' : '—'}</td>
              <td className="text-gray-500 pr-2 py-0.5">Лестница</td>
              <td className="font-semibold py-0.5">{m.stairs_available === true ? 'есть' : m.stairs_available === false ? 'нет' : '—'}</td>
            </tr>
            <tr>
              <td className="text-gray-500 pr-2 py-0.5">Пронос до подъезда</td>
              <td className="font-semibold py-0.5">{m.carry_to_entrance === true ? 'нужен' : m.carry_to_entrance === false ? 'не нужен' : '—'}</td>
              <td className="text-gray-500 pr-2 py-0.5">Этаж</td>
              <td className="font-semibold py-0.5">{dash(m.floor_number)}</td>
            </tr>
            <tr>
              <td className="text-gray-500 pr-2 py-0.5">Готовность пола</td>
              <td className="font-semibold py-0.5">{dash(m.floor_readiness)}</td>
              <td className="text-gray-500 pr-2 py-0.5">Проёмов</td>
              <td className="font-semibold py-0.5">{m.openings.length}</td>
            </tr>
          </tbody>
        </table>

        {/* Проёмы */}
        <div className="text-base font-bold border-l-4 border-blue-600 pl-2 mb-2">Проёмы</div>
        <table className="openings w-full border-collapse mb-4">
          <thead>
            <tr>
              <th>№</th>
              <th>Помещение</th>
              <th>Тип двери</th>
              <th>Факт. проём<br />В×Ш×Гл, мм</th>
              <th>Рек. дверь<br />В×Ш</th>
              <th>Рек. проём<br />В×Ш</th>
              <th>Доработать<br />размеры проёмов</th>
              <th>Открывание</th>
              <th>Добор</th>
              <th>Наличник<br />лицев.</th>
              <th>Наличник<br />обор.</th>
              <th>Доп. фурнитура</th>
              <th>Порог</th>
              <th>Примечания</th>
            </tr>
          </thead>
          <tbody>
            {m.openings.length === 0 ? (
              <tr><td colSpan={14} className="text-gray-500">Проёмы не заполнены</td></tr>
            ) : (
              m.openings.map((op) => (
                <tr key={op.id}>
                  <td>{op.opening_number}</td>
                  <td className="left">{dash(op.room_name)}</td>
                  <td>{dash(op.door_type_display)}</td>
                  <td>{fmtSize(op.actual_height, op.actual_width, op.actual_depth)}</td>
                  <td>{fmtSize(op.recommended_door_height, op.recommended_door_width)}</td>
                  <td>{fmtSize(op.recommended_opening_height, op.recommended_opening_width)}</td>
                  <td>
                    {needsRework(op)
                      ? <span className="text-red-700 font-semibold">доработать проём до рекомендуемого размера</span>
                      : '—'}
                  </td>
                  <td>{dash(op.opening_type_display)}</td>
                  <td>{dash(op.addon_width)}</td>
                  <td className="left">{dash(op.face_trim_qty)}{op.face_trim_comment ? ` (${op.face_trim_comment})` : ''}</td>
                  <td className="left">{dash(op.back_trim_qty)}{op.back_trim_comment ? ` (${op.back_trim_comment})` : ''}</td>
                  <td className="left">{dash(op.extra_hardware)}</td>
                  <td className="left">{dash(op.threshold)}</td>
                  <td className="left">{dash(op.notes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Условия подписания */}
        <div className="border border-gray-300 bg-gray-50 rounded p-3 text-xs leading-relaxed mb-5">
          <b>Условия подписания.</b> Подтверждаю правильность снятых замеров, согласованные размеры дверей и проёмов,
          тип открывания и комплектацию, указанные в настоящем бланке, а также то, что:
          <ol className="list-decimal pl-5 mt-1 space-y-0.5">
            <li>Рекомендации по подготовке проёмов получил(а) и ознакомлен(а).</li>
            <li>Стены отделаны «по уровню», не имеют отклонений от вертикальной и горизонтальной осей.</li>
            <li>Напольное покрытие уложено до монтажа, по уровню, в одной плоскости (ровное).</li>
            <li>Стены для стеновых панелей выровнены, загрунтованы.</li>
            <li>Стыки напольных покрытий выполнены под полотном двери.</li>
          </ol>
        </div>

        {/* Подписи */}
        <div className="flex justify-between gap-8 mb-6">
          <div className="flex-1">
            <div className="border-t border-gray-700 mt-12 pt-1 text-xs text-gray-600">Клиент (ФИО, подпись)</div>
          </div>
          <div className="flex-1">
            <div className="border-t border-gray-700 mt-12 pt-1 text-xs text-gray-600">Сервис-менеджер: {smName}</div>
          </div>
        </div>

        <div className="border-t border-gray-300 pt-3 text-xs leading-relaxed">
          <div>Замер произвёл (СМ): <b>{smName}</b> &nbsp; ____________________________</div>
          <div className="text-red-700 font-semibold mt-2">Рекомендуемые размеры проёма даны от «ЧИСТОГО» ПОЛА!!!</div>
          <div className="text-gray-500 mt-2">
            Внимание! После подписания замера ответственность за любые изменения размеров проёмов, напольного покрытия
            и отделки стен несёт покупатель. Такие изменения могут повлиять на возможность монтажа, сроки и стоимость.
          </div>
        </div>

        {/* Фото подписанного бланка */}
        {m.signature_photo_url && (
          <div className="mt-4">
            <div className="text-xs text-gray-500 mb-1">Фото подписанного бланка:</div>
            <HideOnError src={m.signature_photo_url} alt="Подпись" className="max-w-[300px] max-h-[170px] border border-gray-300" />
          </div>
        )}

        {/* Фото/схемы проёмов — каждое на отдельной странице */}
        {openingImages.map((att) => {
          const op = m.openings.find((o) => o.id === att.opening)
          return (
            <div key={att.id} className="photo-page mt-6">
              <div className="text-xs text-gray-500 mb-1">
                {op ? `Проём № ${op.opening_number}${op.room_name ? ` — ${op.room_name}` : ''}` : att.name || 'Фото'}
              </div>
              <HideOnError src={att.file_url!} alt="Схема проёма" className="w-full max-h-[900px] object-contain" />
            </div>
          )
        })}

        {/* План открывания */}
        {m.opening_plan_url && (
          <div className="photo-page mt-6">
            <div className="text-xs text-gray-500 mb-1">План открывания</div>
            <HideOnError src={m.opening_plan_url} alt="План открывания" className="w-full max-h-[900px] object-contain" />
          </div>
        )}
      </div>
    </div>
  )
}

export default MeasurementBlankPrint
