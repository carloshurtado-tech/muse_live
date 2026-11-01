// @ts-check
// Product health + usage telemetry (first-party, no third-party SDK).
//   POST /api/observe {events:[...]}  (writers; viewer events are dropped — see below)
//   GET  /api/observe?date=YYYY-MM-DD → the day's aggregate (admins only)
// Daily aggregate in KV `obs:<date>`: errors grouped by signature, views, Muse question count
// (never the question text), feature usage, perf samples (n/sum/max per key), sessions.
import { json, sameOrigin } from '../_lib/session.js';
import { who, isAdmin } from '../_lib/who.js';

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const MAX_GROUPS = 300;

function bump(obj, k, n = 1) {
  if (!(k in obj) && Object.keys(obj).length >= MAX_GROUPS) k = '(other)';
  obj[k] = (obj[k] || 0) + n;
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (!env.MUSE_KV) return json({ ok: false, configured: false }, 503);
  const day = new Date().toISOString().slice(0, 10);
  if (request.method === 'GET') {
    if (!isAdmin(user)) return json({ ok: false, error: 'Admins only' }, 403);
    const date = new URL(request.url).searchParams.get('date') || day;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'Bad date' }, 400);
    return json({ ok: true, date, data: (await env.MUSE_KV.get('obs:' + date, { type: 'json' })) || null });
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  // Read-only (viewer/guest) events are accepted and dropped: anyone can open
  // a guest session, so honouring them would let guests forge /ops/health groups.
  if (user.r === 'viewer') return json({ ok: true });
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const text = await request.text();
  if (text.length > 64 * 1024) return json({ ok: false, error: 'Too large' }, 413);
  let events;
  try { events = JSON.parse(text).events; } catch (e) { return json({ ok: false, error: 'Bad body' }, 400); }
  if (!Array.isArray(events)) return json({ ok: false, error: 'Bad body' }, 400);
  const key = 'obs:' + day;
  const agg = (await env.MUSE_KV.get(key, { type: 'json' })) || { errors: {}, views: {}, features: {}, muse: { asked: 0, answered: 0, failed: 0 }, perf: {}, sessions: 0, users: {}, updated: '' };
  for (const e of events.slice(0, 200)) {
    if (!e || typeof e !== 'object') continue;
    if (e.t === 'error') {
      const sig = clip(e.msg, 160) + ' @ ' + clip(e.src, 120);
      const g = agg.errors[sig] || (Object.keys(agg.errors).length < MAX_GROUPS ? (agg.errors[sig] = { msg: clip(e.msg, 300), src: clip(e.src, 200), count: 0, first: e.at || '', last: '' }) : null);
      if (g) { g.count++; g.last = clip(e.at, 30); if (!g.stack && e.stack) g.stack = clip(e.stack, 1200); }
    } else if (e.t === 'view') bump(agg.views, clip(e.v, 40));
    else if (e.t === 'feature') bump(agg.features, clip(e.f, 60));
    else if (e.t === 'muse') { const k = ['asked', 'answered', 'failed'].includes(e.k) ? e.k : 'asked'; agg.muse[k] = (agg.muse[k] || 0) + 1; }
    else if (e.t === 'perf') {
      const k = clip(e.k, 40) || '(unknown)';
      agg.perf = agg.perf || {};
      const g = agg.perf[k] || (Object.keys(agg.perf).length < MAX_GROUPS ? (agg.perf[k] = { n: 0, sum: 0, max: 0 }) : null);
      if (g) { const v = Math.max(0, Math.min(60000, Math.round(Number(e.v) || 0))); g.n++; g.sum += v; if (v > g.max) g.max = v; }
    }
    else if (e.t === 'session') { agg.sessions++; bump(agg.users, user.u); }
  }
  agg.updated = new Date().toISOString();
  await env.MUSE_KV.put(key, JSON.stringify(agg), { expirationTtl: 60 * 60 * 24 * 120 });
  return json({ ok: true });
}
