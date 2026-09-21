'use client';
import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Attendance, Invoice, Snapshot, METHODS, seoulDay } from '@/lib/operations/model';
import { CheckIn } from './CheckIn';
import { sample, demoAction } from './demo';
import './operations.css';
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const time = (v: string) => new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, string> = { queued: '발송 대기', blocked: '설정 필요', processing: '처리 중 · 결과 확인', submitted: 'NHN 접수', failed: '발송 실패', unknown: '결과 확인 필요', cancelled: '취소', demo: '체험 기록', review: '청구 확인 필요' };
type Panel = { type: 'account'; id: string } | { type: 'adjust'; row: Attendance } | { type: 'payment'; row: Invoice; requestId: string } | null;
export function Operations({ demo = false }: { demo?: boolean }) {
  const [data, setData] = useState<Snapshot | null>(() => demo ? sample() : null); const dataRef = useRef(data);
  const [user, setUser] = useState<User | null>(null); const [authReady, setAuthReady] = useState(demo);
  const [tab, setTab] = useState('today'); const [day, setDay] = useState(seoulDay()); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [panel, setPanel] = useState<Panel>(null); const [pairCode, setPairCode] = useState('');
  useEffect(() => { if (demo) return; let stopped = false; let off: (() => void) | undefined;
    void Promise.all([import('@/lib/firebase'), import('firebase/auth')]).then(([f, a]) => { if (!stopped) off = a.onAuthStateChanged(f.auth, u => { setUser(u); setAuthReady(true); }); });
    return () => { stopped = true; off?.(); };
  }, [demo]);
  const api = async (body?: Record<string, unknown>) => {
    if (!user) throw new Error('원장 계정으로 로그인해주세요.');
    const response = await fetch(`/api/operations?day=${day}`, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'Authorization': `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  };
  const refresh = async () => { try { const next = await api(); setData(next); dataRef.current = next; setError(''); } catch (e) { setError(e instanceof Error ? e.message : '불러오지 못했습니다.'); } };
  useEffect(() => { if (demo || !user) return; void refresh(); const timer = setInterval(() => void refresh(), 30000); return () => clearInterval(timer);
  // Re-fetch only when the user or selected date changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, user, day]);
  const act = async (input: Record<string, unknown>) => {
    setBusy(true); setError(''); setMessage('');
    try {
      let result: Record<string, unknown>;
      if (demo) { const next = demoAction(dataRef.current!, input); setData(next.data); dataRef.current = next.data; result = next.result; }
      else { result = await api(input); await refresh(); }
      setMessage(input.action === 'process' ? (demo ? '체험에서는 실제 메시지를 보내지 않습니다.' : '발송 대기 항목을 처리했습니다. 결과를 확인해주세요.') : '저장했습니다.');
      return result;
    } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.'); throw e; } finally { setBusy(false); }
  };
  const click = (input: Record<string, unknown>) => { void act(input).catch(() => {}); };
  const submit = (e: React.FormEvent<HTMLFormElement>, action: string, extra: Record<string, unknown>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const values = Object.fromEntries(f.entries());
    const input: Record<string, unknown> = { ...values, ...extra, action };
    for (const field of ['planUnits', 'planAmount', 'remaining', 'units', 'amount']) if (f.has(field)) input[field] = Number(f.get(field));
    if (action === 'configure') { input.phones = String(f.get('phones')).split(/[,\n]/); input.autoBilling = f.get('autoBilling') === 'on'; input.active = f.get('active') === 'on'; }
    void act(input).then(() => setPanel(null)).catch(() => {});
  };
  if (!authReady) return <main className="whee-ops gate"><h1>출석·수납 관리</h1><p>계정을 확인하고 있습니다.</p></main>;
  if (!demo && !user) return <main className="whee-ops gate"><p className="brand">WHEE MUSIC</p><h1>원장님 관리실</h1><p>출석과 수납을 확인하려면 원장 계정으로 로그인해주세요.</p><a className="primary" href="/login">기존 계정으로 로그인</a><a href="/operations/demo">가상 학생으로 먼저 체험하기 →</a></main>;
  if (!data) return <main className="whee-ops gate"><h1>출석·수납 관리</h1><p role="alert">{error || '자료를 불러오고 있습니다.'}</p><button onClick={() => void refresh()}>다시 불러오기</button><a href="/operations/demo">가상 학생으로 체험하기</a></main>;
  const todayAttendance = data.attendance.filter(a => a.day === day);
  const unconfigured = data.students.length - data.accounts.length;
  const open = data.invoices.filter(i => i.status === 'open');
  const students = data.students.filter(s => s.name.includes(search) || s.phone.includes(search));
  const account = panel?.type === 'account' ? data.accounts.find(a => a.id === panel.id) : undefined;
  const student = panel?.type === 'account' ? data.students.find(s => s.id === panel.id) : undefined;
  const tabs = [['today', '오늘 출석'], ['students', '수강 설정'], ['billing', '청구·수납'], ['notices', '알림 내역'], ['devices', '출석 기기']];
  return <div className="whee-ops operations">
    {demo && <div className="demo-banner">가상 학생 체험 · 실제 학생 정보와 연결되지 않으며 메시지·결제가 발생하지 않습니다. <button onClick={() => { const next = sample(); dataRef.current = next; setData(next); setPanel(null); setMessage('체험을 초기화했습니다.'); }}>체험 초기화</button></div>}
    <header className="ops-header"><div><p className="brand">WHEE MUSIC</p><h1>출석·수납 관리</h1></div><div className="header-actions"><span className="subtle">{demo ? '원장님 화면 체험' : user?.email}</span><a href={demo ? '/check-in/demo' : '/check-in'} target="_blank" rel="noreferrer">출석 화면 ↗</a>{!demo && <a href="/admin">피드백 관리</a>}</div></header>
    <main className="ops-main"><div className="summary-grid">
      <div><span>선택일 출석</span><strong>{todayAttendance.length}<small>명</small></strong></div>
      <div><span>결제 요청 대상</span><strong>{open.length}<small>명</small></strong></div>
      <div><span>미납 합계</span><strong>{won(open.reduce((s, i) => s + i.amount - i.paid, 0))}</strong></div>
      <div><span>수강 설정</span><strong>{data.accounts.length}<small>/ {data.students.length}명</small></strong>{unconfigured > 0 && <button className="text-button" onClick={() => setTab('students')}>{unconfigured}명 설정 필요 →</button>}</div>
    </div>
    <nav className="ops-tabs" aria-label="관리 메뉴">{tabs.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setMessage(''); }}>{label}{id === 'billing' && open.length > 0 && <b>{open.length}</b>}</button>)}</nav>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    <div className={demo && tab === 'today' ? 'workspace-with-kiosk' : ''}><section className="surface">
    {tab === 'today' && <><div className="section-head"><div><h2>출석 기록</h2><p>기본 1회 차감 · 변경할 때는 사유를 남겨주세요.</p></div><label>조회일<input type="date" value={day} onChange={e => setDay(e.target.value)} /></label></div>
      {todayAttendance.length ? <div className="table-wrap"><table><thead><tr><th>학생</th><th>출석 시간</th><th>차감</th><th>남은 횟수</th><th>비고</th><th>관리</th></tr></thead><tbody>{todayAttendance.map(a => <tr key={a.id}><td><strong>{a.name}</strong></td><td>{time(a.at)}</td><td>{a.units}회</td><td>{data.accounts.find(s => s.id === a.studentId)?.remaining}회</td><td>{a.note || '—'}</td><td><button disabled={busy} onClick={() => setPanel({ type: 'adjust', row: a })}>횟수·비고 수정</button></td></tr>)}</tbody></table></div> : <div className="empty"><h3>아직 출석 기록이 없습니다.</h3><p>{demo ? '옆 출석 화면에 1234를 입력하고 김하늘 학생을 선택해보세요. 마지막 수업이 차감되면 청구가 생성됩니다.' : '수강 설정을 저장한 학생이 등록된 아이폰에서 출석하면 여기에 표시됩니다.'}</p></div>}</>}
    {tab === 'students' && <><div className="section-head"><div><h2>학생별 수강 설정</h2><p>현재 남은 횟수는 처음 등록할 때만 입력합니다.</p></div><label>학생 찾기<input placeholder="이름 또는 전화번호" value={search} onChange={e => setSearch(e.target.value)} /></label></div><div className="table-wrap"><table><thead><tr><th>학생</th><th>수강권</th><th>수강료</th><th>남은 횟수</th><th>상태</th><th>관리</th></tr></thead><tbody>{students.map(s => { const a = data.accounts.find(a => a.id === s.id); return <tr key={s.id}><td><strong>{s.name}</strong><small>{s.phone}</small></td><td>{a ? `${a.planUnits}회` : '설정 전'}</td><td>{a ? won(a.planAmount) : '—'}</td><td><span className={a && a.remaining <= 0 ? 'pill amber' : ''}>{a ? `${a.remaining}회` : '—'}</span></td><td>{!a ? '설정 필요' : a.active ? '수강 중' : '중지'}</td><td><button disabled={busy} onClick={() => setPanel({ type: 'account', id: s.id })}>{a ? '설정 수정' : '수강 등록'}</button>{a && !a.openInvoiceId && <button disabled={busy} className="quiet" onClick={() => click({ action: 'invoice', studentId: s.id })}>청구 만들기</button>}</td></tr>; })}</tbody></table></div>{!students.length && <div className="empty">학생이 없습니다. 기존 학생 관리에서 먼저 등록해주세요.</div>}</>}
    {tab === 'billing' && <><div className="section-head"><div><h2>청구·수납</h2><p>결제 요청과 실제 수납을 따로 기록합니다. 전액 수납 시 수강 횟수가 추가됩니다.</p></div></div>
      {open.length ? <div className="invoice-list">{open.map(i => <article key={i.id} className="invoice-row"><div><strong>{i.name}</strong><p>{i.units}회 수강권 · {won(i.amount)}</p>{i.needsReview && <span className="pill amber">횟수 수정으로 청구 확인 필요</span>}</div><div><span className="subtle">남은 결제금액</span><strong>{won(i.amount - i.paid)}</strong>{i.paid > 0 && <small>{won(i.paid)} 수납 완료</small>}</div><div className="row-actions">{i.needsReview ? <button disabled={busy} onClick={() => click({ action: 'confirmInvoice', invoiceId: i.id })}>청구 유지 확인</button> : <><button disabled={busy || data.notices.some(n => n.id === `billing_${i.id}`)} onClick={() => click({ action: 'sendInvoice', invoiceId: i.id })}>결제 안내 요청</button><button className="primary" disabled={busy} onClick={() => setPanel({ type: 'payment', row: i, requestId: crypto.randomUUID() })}>수납 기록</button></>}<button className="quiet" disabled={busy || i.paid > 0} onClick={() => { if (window.confirm('이 청구를 취소할까요? 이미 발송한 안내는 회수되지 않습니다.')) click({ action: 'cancelInvoice', invoiceId: i.id }); }}>청구 취소</button></div></article>)}</div> : <div className="empty"><h3>진행 중인 청구가 없습니다.</h3><p>수강 횟수가 소진되면 자동으로 생성됩니다. 선납은 수강 설정에서 ‘청구 만들기’를 이용하세요.</p></div>}
      <div className="section-head divided"><div><h2>최근 수납 기록</h2><p>최근 100건 · 카드·현금·지역화폐 수납을 원장님이 확인해 기록합니다.</p></div></div><div className="table-wrap"><table><thead><tr><th>수납일</th><th>학생</th><th>금액</th><th>결제 수단</th><th>비고</th></tr></thead><tbody>{data.payments.map(p => <tr key={p.id}><td>{time(p.at)}</td><td>{data.accounts.find(a => a.id === p.studentId)?.name || '학생'}</td><td>{won(p.amount)}</td><td>{p.method}</td><td>{p.note || '—'}</td></tr>)}</tbody></table>{!data.payments.length && <p className="empty">아직 수납 기록이 없습니다.</p>}</div></>}
    {tab === 'notices' && <><div className="section-head"><div><h2>알림 발송 내역</h2><p>최근 50건 · ‘NHN 접수’는 전달 완료와 다릅니다. 최종 결과는 NHN 내역에서 확인하세요.</p></div><button disabled={busy} onClick={() => click({ action: 'process' })}>{busy ? '처리 중…' : '발송 대기 처리'}</button>{data.notices.some(n => n.status === 'blocked') && <button disabled={busy} onClick={() => click({ action: 'releaseBlocked' })}>설정 완료 후 다시 처리</button>}</div>{!data.configured && <p className="notice">{demo ? '체험에서는 발송하지 않습니다.' : '출석·결제 안내 템플릿 연결이 필요합니다. 연결 전에는 발송 대기로 보관됩니다.'}</p>}<div className="table-wrap"><table><thead><tr><th>시간</th><th>학생</th><th>종류</th><th>상태</th><th>확인 사항</th></tr></thead><tbody>{data.notices.map(n => <tr key={n.id}><td>{time(n.createdAt)}</td><td>{n.name}</td><td>{n.kind === 'attendance' ? '출석 알림' : '결제 안내'}</td><td><span className="pill">{STATUS[n.status] || n.status}</span></td><td>{n.error || n.requestId || '—'}</td></tr>)}</tbody></table>{!data.notices.length && <div className="empty">아직 알림 기록이 없습니다.</div>}</div></>}
    {tab === 'devices' && <><div className="section-head"><div><h2>아이폰 출석 기기</h2><p>등록된 기기만 출석할 수 있습니다. 등록 코드는 10분 동안 한 번 사용할 수 있어요.</p></div><button className="primary" disabled={busy} onClick={() => { void act({ action: 'pair' }).then(r => setPairCode(String(r.code))).catch(() => {}); }}>등록 코드 만들기</button></div>
      {pairCode && <div className="notice"><p>아이폰에서 <strong>{typeof window === 'undefined' ? '/check-in' : `${window.location.origin}/check-in`}</strong>을 열고 아래 코드를 입력해주세요.</p><code className="pair-code">{pairCode}</code><button onClick={() => { void navigator.clipboard.writeText(pairCode).then(() => setMessage('등록 코드를 복사했습니다.')).catch(() => setError('코드를 직접 복사해주세요.')); }}>코드 복사</button></div>}
      {data.devices.map(d => <div className="invoice-row" key={d.id}><div><strong>{d.name}</strong><p>{time(d.createdAt)} 등록 · {d.active ? '사용 중' : '중지됨'}</p></div>{d.active && <button disabled={busy} onClick={() => { if (window.confirm('이 기기의 출석 권한을 중지할까요?')) click({ action: 'revoke', deviceId: d.id }); }}>사용 중지</button>}</div>)}{!data.devices.length && <div className="empty">등록된 출석 기기가 없습니다.</div>}</>}
    </section>{demo && tab === 'today' && <aside><CheckIn demo={{ lookup: digits => data.accounts.filter(a => a.active && a.checkinSuffixes.includes(digits)).map(a => ({ id: a.id, name: a.name })), checkIn: id => act({ action: 'demoCheckIn', studentId: id }) }} /></aside>}</div>
    </main>
    {panel && <div className="panel-backdrop"><section className="edit-panel" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div className="section-head"><h2 id="edit-title">{panel.type === 'account' ? `${student?.name} · 수강 설정` : panel.type === 'adjust' ? `${panel.row.name} · 출석 수정` : `${panel.row.name} · 수납 기록`}</h2><button disabled={busy} onClick={() => setPanel(null)} aria-label="닫기">닫기</button></div>
      {panel.type === 'account' && <form onSubmit={e => submit(e, 'configure', { studentId: panel.id })} key={panel.id}><label>수강권 횟수<input name="planUnits" type="number" min="1" max="200" defaultValue={account?.planUnits || 8} required /></label><label>수강료 (원)<input name="planAmount" type="number" min="1" max="100000000" defaultValue={account?.planAmount || ''} required /></label>{!account && <label>현재 남은 횟수<input name="remaining" type="number" min="-1000" max="1000" defaultValue="0" required /><small>기존 장부 기준으로 입력하세요. 미납 상태로 초과 수업한 횟수는 음수로 입력할 수 있어요.</small></label>}<label>알림 받을 보호자 전화번호<input name="phone" type="tel" defaultValue={account?.phone || student?.phone} required /></label><label>출석에 사용할 전화번호 또는 뒷번호<input name="phones" defaultValue={account?.checkinSuffixes.join(', ') || student?.phone} required /><small>본인·보호자 번호를 쉼표로 구분하세요. 예: 1234, 5678</small></label><label className="check"><input name="active" type="checkbox" defaultChecked={account?.active ?? true} />출석 허용</label><label className="check"><input name="autoBilling" type="checkbox" defaultChecked={account?.autoBilling ?? false} />수강 횟수 소진 시 결제 안내도 자동 요청</label><p className="subtle">자동 안내를 켜지 않아도 청구 대상은 자동으로 만들어집니다.</p><button className="primary" disabled={busy}>수강 설정 저장</button></form>}
      {panel.type === 'adjust' && <form onSubmit={e => submit(e, 'adjust', { attendanceId: panel.row.id })}><label>차감 횟수<input name="units" type="number" min="0" max="10" defaultValue={panel.row.units} required /><small>2회 연속 수업은 2, 차감 취소는 0을 입력하세요.</small></label><label>변경 사유·비고<textarea name="note" defaultValue={panel.row.note} required maxLength={500} /></label><button className="primary" disabled={busy}>변경 기록 저장</button></form>}
      {panel.type === 'payment' && <form onSubmit={e => submit(e, 'payment', { invoiceId: panel.row.id, requestId: panel.requestId })}><p>현재 미납 금액 <strong>{won(panel.row.amount - panel.row.paid)}</strong></p><label>이번 수납 금액 (원)<input name="amount" type="number" min="1" max={panel.row.amount - panel.row.paid} defaultValue={panel.row.amount - panel.row.paid} required /></label><label>결제 수단<select name="method">{METHODS.map(m => <option key={m}>{m}</option>)}</select></label><label>비고<textarea name="note" maxLength={500} placeholder="입금자명, 확인 사항 등" /></label><p className="subtle">실제 결제를 확인한 금액만 기록하세요. 전액 수납 시 {panel.row.units}회가 추가됩니다.</p><button className="primary" disabled={busy}>{busy ? '저장 중…' : '수납 확인·저장'}</button></form>}
      {error && <p className="error" role="alert">{error}</p>}
    </section></div>}
  </div>;
}
