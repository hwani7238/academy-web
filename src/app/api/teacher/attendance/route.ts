// Keep all lesson accounting and teacher authorization in the management
// backend. The public teacher page uses this same-origin, uncached relay.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
const BACKEND = 'https://manage.wheemusic.com/api/teacher/attendance';
async function relay(request: Request) {
  if (request.method === 'POST' && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error:'허용되지 않은 요청입니다.'},{status:403,headers});
  const token = request.headers.get('authorization');
  if (!token?.match(/^Bearer .+$/)) return Response.json({error:'로그인이 필요합니다.'},{status:401,headers});
  try {
    const roster = request.method === 'GET' && new URL(request.url).searchParams.get('roster') === '1';
    const response = await fetch(BACKEND + (roster ? '?roster=1' : ''), {
      method:request.method, headers:{Authorization:token,'Content-Type':'application/json',Origin:'https://manage.wheemusic.com'},
      ...(request.method === 'POST' ? {body:JSON.stringify(await request.json())} : {}), cache:'no-store', redirect:'error', signal:AbortSignal.timeout(15000),
    });
    return Response.json(await response.json(),{status:response.status,headers});
  } catch { return Response.json({error:'출석 서버 연결이 지연됩니다. 새로고침하여 저장 여부를 확인해주세요.'},{status:503,headers}); }
}
export const GET = relay;
export const POST = relay;
