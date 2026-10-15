export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (url.pathname === '/api/ping') {
    return new Response(JSON.stringify({ ok: true, authed: true, passwordConfigured: true }), { status: 200, headers });
  }
  if (url.pathname === '/api/login' && request.method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }
  return next();
}
