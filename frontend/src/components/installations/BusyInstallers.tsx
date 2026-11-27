import type { Installer, ScheduleVisit } from '../../types/installations'

interface Props {
  visits: ScheduleVisit[]
  installers: Installer[]
  onSelect: (id: number) => void
}

export default function BusyInstallers({ visits, installers, onSelect }: Props) {
  const busy = new Map<number, string[]>()
  for (const visit of visits) {
    for (const installer of visit.installers) {
      const comments = busy.get(installer.id) ?? []
      if (visit.kind === 'day_off' && visit.work_description) comments.push(visit.work_description)
      busy.set(installer.id, comments)
    }
  }
  return <ul className="space-y-1 mt-0.5">
    {installers.filter(person => busy.has(person.id)).map(person => {
      const hue = (person.id * 137.508) % 360
      return <li key={person.id}>
        <button type="button" onClick={() => onSelect(person.id)}
          className="block w-full rounded border-l-4 px-1 py-1 text-left text-xs leading-tight break-words text-gray-900 hover:underline"
          style={{ backgroundColor: `hsl(${hue}, 75%, 91%)`, borderColor: `hsl(${hue}, 60%, 40%)` }}>
          {person.full_name}
          {busy.get(person.id)?.map((comment, index) => (
            <span key={index} className="block">Выходной: {comment}</span>
          ))}
        </button>
      </li>
    })}
  </ul>
}
