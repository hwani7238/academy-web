'use client';
import { ScheduleDialog, MoveLessonDialog } from './ScheduleDialog';
import { plannedLesson, scheduleLabel } from '@/lib/operations/schedule';
import { AttendanceRangeDialog, type RangeSelection } from './AttendanceRangeDialog';
import { attendancePaymentDue, importedAttendanceAppearance, paidFirstLesson } from '@/lib/operations/attendance-appearance';
import { attendanceSequence } from '@/lib/operations/attendance-sequence';
import { CloseButton } from './CloseButton';
import { enrollmentState } from '@/lib/operations/lifecycle';
import { calendarDay, HOLIDAY_YEARS } from '@/lib/operations/holidays';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ATTENDANCE_LABELS, AttendanceStatus, Snapshot, seoulDay, defaultAttendanceUnits } from '@/lib/operations/model';
import { GROUPS, groupName, compareGroups, displayEnrollmentName } from '@/lib/operations/student-order';
import { arrivalsOnDay, orderAttendanceStudents, arrivalLabel, type AttendanceOrder } from '@/lib/operations/attendance-order';
export function MonthlyAttendance({ data, day, busy, loading, onDayChange, save }: { data: Snapshot; day: string; busy: boolean; loading: boolean; onDayChange: (day: string) => void; save: (v: Record<string, unknown>) => Promise<unknown> }) {
  const [scheduleStudent,setScheduleStudent]=useState<string|null>(null);
  const [moveSelection,setMoveSelection]=useState<{studentId:string;from:string}|null>(null);
  const openSchedule=useCallback((id:string)=>setScheduleStudent(id),[]);
  const [moveError,setMoveError]=useState('');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const subjects = useMemo(() => [...new Set([...GROUPS, ...data.students.map(groupName)])].sort(compareGroups), [data.students]);
  const [order, setOrder] = useState<AttendanceOrder>('name');
  const today = seoulDay();
  const arrivals = useMemo(() => arrivalsOnDay({ attendance: data.attendance, legacyAttendance: data.legacyAttendance }, day), [data.attendance, data.legacyAttendance, day]);
  const visibleStudents = useMemo(() => orderAttendanceStudents(data.students.filter(s => enrollmentState(s.lifecycle, today) === 'active' && s.name.includes(search.trim()) && (!subject || groupName(s) === subject)), order, arrivals), [data.students, today, search, subject, order, arrivals]);
  const accountById = useMemo(() => new Map(data.accounts.map(a => [a.id, a])), [data.accounts]);
  const move=useCallback((studentId:string,from:string,to?:string)=>{
    if(!to){setMoveSelection({studentId,from});return;}
    const account=accountById.get(studentId);if(!account)return;
    setMoveError('');void save({action:'moveLesson',studentId,from,to,expectedUpdatedAt:account.schedule?.updatedAt||''}).catch(e=>setMoveError(e instanceof Error?e.message:'수업일을 옮기지 못했습니다.'));
  },[accountById,save]);
  const invoiceByStudent = useMemo(() => new Map(data.invoices.filter(i => i.status === 'open').map(i => [i.studentId, i])), [data.invoices]);
  const [selected, setSelected] = useState<{ studentId: string; day: string } | null>(null);
  const [rangeSelection,setRangeSelection]=useState<RangeSelection|null>(null);
  const [detailed, setDetailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const quickRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if(selected && !detailed && quickRef.current && !quickRef.current.open) quickRef.current.showModal(); }, [selected, detailed]);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [units, setUnits] = useState(1); const [note, setNote] = useState(''); const [relatedDay, setRelatedDay] = useState(''); const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [order, subject, search, day]);
  const dateRef = useRef<HTMLTableCellElement>(null);
  const showDate = () => {
    const wrap = scrollRef.current; const cell = dateRef.current;
    if (wrap && cell) wrap.scrollLeft += cell.getBoundingClientRect().left - wrap.getBoundingClientRect().left - (wrap.querySelector('thead th')?.getBoundingClientRect().width || 190);
  };
  useEffect(() => { if (!loading) showDate(); }, [day, loading]);
  const month = day.slice(0, 7);
  const moveMonth = (offset: number) => {
    const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + offset, 1));
    onDayChange(date.toISOString().slice(0, 10));
  };
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const dates = useMemo(() => Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`), [month, count]);
  const lookup = useMemo(() => new Map(data.attendance.map(a => [`${a.studentId}_${a.day}`, a])), [data.attendance]);
  const legacy = useMemo(() => new Map((data.legacyAttendance || []).map(a => [`${a.studentId}_${a.day}`, a])), [data.legacyAttendance]);
  const sequence = useMemo(() => attendanceSequence(data.accounts, data.attendance, data.legacyAttendance || [], data.sequenceContext).labels, [data.accounts, data.attendance, data.legacyAttendance, data.sequenceContext]);
  const student = data.students.find(s => s.id === selected?.studentId);
  const account = data.accounts.find(a => a.id === selected?.studentId);
  const current = selected ? lookup.get(`${selected.studentId}_${selected.day}`) : undefined;
  const [revision, setRevision] = useState('');
  const openRange=useCallback((studentId:string,start:string,end:string)=>{setSelected(null);setRangeSelection({studentId,start:start<end?start:end,end:start<end?end:start});},[]);
  const open = useCallback((studentId: string, date: string) => {
    const row = lookup.get(`${studentId}_${date}`);
    setDetailed(false); setSelected({ studentId, day: date }); setStatus(row?.status || (date>today?'travel':'present')); setUnits(row?.units ?? (date>today?0:1)); setNote(row?.note || ''); setRelatedDay(row?.relatedDay || ''); setRevision(row?.updatedAt || ''); setError('');
  }, [lookup, today]);
  async function commit(nextStatus: AttendanceStatus, nextUnits: number) {
    if (!selected || busy || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try { await save({ action: 'recordAttendance', ...selected, status: nextStatus, units: nextUnits, note, relatedDay: nextStatus === 'makeup' ? relatedDay : '', expectedUpdatedAt: revision }); setSelected(null); }
    catch(e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const course = student?.attendanceGroup || student?.instruments?.[0] || student?.name || '';
  return <><div className="section-head"><div><div className="month-navigation" role="group" aria-label="출석표 월 이동"><button type="button" className="month-arrow" aria-label="이전 달" title="이전 달" disabled={busy} onClick={() => moveMonth(-1)}><span aria-hidden="true">‹</span></button><h2 aria-live="polite">{month} 월별 출석표</h2><button type="button" className="month-arrow" aria-label="다음 달" title="다음 달" disabled={busy} onClick={() => moveMonth(1)}><span aria-hidden="true">›</span></button><button type="button" disabled={busy || month === today.slice(0, 7)} onClick={() => onDayChange(today)}>이번 달</button></div><p>날짜 칸 드래그는 여행 등 기간 표시, ‘수업 예정’ 표시 드래그는 이번 수업일 이동입니다. 수업 표시를 누르면 다른 달 날짜로도 옮길 수 있습니다.</p></div><button disabled={loading} onClick={showDate}>조회 날짜 칸 보기</button><label>과목<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">전체 과목</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></label><label>정렬<select value={order} onChange={e => setOrder(e.target.value as AttendanceOrder)}><option value="name">이름 가나다순</option><option value="attendance">당일 출석자 우선 · 시간순</option></select></label><label>학생 찾기<input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름" /></label></div>
    <p className="month-help">전체 {visibleStudents.length}건 · 스크롤해서 전체 명단을 볼 수 있습니다.{order === 'attendance' && ` 기준일 ${day} · 먼저 출석한 순서이며, 시간 미기록 출석자는 그다음에 표시됩니다. 미출석자는 가나다순입니다.`}</p>
    <p className="notice">숫자는 <strong>수강권 내 수업 회차</strong>입니다. 수강권을 다 쓰면 다시 1부터 표시합니다. 두 번 차감하면 회차 두 개를 표시하고, 차감 없는 결석·보강은 회차를 올리지 않습니다. 결제 상태와 남은 횟수는 현재 기준입니다.</p>
    <p className="month-color-legend" aria-label="출석표 색상 안내"><span className="present">수업 횟수</span><span className="paid-first">결제 완료 1회차</span><span className="makeup">보강</span><span className="absent">결석</span><span className="payment-due">결제 필요 수업</span></p>
    {moveError && <p className="error" role="alert">{moveError}</p>}
    {loading ? <p className="empty" role="status">{month} 출석표를 불러오고 있습니다…</p> : <div className="table-wrap monthly-scroll" ref={scrollRef}><table className="monthly-table" style={{minWidth:190 + count * 32}}><colgroup><col style={{width:190}} />{dates.map(d=><col key={d} />)}</colgroup><thead><tr><th>학생 / 현재 잔여</th>{dates.map((d, i) => { const calendar = calendarDay(d); return <th key={d} ref={d === day ? dateRef : undefined} title={calendar.holiday} aria-label={`${d} ${['일','월','화','수','목','금','토'][calendar.weekday]}${calendar.holiday ? ` · ${calendar.holiday}` : ''}`} className={`${d === today ? 'month-today' : ''} ${calendar.className}`}>{i + 1}<small>{['일','월','화','수','목','금','토'][calendar.weekday]}</small></th>; })}</tr></thead><tbody>
      {visibleStudents.map(s => <MonthlyRow key={s.id} student={s} account={accountById.get(s.id)} invoice={invoiceByStudent.get(s.id)} dates={dates} today={today} lookup={lookup} legacy={legacy} sequence={sequence} busy={busy} open={open} openRange={openRange} openSchedule={openSchedule} move={move} arrival={order === 'attendance' && arrivals.has(s.id) ? arrivalLabel(arrivals.get(s.id)!) : undefined} />)}
    </tbody></table></div>}{!loading && !visibleStudents.length && <p className="empty">선택한 과목과 이름에 해당하는 학생이 없습니다.</p>}

    {!HOLIDAY_YEARS.includes(Number(month.slice(0, 4))) && <p className="month-help">이 연도의 공휴일 자료는 아직 등록되지 않아 주말 색상만 표시합니다.</p>}<p className="month-help">표시 수강권 {visibleStudents.length}건 · 과목별 수강권은 출결·잔여 횟수·결제를 각각 관리합니다. 기존 통합 수강권은 분리 확인이 필요합니다. 제목 옆 화살표로 월을 이동하고, 미래 날짜에도 여행·결석·병가를 미리 표시할 수 있습니다. 수동 기록은 보호자에게 출석 알림을 보내지 않습니다.</p>
    {scheduleStudent && accountById.get(scheduleStudent) && <ScheduleDialog account={accountById.get(scheduleStudent)!} save={save} close={()=>setScheduleStudent(null)}/>}
    {moveSelection && accountById.get(moveSelection.studentId) && <MoveLessonDialog account={accountById.get(moveSelection.studentId)!} from={moveSelection.from} save={save} close={()=>setMoveSelection(null)}/>}
    {rangeSelection && <AttendanceRangeDialog selection={rangeSelection} data={data} busy={busy} save={save} close={()=>setRangeSelection(null)}/>}
    {selected && !detailed && <dialog ref={quickRef} className="quick-attendance" aria-labelledby="quick-attendance-title" onCancel={e=>{e.preventDefault();if(!savingRef.current&&!busy)setSelected(null);}}><div className="section-head"><div><h2 id="quick-attendance-title">{student ? displayEnrollmentName(student) : '학생'}</h2><p>{selected.day}{current && current.status!=='cancelled' ? ` · 현재 ${ATTENDANCE_LABELS[current.status || 'present']}` : ''} · 선택하면 저장됩니다.</p></div><CloseButton disabled={busy||saving} onClick={()=>setSelected(null)} /></div><div className="quick-attendance-options">{(['present','absent','late_cancel','travel','sick','makeup'] as AttendanceStatus[]).map(next=>{const n=defaultAttendanceUnits(next,course);return <button key={next} disabled={busy||saving||(selected.day>today && !['travel','absent','sick'].includes(next))} className={`quick-option ${next}`} aria-pressed={current?.status===next} onClick={()=>void commit(next,n)}><strong>{ATTENDANCE_LABELS[next]}</strong><small>{n ? `${n}회 차감` : '차감 없음'}</small></button>;})}</div><div className="attendance-secondary-actions"><button disabled={busy||saving} onClick={()=>{setRangeSelection({studentId:selected.studentId,start:current?.range?.start||selected.day,end:current?.range?.end||selected.day,existing:current?.range,status:current?.status});setSelected(null);}}>{current?.range ? '등록한 기간 보기·취소' : '기간으로 표시'}</button>{current && current.status!=='cancelled' && <button className="danger-text" disabled={busy||saving} onClick={()=>void commit('cancelled',0)}>{current.range?'이 날짜만 취소':'기록 취소'}{current.units>0 ? ` · ${current.units}회 복원` : ''}</button>}</div><p className="quick-attendance-help">피아노 당일 취소는 기본 차감 없음입니다. 차감 횟수·비고는 상세 수정에서 바꿀 수 있습니다.</p>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy||saving} onClick={()=>setDetailed(true)}>차감 횟수·비고 상세 수정</button>{saving && <p role="status">저장 중…</p>}</dialog>}
    {selected && detailed && <div className="panel-backdrop"><section className="edit-panel" role="dialog" aria-modal="true" aria-labelledby="attendance-title"><div className="section-head"><div><h2 id="attendance-title">{student?.name} · 출결 기록</h2><p>{selected.day}</p></div><CloseButton disabled={busy} onClick={() => setSelected(null)} /></div><form onSubmit={e => { e.preventDefault(); setError(''); void commit(status, units); }}>
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

// Keep the full roster mounted; opening an editor need not rerender every day cell.
const MonthlyRow = memo(function MonthlyRow({student:s, account:a, invoice, dates, today, lookup, legacy, sequence, busy, open, openRange, openSchedule, move, arrival}: {
  student: Snapshot['students'][number]; account?: Snapshot['accounts'][number]; invoice?: Snapshot['invoices'][number];
  dates: string[]; today: string; lookup: Map<string, Snapshot['attendance'][number]>;
  legacy: Map<string, NonNullable<Snapshot['legacyAttendance']>[number]>;
  openSchedule:(id:string)=>void; move:(id:string,from:string,to?:string)=>void;
  sequence: Map<string, string>; busy: boolean; open: (studentId: string, day: string) => void; openRange:(studentId:string,start:string,end:string)=>void; arrival?: string;
}) {
  const label = displayEnrollmentName(s);
  const drag=useRef<{start:string;end:string}|null>(null),suppressClick=useRef(false);
  const lessonDrag=useRef<string|null>(null);
  const [moveTarget,setMoveTarget]=useState<string|null>(null);
  const [highlight,setHighlight]=useState<{start:string;end:string}|null>(null);
  useEffect(()=>{
    const clear=()=>{drag.current=null;lessonDrag.current=null;setMoveTarget(null);setHighlight(null);};
    window.addEventListener('pointerup',clear);window.addEventListener('pointercancel',clear);
    return()=>{window.removeEventListener('pointerup',clear);window.removeEventListener('pointercancel',clear);};
  },[]);
  function finish(date:string){
    const selection=drag.current;drag.current=null;setHighlight(null);
    if(selection && selection.start!==date){suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);openRange(s.id,selection.start,date);}
  }

  function dropLesson(date:string){const from=lessonDrag.current;lessonDrag.current=null;setMoveTarget(null);if(from && from!==date){suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);move(s.id,from,date);}}
  return <tr key={s.id}><th><strong>{label}</strong><small>{a ? `잔여 ${a.remaining}회` : '수강 설정 필요'}</small>{a && <button className="schedule-link" disabled={busy} title="정규 수업 요일 설정" onClick={()=>openSchedule(s.id)}>{scheduleLabel(a.schedule,dates.includes(today)?today:dates[0])}</button>}{a?.schedule?.rules.filter(r=>r.start>dates[0] && r.start<=dates[dates.length-1]).map(r=><small key={r.start} className="schedule-change-hint">{Number(r.start.slice(5,7))}/{Number(r.start.slice(8))}부터 주 {r.weekdays.length}회</small>)}{arrival && <small className="arrival-time">{arrival}</small>}{invoice && <span className="attendance-badge billing">{invoice.needsReview ? '청구 확인 필요' : invoice.paid > 0 ? '부분 수납' : '결제 필요'}</span>}</th>{dates.map(d => { const lesson=plannedLesson(a?.schedule,d); const movedTo=a?.schedule?.moves.find(m=>m.from===d)?.to; const r = lookup.get(`${s.id}_${d}`); const original = legacy.get(`${s.id}_${d}`); const st = r?.status || 'present'; const originalAppearance = original ? importedAttendanceAppearance(original, a, invoice) : undefined; const originalLabel = originalAppearance?.label || ''; const paymentDue = r ? attendancePaymentDue(r, a, invoice) : originalAppearance?.tone === 'payment-due'; const paidFirst = r ? paidFirstLesson(sequence.get(`${s.id}_${d}`), st, paymentDue) : originalAppearance?.tone === 'paid-first'; return <td key={d} onPointerEnter={()=>{if(lessonDrag.current)setMoveTarget(d);}} onPointerUp={()=>dropLesson(d)} className={`${d === today ? 'month-today' : ''}${lesson?' lesson-planned':''}${moveTarget===d?' lesson-drop-target':''}`}><button disabled={busy || !a || Boolean(!r && original)} aria-label={`${label} ${d} ${r ? `${ATTENDANCE_LABELS[st]} ${r.units}회 차감${paymentDue ? ' · 결제 필요' : paidFirst ? ' · 결제 완료 1회차' : ''}` : original ? `이전 장부 ${original.value} ${originalLabel}` : '미기록'}`} title={r ? `${sequence.get(`${s.id}_${d}`) ? `${sequence.get(`${s.id}_${d}`)}회차 · ` : ''}${ATTENDANCE_LABELS[st]} · ${r.units}회 차감${paymentDue ? ' · 결제 필요' : paidFirst ? ' · 결제 완료 1회차' : ''}` : original ? `이전 장부 누적 회차: ${original.value}${originalLabel ? ` · ${originalLabel}` : ''}` : undefined} onPointerDown={e=>{suppressClick.current=false;if(e.pointerType==='mouse' && e.button===0){drag.current={start:d,end:d};setHighlight(drag.current);}}} onPointerEnter={()=>{if(drag.current){drag.current={...drag.current,end:d};setHighlight(drag.current);}}} onPointerUp={()=>finish(d)} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}open(s.id,d);}} className={`${r && st!=='cancelled' ? `attendance-cell ${st}${paymentDue ? ' payment-due' : paidFirst ? ' paid-first' : ''}` : !r && original ? `attendance-cell imported ${originalAppearance?.tone}` : 'attendance-cell blank'}${highlight && d>=(highlight.start<highlight.end?highlight.start:highlight.end) && d<=(highlight.start>highlight.end?highlight.start:highlight.end)?' range-selected':''}`}>{r && st!=='cancelled' ? <>{sequence.has(`${s.id}_${d}`) ? <><span>{sequence.get(`${s.id}_${d}`)}</span>{st !== 'present' && <small>{ATTENDANCE_LABELS[st]}</small>}</> : <>{ATTENDANCE_LABELS[st]}{(st === 'present' || st === 'makeup') && <small>차감 없음</small>}</>}</> : !r && original ? <><span>{original.value.replace(/\.0$/, '')}</span>{originalLabel && <small>{originalLabel}</small>}</> : '＋'}</button>{lesson && <button type="button" className="lesson-marker" disabled={busy||d<today||Boolean(r&&(r.units>0||['present','makeup'].includes(st)))} title={`${lesson.moved?`${lesson.origin}에서 이동한 수업`:'정규 수업일'} · 잡아 끌면 이동, 누르면 날짜 선택`} aria-label={`${label} ${d} 수업일 이동`} onPointerDown={e=>{if(e.pointerType==='mouse' && e.button===0){e.stopPropagation();lessonDrag.current=d;setMoveTarget(d);suppressClick.current=false;}}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}move(s.id,d);}}>{lesson.moved?'변경 수업':r&&st!=='cancelled'?'정규 수업':'수업 예정'}</button>}{movedTo && movedTo!==d && <small className="lesson-moved" title={`${movedTo}로 수업 이동`}>→{Number(movedTo.slice(5,7))}/{Number(movedTo.slice(8))}</small>}</td>; })}</tr>;
});
