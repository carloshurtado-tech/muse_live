// @ts-check
// Show media on R2 (bucket binding MUSE_MEDIA): pano photos, caption files,
// recorded segments, survey captures.
//   POST /api/media → { kind, show, name, contentType, data (base64, ≤8 MB raw) }
//     stores kind/show/yyyy-mm-dd/ts-name, returns { key, url, size }
//   GET /api/media?key=… → the bytes (signed-in)
//   GET /api/media?prefix=…&limit=… → key listing (signed-in, cap 100)
//   DELETE /api/media?key=… → remove (writers only)
// Kinds: pano | captions | segments | survey. Anything else is rejected —
// the bucket is show evidence, not a file dump. 503 until MUSE_MEDIA is bound.
import { json, sameOrigin } from '../_lib/session.js';
import { who, canWrite } from '../_lib/who.js';
import { audit } from '../_lib/audit.js';

const KINDS = ['pano', 'captions', 'segments', 'survey'];
const MAX_RAW = 8 * 1024 * 1024;
const KEY = /^[a-z0-9][a-z0-9_./-]{0,200}$/;

function safeName(name) {
  return String(name || 'file').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'file';
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.MUSE_MEDIA) return json({ ok: false, configured: false, error: 'Media storage is not configured (MUSE_MEDIA binding).' }, 503);
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  const url = new URL(request.url);
  const bucket = env.MUSE_MEDIA;

  if (request.method === 'GET') {
    const key = url.searchParams.get('key') || '';
    const prefix = url.searchParams.get('prefix') || '';
    if (key) {
      if (!KEY.test(key)) return json({ ok: false, error: 'Invalid key' }, 400);
      const obj = await bucket.get(key);
      if (!obj) return json({ ok: false, error: 'Not found' }, 404);
      return new Response(obj.body, { headers: {
        'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600', 'X-Muse-Media-Key': key } });
    }
    if (prefix) {
      const listed = await bucket.list({ prefix, limit: Math.min(+url.searchParams.get('limit') || 100, 100) });
      return json({ ok: true, prefix, keys: (listed.objects || []).map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })) });
    }
    return json({ ok: false, error: 'Pass ?key= or ?prefix=' }, 400);
  }

  if (request.method === 'POST') {
    if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
    if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    let body = null;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Body must be JSON' }, 400); }
    const kind = body && body.kind, show = String((body && body.show) || '').slice(0, 64);
    if (KINDS.indexOf(kind) < 0) return json({ ok: false, error: 'Kind is ' + KINDS.join(' | ') + '.' }, 400);
    if (!/^[a-z0-9_-]{1,64}$/.test(show)) return json({ ok: false, error: 'Show key is [a-z0-9_-]{1,64}.' }, 400);
    const contentType = String((body && body.contentType) || 'application/octet-stream').slice(0, 120);
    let raw = null;
    try { raw = Uint8Array.from(atob(String(body.data || '')), (c) => c.charCodeAt(0)); }
    catch (e) { return json({ ok: false, error: 'data must be base64.' }, 400); }
    if (!raw.length) return json({ ok: false, error: 'Empty file.' }, 400);
    if (raw.length > MAX_RAW) return json({ ok: false, error: 'File exceeds 8 MB.' }, 413);
    const day = new Date().toISOString().slice(0, 10);
    const key = kind + '/' + show + '/' + day + '/' + Date.now().toString(36) + '-' + safeName(body.name);
    await bucket.put(key, raw, { httpMetadata: { contentType }, customMetadata: { show, kind, by: user.u } });
    await audit(env, { who: user.u, role: user.r, action: 'media.put', key, detail: kind + ' ' + raw.length + ' bytes' });
    return json({ ok: true, key, url: '/api/media?key=' + encodeURIComponent(key), size: raw.length });
  }

  if (request.method === 'DELETE') {
    if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
    if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    const key = url.searchParams.get('key') || '';
    if (!KEY.test(key)) return json({ ok: false, error: 'Invalid key' }, 400);
    await bucket.delete(key);
    await audit(env, { who: user.u, role: user.r, action: 'media.delete', key });
    return json({ ok: true, key });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
