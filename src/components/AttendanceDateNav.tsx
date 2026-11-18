import { attendanceDayLabel, shiftAttendanceDay } from '@/lib/attendance-date';

export function AttendanceDateNav({day,today,disabled=false,onChange}:{day:string;today:string;disabled?:boolean;onChange:(day:string)=>void}) {
 const arrow={width:36,height:36,padding:0,border:'1px solid #d5d9e0',borderRadius:8,background:'#fff',fontSize:22,lineHeight:1,color:'#374151'};
 return <div role="group" aria-label="출석 날짜 이동" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
  <button type="button" aria-label="이전 날짜" title="하루 전" disabled={disabled} onClick={()=>onChange(shiftAttendanceDay(day,-1))} style={arrow}>‹</button>
  <time dateTime={day} aria-live="polite" style={{fontSize:15,fontWeight:600,color:'#374151'}}>{attendanceDayLabel(day)}</time>
  <button type="button" aria-label="다음 날짜" title="하루 뒤" disabled={disabled} onClick={()=>onChange(shiftAttendanceDay(day,1))} style={arrow}>›</button>
  <button type="button" aria-label="오늘 날짜로 이동" disabled={disabled||day===today} onClick={()=>onChange(today)} style={{height:36,padding:'0 10px',border:'1px solid #d5d9e0',borderRadius:8,fontSize:13,background:'#fff',color:'#374151',opacity:day===today?0.45:1}}>오늘</button>
 </div>;
}
