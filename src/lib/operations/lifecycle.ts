import { seoulDay, validDay } from './model';
export type Lifecycle = { status: 'active' | 'paused' | 'withdrawn'; until: string; note: string; updatedAt: string };
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
  return {status,until,note};
}
