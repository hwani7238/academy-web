'use client';
import { useEffect, useRef, useState } from 'react';
import { ATTENDANCE_LABELS, AttendanceStatus, Snapshot, seoulDay } from '@/lib/operations/model';
const SUBJECTS = ['어린이 피아노', '성인 피아노', '통기타', '일렉기타', '베이스', '드럼', '보컬', '미디', '작곡', '시창청음', '댄스', '우쿨렐레'];
const subjectName = (value: string) => ({ '기타': '통기타', '일렉': '일렉기타', '피아노(어린이)': '어린이 피아노', '피아노(성인)': '성인 피아노', '피아노': '피아노 (구분 미지정)' }[value] || value);
export function MonthlyAttendance({ data, day, busy, save }: { data: Snapshot; day: string; busy: boolean; save: (v: Record<string, unknown>) => Promise<unknown> }) {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const subjects = [...new Set([...SUBJECTS, ...data.students.flatMap(s => (s.instruments || []).map(subjectName))])];
  const filteredStudents = data.students.filter(s => s.name.includes(search.trim()) && (!subject || (subject === '__unset' ? !s.instruments?.length : s.instruments?.some(v => subjectName(v) === subject))));
  const [selected, setSelected] = useState<{ studentId: string; day: string } | null>(null);
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
  const lookup = new Map(data.attendance.map(a => [`${a.studentId}_${a.day}`, a]));
  const student = data.students.find(s => s.id === selected?.studentId);
  const account = data.accounts.find(a => a.id === selected?.studentId);
  const current = selected ? lookup.get(`${selected.studentId}_${selected.day}`) : undefined;
  const [revision, setRevision] = useState('');
  function open(studentId: string, date: string) {
    const row = lookup.get(`${studentId}_${date}`);
    setSelected({ studentId, day: date }); setStatus(row?.status || 'present'); setUnits(row?.units ?? 1); setNote(row?.note || ''); setRelatedDay(row?.relatedDay || ''); setRevision(row?.updatedAt || ''); setError('');
  }
  return <><div className="section-head"><div><h2>{month} 월별 출석표</h2><p>학생·날짜 칸을 누르면 기록할 수 있어요. 빈칸은 미기록이며 결석을 뜻하지 않습니다.</p></div><button onClick={showDate}>조회 날짜 칸 보기</button><label>과목<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">전체 과목</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}<option value="__unset">과목 미지정</option></select></label><label>학생 찾기<input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름" /></label></div>
    <p className="notice">출석 · 결석 · 보강을 글자로 구분합니다. 숫자는 수업 순번이 아닌 <strong>그날 차감한 횟수</strong>입니다. 결제 상태와 남은 횟수는 현재 기준입니다.</p>
    <div className="table-wrap monthly-scroll" ref={scrollRef}><table className="monthly-table"><thead><tr><th>학생 / 현재 잔여</th>{dates.map((d, i) => <th key={d} ref={d === day ? dateRef : undefined} className={d === today ? 'month-today' : ''}>{i + 1}<small>{['일','월','화','수','목','금','토'][new Date(`${d}T00:00:00Z`).getUTCDay()]}</small></th>)}</tr></thead><tbody>
      {filteredStudents.map(s => { const a = data.accounts.find(a => a.id === s.id); const invoice = data.invoices.find(i => i.studentId === s.id && i.status === 'open'); return <tr key={s.id}><th><strong>{s.name}</strong><small>{s.instruments?.map(subjectName).join(" · ") || "과목 미지정"}</small><small>{a ? `잔여 ${a.remaining}회` : '수강 설정 필요'}</small>{invoice && <span className="attendance-badge billing">{invoice.needsReview ? '청구 확인 필요' : invoice.paid > 0 ? '부분 수납' : '결제 필요'}</span>}</th>{dates.map(d => { const r = lookup.get(`${s.id}_${d}`); const st = r?.status || 'present'; return <td key={d} className={d === today ? 'month-today' : ''}><button disabled={busy || !a || d > today} aria-label={`${s.name} ${d} ${r ? ATTENDANCE_LABELS[st] : '미기록'}`} onClick={() => open(s.id, d)} className={r ? `attendance-cell ${st}` : 'attendance-cell blank'}>{r ? <>{ATTENDANCE_LABELS[st]}<small>{r.units}회 차감</small></> : '＋'}</button></td>; })}</tr>; })}
    </tbody></table></div>{!filteredStudents.length && <p className="empty">선택한 과목과 이름에 해당하는 학생이 없습니다.</p>}
    <p className="month-help">표시 학생 {filteredStudents.length}명 · 여러 과목을 듣는 학생은 각 과목 목록에 표시되며, 출결·잔여 횟수는 학생 기준으로 공유됩니다. 날짜는 화면 상단에서 변경할 수 있습니다. 수동 기록은 보호자에게 출석 알림을 보내지 않습니다.</p>
    {selected && <div className="panel-backdrop"><section className="edit-panel" role="dialog" aria-modal="true" aria-labelledby="attendance-title"><div className="section-head"><div><h2 id="attendance-title">{student?.name} · 출결 기록</h2><p>{selected.day}</p></div><button disabled={busy} onClick={() => setSelected(null)}>닫기</button></div><form onSubmit={e => { e.preventDefault(); setError(''); void save({ action: 'recordAttendance', ...selected, status, units, note, relatedDay, expectedUpdatedAt: revision }).then(() => setSelected(null)).catch(e => setError(e instanceof Error ? e.message : '저장하지 못했습니다.')); }}>
      <label>출결 상태<select value={status} onChange={e => { const next = e.target.value as AttendanceStatus; setStatus(next); setUnits(next === 'absent' || next === 'cancelled' ? 0 : 1); }}>{Object.entries(ATTENDANCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>이번 날짜의 차감 횟수<input type="number" min="0" max="10" required value={units} onChange={e => setUnits(Number(e.target.value))} /><small>결석은 기본 0회입니다. 이미 차감한 수업의 보강은 0회로 바꾸세요. 2회 연속 수업은 2를 입력하세요.</small></label>
      {status === 'makeup' && <label>원래 수업일 (선택)<input type="date" max={selected.day} value={relatedDay} onChange={e => setRelatedDay(e.target.value)} /><small>참고 날짜만 기록하며 원래 날짜의 차감은 자동 변경하지 않습니다.</small></label>}
      <label>기록 사유·비고 (선택)<textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="예: 결석 후 보강, 원래 수업에서 이미 차감하여 이번에는 0회" /></label>
      <p className="notice">현재 잔여 {account?.remaining}회 → 저장 후 {(account?.remaining || 0) + (current?.units || 0) - units}회<br />기존 {current?.units || 0}회 차감을 이번 입력값으로 바꿉니다.</p>
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? '저장 중…' : '출결·차감 저장'}</button>
    </form></section></div>}
  </>;
}
