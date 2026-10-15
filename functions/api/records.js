/* Existing authenticated Pages middleware protects this endpoint. */
export async function onRequestPost({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const fail = (error, status) =>
    new Response(JSON.stringify({ error }), { status, headers });
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return fail("Forbidden origin", 403);
  let target;
  try {
    target = new URL(env.CONVEX_SITE_URL);
  } catch {
    return fail("Shared records service is not configured", 503);
  }
  if (
    target.protocol !== "https:" ||
    !target.hostname.endsWith(".convex.site") ||
    !env.PULSE_SYNC_KEY ||
    env.PULSE_SYNC_KEY.length < 32
  )
    return fail("Shared records service is not configured", 503);
  let text, body;
  try {
    text = await request.text();
    if (new TextEncoder().encode(text).length > 8500000)
      return fail(
        "Shared package exceeds 8 MB; split or archive older content",
        413,
      );
    body = JSON.parse(text);
  } catch {
    return fail("Invalid request", 400);
  }
  if (
    !["wiki", "operations"].includes(body.name) ||
    !["get", "put", "uploadUrl", "fileUrl"].includes(body.action)
  )
    return fail("Invalid record operation", 400);
  if (
    env.PULSE_READ_ONLY === "true" &&
    ["put", "uploadUrl"].includes(body.action)
  )
    return fail("Shared records are read-only", 403);
  try {
    const response = await fetch(new URL("/records", target), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pulse-Sync-Key": env.PULSE_SYNC_KEY,
      },
      body: text,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers,
    });
  } catch {
    return fail("Shared service unavailable; local changes remain saved", 502);
  }
}
