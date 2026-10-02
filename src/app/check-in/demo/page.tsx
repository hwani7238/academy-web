'use client';
import { useState } from 'react';
import { CheckIn } from '@/components/operations/CheckIn';
import { sample, demoAction } from '@/components/operations/demo';
import { checkInName } from '@/lib/operations/course-label';
export default function Page() {
  const [data, setData] = useState(sample);
  return <CheckIn demo={{ lookup: digits => data.accounts.filter(a => a.active && a.checkinSuffixes.includes(digits)).map(a => ({ id: a.id, name: checkInName(a, {}) })), checkIn: async studentId => { const next = demoAction(data, { action: 'demoCheckIn', studentId }); setData(next.data); return next.result; } }} />;
}
