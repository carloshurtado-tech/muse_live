// @ts-check
// R2-backed media for Muse Live (R2 binding MUSE_MEDIA, registry in D1 MUSE_D1).
// Pano photos, caption files, recorded segments and clips are blobs: KV is the
// wrong tool for them, so they live in R2 with one D1 row each for listing.
//   PUT /api/media?show=&kind=&name=   raw body stream (Content-Type preserved), ≤ 25 MB
//   POST /api/media  {kind, show, name, contentType, data}  small JSON uploads (base64, ≤ 8 MB raw)
//   GET /api/media?id=123 | ?key=… | ?prefix=…&limit= | ?show=&kind=
//   DELETE /api/media?key=… → remove object + registry row (writers only)
// Reads need sign-in; writes need a writer role. Raw PUT bodies stream straight
// into R2 (never buffered), with a Content-Length pre-check.
// User-facing strings come from _lib/strings.js (en/es/pt via Accept-Language).
import { json, sameOrigin } from '../_lib/session.js';
import { who, canWrite } from '../_lib/who.js';
import { d1, mediaBucket, nowIso } from '../_lib/store.js';
import { resolveLang, t } from '../_lib/strings.js';
import { audit } from '../_lib/audit.js';

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_RAW = 8 * 1024 * 1024;
const KEY = /^[a-z0-9][a-z0-9_./-]{0,200}$/;
// Closed kind list: the bucket is show evidence, not a file dump. 'clip' is in
// because the clip maker exports captioned clips here via PUT.
const KINDS = ['pano', 'captions', 'segments', 'survey', 'clip'];
const SHOW = /^[a-z0-9_-]{1,64}$/;

function safeName(name) {
  return String(name || 'file').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'file';
}

