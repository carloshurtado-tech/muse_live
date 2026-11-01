// @ts-check
// GET /api/auth/oidc/start → redirect to the IdP (state + PKCE kept in a short-lived signed cookie).
import { json, signSession, safeNextPath, OIDC_TX_TYP } from '../../../_lib/session.js';
import { oidcConfigured, discovery, randomString, challenge, redirectUri } from '../../../_lib/oidc.js';

export async function onRequestGet({ request, env }) {
  if (!oidcConfigured(env)) return json({ ok: false, error: 'SSO is not configured.' }, 404);
  const url = new URL(request.url);
  let meta;
  try { meta = await discovery(env); } catch (e) { return json({ ok: false, error: String(e.message || e) }, 502); }
  const state = randomString(16), verifier = randomString(48);
  // Same-origin target only, control characters stripped: a TAB-prefixed
  // "//evil" would otherwise survive a naive leading-slash check in browsers.
  const next = safeNextPath(url.searchParams.get('next') || '/');
  // Transient cookie signed like a session but typed apart (u = state,
  // n = verifier|next): the typ claim keeps it from ever authenticating.
  const tx = await signSession(env, { u: state, n: verifier + '|' + next, r: 'viewer' }, 600, OIDC_TX_TYP);
  const auth = new URL(meta.authorization_endpoint);
  auth.search = new URLSearchParams({
    response_type: 'code', client_id: env.OIDC_CLIENT_ID, redirect_uri: redirectUri(url),
    scope: env.OIDC_SCOPES || 'openid email profile', state,
    code_challenge: await challenge(verifier), code_challenge_method: 'S256',
  }).toString();
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return new Response(null, { status: 302, headers: { Location: auth.toString(), 'Cache-Control': 'no-store',
    'Set-Cookie': `muse_oidc=${tx}; Path=/api/auth/oidc; Max-Age=600; HttpOnly; SameSite=Lax${secure}` } });
}
