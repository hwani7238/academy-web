/** Date-only navigation is independent of the browser's local timezone. */
export function validAttendanceDay(value:unknown):string {
 if(typeof value!=='string'||! /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))throw Error('조회 날짜를 확인해주세요.');
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('조회 날짜를 확인해주세요.');
 return value;
}
export function shiftAttendanceDay(day:string,offset:number){
 const date=new Date(validAttendanceDay(day)+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+offset);
 return validAttendanceDay(date.toISOString().slice(0,10));
}
export function attendanceDayLabel(day:string){
 return `${day} (${'일월화수목금토'[new Date(validAttendanceDay(day)+'T00:00:00Z').getUTCDay()]})`;
}
