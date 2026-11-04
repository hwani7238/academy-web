import {validDay,seoulDay,type Attendance} from './model';
import {legacyAttendanceAppearance} from './attendance-appearance';
import type {LedgerEvidence,LedgerSheetSource} from './course-ledger';
import {passStart} from './pass-settlement';
/** A sheet supplies only missing history before the first native record. Native
 * attendance, including the owner's later makeup/pause corrections, always wins. */
export function prepareLedgerSheetSource(e:LedgerEvidence,input:Record<string,unknown>,today=seoulDay()):LedgerSheetSource{
 const source=String(input.source||'');if(!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+(?:\/[^\s]*)?$/.test(source))throw Error('원본 스프레드시트 주소를 확인해주세요.');
 if(!Array.isArray(input.cells)||input.cells.length>500)throw Error('과목별 장부 자료를 확인해주세요.');
 const seen=new Set<string>();
 const cells=input.cells.map((v:Record<string,unknown>)=>{const day=validDay(v.day),value=String(v.value||'').trim(),color=String(v.color||'').toUpperCase(),cell=String(v.cell||''),sheet=String(v.sheet||'');if(seen.has(day)||!/^\d+(?:\.5)?$/.test(value)||Number(value)>200||Number(value)<1||!/^\$?[A-Z]+\$?\d+$/.test(cell)||!sheet||(!/^#[A-F0-9]{6}$/.test(color)&&color!==''))throw Error('장부 날짜·회차·셀 주소를 확인해주세요.');seen.add(day);return {day,value,color,cell,sheet};}).filter(c=>c.day<=today).sort((a,b)=>a.day.localeCompare(b.day));
 const firstModern=e.attendance.map(r=>r.day).sort()[0]||'9999-12-31';
 const dated=e.invoices.filter(i=>i.status!=='cancelled'&&i.allocationState==='allocated'&&passStart(i)).map(passStart).sort();
 const anchor=dated.filter(day=>day<=firstModern).at(-1)||dated[0]||cells.filter(c=>c.day<firstModern&&Number(c.value)===1&&legacyAttendanceAppearance(c).tone!=='makeup').at(-1)?.day;
 if(!anchor)throw Error('시트에서 계산을 시작할 1회차 또는 연결된 수강권을 확인할 수 없습니다.');
 const history:Attendance[]=[];
 for(const c of cells.filter(c=>c.day>=anchor&&c.day<firstModern)){
  const tone=legacyAttendanceAppearance(c).tone;
  if(tone==='makeup')continue; // A standalone orange number cannot identify its original lesson.
  if(!Number.isInteger(Number(c.value)))throw Error(`${c.day}: 반 회차의 차감 기준 확인 필요`);
  const status=tone==='absent'?'absent':'present';
  history.push({id:`sheet_${e.account.id}_${c.day}`,studentId:e.account.id,name:e.account.name,day:c.day,status,units:status==='absent'?0:1,source:'manual',sheetSource:{value:c.value,color:c.color,sheet:c.sheet,cell:c.cell},at:'',updatedAt:'',note:`원본 장부 ${c.sheet}!${c.cell} · ${c.value}회`});
 }
 return {source,cells,history,note:String(input.note||'').slice(0,500),updatedAt:new Date().toISOString()};
}
