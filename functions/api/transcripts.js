// @ts-check
// D1-backed transcripts for Muse Live (D1 binding MUSE_D1).
//   GET  /api/transcripts?q=words&show=&limit=  → keyword search (FTS5, ranked, with snippet).
//        Without q: most recently updated transcripts (optional show filter).
//   PUT  /api/transcripts {show, title, body, id?} → insert, or update when id names a row.
//   DELETE /api/transcripts?id=123 → delete (admins only).
// Bodies ≤ 256 KB, same as the KV sync path. Reads need sign-in; writes need a
// writer role. Unlike the KV mirror this is truly queryable: no list-then-get.
import { json, sameOrigin } from '../_lib/session.js';
import { who, isAdmin, canWrite } from '../_lib/who.js';
import { d1, ftsPhrase, nowIso } from '../_lib/store.js';
import { audit } from '../_lib/audit.js';

const MAX_BODY = 256 * 1024;

function pub(r) {
  return r && { id: r.id, show: r.show, title: r.title, body: r.body, created: r.created, updated: r.updated };
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = d1(env);
  if (!db) return json({ ok: false, configured: false, error: 'Transcripts need the MUSE_D1 binding.' }, 503);
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    const show = (url.searchParams.get('show') || '').trim().slice(0, 64);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    if (q) {
      const cols = 't.id, t.show, t.title, t.created, t.updated';
      const snip = "snippet(transcripts_fts, 1, '<b>', '</b>', '…', 24) AS snip";
      const from = 'FROM transcripts_fts JOIN transcripts t ON t.id = transcripts_fts.rowid WHERE transcripts_fts MATCH ?';
      const args = show ? [ftsPhrase(q), show, limit] : [ftsPhrase(q), limit];
      const r = await db.prepare(
        `SELECT ${cols}, ${snip} ${from}${show ? ' AND t.show = ?' : ''} ORDER BY rank LIMIT ?`).bind(...args).all();
      return json({ ok: true, q, results: r.results || [] });
    }
    const r = await db.prepare(
      `SELECT id, show, title, body, created, updated FROM transcripts${show ? ' WHERE show = ?' : ''} ORDER BY updated DESC LIMIT ?`
    ).bind(...(show ? [show, limit] : [limit])).all();
    return json({ ok: true, results: (r.results || []).map(pub) });
  }

  if (request.method === 'PUT') {
    if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
    let b = {};
    try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Body must be JSON' }, 400); }
    const show = String(b.show || '').trim().slice(0, 64);
    const title = String(b.title || '').trim().slice(0, 200);
    const body = typeof b.body === 'string' ? b.body : '';
    if (!show) return json({ ok: false, error: 'show is required.' }, 400);
    if (!title) return json({ ok: false, error: 'title is required.' }, 400);
    if (new TextEncoder().encode(body).length > MAX_BODY) return json({ ok: false, error: 'Transcript exceeds 256 KB' }, 413);
    const now = nowIso();
    if (b.id !== undefined && b.id !== null && b.id !== '') {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Bad id.' }, 400);
      const r = await db.prepare('UPDATE transcripts SET show = ?, title = ?, body = ?, updated = ? WHERE id = ?')
        .bind(show, title, body, now, id).run();
      if (!r.meta.changes) return json({ ok: false, error: 'No such transcript.' }, 404);
      await audit(env, { who: user.u, role: user.r, action: 'transcript.update', key: String(id), detail: show + ' / ' + title });
      const row = await db.prepare('SELECT id, show, title, body, created, updated FROM transcripts WHERE id = ?').bind(id).first();
      return json({ ok: true, transcript: pub(row) });
    }
    const r = await db.prepare('INSERT INTO transcripts (show, title, body, created, updated) VALUES (?, ?, ?, ?, ?)')
      .bind(show, title, body, now, now).run();
    const id = Number(r.meta.last_row_id);
    await audit(env, { who: user.u, role: user.r, action: 'transcript.create', key: String(id), detail: show + ' / ' + title });
    return json({ ok: true, transcript: { id, show, title, body, created: now, updated: now } }, 201);
  }

  if (request.method === 'DELETE') {
    if (!isAdmin(user)) return json({ ok: false, error: 'Admins only' }, 403);
    if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Bad id.' }, 400);
    const r = await db.prepare('DELETE FROM transcripts WHERE id = ?').bind(id).run();
    if (!r.meta.changes) return json({ ok: false, error: 'No such transcript.' }, 404);
    await audit(env, { who: user.u, role: user.r, action: 'transcript.delete', key: String(id) });
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
