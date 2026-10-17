// @ts-check
// Per-user accounts in KV: key `users:<email>` → {email,name,role,salt,hash,iter,disabled,created,updated}.
// Passwords: PBKDF2-SHA256 via WebCrypto (100k iterations — the Workers maximum).
import { ROLES, b64u, fromB64u } from './session.js';

export const ITER = 100000;
const enc = new TextEncoder();

/** @param {string} email */
export function normEmail(email) { return String(email || '').trim().toLowerCase(); }
/** @param {string} email */
export function validEmail(email) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email); }

/** @param {string} password @param {Uint8Array} salt @param {number} iter */
export async function pbkdf2(password, salt, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return b64u(new Uint8Array(bits));
}
/** @param {string} password */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64u(salt), hash: await pbkdf2(password, salt, ITER), iter: ITER };
}
/** Constant-time compare. @param {string} a @param {string} b */
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/** @param {{salt:string,hash:string,iter?:number}} user @param {string} password */
export async function verifyPassword(user, password) {
  if (!user || !user.salt || !user.hash) return false;
  return safeEqual(await pbkdf2(password, fromB64u(user.salt), user.iter || ITER), user.hash);
}

/** @param {any} env @param {string} email */
export async function getUser(env, email) {
  if (!env || !env.MUSE_KV) return null;
  return env.MUSE_KV.get('users:' + normEmail(email), { type: 'json' });
}
/** @param {any} env @param {any} user */
export async function putUser(env, user) { await env.MUSE_KV.put('users:' + user.email, JSON.stringify(user)); }
/** @param {any} env */
export async function listUsers(env) {
  if (!env || !env.MUSE_KV) return [];
  const out = [];
  let cursor;
  do {
    const page = await env.MUSE_KV.list({ prefix: 'users:', cursor });
    for (const k of page.keys) { const u = await env.MUSE_KV.get(k.name, { type: 'json' }); if (u) out.push(u); }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
/** @param {any} env */
export async function hasUsers(env) {
  if (!env || !env.MUSE_KV) return false;
  const page = await env.MUSE_KV.list({ prefix: 'users:', limit: 1 });
  return page.keys.length > 0;
}
/** Public shape of a user (never the hash). @param {any} u */
export function publicUser(u) { return u && { email: u.email, name: u.name, role: u.role, disabled: !!u.disabled, created: u.created, updated: u.updated }; }
export { ROLES };
