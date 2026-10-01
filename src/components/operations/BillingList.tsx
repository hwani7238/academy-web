'use client';
import { useEffect, useRef, useState } from 'react';
import { type Invoice, type Snapshot, seoulDay } from '@/lib/operations/model';
import { compareGroups, compareNames, groupName } from '@/lib/operations/student-order';
import { CloseButton } from './CloseButton';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const invoiceDay = (invoice: Invoice) => invoice.cycleStart || seoulDay(new Date(invoice.createdAt));
function identity(data: Snapshot, id: string, fallback = '학생') {
  const student = data.students.find(s => s.id === id), account = data.accounts.find(a => a.id === id);
  const name = student?.name || account?.name || fallback;
  return { name: name.split(' · ')[0], subject: student ? groupName(student) : account?.attendanceGroup || account?.subject || name.split(' · ')[1] || '과목 미지정' };
}
type Props = {
  data: Snapshot; invoices: Invoice[]; busy: boolean; demo: boolean;
  pay: (invoice: Invoice) => void; edit: (invoice: Invoice) => void;
  action: (action: string, invoice: Invoice) => void;
};
export function BillingList({ data, invoices, busy, demo, pay, edit, action }: Props) {
  const [subject, setSubject] = useState(''), [search, setSearch] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const subjects = [...new Set(invoices.map(i => identity(data, i.studentId, i.name).subject))].sort(compareGroups);
  const visible = invoices.filter(i => { const who = identity(data, i.studentId, i.name); return (!subject || who.subject === subject) && who.name.includes(search.trim()); })
    .sort((a,b) => invoiceDay(a).localeCompare(invoiceDay(b)) || compareGroups(identity(data,a.studentId,a.name).subject,identity(data,b.studentId,b.name).subject) || compareNames(a.name,b.name));
  const selectedInvoice = invoices.find(i => i.id === selected);
  return <div className="billing-compact">
    <div className="section-head billing-heading"><div><h2>청구·수납</h2><p>날짜순 · 같은 날짜는 과목, 이름순입니다. 재등록일이 없으면 청구일을 표시합니다.</p></div>
      <label>과목<select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">전체 과목</option>{subject && !subjects.includes(subject) && <option value={subject}>{subject}</option>}{subjects.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>학생 찾기<input placeholder="이름" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    </div>
    <div className="billing-count" role="status">결제 대상 <strong>{visible.length}건</strong><span>미납 합계 <strong>{won(visible.reduce((sum,i)=>sum+i.amount-i.paid,0))}</strong></span></div>
    {visible.length ? <div className="table-wrap"><table className="billing-table"><caption className="sr-only">날짜별 결제 대상</caption><colgroup><col className="billing-date-col"/><col className="billing-subject-col"/><col className="billing-name-col"/><col className="billing-plan-col"/><col className="billing-amount-col"/><col className="billing-status-col"/><col className="billing-actions-col"/></colgroup><thead><tr><th>날짜</th><th>과목</th><th>학생</th><th>수강권</th><th className="money">미납 금액</th><th>상태</th><th>관리</th></tr></thead><tbody>{visible.map((i,index)=>{const who=identity(data,i.studentId,i.name),date=invoiceDay(i);return <tr key={i.id} className={index>0 && invoiceDay(visible[index-1])!==date?'billing-date-start':''}>
      <td><time dateTime={date}>{date}</time><small>{i.cycleStart?'재등록일':'청구일'}</small></td><td>{who.subject}</td><td><strong>{who.name}</strong></td><td>{i.units}회</td><td className="money"><strong>{won(i.amount-i.paid)}</strong>{i.paid>0 && <small>{won(i.paid)} 수납</small>}</td><td><span className={`billing-state ${i.needsReview?'review':''}`}>{i.needsReview?'청구 확인 필요':i.paid>0?'부분 수납':'미수납'}</span></td>
      <td><div className="billing-actions">{i.needsReview?<button disabled={busy} onClick={()=>action('confirmInvoice',i)}>청구 확인</button>:<button className="primary" disabled={busy} onClick={()=>pay(i)}>수납 완료</button>}<button className="billing-more" disabled={busy} aria-label={`${who.name} ${who.subject} ${date} 청구 관리`} title="청구 상세·수정·안내·취소" onClick={()=>setSelected(i.id)}>⋮</button></div></td>
    </tr>;})}</tbody></table></div>:<div className="empty billing-empty">{invoices.length?'선택한 과목과 이름에 해당하는 청구가 없습니다.':'진행 중인 청구가 없습니다.'}{(subject||search)&&<button onClick={()=>{setSubject('');setSearch('');}}>전체 보기</button>}</div>}
    <div className="section-head billing-heading divided"><div><h2>최근 수납 기록</h2><p>최근 100건 · 수납일이 최근인 순서입니다.</p></div></div>
    {data.payments.length?<div className="table-wrap"><table className="billing-table payment-table"><caption className="sr-only">최근 수납 기록</caption><thead><tr><th>수납일</th><th>과목</th><th>학생</th><th className="money">수납 금액</th><th>수단</th><th>비고</th></tr></thead><tbody>{[...data.payments].sort((a,b)=>b.at.localeCompare(a.at)).map(p=>{const who=identity(data,p.studentId);return <tr key={p.id}><td><time dateTime={p.at}>{seoulDay(new Date(p.at))}</time></td><td>{who.subject}</td><td><strong>{who.name}</strong></td><td className="money">{won(p.amount)}</td><td>{p.method}</td><td className="billing-note">{p.note||'—'}</td></tr>;})}</tbody></table></div>:<p className="empty billing-empty">아직 수납 기록이 없습니다.</p>}
    {selectedInvoice && <BillingActions key={selectedInvoice.id} invoice={selectedInvoice} name={identity(data,selectedInvoice.studentId,selectedInvoice.name).name} busy={busy} demo={demo} sent={data.notices.some(n=>n.id===`billing_${selectedInvoice.id}`)} close={()=>setSelected(null)} edit={()=>{setSelected(null);edit(selectedInvoice);}} action={name=>{action(name,selectedInvoice);setSelected(null);}}/>}
  </div>;
}
function BillingActions({invoice:i,name,busy,demo,sent,close,edit,action}:{invoice:Invoice;name:string;busy:boolean;demo:boolean;sent:boolean;close:()=>void;edit:()=>void;action:(action:string)=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="quick-attendance billing-detail" aria-labelledby="billing-detail-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}><div className="section-head"><h2 id="billing-detail-title">{name} · 청구 관리</h2><CloseButton disabled={busy} onClick={close}/></div>
    <p>{invoiceDay(i)} · {i.cycleStart?'재등록일':'청구일'} · {i.units}회권</p><dl><div><dt>청구 금액</dt><dd>{won(i.amount)}</dd></div><div><dt>수납 금액</dt><dd>{won(i.paid)}</dd></div><div><dt>미납 금액</dt><dd><strong>{won(i.amount-i.paid)}</strong></dd></div></dl>
    <p>{i.creditUnits===0?'이미 횟수가 반영된 수강권입니다. 수납해도 잔여 횟수를 추가하지 않습니다.':`전액 수납 시 ${i.creditUnits??i.units}회가 추가됩니다.`}</p>
    <div className="billing-detail-actions">{!demo&&<button disabled={busy||i.paid>0} onClick={edit}>청구 수정</button>}<button disabled={busy||i.needsReview||sent} onClick={()=>action('sendInvoice')}>{sent?'결제 안내 요청됨':'결제 안내 요청'}</button><button className="danger-text" disabled={busy||i.paid>0} onClick={()=>{if(window.confirm('이 청구를 취소할까요? 이미 발송한 안내는 회수되지 않습니다.'))action('cancelInvoice');}}>청구 취소</button></div><p className="billing-api-note">결제선생 API 연결 대기 중으로, 안내 요청은 기록만 저장하며 실제 청구서를 보내지 않습니다.</p>
  </dialog>;
}
