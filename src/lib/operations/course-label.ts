import type { Account } from './model';

type Owner = { name?: string; instrument?: string; instruments?: string[]; operationsCourseGroups?: Record<string, string> };
type Imported = { subject?: string; asOf?: string; history?: { section?: string; cells?: { day: string }[] }[] };

export function pianoGroup(value: string): string | undefined {
  const compact = value.replace(/\s/g, '');
  if (!compact.includes('피아노')) return undefined;
  if (compact.includes('성인')) return '성인 피아노';
  if (compact.includes('1관')) return '어린이 피아노 (1관)';
  if (compact.includes('2관')) return '어린이 피아노 (2관)';
  return undefined;
}

// Old imports stored the campus in the sheet section, not in the account name.
export function importedCourseGroup(source?: Imported): string | undefined {
  if (!source?.subject?.includes('피아노')) return undefined;
  const explicit = pianoGroup(source.subject);
  if (explicit) return explicit;
  if (!source.asOf) return undefined;
  const groups = new Set((source.history || [])
    .filter(h => h.cells?.some(c => c.day.startsWith(source.asOf!.slice(0, 7))))
    .map(h => {
      const section = (h.section || '').replace(/\s/g, '');
      return pianoGroup(section) || (section === '피아노(어린이)' ? '어린이 피아노 (1관)' : undefined);
    }).filter(Boolean));
  return groups.size === 1 ? [...groups][0] : undefined;
}

export function checkInName(account: Account, owner: Owner, source?: Imported): string {
  const subject = account.subject || (owner.instruments?.length === 1 ? owner.instruments[0] : owner.instrument) || account.name.split(' · ')[1] || '';
  const group = owner.operationsCourseGroups?.[subject] || account.attendanceGroup;
  const label = group || importedCourseGroup(source) || account.displaySubject || subject;
  const name = owner.name || account.name.split(' · ')[0];
  if (!label) return name;
  return `${name} · ${label.includes('피아노') ? pianoGroup(label) || '피아노 · 반 확인 필요' : label}`;
}
