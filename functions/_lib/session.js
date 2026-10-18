// @ts-check
// Signed session tokens shared by the middleware and the auth endpoints.
// Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payload)).
// The secret is SESSION_SECRET when set, otherwise derived from the access-password hash,
// so rotating the shared password also invalidates every session.

export const SESSION = 'muse_session';
export const HINT = 'muse_authed';
export const MAX_AGE = 60 * 60 * 24 * 7;
export const ROLES = ['admin', 'producer', 'engineer', 'viewer'];
// sha256('muse-live:' + password). Local dev only; production MUST set MUSE_PASSWORD_HASH.
export const DEFAULT_PW_HASH = 'b774222f71346737d53bc90fd0572e8b2f86d34b02b16b1c9704cc18a3f85db0';

const enc = new TextEncoder();

/** @param {any} env */
export function pwHash(env) { return (env && env.MUSE_PASSWORD_HASH) || DEFAULT_PW_HASH; }
/** True when no deployment-specific signing material was configured. */
export function usingDefaultSecrets(env) {
  return !(env && (env.SESSION_SECRET || env.MUSE_PASSWORD_HASH));
}

/** @param {string} text */
export async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** @param {Uint8Array} bytes */
export function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** @param {string} str */
export function fromB64u(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** @param {any} env */
async function hmacKey(env) {
  const secret = (env && env.SESSION_SECRET) || (await sha256hex('muse-session-secret:' + pwHash(env)));
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * @param {any} env
 * @param {{u:string,n?:string,r:string}} who
 * @param {number} [maxAge]
 */
export async function signSession(env, who, maxAge = MAX_AGE) {
  const payload = b64u(enc.encode(JSON.stringify({ v: 1, u: who.u, n: who.n || who.u, r: who.r, exp: Math.floor(Date.now() / 1000) + maxAge })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload)));
  return payload + '.' + b64u(sig);
}

/** @param {Request} request @param {string} name */
export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * Verify a token string. Returns the session or null.
 * @param {any} env @param {string|null} token
 * @returns {Promise<{u:string,n:string,r:string,exp:number,legacy?:boolean}|null>}
 */
export async function verifyToken(env, token) {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64u(token.slice(dot + 1)), enc.encode(payload));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    if (!s || s.v !== 1 || typeof s.u !== 'string' || !ROLES.includes(s.r)) return null;
    if (s.exp && s.exp < Math.floor(Date.now() / 1000)) return null;
    return s;
  } catch (e) { return null; }
}

/** @param {Request} request @param {any} env */
export async function readSession(request, env) { return verifyToken(env, readCookie(request, SESSION)); }

/** @param {string} token @param {boolean} secure @param {number} [maxAge] */
export function sessionCookies(token, secure, maxAge = MAX_AGE) {
  const s = secure ? '; Secure' : '';
  return [
    `${SESSION}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${s}`,
    `${HINT}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${s}`,
  ];
}
/** @param {boolean} secure */
export function clearCookies(secure) {
  const s = secure ? '; Secure' : '';
  return [`${SESSION}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${s}`, `${HINT}=; Path=/; Max-Age=0; SameSite=Lax${s}`];
}

/** @param {any} body @param {number} [status] @param {Array<[string,string]>} [extra] */
export function json(body, status = 200, extra) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (extra) for (const [k, v] of extra) headers.append(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Same-origin check for state-changing requests (CSRF defence in depth on top of SameSite=Lax). @param {Request} request */
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
