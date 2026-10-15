export async function onRequest() {
  return new Response(JSON.stringify({ ok: true, gate: 'muse-auth' }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
