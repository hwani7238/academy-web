export type WheelTime = { period: 0 | 1; hour: number; minute: number };
export function clockToWheel(clock: string): WheelTime {
  const [hour, minute] = clock.split(':').map(Number);
  return { period: hour >= 12 ? 1 : 0, hour: hour % 12 || 12, minute };
}
export function wheelToClock({ period, hour, minute }: WheelTime): string {
  return `${String(hour % 12 + period * 12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
