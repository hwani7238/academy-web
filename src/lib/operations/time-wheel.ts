export type WheelTime = { hour: number; minute: number };
export function clockToWheel(clock: string): WheelTime {
  const [hour, minute] = clock.split(':').map(Number);
  return { hour, minute };
}
export function wheelToClock({ hour, minute }: WheelTime): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
