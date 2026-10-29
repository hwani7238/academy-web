'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import './operations.css';
import './check-in.css';
type Match = { id: string; name: string };
type Demo = { lookup: (digits: string) => Match[]; checkIn: (studentId: string) => Promise<Record<string, unknown>> };
export function CheckIn({ demo }: { demo?: Demo }) {
  const [registered, setRegistered] = useState(Boolean(demo)); const [code, setCode] = useState('');
  const [digits, setDigits] = useState(''); const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState(''); const [success, setSuccess] = useState(false); const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const enteredDigits = useRef('');
  const call = async (body: object) => { const response = await fetch('/api/check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) { if (response.status === 401) setRegistered(false); throw new Error(data.error); } return data; };
  useEffect(() => {
    if (demo) return;
    const hash = window.location.hash.slice(1); if (hash) { setCode(hash); history.replaceState(null, '', window.location.pathname); }
    void call({ action: 'status' }).then(() => setRegistered(true)).catch(() => {});
  // Initialization only: demo is fixed for the lifetime of this screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!success) return; const timer = setTimeout(() => { setSuccess(false); enteredDigits.current=''; setDigits(''); setMatches([]); setMessage(''); }, 3500); return () => clearTimeout(timer);
  }, [success]);
  const run = async (fn: () => Promise<void>) => { if (pending.current) return; pending.current = true; setBusy(true); setMessage(''); try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : '다시 시도해주세요.'); } finally { pending.current = false; setBusy(false); } };
  const saveAttendance = async (id: string, completedDigits = digits) => { const result = demo ? await demo.checkIn(id) : await call({ action: 'checkIn', digits: completedDigits, studentId: id }); setMessage(result.duplicate ? `${result.name} 학생은 이미 출석했어요.` : `${result.name} 학생, 출석했어요!`); setSuccess(true); };
  const lookup = (completedDigits: string) => run(async () => {
    if (!/^\d{4}$/.test(completedDigits)) return;
    const found: Match[] = demo ? demo.lookup(completedDigits) : (await call({ action: 'lookup', digits: completedDigits })).matches;
    if (found.length === 1) { await saveAttendance(found[0].id, completedDigits); return; }
    setMatches(found);
    if (!found.length) setMessage('등록된 번호가 없어요. 선생님께 말씀해주세요.');
  });
  const changeDigits = (value: string) => {
    if (pending.current || success || !registered) return;
    const next = value.replace(/[^0-9]/g, '').slice(0, 4);
    if (next === enteredDigits.current) return;
    enteredDigits.current = next;
    setDigits(next); setMessage('');
    if (next.length === 4) void lookup(next);
  };
  const attend = (id: string) => run(() => saveAttendance(id));
  return <div className={`whee-ops kiosk kiosk-light ${demo ? 'embedded' : ''}`}>
    <div className="kiosk-shell">
    <header className="kiosk-topbar"><div className="kiosk-logo"><Image src="/logo.png?kiosk=1" alt="WHEE MUSIC ACADEMY 위뮤직 아카데미" width={1024} height={576} priority unoptimized /></div></header>
    <div className="kiosk-inner"><div className="kiosk-heading"><span className="kiosk-eyebrow" aria-hidden="true"><span className="kiosk-sound-bars"><i/><i/><i/></span>WHEE MUSIC</span><h1>{registered ? '오늘도 반가워요' : '출석 기기 등록'}</h1></div>
    {!registered ? <form onSubmit={e => { e.preventDefault(); void run(async () => { await call({ action: 'pair', code: code.trim() }); setRegistered(true); setCode(''); }); }}>
      <p>원장님 관리 화면에서 만든 등록 코드를 입력해주세요.</p><label>기기 등록 코드<input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" required /></label><button className="primary" disabled={busy}>이 아이폰 등록</button>
    </form> : success ? <div className="kiosk-success" role="status"><span className="kiosk-success-icon" aria-hidden="true">✓</span><h2>{message}</h2><p>잠시 후 처음 화면으로 돌아갑니다.</p></div> : matches.length ? <div className="matches"><p>출석할 학생과 과목을 선택해주세요.</p>{matches.map(m => <button disabled={busy} key={m.id} onClick={() => void attend(m.id)}>{m.name}<span>출석하기 →</span></button>)}<button className="quiet" disabled={busy} onClick={() => { enteredDigits.current=''; setMatches([]); setDigits(''); setMessage(''); }}>번호 다시 입력</button></div> : <form onSubmit={e => e.preventDefault()}>
      <label className="sr-only" htmlFor={demo ? 'demo-digits' : 'digits'}>휴대폰 뒷번호</label><input id={demo ? 'demo-digits' : 'digits'} className="digit-display" disabled={busy} inputMode="numeric" autoComplete="off" maxLength={4} value={digits} onChange={e => changeDigits(e.target.value)} placeholder="····" />
      <div className="keypad">{['1','2','3','4','5','6','7','8','9','지우기','0','⌫'].map(k => <button type="button" disabled={busy} key={k} aria-label={k === '⌫' ? '마지막 숫자 지우기' : k} onClick={() => changeDigits(k === '지우기' ? '' : k === '⌫' ? enteredDigits.current.slice(0, -1) : enteredDigits.current + k)}>{k}</button>)}</div>{busy && <p role="status">출석 처리 중…</p>}
    </form>}{!success && message && <p className="error" role="alert">{message}</p>}</div><p className="kiosk-footer">{demo ? '체험 번호 1234 · 형제자매 선택 가능' : '위뮤직 아카데미 · 출석 체크'}</p></div>
  </div>;
}
