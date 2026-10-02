import type { Account } from './model';

export function guardianPhone(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const phone = raw.replace(/\D/g, '');
  if (!/^[\d\s()+-]+$/.test(raw) || !/^0\d{8,10}$/.test(phone)) throw Error('보호자 전화번호를 전체 번호로 입력해주세요.');
  return phone;
}

// Replace guardian lookup codes while keeping separately registered student codes.
export function contactAccount(account: Account, previousPhone: string, phone: string, updatedAt: string): Account {
  const oldCodes = new Set([previousPhone, account.phone].map(v => String(v || '').replace(/\D/g, '')).filter(v => v.length >= 8).map(v => v.slice(-4)));
  const checkinSuffixes = [...new Set([phone.slice(-4), ...(account.checkinSuffixes || []).filter(code => !oldCodes.has(code))])];
  if (checkinSuffixes.length > 5) throw Error('추가 출석번호가 너무 많습니다. 수강권 설정에서 사용하지 않는 번호를 정리해주세요.');
  return { ...account, phone, checkinSuffixes, updatedAt };
}
