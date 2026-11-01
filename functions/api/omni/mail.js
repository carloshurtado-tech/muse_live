// @ts-check
// POST /api/omni/mail — send a Show Caller notification via the Gmail API.
// Body: { to: [email], subject, body, show?, idempotencyKey?/approvalId? } → { ok, id, threadId }.
// Writers only. A repeated send with the same idempotency/approval id returns
// the first result instead of mailing again.
// Sends from the authorized account (see the OAuth setup); least-privilege send scope.
import { json, sameOrigin } from '../../_lib/session.js';
import { who, canWrite } from '../../_lib/who.js';
import { audit } from '../../_lib/audit.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,128}\.[^\s@]{1,32}$/;
function b64url(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Idempotency store: KV when bound, per-isolate memory otherwise.
const dedupeMem = globalThis.__museOmniMailDedupe || (globalThis.__museOmniMailDedupe = new Map());
async function dedupeGet(env, k) {
  if (env && env.MUSE_KV) { try { return await env.MUSE_KV.get(k, 'json'); } catch (e) { /* fall through */ } }
  return dedupeMem.get(k) || null;
}
async function dedupePut(env, k, v) {
  dedupeMem.set(k, v);
  if (env && env.MUSE_KV) { try { await env.MUSE_KV.put(k, JSON.stringify(v), { expirationTtl: 86400 }); } catch (e) { /* memory copy stands */ } }
}
// Headers must be ASCII: RFC 2047-encode anything beyond it (else "—" arrives as mojibake).
function encodeSubject(s) {
  const flat = String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
  if (/^[\x20-\x7e]*$/.test(flat)) return flat;
  return '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(flat))) + '?=';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const id = env && env.GMAIL_CLIENT_ID, secret = env && env.GMAIL_CLIENT_SECRET, refresh = env && env.GMAIL_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return json({ ok: false, configured: false, error: 'Gmail is not connected.' }, 503);
  if (+(request.headers.get('Content-Length') || 0) > 65536) return json({ ok: false, error: 'Body too large.' }, 413);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request.' }, 400); }
  const to = Array.isArray(body && body.to) ? body.to.map((x) => String(x).trim()).filter(Boolean).slice(0, 10) : [];
  const subject = String((body && body.subject) || '').slice(0, 200);
  const text = String((body && body.body) || '').slice(0, 20000);
  if (!to.length || !to.every((x) => EMAIL.test(x))) return json({ ok: false, error: 'A valid to list is required (max 10).' }, 400);
  if (!subject || !text) return json({ ok: false, error: 'subject and body are required.' }, 400);
  const idem = String((body && (body.idempotencyKey || body.approvalId || body.id)) || '').slice(0, 120);
  const dedupeKey = idem ? 'omni:mail:' + idem : null;
  if (dedupeKey) {
    const prior = await dedupeGet(env, dedupeKey);
    if (prior && prior.ok) return json(prior);
  }

  let access = '';
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    access = (j && j.access_token) || '';
  } catch (e) { access = ''; }
  if (!access) {
    await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify.failed', key: 'gmail', detail: 'token refresh failed' });
    return json({ ok: false, error: 'Gmail authorization lapsed. Reconnect it and retry.' }, 502);
  }
  const raw = 'To: ' + to.join(', ') + '\r\nSubject: ' + encodeSubject(subject) + '\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + text;
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
      body: JSON.stringify({ raw: b64url(raw) }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    if (j && j.id) {
      const out = { ok: true, id: String(j.id), threadId: String(j.threadId || '') };
      if (dedupeKey) await dedupePut(env, dedupeKey, out);
      await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify', key: 'gmail', detail: to.join(',') });
      return json(out);
    }
  } catch (e) { /* fall through */ }
  await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify.failed', key: 'gmail', detail: 'send failed' });
  return json({ ok: false, error: 'Gmail send failed.' }, 502);
}
