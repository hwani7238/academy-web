import { NextResponse, type NextRequest } from 'next/server';
import { managementRoute } from '@/lib/operations/management-host';

export function proxy(request: NextRequest) {
  const action = managementRoute(request.nextUrl.hostname, request.nextUrl.pathname);
  if (action === 'deny-api') return NextResponse.json({ error: '관리 전용 주소에서는 사용할 수 없습니다.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (action === 'redirect') return NextResponse.redirect(new URL('/operations', request.url));
  return NextResponse.next();
}
