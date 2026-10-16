import type { LessonSchedule } from '@/lib/operations/schedule';
import { scheduleSummary } from '@/lib/operations/schedule';

// Both lists show the current course schedule, independent of the month being viewed.
export function ScheduleSummary({ schedule, today, busy, onClick }: {
  schedule?: LessonSchedule; today: string; busy: boolean; onClick: () => void;
}) {
  const summary = scheduleSummary(schedule, today);
  return <><button className="schedule-link" disabled={busy} title="현재 정규 수업 요일 설정" onClick={onClick}>{summary.label}</button>
    {summary.upcoming.map(change => <small key={change.start} className="schedule-change-hint">{change.start}부터 · {change.label}</small>)}
  </>;
}
