import { Operations } from '@/components/operations/Operations';
import { ManagementAccess } from '@/components/operations/ManagementAccess';
export const metadata = { title: '출석·수납 관리' };
export default function Page() { return <ManagementAccess><Operations /></ManagementAccess>; }
