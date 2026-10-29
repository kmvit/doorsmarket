import { RatingScores } from '../../types/installations'

export const Stars = ({ score }: { score: number | null }) =>
  score ? (
    <span className="whitespace-nowrap" aria-label={`${score} из 5`}>
      <span className="text-amber-500">{'★'.repeat(score)}</span>
      <span className="text-gray-300">{'★'.repeat(5 - score)}</span>
    </span>
  ) : <span className="text-gray-400">—</span>

/** Оценка клиента по параметрам: баллы и комментарии */
const RatingView = ({ rating }: { rating: RatingScores }) => (
  <ul className="divide-y divide-gray-100">
    {rating.items.map((i) => (
      <li key={i.key} className="py-1.5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-gray-700">{i.label}</span>
          <Stars score={i.score} />
        </div>
        {i.comment && <p className="text-xs text-gray-500 mt-0.5">«{i.comment}»</p>}
      </li>
    ))}
  </ul>
)

export default RatingView
