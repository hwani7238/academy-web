'use client';
import { LegacyAttendanceDialog } from './LegacyAttendanceDialog';
import { ScheduleSummary } from './ScheduleSummary';
import { ScheduleDialog, MoveLessonDialog } from './ScheduleDialog';
import { plannedLesson, scheduleLabel } from '@/lib/operations/schedule';
import { AttendanceRangeDialog, type RangeSelection } from './AttendanceRangeDialog';
import { unpaidForecastFirstLessons, legacyAttendanceAppearance, isUnpaidAttendance, unpaidAttendanceCycles, lessonCycleStart, confirmedFirstLessons, isFirstLesson, attendancePaymentDue, importedAttendanceAppearance, paidFirstLesson } from '@/lib/operations/attendance-appearance';
import { attendanceForecast } from '@/lib/operations/attendance-forecast';
import { attendanceSequence } from '@/lib/operations/attendance-sequence';
import { CloseButton } from './CloseButton';
import { enrollmentState } from '@/lib/operations/lifecycle';
import { ACADEMY_DAYS } from '@/lib/operations/academy-calendar';
import { calendarDay, HOLIDAY_YEARS } from '@/lib/operations/holidays';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ATTENDANCE_LABELS, AttendanceStatus, Snapshot, seoulDay, defaultAttendanceUnits } from '@/lib/operations/model';
import { GROUPS, groupName, compareGroups, displayEnrollmentName } from '@/lib/operations/student-order';
import { arrivalsOnDay, orderAttendanceStudents, arrivalLabel, type AttendanceOrder } from '@/lib/operations/attendance-order';
export function MonthlyAttendance({ data, day, busy, loading, onDayChange, save }: { data: Snapshot; day: string; busy: boolean; loading: boolean; onDayChange: (day: string) => void; save: (v: Record<string, unknown>) => Promise<unknown> }) {
  const [legacySelection,setLegacySelection]=useState<{studentId:string;day:string}|null>(null);
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
  const [unpaid, setUnpaid] = useState(false);
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
  const sequenceState = useMemo(() => attendanceSequence(data.accounts, data.attendance, data.legacyAttendance || [], data.sequenceContext), [data.accounts, data.attendance, data.legacyAttendance, data.sequenceContext]);
  const sequence = sequenceState.labels;
  const confirmedFirst = useMemo(() => confirmedFirstLessons([...data.invoices, ...(data.settledInvoices || [])], sequenceState.cycleFirstDays), [data.invoices, data.settledInvoices, sequenceState.cycleFirstDays]);
  const unpaidCycles = useMemo(() => unpaidAttendanceCycles(data.attendance, confirmedFirst, data.unpaidCycleKeys), [data.attendance, confirmedFirst, data.unpaidCycleKeys]);
  const missedDates = selected ? Object.entries(sequenceState.missedLessons)
    .filter(([key]) => key.startsWith(`${selected.studentId}_`) && key.slice(-10) < selected.day && !data.attendance.some(r=>r.studentId===selected.studentId && r.day!==selected.day && r.relatedDay===key.slice(-10) && ['makeup','makeup_reserved'].includes(r.status||'')))
    .map(([key, ordinal]) => ({ day: key.slice(-10), ordinal })).sort((a,b) => b.day.localeCompare(a.day)) : [];
  const forecast = useMemo(() => attendanceForecast(data.accounts, data.attendance, data.legacyAttendance || [], data.sequenceContext, dates, today), [data.accounts, data.attendance, data.legacyAttendance, data.sequenceContext, dates, today]);
  const unpaidForecastFirst = useMemo(() => unpaidForecastFirstLessons(forecast, [...data.invoices, ...(data.settledInvoices || [])], sequenceState.cycleFirstDays), [forecast, data.invoices, data.settledInvoices, sequenceState.cycleFirstDays]);
  const student = data.students.find(s => s.id === selected?.studentId);
  const account = data.accounts.find(a => a.id === selected?.studentId);
  const current = selected ? lookup.get(`${selected.studentId}_${selected.day}`) : undefined;
  const selectedCycle = selected ? (current?.unpaidCycleStart || lessonCycleStart(selected.studentId, selected.day, sequenceState.cycleFirstDays)) : '';
  const selectedCyclePaid = Boolean(selected && confirmedFirst.has(`${selected.studentId}_${selectedCycle}`));
  const [revision, setRevision] = useState('');
  const openRange=useCallback((studentId:string,start:string,end:string)=>{setSelected(null);setRangeSelection({studentId,start:start<end?start:end,end:start<end?end:start});},[]);
  const open = useCallback((studentId: string, date: string) => {
    const row = lookup.get(`${studentId}_${date}`);
    if (!row && legacy.has(`${studentId}_${date}`)) { setLegacySelection({studentId,day:date}); return; }
    setUnpaid(Boolean(row?.unpaidCycleStart && !confirmedFirst.has(`${studentId}_${row.unpaidCycleStart}`))); setDetailed(false); setSelected({ studentId, day: date }); setStatus(row?.status || (date>today?'travel':'present')); setUnits(row?.units ?? (date>today?0:1)); setNote(row?.note || ''); setRelatedDay(row?.relatedDay || ''); setRevision(row?.updatedAt || ''); setError('');
  }, [lookup, legacy, today, confirmedFirst]);
  async function commit(nextStatus: AttendanceStatus, nextUnits: number, markUnpaid = unpaid) {
    if (!selected || busy || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try { await save({ action: 'recordAttendance', ...selected, status: nextStatus, units: nextUnits, unpaidCycleStart: markUnpaid && nextStatus === 'present' ? (current?.unpaidCycleStart || lessonCycleStart(selected.studentId, selected.day, sequenceState.cycleFirstDays)) : '', note, relatedDay: ['makeup','makeup_reserved'].includes(nextStatus) ? relatedDay : '', expectedUpdatedAt: revision }); setSelected(null); }
    catch(e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const course = student?.attendanceGroup || student?.instruments?.[0] || student?.name || '';
  return <><div className="section-head"><div><div className="month-navigation" role="group" aria-label="출석표 월 이동"><button type="button" className="month-arrow" aria-label="이전 달" title="이전 달" disabled={busy} onClick={() => moveMonth(-1)}><span aria-hidden="true">‹</span></button><h2 aria-live="polite">{month} 월별 출석표</h2><button type="button" className="month-arrow" aria-label="다음 달" title="다음 달" disabled={busy} onClick={() => moveMonth(1)}><span aria-hidden="true">›</span></button><button type="button" disabled={busy || month === today.slice(0, 7)} onClick={() => onDayChange(today)}>이번 달</button></div><p>날짜 칸 드래그는 여행 등 기간 표시, 파란색 밑줄 드래그는 이번 수업일 이동입니다. 밑줄을 누르면 다른 달 날짜로도 옮길 수 있습니다.</p></div><button disabled={loading} onClick={showDate}>조회 날짜 칸 보기</button><label>과목<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">전체 과목</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></label><label>정렬<select value={order} onChange={e => setOrder(e.target.value as AttendanceOrder)}><option value="name">이름 가나다순</option><option value="attendance">당일 출석자 우선 · 시간순</option></select></label><label>학생 찾기<input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름" /></label></div>
    <p className="month-help">전체 {visibleStudents.length}건 · 스크롤해서 전체 명단을 볼 수 있습니다.{order === 'attendance' && ` 기준일 ${day} · 먼저 출석한 순서이며, 시간 미기록 출석자는 그다음에 표시됩니다. 미출석자는 가나다순입니다.`}</p>
    <p className="notice">숫자는 <strong>수강권 내 수업 회차</strong>입니다. 결제가 필요한 1회차는 출석 전 예정 회차부터 빨간 테두리로 표시하며, 출석 후에는 보라색 바탕으로 표시합니다. 해당 수강권의 수납 완료가 확인되면 빨간 테두리가 사라지고 분홍색으로 바뀝니다. 수강권을 다 쓰면 다시 1부터 표시합니다. 두 번 차감하면 회차 두 개를 표시하고, 결석은 해당 회차를 회색으로 남기고 다음 수업은 다음 회차로 넘어갑니다. 보강은 원래 수업일을 지정하면 빠진 회차를 표시하며 정규 회차를 올리지 않습니다. 보강 예약은 주황색 회차로 표시하며 실제 출석 전에는 차감하지 않습니다. 기간으로 표시한 여행·결석은 수업 예정일만 회차에 포함합니다. 회색 숫자는 수업 요일에 따른 예정 회차이며 실제 출석하면 확정됩니다. 예정 회차는 잔여 횟수에서 차감하지 않습니다. 이름 아래 요일·결제 상태·남은 횟수는 현재 기준입니다. 날짜 칸의 수업 일정은 저장한 적용 시작일과 개별 이동을 따릅니다.</p>
    <p className="month-color-legend" aria-label="출석표 색상 안내"><span className="forecast">예정 회차</span><span className="present">수업 횟수</span><span className="paid-first">수납 확인된 1회차</span><span className="makeup">보강</span><span className="absent">결석</span><span className="payment-due">결제 필요 수업</span><span className="payment-due payment-first">결제 필요 1회차</span></p>
    {month === '2026-10' && <p className="month-help academy-calendar-note">10월 3일 정상 수업 · 5일·9일 휴원 — 휴원일은 예정 회차에서 제외됩니다.</p>}
    {moveError && <p className="error" role="alert">{moveError}</p>}
    {loading ? <p className="empty" role="status">{month} 출석표를 불러오고 있습니다…</p> : <div className="table-wrap monthly-scroll" ref={scrollRef}><table className="monthly-table" style={{minWidth:190 + count * 32}}><colgroup><col style={{width:190}} />{dates.map(d=><col key={d} />)}</colgroup><thead><tr><th>학생 / 현재 잔여</th>{dates.map((d, i) => { const calendar = calendarDay(d); return <th key={d} ref={d === day ? dateRef : undefined} title={[calendar.holiday, ACADEMY_DAYS[d]?.label].filter(Boolean).join(' · ')} aria-label={`${d} ${['일','월','화','수','목','금','토'][calendar.weekday]}${calendar.holiday ? ` · ${calendar.holiday}` : ''}${ACADEMY_DAYS[d] ? ` · ${ACADEMY_DAYS[d].label}` : ''}`} className={`${d === today ? 'month-today' : ''} ${calendar.className}`}>{i + 1}<small>{['일','월','화','수','목','금','토'][calendar.weekday]}</small>{ACADEMY_DAYS[d] && <small className="academy-day-label">{ACADEMY_DAYS[d].open ? '운영' : '휴원'}</small>}</th>; })}</tr></thead><tbody>
      {visibleStudents.map(s => <MonthlyRow key={s.id} student={s} account={accountById.get(s.id)} invoice={invoiceByStudent.get(s.id)} dates={dates} today={today} lookup={lookup} legacy={legacy} sequence={sequence} confirmedFirst={confirmedFirst} unpaidCycles={unpaidCycles} cycleFirstDays={sequenceState.cycleFirstDays} forecast={forecast} unpaidForecastFirst={unpaidForecastFirst} busy={busy} open={open} openRange={openRange} openSchedule={openSchedule} move={move} arrival={order === 'attendance' && arrivals.has(s.id) ? arrivalLabel(arrivals.get(s.id)!) : undefined} />)}
    </tbody></table></div>}{!loading && !visibleStudents.length && <p className="empty">선택한 과목과 이름에 해당하는 학생이 없습니다.</p>}

    {!HOLIDAY_YEARS.includes(Number(month.slice(0, 4))) && <p className="month-help">이 연도의 공휴일 자료는 아직 등록되지 않아 주말 색상만 표시합니다.</p>}<p className="month-help">표시 수강권 {visibleStudents.length}건 · 과목별 수강권은 출결·잔여 횟수·결제를 각각 관리합니다. 기존 통합 수강권은 분리 확인이 필요합니다. 제목 옆 화살표로 월을 이동하고, 미래 날짜에도 여행·결석·병가와 보강 예약을 미리 표시할 수 있습니다. 수동 기록은 보호자에게 출석 알림을 보내지 않습니다.</p>
    {legacySelection && legacy.get(`${legacySelection.studentId}_${legacySelection.day}`) && <LegacyAttendanceDialog row={legacy.get(`${legacySelection.studentId}_${legacySelection.day}`)!} name={displayEnrollmentName(data.students.find(s=>s.id===legacySelection.studentId)!)} save={save} close={()=>setLegacySelection(null)}/>}
    {scheduleStudent && accountById.get(scheduleStudent) && <ScheduleDialog account={accountById.get(scheduleStudent)!} save={save} close={()=>setScheduleStudent(null)}/>}
    {moveSelection && accountById.get(moveSelection.studentId) && <MoveLessonDialog account={accountById.get(moveSelection.studentId)!} from={moveSelection.from} save={save} close={()=>setMoveSelection(null)}/>}
    {rangeSelection && <AttendanceRangeDialog selection={rangeSelection} data={data} busy={busy} save={save} close={()=>setRangeSelection(null)}/>}
    {selected && !detailed && <dialog ref={quickRef} className="quick-attendance" aria-labelledby="quick-attendance-title" onCancel={e=>{e.preventDefault();if(!savingRef.current&&!busy)setSelected(null);}}><div className="section-head"><div><h2 id="quick-attendance-title">{student ? displayEnrollmentName(student) : '학생'}</h2><p>{selected.day}{current && current.status!=='cancelled' ? ` · 현재 ${ATTENDANCE_LABELS[current.status || 'present']}` : ''} · 보강은 원래 수업일을 확인한 뒤 저장합니다.</p></div><CloseButton disabled={busy||saving} onClick={()=>setSelected(null)} /></div><div className="quick-attendance-options">{(['present','unpaid','absent','late_cancel','travel','sick','makeup'] as (AttendanceStatus|'unpaid')[]).map(next=>{const booking = next === 'makeup' && selected.day > today; const n=booking?0:next==='unpaid'?(current?.units||1):defaultAttendanceUnits(next,course);return <button key={next} disabled={busy||saving||(next==='unpaid'&&selectedCyclePaid)||(selected.day>today && !['travel','absent','sick','makeup'].includes(next))||(current?.status==='makeup_reserved'&&['present','unpaid'].includes(next))} className={`quick-option ${next}`} aria-pressed={next==='unpaid'?Boolean(current?.unpaidCycleStart&&!selectedCyclePaid):current?.status===next&&(next!=='present'||!current?.unpaidCycleStart)} onClick={()=>{if(next==='makeup'){setStatus(booking?'makeup_reserved':'makeup');setUnits(booking?0:(lookup.get(`${selected.studentId}_${relatedDay}`)?.units||0)>0?0:n);setDetailed(true);}else if(next==='unpaid')void commit('present',n,true);else void commit(next,n,false);}}><strong>{booking?'보강 예약':next==='makeup'&&current?.status==='makeup_reserved'?'보강 완료':next==='unpaid'?'미결제 출석':ATTENDANCE_LABELS[next]}</strong><small>{booking?'예약만 · 차감 없음':n ? `${n}회 차감` : '차감 없음'}</small></button>;})}</div><div className="attendance-secondary-actions"><button disabled={busy||saving} onClick={()=>{setRangeSelection({studentId:selected.studentId,start:current?.range?.start||selected.day,end:current?.range?.end||selected.day,existing:current?.range,status:current?.status});setSelected(null);}}>{current?.range ? '등록한 기간 보기·취소' : '기간으로 표시'}</button>{current && current.status!=='cancelled' && <button className="danger-text" disabled={busy||saving} onClick={()=>void commit('cancelled',0)}>{current.status==='makeup_reserved'?'보강 예약 취소':current.range?'이 날짜만 취소':'기록 취소'}{current.units>0 ? ` · ${current.units}회 복원` : ''}</button>}</div><p className="quick-attendance-help">미결제 출석도 1회 차감하며 수강권의 미결제 표시를 유지합니다. 수납은 청구·수납에서 별도로 기록해주세요. 피아노 당일 취소는 기본 차감 없음입니다.</p>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy||saving} onClick={()=>setDetailed(true)}>차감 횟수·비고 상세 수정</button>{saving && <p role="status">저장 중…</p>}</dialog>}
    {selected && detailed && <div className="panel-backdrop"><section className="edit-panel" role="dialog" aria-modal="true" aria-labelledby="attendance-title"><div className="section-head"><div><h2 id="attendance-title">{student?.name} · 출결 기록</h2><p>{selected.day}</p></div><CloseButton disabled={busy} onClick={() => setSelected(null)} /></div><form onSubmit={e => { e.preventDefault(); setError(''); void commit(status, units); }}>
      <label>출결 상태<select value={status} onChange={e => { const next = e.target.value as AttendanceStatus; setStatus(next); setUnits(defaultAttendanceUnits(next, course)); }}>{Object.entries(ATTENDANCE_LABELS).filter(([key])=>key!=='makeup_reserved'||selected.day>=today||current?.status==='makeup_reserved').map(([key, label]) => <option key={key} value={key} disabled={selected.day>today&&!['travel','absent','sick','cancelled','makeup_reserved'].includes(key)}>{label}</option>)}</select></label>
      {status === 'present' && <label><input type="checkbox" checked={unpaid} disabled={selectedCyclePaid} onChange={e=>setUnpaid(e.target.checked)} />미결제 출석으로 표시</label>}
      {status === 'absent' && <div className="notice"><p>결석 처리 방식을 선택하세요.</p><button type="button" aria-pressed={units === 1} onClick={() => setUnits(1)}>당일 취소 · 1회 차감</button> <button type="button" aria-pressed={units === 0} onClick={() => setUnits(0)}>보강 예정 · 차감 없음</button><p>1:1 당일 취소는 보통 1회 차감, 피아노 보강 예정은 0회로 기록합니다. 예외가 있으면 차감 횟수를 직접 바꿀 수 있습니다.</p></div>}
      <label>{status==='makeup_reserved'?'예약 차감 횟수':'이번 날짜의 차감 횟수'}<input type="number" min="0" max={status==='makeup_reserved'?0:10} readOnly={status==='makeup_reserved'} required value={units} onChange={e => setUnits(Number(e.target.value))} /><small>{status==='makeup_reserved'?'예약할 때는 차감하지 않습니다. 보강일에 출석 체크하거나 보강 완료로 바꾸면 1회 차감합니다. 원래 수업에서 이미 차감했다면 추가 차감하지 않습니다.':'결석은 기본 0회입니다. 이미 차감한 수업의 보강은 0회로 바꾸세요. 2회 연속 수업은 2를 입력하세요.'}</small></label>
      {['makeup','makeup_reserved'].includes(status) && <label>{status==='makeup_reserved'?'원래 수업일':'원래 수업일 (선택)'}<select required={status==='makeup_reserved'} value={relatedDay} onChange={e => {setRelatedDay(e.target.value);if(status==='makeup')setUnits((lookup.get(`${selected.studentId}_${e.target.value}`)?.units||0)>0?0:1);}}><option value="">{status==='makeup_reserved'?'보강할 결석·여행 수업 선택':'선택 안 함 · 회차 없이 보강 표시'}</option>{relatedDay && !missedDates.some(r=>r.day===relatedDay) && <option value={relatedDay}>{relatedDay} · 결석 기록 확인 필요</option>}{missedDates.map(r=><option key={r.day} value={r.day}>{r.day} · {r.ordinal}회차</option>)}</select><small>결석한 날짜를 선택하면 그날의 회차를 주황색으로 표시합니다. 예약은 실제 출석과 구분되며, 날짜가 지나도 자동 완료되지 않습니다. 원래 날짜의 기록은 유지합니다.</small></label>}
      <label>기록 사유·비고 (선택)<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="예: 결석 후 보강, 원래 수업에서 이미 차감하여 이번에는 0회" /></label>
      <p className="notice">현재 잔여 {account?.remaining}회 → 저장 후 {(account?.remaining || 0) + (current?.units || 0) - units}회<br />기존 {current?.units || 0}회 차감을 이번 입력값으로 바꿉니다.</p>
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy||saving}>{busy||saving ? '저장 중…' : status==='makeup_reserved'?'보강 예약 저장':'출결·차감 저장'}</button>
    </form></section></div>}
  </>;
}

// Keep the full roster mounted; opening an editor need not rerender every day cell.
const MonthlyRow = memo(function MonthlyRow({student:s, account:a, invoice, dates, today, lookup, legacy, sequence, confirmedFirst, unpaidCycles, cycleFirstDays, forecast, unpaidForecastFirst, busy, open, openRange, openSchedule, move, arrival}: {
  student: Snapshot['students'][number]; account?: Snapshot['accounts'][number]; invoice?: Snapshot['invoices'][number];
  dates: string[]; today: string; lookup: Map<string, Snapshot['attendance'][number]>;
  legacy: Map<string, NonNullable<Snapshot['legacyAttendance']>[number]>;
  openSchedule:(id:string)=>void; move:(id:string,from:string,to?:string)=>void;
  sequence: Map<string, string>; confirmedFirst: Set<string>; unpaidCycles: Set<string>; cycleFirstDays: Record<string,string[]>; forecast: Map<string, string>; unpaidForecastFirst: Set<string>; busy: boolean; open: (studentId: string, day: string) => void; openRange:(studentId:string,start:string,end:string)=>void; arrival?: string;
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
  return <tr key={s.id}><th><strong>{label}</strong><small>{a ? `잔여 ${a.remaining}회` : '수강 설정 필요'}</small>{a && <ScheduleSummary schedule={a.schedule} today={today} busy={busy} onClick={()=>openSchedule(s.id)}/>}{a?.schedule?.rules.filter(r=>r.start>dates[0] && r.start<=dates[dates.length-1] && r.start<=today).map(r=><small key={r.start} className="schedule-change-hint">{r.start}부터 · {scheduleLabel(a.schedule,r.start)}</small>)}{arrival && <small className="arrival-time">{arrival}</small>}{invoice && <span className="attendance-badge billing">{invoice.needsReview ? '청구 확인 필요' : invoice.paid > 0 ? '부분 수납' : '결제 필요'}</span>}</th>{dates.map(d => { const lesson=plannedLesson(a?.schedule,d); const movedTo=a?.schedule?.moves.find(m=>m.from===d)?.to; const r = lookup.get(`${s.id}_${d}`); const original = legacy.get(`${s.id}_${d}`); const st = r?.status || 'present'; const expected = forecast.get(`${s.id}_${d}`); const originalAppearance = original ? importedAttendanceAppearance(original, a, invoice, confirmedFirst.has(`${s.id}_${d}`)) : undefined; const originalLabel = originalAppearance?.label || ''; const legacyCancelled = original?.status === 'cancelled'; const markedUnpaid = Boolean(r && isUnpaidAttendance(r,cycleFirstDays,unpaidCycles)); const paymentDue = r ? markedUnpaid || attendancePaymentDue(r, a, invoice) || (isFirstLesson(sequence.get(`${s.id}_${d}`), st) && !confirmedFirst.has(`${s.id}_${d}`)) : originalAppearance?.tone === 'payment-due'; const firstPaymentDue = !r && !original ? unpaidForecastFirst.has(`${s.id}_${d}`) : !confirmedFirst.has(`${s.id}_${d}`) && paymentDue && (r ? isFirstLesson(sequence.get(`${s.id}_${d}`), st) : original && ['present', 'payment-due'].includes(legacyAttendanceAppearance(original).tone) && isFirstLesson(original.value, 'present')); const paidFirst = r ? paidFirstLesson(sequence.get(`${s.id}_${d}`), st, paymentDue, confirmedFirst.has(`${s.id}_${d}`)) : originalAppearance?.tone === 'paid-first'; return <td key={d} onPointerEnter={()=>{if(lessonDrag.current)setMoveTarget(d);}} onPointerUp={()=>dropLesson(d)} className={`${calendarDay(d).className} ${d === today ? 'month-today' : ''}${lesson?' lesson-planned':''}${moveTarget===d?' lesson-drop-target':''}`}><button disabled={busy || !a} aria-label={`${label} ${d} ${r ? `${markedUnpaid?'미결제 출석':ATTENDANCE_LABELS[st]} ${r.units}회 차감${paymentDue ? firstPaymentDue ? ' · 결제 필요 1회차' : ' · 결제 필요' : paidFirst ? ' · 결제 완료 1회차' : ''}` : original ? `이전 장부 ${original.value} ${originalLabel}${firstPaymentDue ? ' · 결제 필요 1회차' : ''}` : expected ? `예정 ${expected}회차 · 출석 전${firstPaymentDue ? ' · 결제 필요 1회차' : ''}` : '미기록'}`} title={r ? `${sequence.get(`${s.id}_${d}`) ? `${sequence.get(`${s.id}_${d}`)}회차 · ` : ''}${ATTENDANCE_LABELS[st]} · ${r.units}회 차감${paymentDue ? firstPaymentDue ? ' · 결제 필요 1회차' : ' · 결제 필요' : paidFirst ? ' · 결제 완료 1회차' : ''}` : original ? `이전 장부 누적 회차: ${original.value}${originalLabel ? ` · ${originalLabel}` : ''}${firstPaymentDue ? ' · 결제 필요 1회차' : ''}` : expected ? `예정 ${expected}회차 · 실제 출석 시 확정됩니다${firstPaymentDue ? ' · 결제 필요 1회차' : ''}` : undefined} onPointerDown={e=>{suppressClick.current=false;if(e.pointerType==='mouse' && e.button===0){drag.current={start:d,end:d};setHighlight(drag.current);}}} onPointerEnter={()=>{if(drag.current){drag.current={...drag.current,end:d};setHighlight(drag.current);}}} onPointerUp={()=>finish(d)} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}open(s.id,d);}} className={`${r && st!=='cancelled' ? `attendance-cell ${st}${paymentDue ? ' payment-due' : paidFirst ? ' paid-first' : ''}` : !r && original && !legacyCancelled ? `attendance-cell imported ${originalAppearance?.tone}` : expected ? 'attendance-cell forecast' : 'attendance-cell blank'}${firstPaymentDue ? ' payment-first' : ''}${highlight && d>=(highlight.start<highlight.end?highlight.start:highlight.end) && d<=(highlight.start>highlight.end?highlight.start:highlight.end)?' range-selected':''}`}>{r && st!=='cancelled' ? <>{sequence.has(`${s.id}_${d}`) ? <><span>{sequence.get(`${s.id}_${d}`)}</span>{(st !== 'present' || markedUnpaid) && <small>{markedUnpaid?'미결제':st==='makeup_reserved'?'예약':ATTENDANCE_LABELS[st]}</small>}</> : <>{ATTENDANCE_LABELS[st]}{(st === 'present' || st === 'makeup') && <small>{r.units > 0 ? `${r.units}회 차감` : '차감 없음'}</small>}</>}</> : !r && original && !legacyCancelled ? <><span>{original.value.replace(/\.0$/, '')}</span>{originalLabel && <small>{originalLabel}</small>}</> : expected ? <span>{expected}</span> : '＋'}</button>{lesson && <button type="button" className="lesson-marker" disabled={busy||d<today||Boolean(r&&(r.units>0||['present','makeup','makeup_reserved'].includes(st)))} title={`${lesson.moved?`${lesson.origin}에서 이동한 수업`:'정규 수업일'} · 잡아 끌면 이동, 누르면 날짜 선택`} aria-label={`${label} ${d} 수업일 이동`} onPointerDown={e=>{if(e.pointerType==='mouse' && e.button===0){e.stopPropagation();lessonDrag.current=d;setMoveTarget(d);suppressClick.current=false;}}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}move(s.id,d);}} />}{movedTo && movedTo!==d && <small className="lesson-moved" title={`${movedTo}로 수업 이동`}>→{Number(movedTo.slice(5,7))}/{Number(movedTo.slice(8))}</small>}</td>; })}</tr>;
});
