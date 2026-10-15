/* Auth is enforced by the existing Pages API middleware. Service key stays server-side. */
export async function onRequestPost({ request, env }) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  function fail(error, status) { return new Response(JSON.stringify({ ok: false, error }), { status, headers }); }
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail('Forbidden origin', 403);
  if (env.PULSE_READ_ONLY === 'true') return fail('Shared records are read-only', 403);
  let target;
  try { target = new URL(env.CONVEX_SITE_URL); } catch (e) { return fail('Shared sync is not configured', 503); }
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.convex.site') || !env.PULSE_SYNC_KEY || env.PULSE_SYNC_KEY.length < 32) {
    return fail('Shared sync is not configured', 503);
  }
  const text = await request.text();
  if (text.length > 2000000) return fail('Snapshot too large', 413);
  try {
    const response = await fetch(new URL('/snapshot', target), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pulse-Sync-Key': env.PULSE_SYNC_KEY },
      body: text, signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    return new Response(await response.text(), { status: response.status, headers });
  } catch (e) { return fail('Shared sync temporarily unavailable. Your browser changes are retained.', 502); }
}
