// @ts-check
// Shared key/value storage for Muse Live (Cloudflare KV binding MUSE_KV).
//   GET    /api/kv/:key   → the stored JSON value (404 when absent; ?optional=1 → 200 null + X-Muse-Missing). Header X-Muse-Updated = ms timestamp.
//   PUT    /api/kv/:key   → store a JSON body (≤ 256 KB). Viewers are read-only.
//   DELETE /api/kv/:key   → admins only.
// Keys are [a-z0-9_-]{1,64}; internal namespaces (users:, audit:, obs:) use ':' and are not reachable here.
import { json } from '../../_lib/session.js';
import { guardJsonWrite, readCappedBody } from '../../_lib/abuse.js';
import { who, isAdmin, canWrite } from '../../_lib/who.js';
import { audit } from '../../_lib/audit.js';

const KEY = /^[a-z0-9_-]{1,64}$/;
const MAX = 256 * 1024;

/* Optimistic concurrency for PUT: clients send the X-Muse-Updated value they
   read (as an ETag) back via If-Match / If-None-Match. Returns null when the
   write may proceed, otherwise an error Response (412). */
function etagList(h) {
  return String(h || '').split(',').map((t) => t.trim().replace(/^W\//, '').replace(/^"|"$/g, ''));
}
export function checkPreconditions(request, updated) {
  const im = request.headers.get('If-Match');
  if (im !== null) {
    const tags = etagList(im);
    // If-Match:* requires the key to exist; a list requires one entry to equal the version.
    if (im.trim() === '*') {
      if (!updated) return json({ ok: false, error: 'Version mismatch' }, 412);
    } else if (!updated || !tags.some((t) => t === updated)) {
      return json({ ok: false, error: 'Version mismatch' }, 412);
    }
  }
  const inm = request.headers.get('If-None-Match');
  if (inm !== null) {
    const tags = etagList(inm);
    // If-None-Match:* fails when the key exists; a list fails on any match (PUT → 412).
    if (inm.trim() === '*' ? !!updated : (!!updated && tags.some((t) => t === updated))) {
      return json({ ok: false, error: 'Version mismatch' }, 412);
    }
  }
  return null;
}

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
  if (request.method === 'PUT') {
    const guard = guardJsonWrite(request, { maxBytes: MAX, perMin: 120, ns: 'kv' });
    if (guard) return guard;
    if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    const read = await readCappedBody(request, MAX);
    if (typeof read !== 'string') return read;
    const text = read;
    try { JSON.parse(text); } catch (e) { return json({ ok: false, error: 'Body must be JSON' }, 400); }
    const cur = await env.MUSE_KV.getWithMetadata(key, { type: 'text' });
    const current = cur && cur.value !== null ? String((cur.metadata && cur.metadata.updated) || 0) : null;
    const blocked = checkPreconditions(request, current || '');
    if (blocked) return blocked;
    const updated = Date.now();
    await env.MUSE_KV.put(key, text, { metadata: { updated, by: user.u } });
    // High-frequency telemetry keys aren't audited (they'd drown the log).
    if (!/^(live-status|presence)/.test(key)) await audit(env, { who: user.u, role: user.r, action: 'kv.put', key, detail: text.length + ' bytes' });
    return json({ ok: true, key, updated }, 200,
      [['ETag', '"' + updated + '"'], ['X-Muse-Updated', String(updated)], ['X-Muse-By', user.u]]);
  }
  if (request.method === 'DELETE') {
    if (!isAdmin(user)) return json({ ok: false, error: 'Admins only' }, 403);
    await env.MUSE_KV.delete(key);
    await audit(env, { who: user.u, role: user.r, action: 'kv.delete', key });
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
