'use client';
import { useMemo, useRef, useState } from 'react';
import { matchLessonSource, parseLessonSource } from '@/lib/operations/lesson-reference';
import { seoulDay, type Snapshot } from '@/lib/operations/model';
import { CloseButton } from './CloseButton';

export function LessonReferenceDialog({ data, month, save, close }: { data: Snapshot; month: string; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void }) {
  const [text, setText] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const input = JSON.parse(text);
      if (input.month !== month) throw Error('조회 중인 달과 장부의 달이 다릅니다.');
      const rows = parseLessonSource(input.rows, month);
      return { ok: true as const, source: String(input.source || ''), rows, ...matchLessonSource(rows, data.students, seoulDay()), error: '' };
    } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : '자료 형식을 확인해주세요.' }; }
  }, [text, month, data.students]);
  async function submit() {
    if (!preview?.ok || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await save({ action: 'reconcileLessonReferences', month, rows: preview.rows, source: preview.source, expectedRevision: data.sequenceContext?.referenceRevision || '' }) as { matched: number; cells: number; excluded: unknown[] };
      setMessage(`${result.matched}개 수강권 · ${result.cells}개 장부 회차 반영 완료 · 확인 필요 ${result.excluded.length}행 제외`);
    } catch (e) { setError(e instanceof Error ? e.message : '반영하지 못했습니다.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="panel-backdrop"><section className="edit-panel" role="dialog" aria-modal="true" aria-labelledby="lesson-reference-title">
    <div className="section-head"><h2 id="lesson-reference-title">{month} 장부 회차 맞추기</h2><CloseButton disabled={busy} onClick={close}/></div>
    <p>이름과 과목이 한 명에게만 일치하는 회차를 반영합니다. 여행·보강·일시 정지와 차감·수납 기록은 유지합니다. 미기록 날짜는 장부 회차로 표시합니다.</p>
    <label>출결 회차 자료<textarea rows={5} value={text} disabled={busy} onChange={e => { setText(e.target.value); setMessage(''); }} placeholder="원본 주소, 월, 학생별 이름·과목·날짜·회차 JSON"/></label>
    {preview?.error && <p className="error" role="alert">{preview.error}</p>}
    {preview?.ok && <>
      <p>{preview.matched.length}개 수강권 · {preview.references.length}개 회차 · 확인 필요 {preview.excluded.length}행</p>
      <details><summary>반영 대상 보기</summary><ul>{preview.matched.map(r => <li key={r.row}>{r.row}행 · {r.label} · {r.count}개 회차</li>)}</ul></details>
      <details open={preview.excluded.length > 0}><summary>확인 필요 · 반영 제외</summary><ul>{preview.excluded.map(r => <li key={r.row}>{r.row}행 · {r.label} — {r.reason}</li>)}</ul></details>
      <button className="primary" disabled={busy || !preview.references.length || Boolean(message)} onClick={() => void submit()}>{busy ? '반영 중…' : '회차 반영'}</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section></div>;
}
