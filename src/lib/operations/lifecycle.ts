import { seoulDay, validDay } from './model';
export type Lifecycle = { status: 'active' | 'paused' | 'withdrawn'; until: string; withdrawnOn?: string; note: string; updatedAt: string };
export function enrollmentState(value?: Lifecycle, today = seoulDay()): Lifecycle['status'] {
  if (!value || value.status === 'active' || (value.status === 'paused' && value.until && today > value.until)) return 'active';
  return value.status;
}
export function lifecycleInput(input: Record<string, unknown>) {
  const status = input.status as Lifecycle['status'];
  if (!['active','paused','withdrawn'].includes(status)) throw Error('처리 상태를 선택해주세요.');
  const until = status === 'paused' ? validDay(input.until) : '';
  if (until && until < seoulDay()) throw Error('휴원 종료일은 오늘 이후로 선택해주세요.');
  const note = typeof input.note === 'string' ? input.note.trim().slice(0,500) : '';
  const withdrawnOn = status === 'withdrawn' ? validDay(input.withdrawnOn ?? seoulDay()) : '';
  if (withdrawnOn && withdrawnOn > seoulDay()) throw Error('퇴원일은 오늘 또는 이전 날짜로 선택해주세요.');
  return {status,until,withdrawnOn,note};
}

export function courseLifecycle(student: { lifecycle?: Lifecycle; courseLifecycles?: Record<string,Lifecycle> }, id: string): Lifecycle | undefined {
  return student.courseLifecycles?.[id] ?? student.lifecycle;
}
