// Muse Schedule calendar feeds (iCalendar, RFC 5545).
//
//   GET  /api/calendar?prod=<key>|res=<id or name>|crew=<name>&token=<exp>.<sig>   (alias: /api/calendar.ics)
//        Public subscription feed for Google / Apple / Outlook calendars. The token is
//        "<expiry>.<HMAC-SHA256(secret, "<scope>:<value>:<expiry>")>", base64url, so a link
//        only ever opens the calendar it was made for, and only until it expires.
//        Calendar apps fetch it without the Muse Live session.
//   GET  /api/calendar?sign=1&prod=…  (writers only) → { url, webcal, google, outlook, label }
//   POST /api/calendar                 (signed-in only) the browser mirrors its Muse Schedule
//        snapshot here; feeds are rendered from the latest snapshot.
//
// Storage: env.MUSE_KV (Cloudflare KV) key "calendar:schedule"; also reads the MuseSync record
// "schedule" if present. Without KV (local dev) the snapshot is kept in memory.
//
// Secrets / vars: MUSE_FEED_SECRET (recommended); falls back to MUSE_PASSWORD_HASH, then the
// middleware's default hash. The login middleware must let /api/calendar* through: this
// function checks the session itself for sign and POST, and the token for feeds.

import { DEFAULT_PW_HASH, sameOrigin } from '../_lib/session.js';
import { canWrite } from '../_lib/who.js';
const KV_KEY = 'calendar:schedule';
const MAX_SNAPSHOT = 2_000_000;
const FEED_TTL_S = 30 * 24 * 3600;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  let s = ''; for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function secretOf(env) { return (env && (env.MUSE_FEED_SECRET || env.MUSE_PASSWORD_HASH)) || DEFAULT_PW_HASH; }
async function mintToken(secret, scopeKey) {
  const exp = Math.floor(Date.now() / 1000) + FEED_TTL_S;
  return exp + '.' + await hmac(secret, scopeKey + ':' + exp);
}
async function tokenValid(secret, scopeKey, given) {
  const dot = String(given || '').indexOf('.');
  if (dot < 1) return false;
  const exp = Number(String(given).slice(0, dot));
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(String(given).slice(dot + 1), await hmac(secret, scopeKey + ':' + exp));
}
// Signed in? Middleware runs for every request (even public paths) and sets context.data.user.
function signedIn(_request, _env, data) { return !!(data && (data.user || data.authed === true)); }
function scopeOf(url) {
  for (const k of ['prod', 'res', 'crew']) { const v = url.searchParams.get(k); if (v) return { kind: k, value: v.slice(0, 120), key: k + ':' + v.slice(0, 120) }; }
  return { kind: 'all', value: '', key: 'all' };
}

async function loadSnapshot(env) {
  const kv = env && env.MUSE_KV;
  if (kv) {
    for (const k of [KV_KEY, 'schedule', 'sync:schedule', 'record:schedule']) {
      try {
        let v = await kv.get(k, 'json');
        if (v && v.value && !v.bookings) v = v.value;
        if (v && v.data && !v.bookings) v = v.data;
        if (v && Array.isArray(v.bookings)) return v;
      } catch (e) { /* try the next key */ }
    }
  }
  return globalThis.__museCalendarSnapshot || null;
}
async function saveSnapshot(env, snap) {
  const kv = env && env.MUSE_KV;
  if (kv) await kv.put(KV_KEY, JSON.stringify(snap));
  globalThis.__museCalendarSnapshot = snap;
}

