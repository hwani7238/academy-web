// Academy operating exceptions are separate from the national holiday colors.
export const ACADEMY_DAYS: Record<string, { open: boolean; label: string }> = {
  '2026-10-03': { open: true, label: '학원 운영' },
  '2026-10-05': { open: false, label: '학원 휴원' },
  '2026-10-09': { open: false, label: '학원 휴원' },
};

export function academyClosed(day: string) {
  return ACADEMY_DAYS[day]?.open === false;
}
