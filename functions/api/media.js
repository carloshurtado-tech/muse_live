// @ts-check
// R2-backed media for Muse Live (R2 binding MUSE_MEDIA, registry in D1 MUSE_D1).
// Pano photos, caption files and recorded segments are blobs: KV is the wrong
// tool for them, so they live in R2 with one D1 row each for listing.
//   PUT /api/media?show=&kind=&name=   raw body (Content-Type preserved), ≤ 25 MB
//   GET /api/media?id=123              the bytes, with the stored Content-Type
//   GET /api/media?show=&kind=         registry rows, newest first
// Reads need sign-in; uploads need a writer role. The request body streams
// straight into R2 (never buffered), with a Content-Length pre-check.
import { json, sameOrigin } from '../_lib/session.js';
import { who, canWrite } from '../_lib/who.js';
import { d1, mediaBucket, seg, nowIso } from '../_lib/store.js';
import { audit } from '../_lib/audit.js';

const MAX_BYTES = 25 * 1024 * 1024;

export async function onRequest(context) {
  const { request, env } = context;
  const db = d1(env);
  const bucket = mediaBucket(env);
  const missing = !db ? 'MUSE_D1' : (!bucket ? 'MUSE_MEDIA' : '');
  if (missing) return json({ ok: false, configured: false, error: 'Media needs the ' + missing + ' binding.' }, 503);
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const id = Number(url.searchParams.get('id'));
    if (url.searchParams.has('id')) {
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Bad id.' }, 400);
      const row = await db.prepare('SELECT r2_key, content_type, name FROM media WHERE id = ?').bind(id).first();
      if (!row) return json({ ok: false, error: 'No such media.' }, 404);
      const obj = await bucket.get(row.r2_key);
      if (!obj) return json({ ok: false, error: 'Blob missing from storage.' }, 404);
      return new Response(obj.body, {
        headers: {
          'Content-Type': row.content_type || 'application/octet-stream',
          'Content-Length': String(obj.size),
          'Cache-Control': 'private, max-age=60',
          'Content-Disposition': 'inline; filename="' + String(row.name || 'file').replace(/["\r\n]/g, '') + '"',
        },
      });
    }
    const show = (url.searchParams.get('show') || '').trim().slice(0, 64);
    const kind = (url.searchParams.get('kind') || '').trim().slice(0, 32);
    const clauses = [], args = [];
    if (show) { clauses.push('show = ?'); args.push(show); }
    if (kind) { clauses.push('kind = ?'); args.push(kind); }
    args.push(100);
    const r = await db.prepare(
      `SELECT id, show, kind, name, size, content_type, by, created FROM media${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`
    ).bind(...args).all();
    return json({ ok: true, results: r.results || [] });
  }

  if (request.method === 'PUT') {
    if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
    const len = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(len) && len > MAX_BYTES) return json({ ok: false, error: 'File exceeds 25 MB' }, 413);
    const show = seg(url.searchParams.get('show'), 'general');
    const kind = seg(url.searchParams.get('kind'), 'file');
    const rawName = String(url.searchParams.get('name') || 'upload').slice(0, 120);
    const name = rawName.replace(/[^\w.\-() ]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'upload';
    if (!request.body) return json({ ok: false, error: 'Empty upload.' }, 400);
    const key = show + '/' + kind + '/' + Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8) + '-' + name;
    const contentType = (request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().slice(0, 120);
    let obj;
    try {
      obj = await bucket.put(key, request.body, { httpMetadata: { contentType } });
    } catch (e) { return json({ ok: false, error: 'Storage write failed.' }, 502); }
    if (obj.size > MAX_BYTES) {
      await bucket.delete(key).catch(() => {});
      return json({ ok: false, error: 'File exceeds 25 MB' }, 413);
    }
    const now = nowIso();
    const r = await db.prepare(
      'INSERT INTO media (show, kind, name, r2_key, size, content_type, by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(show, kind, name, key, obj.size, contentType, user.u, now).run();
    const id = Number(r.meta.last_row_id);
    await audit(env, { who: user.u, role: user.r, action: 'media.upload', key: String(id), detail: show + '/' + kind + '/' + name + ' (' + obj.size + ' bytes)' });
    return json({ ok: true, media: { id, show, kind, name, size: obj.size, content_type: contentType, by: user.u, created: now } }, 201);
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
