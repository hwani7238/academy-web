'use client';
import { calendarDay, HOLIDAY_YEARS } from '@/lib/operations/holidays';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ATTENDANCE_LABELS, AttendanceStatus, Snapshot, seoulDay, defaultAttendanceUnits } from '@/lib/operations/model';
import { GROUPS, groupName, compareGroups, compareStudents, displayCourseName } from '@/lib/operations/student-order';
export function MonthlyAttendance({ data, day, busy, save }: { data: Snapshot; day: string; busy: boolean; save: (v: Record<string, unknown>) => Promise<unknown> }) {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const subjects = useMemo(() => [...new Set([...GROUPS, ...data.students.map(groupName)])].sort(compareGroups), [data.students]);
  const filteredStudents = useMemo(() => data.students.filter(s => s.name.includes(search.trim()) && (!subject || groupName(s) === subject)).sort(compareStudents), [data.students, search, subject]);
  const [page, setPage] = useState(0);
  const pageSize = 40;
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleStudents = filteredStudents.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useEffect(() => { setPage(0); }, [subject, search]);
  const accountById = useMemo(() => new Map(data.accounts.map(a => [a.id, a])), [data.accounts]);
  const invoiceByStudent = useMemo(() => new Map(data.invoices.filter(i => i.status === 'open').map(i => [i.studentId, i])), [data.invoices]);
  const [selected, setSelected] = useState<{ studentId: string; day: string } | null>(null);
  const [detailed, setDetailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const quickRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if(selected && !detailed && quickRef.current && !quickRef.current.open) quickRef.current.showModal(); }, [selected, detailed]);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [units, setUnits] = useState(1); const [note, setNote] = useState(''); const [relatedDay, setRelatedDay] = useState(''); const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLTableCellElement>(null);
  const showDate = () => {
    const wrap = scrollRef.current; const cell = dateRef.current;
    if (wrap && cell) wrap.scrollLeft += cell.getBoundingClientRect().left - wrap.getBoundingClientRect().left - 160;
  };
  useEffect(() => { showDate(); }, [day]);
  const month = day.slice(0, 7); const today = seoulDay();
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const dates = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const lookup = useMemo(() => new Map(data.attendance.map(a => [`${a.studentId}_${a.day}`, a])), [data.attendance]);
  const legacy = useMemo(() => new Map((data.legacyAttendance || []).map(a => [`${a.studentId}_${a.day}`, a])), [data.legacyAttendance]);
  const student = data.students.find(s => s.id === selected?.studentId);
  const account = data.accounts.find(a => a.id === selected?.studentId);
  const current = selected ? lookup.get(`${selected.studentId}_${selected.day}`) : undefined;
  const [revision, setRevision] = useState('');
  function open(studentId: string, date: string) {
    const row = lookup.get(`${studentId}_${date}`);
    setDetailed(false); setSelected({ studentId, day: date }); setStatus(row?.status || 'present'); setUnits(row?.units ?? 1); setNote(row?.note || ''); setRelatedDay(row?.relatedDay || ''); setRevision(row?.updatedAt || ''); setError('');
  }
  async function commit(nextStatus: AttendanceStatus, nextUnits: number) {
    if (!selected || busy || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try { await save({ action: 'recordAttendance', ...selected, status: nextStatus, units: nextUnits, note, relatedDay: nextStatus === 'makeup' ? relatedDay : '', expectedUpdatedAt: revision }); setSelected(null); }
    catch(e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const course = student?.attendanceGroup || student?.instruments?.[0] || student?.name || '';
  return <><div className="section-head"><div><h2>{month} 월별 출석표</h2><p>학생·날짜 칸을 누르면 기록할 수 있어요. 빈칸은 미기록이며 결석을 뜻하지 않습니다.</p></div><button onClick={showDate}>조회 날짜 칸 보기</button><label>과목<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">전체 과목</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></label><label>학생 찾기<input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름" /></label></div>
    <p className="notice">출석 · 결석 · 보강을 글자로 구분합니다. 새 기록은 <strong>그날 차감한 횟수</strong>입니다. ‘원본 회차’는 이전 장부의 누적 회차이며 다시 차감하지 않습니다. 결제 상태와 남은 횟수는 현재 기준입니다.</p>
    <div className="table-wrap monthly-scroll" ref={scrollRef}><table className="monthly-table"><thead><tr><th>학생 / 현재 잔여</th>{dates.map((d, i) => { const calendar = calendarDay(d); return <th key={d} ref={d === day ? dateRef : undefined} title={calendar.holiday} aria-label={`${d} ${['일','월','화','수','목','금','토'][calendar.weekday]}${calendar.holiday ? ` · ${calendar.holiday}` : ''}`} className={`${d === today ? 'month-today' : ''} ${calendar.className}`}>{i + 1}<small>{['일','월','화','수','목','금','토'][calendar.weekday]}</small></th>; })}</tr></thead><tbody>
      {visibleStudents.map(s => { const a = accountById.get(s.id); const invoice = invoiceByStudent.get(s.id); return <tr key={s.id}><th><strong>{displayCourseName(s.name)}</strong><small>{a ? `잔여 ${a.remaining}회` : '수강 설정 필요'}</small>{invoice && <span className="attendance-badge billing">{invoice.needsReview ? '청구 확인 필요' : invoice.paid > 0 ? '부분 수납' : '결제 필요'}</span>}</th>{dates.map(d => { const r = lookup.get(`${s.id}_${d}`); const original = legacy.get(`${s.id}_${d}`); const st = r?.status || 'present'; return <td key={d} className={d === today ? 'month-today' : ''}><button disabled={busy || !a || d > today || Boolean(!r && original)} aria-label={`${displayCourseName(s.name)} ${d} ${r ? ATTENDANCE_LABELS[st] : '미기록'}`} onClick={() => open(s.id, d)} className={r ? `attendance-cell ${st}` : 'attendance-cell blank'}>{r ? <>{ATTENDANCE_LABELS[st]}<small>{r.units}회 차감</small></> : original ? <><span>{original.value.replace(/\.0$/, '')}</span><small>{['FFCCCCCC','FFD9D9D9','FFB7B7B7'].includes(original.color) ? '결석·원본' : original.color === 'FFFF9900' ? '보강·원본' : ['FFFF00FF','FF9900FF'].includes(original.color) ? '결제표시·원본' : '원본 회차'}</small></> : '＋'}</button></td>; })}</tr>; })}
    </tbody></table></div>{!filteredStudents.length && <p className="empty">선택한 과목과 이름에 해당하는 학생이 없습니다.</p>}
    <div className="header-actions" aria-label="출석표 페이지"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage + 1} / {pageCount} 페이지 · 전체 {filteredStudents.length}건 · 한 번에 {pageSize}건</span><button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</button></div>
    {!HOLIDAY_YEARS.includes(Number(month.slice(0, 4))) && <p className="month-help">이 연도의 공휴일 자료는 아직 등록되지 않아 주말 색상만 표시합니다.</p>}<p className="month-help">표시 수강권 {filteredStudents.length}건 · 과목별 수강권은 출결·잔여 횟수·결제를 각각 관리합니다. 기존 통합 수강권은 분리 확인이 필요합니다. 날짜는 화면 상단에서 변경할 수 있습니다. 수동 기록은 보호자에게 출석 알림을 보내지 않습니다.</p>
    {selected && !detailed && <dialog ref={quickRef} className="quick-attendance" aria-labelledby="quick-attendance-title" onCancel={e=>{e.preventDefault();if(!savingRef.current&&!busy)setSelected(null);}}><div className="section-head"><div><h2 id="quick-attendance-title">{displayCourseName(student?.name || '학생')}</h2><p>{selected.day} · 선택하면 바로 저장됩니다.</p></div><button disabled={busy||saving} onClick={()=>setSelected(null)}>닫기</button></div><div className="quick-attendance-options">{(['present','absent','late_cancel','travel','sick','makeup'] as AttendanceStatus[]).map(next=>{const n=defaultAttendanceUnits(next,course);return <button key={next} disabled={busy||saving} className={`quick-option ${next}`} onClick={()=>void commit(next,n)}><strong>{ATTENDANCE_LABELS[next]}</strong><small>{n ? `${n}회 차감` : '차감 없음'}</small></button>;})}</div><p className="quick-attendance-help">피아노 당일 취소는 기본 차감 없음입니다. 차감 횟수·비고는 상세 수정에서 바꿀 수 있습니다.</p>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy||saving} onClick={()=>setDetailed(true)}>차감 횟수·비고 상세 수정</button>{saving && <p role="status">저장 중…</p>}</dialog>}
    {selected && detailed && <div className="panel-backdrop"><section className="edit-panel" role="dialog" aria-modal="true" aria-labelledby="attendance-title"><div className="section-head"><div><h2 id="attendance-title">{student?.name} · 출결 기록</h2><p>{selected.day}</p></div><button disabled={busy} onClick={() => setSelected(null)}>닫기</button></div><form onSubmit={e => { e.preventDefault(); setError(''); void commit(status, units); }}>
      <label>출결 상태<select value={status} onChange={e => { const next = e.target.value as AttendanceStatus; setStatus(next); setUnits(defaultAttendanceUnits(next, course)); }}>{Object.entries(ATTENDANCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {status === 'absent' && <div className="notice"><p>결석 처리 방식을 선택하세요.</p><button type="button" aria-pressed={units === 1} onClick={() => setUnits(1)}>당일 취소 · 1회 차감</button> <button type="button" aria-pressed={units === 0} onClick={() => setUnits(0)}>보강 예정 · 차감 없음</button><p>1:1 당일 취소는 보통 1회 차감, 피아노 보강 예정은 0회로 기록합니다. 예외가 있으면 차감 횟수를 직접 바꿀 수 있습니다.</p></div>}
      <label>이번 날짜의 차감 횟수<input type="number" min="0" max="10" required value={units} onChange={e => setUnits(Number(e.target.value))} /><small>결석은 기본 0회입니다. 이미 차감한 수업의 보강은 0회로 바꾸세요. 2회 연속 수업은 2를 입력하세요.</small></label>
      {status === 'makeup' && <label>원래 수업일 (선택)<input type="date" max={selected.day} value={relatedDay} onChange={e => setRelatedDay(e.target.value)} /><small>참고 날짜만 기록하며 원래 날짜의 차감은 자동 변경하지 않습니다.</small></label>}
      <label>기록 사유·비고 (선택)<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="예: 결석 후 보강, 원래 수업에서 이미 차감하여 이번에는 0회" /></label>
      <p className="notice">현재 잔여 {account?.remaining}회 → 저장 후 {(account?.remaining || 0) + (current?.units || 0) - units}회<br />기존 {current?.units || 0}회 차감을 이번 입력값으로 바꿉니다.</p>
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy||saving}>{busy||saving ? '저장 중…' : '출결·차감 저장'}</button>
    </form></section></div>}
  </>;
}
