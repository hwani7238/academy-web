import type { Account } from './model';

type Owner = { name?: string; instrument?: string; instruments?: string[]; operationsCourseGroups?: Record<string, string> };
export type Imported = { subject?: string; asOf?: string; history?: { section?: string; cells?: { day: string }[] }[] };

export function pianoGroup(value: string): string | undefined {
  const compact = value.replace(/\s/g, '');
  if (!compact.includes('피아노')) return undefined;
  if (compact.includes('성인')) return '성인 피아노';
  if (compact.includes('1관')) return '어린이 피아노 (1관)';
  if (compact.includes('2관')) return '어린이 피아노 (2관)';
  return undefined;
}

export function resolveImportedSubjects(subjects: string[], source: string) {
  const aliases: Record<string, string> = { '기타': '통기타', '일렉': '일렉기타', '피아노(어린이)': '어린이 피아노', '피아노(성인)': '성인 피아노' };
  return subjects.filter(s => (aliases[s] || s) === source || (s === '피아노' && ['어린이 피아노', '성인 피아노'].includes(source)));
}

export function courseSubject(account: Pick<Account, 'subject' | 'name'>, owner: Owner): string {
  return account.subject || (owner.instruments?.length === 1 ? owner.instruments[0] : owner.instrument) || account.name.split(' · ')[1] || '';
}

// importId is a balance baseline, not a class assignment. Resolve all matched
// sources consistently in the manager roster, kiosk search and check-in result.
export function courseGroup(account: Pick<Account, 'subject' | 'name' | 'attendanceGroup' | 'displaySubject'>, owner: Owner, sources: Imported[] = []): string | undefined {
  const subject = courseSubject(account, owner);
  const explicit = owner.operationsCourseGroups?.[subject] || account.attendanceGroup;
  if (explicit) return explicit;
  const subjects = [...new Set([...(owner.instruments?.length ? owner.instruments : owner.instrument ? [owner.instrument] : []), subject].filter(Boolean))];
  const groups = new Set<string>();
  for (const source of sources) {
    const matching = resolveImportedSubjects(subjects, source.subject || '');
    if (matching.length !== 1 || matching[0] !== subject || !source.asOf) continue;
    for (const history of source.history || []) {
      if (!history.cells?.some(c => c.day.startsWith(source.asOf!.slice(0, 7)))) continue;
      const section = (history.section || '').replace(/\s/g, '');
      const group = source.subject === '어린이 피아노'
        ? section.includes('2관') ? '어린이 피아노(2관)' : section === '피아노(어린이)' || section.includes('1관') ? '어린이 피아노(1관)' : '어린이 피아노(관 미확인)'
        : source.subject;
      if (group) groups.add(group);
    }
  }
  return groups.size === 1 ? [...groups][0] : undefined;
}

export function checkInName(account: Account, owner: Owner, source?: Imported | Imported[]): string {
  const subject = courseSubject(account, owner);
  const sources = Array.isArray(source) ? source : source ? [source] : [];
  const label = courseGroup(account, owner, sources) || account.displaySubject || subject;
  const name = owner.name || account.name.split(' · ')[0];
  if (!label) return name;
  return `${name} · ${label.includes('피아노') ? pianoGroup(label) || '피아노 · 반 확인 필요' : label}`;
}
