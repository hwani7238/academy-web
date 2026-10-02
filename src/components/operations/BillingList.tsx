'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Invoice, type Snapshot, seoulDay } from '@/lib/operations/model';
import { compareGroups, compareNames, groupName } from '@/lib/operations/student-order';
import { attendanceSequence } from '@/lib/operations/attendance-sequence';
import { courseInitial, invoiceCycleStart, paymentDay, shortBillingDay } from '@/lib/operations/billing-display';
import { CloseButton } from './CloseButton';
import { InvoiceDateDialog } from './InvoiceDateDialog';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const invoiceDay = (invoice: Invoice) => invoice.lessonDate || invoice.cycleStart || seoulDay(new Date(invoice.createdAt));
function identity(data: Snapshot, id: string, fallback = '학생') {
  const student = data.students.find(s => s.id === id), account = data.accounts.find(a => a.id === id);
  const name = student?.name || account?.name || fallback;
  return { name: name.split(' · ')[0], subject: student ? groupName(student) : account?.attendanceGroup || account?.subject || name.split(' · ')[1] || '과목 미지정' };
}
type Props = {
  data: Snapshot; invoices: Invoice[]; busy: boolean; demo: boolean;
  pay: (invoice: Invoice) => void; edit: (invoice: Invoice) => void;
  action: (action: string, invoice: Invoice) => void;
  save: (input: Record<string, unknown>) => Promise<unknown>;
};
export function BillingList({ data, invoices, busy, demo, pay, edit, action, save }: Props) {
  const [subject, setSubject] = useState(''), [search, setSearch] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [dateInvoice, setDateInvoice] = useState<Invoice | null>(null);
  const layout = useRef<HTMLDivElement>(null);
  const [columns,setColumns]=useState(1);
  useEffect(()=>{const node=layout.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setColumns(Math.max(1,Math.min(4,Math.floor((entry.contentRect.width-8)/308)))));observer.observe(node);return()=>observer.disconnect();},[]);
  const cycleState=useMemo(()=>attendanceSequence(data.accounts,data.attendance,data.legacyAttendance||[],data.sequenceContext),[data.accounts,data.attendance,data.legacyAttendance,data.sequenceContext]);
  const firstDay=(invoice:Invoice)=>invoiceCycleStart(invoice,cycleState.cycleFirstDays,cycleState.firstLessonTimes);
  const subjects = [...new Set(invoices.map(i => identity(data, i.studentId, i.name).subject))].sort(compareGroups);
  const visible = invoices.filter(i => { const who = identity(data, i.studentId, i.name); return (!subject || who.subject === subject) && who.name.includes(search.trim()); })
    .sort((a,b) => (firstDay(a)||'9999').localeCompare(firstDay(b)||'9999') || compareGroups(identity(data,a.studentId,a.name).subject,identity(data,b.studentId,b.name).subject) || compareNames(a.name,b.name));
  const columnCount=Math.min(columns,Math.max(1,Math.ceil(visible.length/7)));
  const perColumn=Math.ceil(visible.length/columnCount);
  const chunks=Array.from({length:columnCount},(_,index)=>visible.slice(index*perColumn,(index+1)*perColumn));
  const selectedInvoice = invoices.find(i => i.id === selected);
  return <div className="billing-compact" ref={layout}>
    <div className="section-head billing-heading"><div><h2>청구·수납</h2><p>1회차 날짜순 · 위에서 아래로, 다음 열로 이어집니다. 날짜 미확인은 맨 뒤에 표시합니다.</p></div>
      <label>과목<select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">전체 과목</option>{subject && !subjects.includes(subject) && <option value={subject}>{subject}</option>}{subjects.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>학생 찾기<input placeholder="이름" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    </div>
    <div className="billing-count" role="status">결제 대상 <strong>{visible.length}건</strong><span>미납 합계 <strong>{won(visible.reduce((sum,i)=>sum+i.amount-i.paid,0))}</strong></span></div>
    {visible.length ? <div className="billing-ledgers" style={{gridTemplateColumns:`repeat(${columnCount},minmax(0,300px))`}}>{chunks.map((chunk,column)=><div className="table-wrap billing-ledger-block" key={column}><table className="billing-table billing-ledger"><caption className="sr-only">결제 대상 {column+1}열</caption><colgroup><col style={{width:'14.67%'}}/><col style={{width:'22.66%'}}/><col style={{width:'24%'}}/><col style={{width:'16%'}}/><col style={{width:'14%'}}/><col style={{width:'8.67%'}}/></colgroup><thead><tr><th className="billing-day" title="결제가 필요한 수강권의 1회차 날짜">1회차</th><th>이름</th><th className="money">금액(원)</th><th className="billing-course">과목</th><th className="billing-pay">수납</th><th className="billing-menu"><span className="sr-only">더 보기</span></th></tr></thead><tbody>{chunk.map((i,index)=>{const who=identity(data,i.studentId,i.name),date=firstDay(i);return <tr key={i.id} className={index>0&&firstDay(chunk[index-1])!==date?'billing-date-start':''}>
      <td className="billing-day"><button className="billing-date-button" disabled={busy} aria-label={`${who.name} ${who.subject} 1회차 날짜 수정`} title="1회차 날짜 수정" onClick={()=>setDateInvoice({...i})}>{date?<time dateTime={date} title={date}>{shortBillingDay(date)}</time>:<span className="billing-unknown">미확인</span>}</button></td>
      <td className="billing-name" title={`${who.name} · ${who.subject}`}><strong>{who.name}</strong>{i.needsReview&&<span title="청구 확인 필요" aria-label="청구 확인 필요"> !</span>}</td><td className="money" title={`청구 ${won(i.amount)} · 수납 ${won(i.paid)} · 미납 ${won(i.amount-i.paid)}`}><strong>{(i.amount-i.paid).toLocaleString('ko-KR')}</strong>{i.paid>0&&<span className="billing-partial" title={`부분 수납: ${won(i.paid)}`} aria-label={`부분 수납 ${won(i.paid)}`}>◐</span>}</td><td className="billing-course"><abbr title={who.subject}>{courseInitial(who.subject)}</abbr></td>
      <td className="billing-pay">{i.needsReview?<button disabled={busy} onClick={()=>action('confirmInvoice',i)} aria-label={`${who.name} 청구 확인`}>확인</button>:<button className="primary" disabled={busy} onClick={()=>pay(i)} aria-label={`${who.name} ${who.subject} 수납 완료`}>수납</button>}</td><td className="billing-menu"><button className="billing-more" disabled={busy} aria-label={`${who.name} ${who.subject} ${date||'날짜 미확인'} 청구 관리`} title="청구 상세·수정·안내·취소" onClick={()=>setSelected(i.id)}>⋮</button></td>
    </tr>;})}</tbody></table></div>)}</div>:<div className="empty billing-empty">{invoices.length?'선택한 과목과 이름에 해당하는 청구가 없습니다.':'진행 중인 청구가 없습니다.'}{(subject||search)&&<button onClick={()=>{setSubject('');setSearch('');}}>전체 보기</button>}</div>}
    <p className="billing-initials">PF(1) 피아노 1관 · PF(2) 피아노 2관 · PF(A) 성인 피아노 · D 드럼 · UK 우쿨렐레 · V 보컬 · G 기타 · ENS 앙상블 · MIDI 미디 · ◐ 부분 수납</p>
    <div className="section-head billing-heading divided"><div><h2>최근 수납 기록</h2><p>최근 등록 100건 · 실제 결제받은 날짜순입니다.</p></div></div>
    {data.payments.length?<div className="table-wrap"><table className="billing-table payment-table"><caption className="sr-only">최근 수납 기록</caption><thead><tr><th>결제일</th><th>과목</th><th>학생</th><th className="money">수납 금액</th><th>수단</th><th>비고</th></tr></thead><tbody>{[...data.payments].sort((a,b)=>paymentDay(b).localeCompare(paymentDay(a))||b.at.localeCompare(a.at)).map(p=>{const who=identity(data,p.studentId);const invoice=[...data.invoices,...(data.settledInvoices||[])].find(i=>i.id===p.invoiceId);const receiptInfo=invoice?`1회차: ${firstDay(invoice)||'날짜 미확인'} · 청구일: ${seoulDay(new Date(invoice.createdAt))} · ${invoice.units}회권 · ${invoice.status==='paid'?'수납 완료':'부분 수납'}${invoice.needsReview?' · 청구 확인 필요':''}`:'연결된 청구 확인 필요';return <tr key={p.id}><td><time dateTime={paymentDay(p)} title={`기록 시각: ${new Date(p.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`}>{paymentDay(p)}</time></td><td><abbr title={who.subject}>{courseInitial(who.subject)}</abbr></td><td title={receiptInfo}><strong>{who.name}</strong></td><td className="money">{won(p.amount)}</td><td>{p.method}</td><td className="billing-note">{p.note||'—'}</td></tr>;})}</tbody></table></div>:<p className="empty billing-empty">아직 수납 기록이 없습니다.</p>}
    {selectedInvoice && <BillingActions key={selectedInvoice.id} invoice={selectedInvoice} name={identity(data,selectedInvoice.studentId,selectedInvoice.name).name} busy={busy} demo={demo} sent={data.notices.some(n=>n.id===`billing_${selectedInvoice.id}`)} close={()=>setSelected(null)} edit={()=>{setSelected(null);edit(selectedInvoice);}} action={name=>{action(name,selectedInvoice);setSelected(null);}}/>}
    {dateInvoice && <InvoiceDateDialog invoice={dateInvoice} initialDate={firstDay(dateInvoice)} save={save} close={()=>setDateInvoice(null)}/>}
  </div>;
}
function BillingActions({invoice:i,name,busy,demo,sent,close,edit,action}:{invoice:Invoice;name:string;busy:boolean;demo:boolean;sent:boolean;close:()=>void;edit:()=>void;action:(action:string)=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="quick-attendance billing-detail" aria-labelledby="billing-detail-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}><div className="section-head"><h2 id="billing-detail-title">{name} · 청구 관리</h2><CloseButton disabled={busy} onClick={close}/></div>
    <p>{invoiceDay(i)} · {i.lessonDate||i.cycleStart?'1회차':'청구일'} · {i.units}회권</p><dl><div><dt>청구 금액</dt><dd>{won(i.amount)}</dd></div><div><dt>수납 금액</dt><dd>{won(i.paid)}</dd></div><div><dt>미납 금액</dt><dd><strong>{won(i.amount-i.paid)}</strong></dd></div></dl>
    <p>{i.creditUnits===0?'이미 횟수가 반영된 수강권입니다. 수납해도 잔여 횟수를 추가하지 않습니다.':`전액 수납 시 ${i.creditUnits??i.units}회가 추가됩니다.`}</p>
    <div className="billing-detail-actions">{!demo&&<button disabled={busy||i.paid>0} onClick={edit}>청구 수정</button>}<button disabled={busy||i.needsReview||sent} onClick={()=>action('sendInvoice')}>{sent?'결제 안내 요청됨':'결제 안내 요청'}</button><button className="danger-text" disabled={busy||i.paid>0} onClick={()=>{if(window.confirm('이 청구를 취소할까요? 이미 발송한 안내는 회수되지 않습니다.'))action('cancelInvoice');}}>청구 취소</button></div><p className="billing-api-note">결제선생 API 연결 대기 중으로, 안내 요청은 기록만 저장하며 실제 청구서를 보내지 않습니다.</p>
  </dialog>;
}
