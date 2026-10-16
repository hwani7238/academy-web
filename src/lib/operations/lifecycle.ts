import { seoulDay, validDay } from './model';
export type Lifecycle = { status: 'active' | 'paused' | 'withdrawn'; until: string; withdrawnOn?: string; note: string; updatedAt: string; deletedAt?: string };
export function enrollmentState(value?: Lifecycle, today = seoulDay()): Lifecycle['status'] {
  if (value?.deletedAt) return 'withdrawn';
  if (!value || value.status === 'active' || (value.status === 'paused' && value.until && today > value.until)) return 'active';
  return value.status;
}

export function deleteOrRestoreEnrollment(old: Lifecycle | undefined, input: Record<string, unknown>, stamp: string, today = seoulDay()): Lifecycle {
  if ((old?.updatedAt || '') !== (input.expectedUpdatedAt || '')) throw Error('학생 상태가 변경됐습니다. 창을 닫고 다시 확인해주세요.');
  if (input.action === 'restoreEnrollment') {
    if (!old?.deletedAt) throw Error('삭제된 항목이 아닙니다.');
    const restored = { ...old, updatedAt: stamp };
    delete restored.deletedAt;
    return restored;
  }
  if (input.action !== 'deleteEnrollment') throw Error('지원하지 않는 작업입니다.');
  if (!old || old.deletedAt || enrollmentState(old, today) === 'active') throw Error('현재 휴원·퇴원 중인 과목만 삭제할 수 있습니다.');
  return { ...old, deletedAt: stamp, updatedAt: stamp };
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
