// Player QoE beacons from Muse Live's HLS monitors (real measurements, not simulated).
//
// POST /api/qoe  { show, stream, session, startup_ms, rebuffer_ms, play_ms, rebuffer_events, switches, errors, bitrate_kbps }
// GET  /api/qoe?show=<key>  → per-stream aggregates over the last 6 hours
//
// Storage: env.MUSE_KV (Cloudflare KV) when bound, otherwise isolate memory (fine for a demo,
// resets when the isolate recycles).

import { who, canWrite } from '../_lib/who.js';
import { sameOrigin } from '../_lib/session.js';

const TTL_MS = 6 * 3600 * 1000, MAX_SESSIONS = 300;
const mem = (globalThis.__museQoe = globalThis.__museQoe || new Map());

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function load(env, show) {
  if (env && env.MUSE_KV) { try { return (await env.MUSE_KV.get('qoe:' + show, 'json')) || {}; } catch (e) { return {}; } }
  return mem.get(show) || {};
}
async function store(env, show, data) {
  if (env && env.MUSE_KV) { await env.MUSE_KV.put('qoe:' + show, JSON.stringify(data), { expirationTtl: 6 * 3600 }); return; }
  mem.set(show, data);
}
const okKey = (s) => typeof s === 'string' && /^[a-z0-9_-]{1,64}$/i.test(s);
const num = (v, max) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.min(v, max) : 0);

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  // Read-only sessions (the public guest demo) can't write to the panel labelled "Real"; accepted and dropped.
  if (!canWrite(await who(context))) return json({ ok: true, stored: false });
  let b;
  try { b = JSON.parse(await request.text()); } catch (e) { return json({ ok: false, error: 'Bad beacon' }, 400); }
  if (!b || !okKey(b.show) || !okKey(b.stream) || !okKey(b.session)) return json({ ok: false, error: 'Bad beacon' }, 400);
  const data = await load(env, b.show), now = Date.now();
  data[b.stream + '|' + b.session] = {
    stream: b.stream, ts: now, startup_ms: b.startup_ms == null ? null : num(b.startup_ms, 120000),
    rebuffer_ms: num(b.rebuffer_ms, 864e5), play_ms: num(b.play_ms, 864e5), rebuffer_events: num(b.rebuffer_events, 1e5),
    switches: num(b.switches, 1e5), errors: num(b.errors, 1e5), bitrate_kbps: b.bitrate_kbps == null ? null : num(b.bitrate_kbps, 1e6),
  };
  const fresh = Object.entries(data).filter(([, v]) => now - v.ts < TTL_MS).sort((a, c) => c[1].ts - a[1].ts).slice(0, MAX_SESSIONS);
  await store(env, b.show, Object.fromEntries(fresh));
  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  const show = new URL(request.url).searchParams.get('show');
  if (!okKey(show)) return json({ ok: false, error: 'Give a show key' }, 400);
  const data = await load(env, show), now = Date.now(), by = {};
  Object.values(data).forEach((v) => { if (now - v.ts < TTL_MS) (by[v.stream] = by[v.stream] || []).push(v); });
  const streams = Object.keys(by).map((stream) => {
    const ss = by[stream], st = ss.filter((x) => x.startup_ms != null), br = ss.filter((x) => x.bitrate_kbps);
    const play = ss.reduce((a, x) => a + x.play_ms, 0), reb = ss.reduce((a, x) => a + x.rebuffer_ms, 0);
    return {
      stream, sessions: ss.length, active: ss.filter((x) => now - x.ts < 60000).length,
      avg_startup_ms: st.length ? Math.round(st.reduce((a, x) => a + x.startup_ms, 0) / st.length) : null,
      rebuffer_pct: play + reb > 0 ? Math.round(10000 * reb / (play + reb)) / 100 : null,
      rebuffer_events: ss.reduce((a, x) => a + x.rebuffer_events, 0), switches: ss.reduce((a, x) => a + x.switches, 0),
      errors: ss.reduce((a, x) => a + x.errors, 0), error_sessions: ss.filter((x) => x.errors > 0).length,
      avg_bitrate_kbps: br.length ? Math.round(br.reduce((a, x) => a + x.bitrate_kbps, 0) / br.length) : null,
    };
  });
  return json({ ok: true, show, window_hours: 6, storage: env && env.MUSE_KV ? 'kv' : 'memory', streams });
}
