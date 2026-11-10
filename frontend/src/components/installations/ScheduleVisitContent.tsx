import { ScheduleVisit } from '../../types/installations'

export const scheduleVisitTitle = (visit: ScheduleVisit) =>
  `${visit.kind === 'complaint' ? `Рекламация #${visit.complaint_id}, ${visit.window}\n` : ''}${visit.client_name}\n${visit.address}\n${visit.work_description}`

const ScheduleVisitContent = ({ visit }: { visit: ScheduleVisit }) => (
  <>
    {visit.kind === 'complaint' && <span className="block font-semibold">Рекламация</span>}
    <span className="font-semibold block truncate">{visit.client_name}</span>
    <span className="block truncate">{visit.address}</span>
    <span className="block truncate opacity-80">{visit.work_description}</span>
  </>
)

export default ScheduleVisitContent
