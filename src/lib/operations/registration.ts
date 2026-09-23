import { integer } from './model';
export const REGISTRATION_SUBJECTS = ['성인 피아노', '어린이 피아노(1관)', '어린이 피아노(2관)', '앙상블', '보컬', '드럼', '우쿨렐레', '통기타', '일렉기타', '베이스', '미디', '성악', '시창청음', '리코더', '댄스'];
export function registrationInput(input: Record<string, unknown>) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.replace(/\D/g, '') : '';
  const group = String(input.group || '');
  if (!name || name.length > 60) throw Error('학생 이름을 입력해주세요.');
  if (!/^0\d{8,10}$/.test(phone)) throw Error('보호자 전화번호를 확인해주세요.');
  if (!REGISTRATION_SUBJECTS.includes(group)) throw Error('과목을 선택해주세요.');
  const subject = group.includes('피아노') ? '피아노' : group;
  const planUnits = integer(input.planUnits, 1, 200, '수강 횟수');
  const planAmount = integer(input.planAmount, 1, 100000000, '수강료');
  const remaining = integer(input.remaining, 0, planUnits, '처음 사용할 횟수');
  const personalPhone = typeof input.personalPhone === 'string' ? input.personalPhone.replace(/\D/g, '') : '';
  if (personalPhone && !/^0\d{8,10}$/.test(personalPhone)) throw Error('학생 전화번호를 확인해주세요.');
  return { name, phone, group, subject, planUnits, planAmount, remaining, personalPhone };
}
