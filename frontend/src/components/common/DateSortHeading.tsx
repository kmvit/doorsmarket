import type { SortDirection } from '../../utils/dateSort'

export default function DateSortHeading({ children, className, direction, onToggle, title }: {
  children: string
  className: string
  direction: SortDirection | null
  onToggle: () => void
  title?: string
}) {
  return (
    <th scope="col" className={className} aria-sort={direction ?? 'none'}>
      <button type="button" onClick={onToggle} title={title}
        className="inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wider hover:text-primary-700">
        {children}
        <span aria-hidden="true">{direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}</span>
      </button>
    </th>
  )
}
