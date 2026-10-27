// @ts-check
// Shared key/value storage for Muse Live (Cloudflare KV binding MUSE_KV).
//   GET    /api/kv/:key   → the stored JSON value (404 when absent; ?optional=1 → 200 null + X-Muse-Missing). Header X-Muse-Updated = ms timestamp.
//   PUT    /api/kv/:key   → store a JSON body (≤ 256 KB). Viewers are read-only.
//   DELETE /api/kv/:key   → admins only.
// Keys are [a-z0-9_-]{1,64}; internal namespaces (users:, audit:, obs:) use ':' and are not reachable here.
import { json, sameOrigin } from '../../_lib/session.js';
import { who, isAdmin, canWrite } from '../../_lib/who.js';
import { audit } from '../../_lib/audit.js';

const KEY = /^[a-z0-9_-]{1,64}$/;
const MAX = 256 * 1024;

export async function onRequest(context) {
  const { request, env, params } = context;
  const key = String(params.key || '');
  if (!KEY.test(key)) return json({ ok: false, error: 'Invalid key' }, 400);
  if (!env.MUSE_KV) return json({ ok: false, configured: false, error: 'Shared storage is not configured (MUSE_KV binding).' }, 503);
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);

  if (request.method === 'GET' || request.method === 'HEAD') {
    const { value, metadata } = await env.MUSE_KV.getWithMetadata(key, { type: 'text' });
    if (value === null) {
      // ?optional=1 → 200 + null (no console noise for "not created yet"); default stays 404.
      if (new URL(request.url).searchParams.get('optional') === '1') {
        return new Response(request.method === 'HEAD' ? null : 'null', { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Muse-Missing': '1', 'X-Muse-Updated': '0' } });
      }
      return json({ ok: false, error: 'Not found' }, 404);
    }
    // The version IS the timestamp: it changes exactly when the value does.
    const updated = String((metadata && metadata.updated) || 0);
    const etag = '"' + updated + '"';
    const inm = request.headers.get('If-None-Match') || '';
    const fresh = inm.trim() === '*' || inm.split(',').some(function (t) {
      return t.trim().replace(/^W\//, '').replace(/^"|"$/g, '') === updated;
    });
    if (fresh) {
      return new Response(null, { status: 304, headers: {
        ETag: etag, 'X-Muse-Updated': updated, 'X-Muse-By': String((metadata && metadata.by) || '') } });
    }
    return new Response(request.method === 'HEAD' ? null : value, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ETag: etag,
        'X-Muse-Updated': updated, 'X-Muse-By': String((metadata && metadata.by) || '') },
    });
  }
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  if (request.method === 'PUT') {
    if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX) return json({ ok: false, error: 'Value exceeds 256 KB' }, 413);
    try { JSON.parse(text); } catch (e) { return json({ ok: false, error: 'Body must be JSON' }, 400); }
    const updated = Date.now();
    await env.MUSE_KV.put(key, text, { metadata: { updated, by: user.u } });
    // High-frequency telemetry keys aren't audited (they'd drown the log).
    if (!/^(live-status|presence)/.test(key)) await audit(env, { who: user.u, role: user.r, action: 'kv.put', key, detail: text.length + ' bytes' });
    return json({ ok: true, key, updated });
  }
  if (request.method === 'DELETE') {
    if (!isAdmin(user)) return json({ ok: false, error: 'Admins only' }, 403);
    await env.MUSE_KV.delete(key);
    await audit(env, { who: user.u, role: user.r, action: 'kv.delete', key });
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
