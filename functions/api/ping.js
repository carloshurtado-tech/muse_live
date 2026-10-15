export async function onRequest() {
  return new Response(JSON.stringify({ ok: true, gate: 'pulse-auth' }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
