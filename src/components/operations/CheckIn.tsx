'use client';
import { useEffect, useState } from 'react';
import './operations.css';
type Match = { id: string; name: string };
type Demo = { lookup: (digits: string) => Match[]; checkIn: (studentId: string) => Promise<Record<string, unknown>> };
export function CheckIn({ demo }: { demo?: Demo }) {
  const [registered, setRegistered] = useState(Boolean(demo)); const [code, setCode] = useState('');
  const [digits, setDigits] = useState(''); const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState(''); const [success, setSuccess] = useState(false); const [busy, setBusy] = useState(false);
  const call = async (body: object) => { const response = await fetch('/api/check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) { if (response.status === 401) setRegistered(false); throw new Error(data.error); } return data; };
  useEffect(() => {
    if (demo) return;
    const hash = window.location.hash.slice(1); if (hash) { setCode(hash); history.replaceState(null, '', window.location.pathname); }
    void call({ action: 'status' }).then(() => setRegistered(true)).catch(() => {});
  // Initialization only: demo is fixed for the lifetime of this screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!success) return; const timer = setTimeout(() => { setSuccess(false); setDigits(''); setMatches([]); setMessage(''); }, 3500); return () => clearTimeout(timer);
  }, [success]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMessage(''); try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : '다시 시도해주세요.'); } finally { setBusy(false); } };
  const lookup = () => run(async () => { const found = demo ? demo.lookup(digits) : (await call({ action: 'lookup', digits })).matches; setMatches(found); if (!found.length) setMessage('등록된 번호가 없어요. 선생님께 말씀해주세요.'); });
  const attend = (id: string) => run(async () => { const result = demo ? await demo.checkIn(id) : await call({ action: 'checkIn', digits, studentId: id }); setMessage(result.duplicate ? `${result.name} 학생은 이미 출석했어요.` : `${result.name} 학생, 출석했어요!`); setSuccess(true); });
  return <div className={`whee-ops kiosk ${demo ? 'embedded' : ''}`}>
    <div className="kiosk-inner"><p className="brand">WHEE MUSIC</p><h1>{registered ? '오늘도 반가워요' : '출석 기기 등록'}</h1>
    {!registered ? <form onSubmit={e => { e.preventDefault(); void run(async () => { await call({ action: 'pair', code: code.trim() }); setRegistered(true); setCode(''); }); }}>
      <p>원장님 관리 화면에서 만든 등록 코드를 입력해주세요.</p><label>기기 등록 코드<input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" required /></label><button className="primary" disabled={busy}>이 아이폰 등록</button>
    </form> : success ? <div className="kiosk-success" role="status"><span aria-hidden="true">✓</span><h2>{message}</h2><p>잠시 후 처음 화면으로 돌아갑니다.</p></div> : matches.length ? <div className="matches"><p>본인의 이름을 눌러주세요.</p>{matches.map(m => <button disabled={busy} key={m.id} onClick={() => void attend(m.id)}>{m.name}<span>출석하기 →</span></button>)}<button className="quiet" onClick={() => { setMatches([]); setDigits(''); setMessage(''); }}>번호 다시 입력</button></div> : <form onSubmit={e => { e.preventDefault(); void lookup(); }}>
      <p>본인 또는 보호자 휴대폰 뒷번호 4자리</p><label className="sr-only" htmlFor={demo ? 'demo-digits' : 'digits'}>휴대폰 뒷번호</label><input id={demo ? 'demo-digits' : 'digits'} className="digit-display" inputMode="numeric" autoComplete="off" maxLength={4} value={digits} onChange={e => setDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="····" />
      <div className="keypad">{['1','2','3','4','5','6','7','8','9','지우기','0','⌫'].map(k => <button type="button" disabled={busy} key={k} aria-label={k === '⌫' ? '마지막 숫자 지우기' : k} onClick={() => setDigits(v => k === '지우기' ? '' : k === '⌫' ? v.slice(0, -1) : (v + k).slice(0, 4))}>{k}</button>)}</div><button className="primary" disabled={digits.length !== 4 || busy}>{busy ? '확인 중…' : '이름 확인'}</button>
    </form>}{!success && message && <p className="error" role="alert">{message}</p>}<p className="kiosk-footer">{demo ? '체험 번호 1234 · 형제자매 선택 가능' : '위뮤직 아카데미 · 출석 체크'}</p></div>
  </div>;
}
