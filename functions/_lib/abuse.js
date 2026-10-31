// @ts-check
// Uniform abuse guards for JSON write endpoints (POST/PUT).
//
// Every guard fails closed and returns a JSON error Response, or null when the
// request may proceed. Route handlers apply them in this order:
//   1. sameOrigin  — CSRF defence in depth on top of SameSite=Lax cookies
//   2. Content-Type — must be application/json (real clients always send it)
//   3. size cap    — Content-Length fast reject, then a byte cap on the body
//   4. rate check  — per-session token bucket (per-isolate memory, best-effort
//                    like the login throttle's fallback; it bounds scanners and
//                    tight loops, not distributed abuse)
//
// resolveModelBase() pins MUSE_API_BASE to https://api.meta.ai/v1 plus an
// optional env override list (MUSE_API_BASE_ALLOWLIST), failing closed. Plain
// http is accepted only for loopback hosts so the local dev server and the
// e2e mock (tests/fixtures/test.vars) keep working; anything else is refused
// without ever calling the upstream.
import { json, sameOrigin } from './session.js';

export const DEFAULT_MODEL_BASE = 'https://api.meta.ai/v1';

/** @param {Request} request */
export function checkOrigin(request) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  return null;
}

/** @param {Request} request */
export function checkContentType(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!/\bapplication\/json\b/i.test(ct)) return json({ ok: false, error: 'Content-Type must be application/json' }, 415);
  return null;
}

/** Fast reject on a lying-or-huge Content-Length before the body is read. @param {Request} request @param {number} maxBytes */
export function checkLength(request, maxBytes) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(len) && len > maxBytes) return json({ ok: false, error: 'Body too large' }, 413);
  return null;
}

// Per-isolate token buckets, keyed by route namespace + session/IP.
const buckets = globalThis.__museAbuseBuckets || (globalThis.__museAbuseBuckets = new Map());

/** @param {Request} request @param {string} ns */
export function abuseKey(request, ns) {
  const c = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)muse_session=([^;]+)/);
  const who = c ? 's:' + c[1].slice(-24) : 'ip:' + (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local');
  return 'abuse:' + ns + ':' + who;
}

/**
 * Take one token from a per-isolate bucket. Returns 0 when admitted, else a
 * Retry-After-style wait in seconds.
 * @param {string} key @param {{ perMin?: number, windowMs?: number }} [opts]
 */
export function abuseTake(key, opts = {}) {
  const perMin = Math.max(1, Number(opts.perMin) || 60);
  const windowMs = opts.windowMs || 60_000;
  const now = Date.now();
  let b = buckets.get(key) || { t: perMin, at: now };
  b.t = Math.min(perMin, b.t + (now - b.at) * (perMin / windowMs)); b.at = now;
  let retryS = 0;
  if (b.t < 1) retryS = Math.ceil((1 - b.t) * windowMs / perMin / 1000);
  else b.t -= 1;
  buckets.set(key, b);
  return retryS;
}

/**
 * Run the cheap pre-body guards for a JSON write: origin, Content-Type,
 * Content-Length and rate. Returns an error Response or null.
 * @param {Request} request @param {{ maxBytes: number, perMin?: number, ns: string }} opts
 */
export function guardJsonWrite(request, opts) {
  return checkOrigin(request) || checkContentType(request) || checkLength(request, opts.maxBytes)
    || (() => {
      const retryS = abuseTake(abuseKey(request, opts.ns), { perMin: opts.perMin });
      return retryS ? json({ ok: false, error: 'Too many requests. Try again in ' + retryS + ' s.' }, 429) : null;
    })();
}

/**
 * Read the request body with a byte cap (the Content-Length header can lie).
 * Returns the text, or an error Response to return directly.
 * @param {Request} request @param {number} maxBytes
 * @returns {Promise<string | Response>}
 */
export async function readCappedBody(request, maxBytes) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return json({ ok: false, error: 'Body too large' }, 413);
  return text;
}

/**
 * Pin the Meta Model API base URL. Returns { ok: true, base } or
 * { ok: false, error } (fail closed — the caller must not call upstream).
 * @param {any} env
 */
export function resolveModelBase(env) {
  const raw = (env && env.MUSE_API_BASE) || DEFAULT_MODEL_BASE;
  let u;
  try { u = new URL(String(raw)); } catch (e) { return { ok: false, error: 'The model API base URL is not configured correctly.' }; }
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'http:') {
    // Local dev / e2e mock only: never allow plain http beyond loopback.
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      return { ok: false, error: 'The model API base URL is not configured correctly.' };
    }
    return { ok: true, base: String(raw).replace(/\/+$/, '') };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'The model API base URL is not configured correctly.' };
  if (host === 'api.meta.ai') return { ok: true, base: String(raw).replace(/\/+$/, '') };
  // Optional override list: comma/space-separated hostnames or origins, each https.
  const list = String((env && env.MUSE_API_BASE_ALLOWLIST) || '').split(/[\s,]+/).filter(Boolean);
  for (const entry of list) {
    try {
      const a = new URL(entry.includes('://') ? entry : 'https://' + entry);
      if (a.protocol === 'https:' && a.hostname.toLowerCase() === host) {
        return { ok: true, base: String(raw).replace(/\/+$/, '') };
      }
    } catch (e) { /* ignore malformed allowlist entries */ }
  }
  return { ok: false, error: 'The model API base URL is not configured correctly.' };
}