/* ---------------- iCalendar ---------------- */
function icsDate(x) { return new Date(x).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsText(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
// Fold at 75 octets (UTF-8), never splitting a character; continuation lines begin with a space.
function fold(line) {
  const enc = new TextEncoder(), out = [];
  let cur = '', n = 0;
  for (const ch of line) {
    const bytes = enc.encode(ch).length;
    if (n + bytes > 75) { out.push(cur); cur = ' '; n = 1; }
    cur += ch; n += bytes;
  }
  out.push(cur);
  return out.join('\r\n');
}
function buildICS(snap, scope, origin) {
  const res = {}; (snap.resources || []).forEach((r) => { res[r.id] = r; });
  const prods = snap.prods || {}, venues = snap.venues || {};
  const byName = (name) => (snap.resources || []).find((r) => r.id === name || (r.name || '').toLowerCase() === String(name).toLowerCase());
  let label = 'Muse Schedule', match = () => true;
  if (scope.kind === 'prod') { label = 'Muse Schedule · ' + (prods[scope.value] || scope.value); match = (b) => b.prod === scope.value; }
  else if (scope.kind === 'res') { const r = byName(scope.value); label = 'Muse Schedule · ' + (r ? r.name : scope.value); match = (b) => r && b.res === r.id; }
  else if (scope.kind === 'crew') { const r = byName(scope.value) || byName('crew-' + String(scope.value).toLowerCase().replace(/[^a-z0-9]+/g, '-')); label = 'Muse Schedule · ' + (r ? r.name : scope.value); match = (b) => r && b.res === r.id; }
  const stamp = icsDate(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meta//Muse Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText(label), 'X-WR-CALDESC:' + icsText('Bookings from Muse Live · ' + origin),
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  (snap.bookings || []).filter((b) => b && b.start && b.end && match(b)).forEach((b) => {
    const r = res[b.res], un = b.status === 'Unavailable', show = b.prod ? (prods[b.prod] || b.prod) : '';
    const where = [r ? r.name : '', b.prod && venues[b.prod] ? venues[b.prod] : ''].filter(Boolean).join(' · ');
    lines.push('BEGIN:VEVENT', 'UID:' + icsText(b.id) + '@muse-schedule', 'DTSTAMP:' + stamp, 'DTSTART:' + icsDate(b.start), 'DTEND:' + icsDate(b.end),
      'SUMMARY:' + icsText(un ? 'Unavailable' + (r ? ' · ' + r.name : '') : (b.onAir ? '[ON AIR] ' : '') + b.title + (scope.kind === 'all' || scope.kind === 'prod' ? (r ? ' · ' + r.name : '') : '')),
      'LOCATION:' + icsText(where),
      'DESCRIPTION:' + icsText(un ? (b.notes || 'Marked unavailable') : [show, b.status, b.notes].filter(Boolean).join(' · ')),
      'STATUS:' + (b.status === 'Released' ? 'CANCELLED' : (b.status === 'Hold' || b.status === 'Tentative') ? 'TENTATIVE' : 'CONFIRMED'),
      'TRANSP:OPAQUE');
    if (show) lines.push('CATEGORIES:' + icsText(show));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return { label, body: lines.map(fold).join('\r\n') + '\r\n' };
}

export async function onRequest(context) {
  const { request, env, data } = context;
  const url = new URL(request.url);
  const scope = scopeOf(url);

  if (request.method === 'POST') {
    if (!signedIn(request, env, data)) return json({ ok: false, error: 'Sign in required' }, 401);
    if (!canWrite(data && data.user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
    const raw = await request.text();
    if (raw.length > MAX_SNAPSHOT) return json({ ok: false, error: 'Snapshot too large' }, 413);
    let snap; try { snap = JSON.parse(raw); } catch (e) { return json({ ok: false, error: 'Bad JSON' }, 400); }
    if (!snap || !Array.isArray(snap.bookings) || !Array.isArray(snap.resources)) return json({ ok: false, error: 'Not a Muse Schedule snapshot' }, 400);
    await saveSnapshot(env, { v: snap.v || 2, updated: snap.updated || new Date().toISOString(), resources: snap.resources, bookings: snap.bookings, prods: snap.prods || {}, venues: snap.venues || {} });
    return json({ ok: true, bookings: snap.bookings.length });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'Method not allowed' }, 405);

  const secret = secretOf(env);
  if (url.searchParams.get('sign')) {
    if (!signedIn(request, env, data)) return json({ ok: false, error: 'Sign in required' }, 401);
    // Minting a bearer feed link is a writer action: a guest link would outlive the guest session.
    if (!canWrite(data && data.user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
    const token = await mintToken(secret, scope.key);
    const qs = scope.kind === 'all' ? '' : scope.kind + '=' + encodeURIComponent(scope.value) + '&';
    const feed = url.origin + '/api/calendar?' + qs + 'token=' + token; // also served at /api/calendar.ics
    const webcal = feed.replace(/^https?:\/\//, 'webcal://');
    const snap = await loadSnapshot(env);
    const label = snap ? buildICS(snap, scope, url.origin).label : 'Muse Schedule';
    return json({ ok: true, url: feed, webcal, label,
      google: 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal),
      outlook: 'https://outlook.live.com/calendar/0/addcalendar?url=' + encodeURIComponent(feed) + '&name=' + encodeURIComponent(label) });
  }

  const given = url.searchParams.get('token') || '';
  if (!(await tokenValid(secret, scope.key, given))) return new Response('Invalid or expired calendar link.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const snap = await loadSnapshot(env);
  if (!snap) return new Response('Muse Schedule has not been published to the server yet. Open Muse Live once and try again.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '300' } });
  const { label, body } = buildICS(snap, scope, url.origin);
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="' + label.replace(/[^A-Za-z0-9 ._-]+/g, '').replace(/\s+/g, '-').toLowerCase() + '.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
