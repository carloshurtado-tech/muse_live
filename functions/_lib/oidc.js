// @ts-check
// OpenID Connect (authorization code + PKCE). Works with any standards-compliant IdP
// (Okta, Entra ID, Google Workspace, Meta's internal IdP if it exposes OIDC).
import { b64u } from './session.js';

/** @param {any} env */
export function oidcConfigured(env) { return !!(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET); }
/** @param {any} env */
export async function discovery(env) {
  const base = String(env.OIDC_ISSUER).replace(/\/+$/, '');
  const r = await fetch(base + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('OIDC discovery failed (' + r.status + ')');
  return r.json();
}
export function randomString(n = 32) { return b64u(crypto.getRandomValues(new Uint8Array(n))); }
/** @param {string} verifier */
export async function challenge(verifier) {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
/** @param {URL} url */
export function redirectUri(url) { return url.origin + '/api/auth/oidc/callback'; }
