import {seoulDay,validDay,type Account} from './model';
export type PassHistoryEntry={start:string;units:number};
export function passHistoryInput(value:unknown,currentUnits:number,today=seoulDay()):PassHistoryEntry[]{
 if(!Array.isArray(value)||!value.length||value.length>60)throw Error('수강권 이력을 1~60개 입력해주세요.');
 const rows=value.map(row=>{
  if(!row||typeof row!=='object')throw Error('수강권 이력을 확인해주세요.');
  const start=validDay(row.start),units=row.units;
  if(start>today)throw Error('수강권 시작일은 오늘 또는 이전 날짜로 입력해주세요.');
  if(!Number.isInteger(units)||units<1||units>200)throw Error('등록 횟수는 1~200회로 입력해주세요.');
  return {start,units};
 }).sort((a,b)=>a.start.localeCompare(b.start));
 if(new Set(rows.map(r=>r.start)).size!==rows.length)throw Error('수강권 시작일이 중복됩니다.');
 if(rows.at(-1)!.units!==currentUnits)throw Error('마지막 수강권 횟수는 현재 수강 설정과 같아야 합니다. 현재 등록 횟수를 먼저 확인해주세요.');
 return rows;
}
export function passUnitsOn(account:Pick<Account,'planUnits'|'passHistory'>,day:string){
 return account.passHistory?.filter(r=>r.start<=day).sort((a,b)=>b.start.localeCompare(a.start))[0]?.units||account.planUnits;
}
export function passCycleStarts(accounts:Pick<Account,'id'|'passHistory'>[]){
 return accounts.flatMap(a=>(a.passHistory||[]).map(r=>({studentId:a.id,day:r.start})));
}