/** @param {any} db @param {string} show @param {string} kind @param {string} name @param {string} key @param {number} size @param {string} contentType @param {string} by @param {string} now */
async function register(db, show, kind, name, key, size, contentType, by, now) {
  const r = await db.prepare(
    'INSERT INTO media (show, kind, name, r2_key, size, content_type, by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(show, kind, name, key, size, contentType, by, now).run();
  return Number(r.meta.last_row_id);
}

export async function onRequest(context) {
  const { request, env } = context;
  const lang = resolveLang(request);
  const db = d1(env);
  const bucket = mediaBucket(env);
  if (!db) return json({ ok: false, configured: false, error: t(lang, 'needD1Media') }, 503);
  if (!bucket) return json({ ok: false, configured: false, error: t(lang, 'needR2Media') }, 503);
  const user = await who(context);
  if (!user) return json({ ok: false, error: t(lang, 'signIn') }, 401);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    if (url.searchParams.has('id')) {
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: t(lang, 'badId') }, 400);
      const row = await db.prepare('SELECT r2_key, content_type, name FROM media WHERE id = ?').bind(id).first();
      if (!row) return json({ ok: false, error: t(lang, 'noSuchMedia') }, 404);
      const obj = await bucket.get(row.r2_key);
      if (!obj) return json({ ok: false, error: t(lang, 'blobMissing') }, 404);
      return new Response(obj.body, {
        headers: {
          'Content-Type': row.content_type || 'application/octet-stream',
          'Content-Length': String(obj.size),
          'Cache-Control': 'private, max-age=60',
          // Uploads are evidence, never executable pages: force a download in
          // a sandboxed, sniff-proof context whatever type was claimed.
          'Content-Disposition': 'attachment; filename="' + String(row.name || 'file').replace(/["\r\n]/g, '') + '"',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': 'sandbox',
        },
      });
    }
    if (url.searchParams.has('key')) {
      const key = url.searchParams.get('key') || '';
      if (!KEY.test(key)) return json({ ok: false, error: t(lang, 'invalidKey') }, 400);
      const obj = await bucket.get(key);
      if (!obj) return json({ ok: false, error: t(lang, 'noSuchMedia') }, 404);
      return new Response(obj.body, { headers: {
        'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600', 'X-Muse-Media-Key': key,
        'Content-Disposition': 'attachment; filename="' + key.split('/').pop().replace(/["\r\n]/g, '') + '"',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox' } });
    }
    if (url.searchParams.has('prefix')) {
      const prefix = url.searchParams.get('prefix') || '';
      const listed = await bucket.list({ prefix, limit: Math.min(Number(url.searchParams.get('limit')) || 100, 100) });
      return json({ ok: true, prefix, keys: (listed.objects || []).map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })) });
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
    if (!canWrite(user)) return json({ ok: false, error: t(lang, 'readOnly') }, 403);
    if (!sameOrigin(request)) return json({ ok: false, error: t(lang, 'forbiddenOrigin') }, 403);
    const len = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(len) && len > MAX_BYTES) return json({ ok: false, error: t(lang, 'fileTooBig') }, 413);
    const show = String(url.searchParams.get('show') || '');
    const kind = String(url.searchParams.get('kind') || '');
    if (KINDS.indexOf(kind) < 0) return json({ ok: false, error: t(lang, 'badKind') }, 400);
    if (!SHOW.test(show)) return json({ ok: false, error: t(lang, 'badShowKey') }, 400);
    const rawName = String(url.searchParams.get('name') || 'upload').slice(0, 120);
    const name = rawName.replace(/[^\w.\-() ]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'upload';
    if (!request.body) return json({ ok: false, error: t(lang, 'emptyUpload') }, 400);
    const key = show + '/' + kind + '/' + Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8) + '-' + name;
    const contentType = (request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().slice(0, 120);
    let obj;
    try {
      obj = await bucket.put(key, request.body, { httpMetadata: { contentType } });
    } catch (e) { return json({ ok: false, error: t(lang, 'storageWriteFailed') }, 502); }
    if (obj.size > MAX_BYTES) {
      await bucket.delete(key).catch(() => {});
      return json({ ok: false, error: t(lang, 'fileTooBig') }, 413);
    }
    const now = nowIso();
    const id = await register(db, show, kind, name, key, obj.size, contentType, user.u, now);
    await audit(env, { who: user.u, role: user.r, action: 'media.upload', key: String(id), detail: show + '/' + kind + '/' + name + ' (' + obj.size + ' bytes)' });
    return json({ ok: true, media: { id, show, kind, name, size: obj.size, content_type: contentType, by: user.u, created: now } }, 201);
  }

  if (request.method === 'POST') {
    if (!sameOrigin(request)) return json({ ok: false, error: t(lang, 'forbiddenOrigin') }, 403);
    if (!canWrite(user)) return json({ ok: false, error: t(lang, 'readOnly') }, 403);
    let body = null;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: t(lang, 'badBody') }, 400); }
    const show = String((body && body.show) || '');
    const kind = String((body && body.kind) || '');
    if (KINDS.indexOf(kind) < 0) return json({ ok: false, error: t(lang, 'badKind') }, 400);
    if (!SHOW.test(show)) return json({ ok: false, error: t(lang, 'badShowKey') }, 400);
    const contentType = String((body && body.contentType) || 'application/octet-stream').slice(0, 120);
    let raw = null;
    try { raw = Uint8Array.from(atob(String((body && body.data) || '')), (c) => c.charCodeAt(0)); }
    catch (e) { return json({ ok: false, error: t(lang, 'notBase64') }, 400); }
    if (!raw.length) return json({ ok: false, error: t(lang, 'emptyUpload') }, 400);
    if (raw.length > MAX_RAW) return json({ ok: false, error: t(lang, 'fileExceeds8') }, 413);
    const day = nowIso().slice(0, 10);
    const name = safeName(body && body.name);
    const key = kind + '/' + show + '/' + day + '/' + Date.now().toString(36) + '-' + name;
    await bucket.put(key, raw, { httpMetadata: { contentType }, customMetadata: { show, kind, by: user.u } });
    const now = nowIso();
    const id = await register(db, show, kind, name, key, raw.length, contentType, user.u, now);
    await audit(env, { who: user.u, role: user.r, action: 'media.put', key, detail: kind + ' ' + raw.length + ' bytes' });
    return json({ ok: true, id, key, url: '/api/media?key=' + encodeURIComponent(key), size: raw.length }, 200);
  }

  if (request.method === 'DELETE') {
    if (!sameOrigin(request)) return json({ ok: false, error: t(lang, 'forbiddenOrigin') }, 403);
    if (!canWrite(user)) return json({ ok: false, error: t(lang, 'readOnly') }, 403);
    const key = url.searchParams.get('key') || '';
    if (!KEY.test(key)) return json({ ok: false, error: t(lang, 'invalidKey') }, 400);
    await bucket.delete(key);
    await db.prepare('DELETE FROM media WHERE r2_key = ?').bind(key).run().catch(() => {});
    await audit(env, { who: user.u, role: user.r, action: 'media.delete', key });
    return json({ ok: true, key });
  }

  return json({ ok: false, error: t(lang, 'methodNotAllowed') }, 405);
}
