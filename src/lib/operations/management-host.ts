// The public site's staff dashboard must never become a second entrance on manage.
// Kiosk routes keep their existing device/pairing authentication.
export function managementRoute(hostname: string, path: string): 'allow' | 'deny-api' | 'redirect' {
  if (hostname !== 'manage.wheemusic.com') return 'allow';
  if (path === '/api/teacher/attendance' || path === '/api/check-in' || path === '/api/operations' || path.startsWith('/api/operations/') || path.startsWith('/api/cron/')) return 'allow';
  if (path.startsWith('/api/')) return 'deny-api';
  if (['/login', '/operations', '/check-in'].includes(path) || path.startsWith('/_next/') || path === '/favicon.ico') return 'allow';
  return 'redirect';
}
