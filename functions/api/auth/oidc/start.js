// @ts-check
// GET /api/auth/oidc/start → redirect to the IdP (state + PKCE kept in a short-lived signed cookie).
import { json, signSession } from '../../../_lib/session.js';
import { oidcConfigured, discovery, randomString, challenge, redirectUri } from '../../../_lib/oidc.js';

export async function onRequestGet({ request, env }) {
  if (!oidcConfigured(env)) return json({ ok: false, error: 'SSO is not configured.' }, 404);
  const url = new URL(request.url);
  let meta;
  try { meta = await discovery(env); } catch (e) { return json({ ok: false, error: String(e.message || e) }, 502); }
  const state = randomString(16), verifier = randomString(48);
  const next = url.searchParams.get('next') || '/';
  // Reuse the session signer for the transient cookie: u = state, n = verifier|next.
  const tx = await signSession(env, { u: state, n: verifier + '|' + (next.startsWith('/') && !next.startsWith('//') ? next : '/'), r: 'viewer' }, 600);
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
