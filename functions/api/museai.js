/**
 * Muse is under construction. No remote assistant from this snapshot.
 */
export async function onRequest() {
  return new Response(JSON.stringify({
    ok: false,
    configured: false,
    underConstruction: true,
    text: 'Muse is under construction.',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
