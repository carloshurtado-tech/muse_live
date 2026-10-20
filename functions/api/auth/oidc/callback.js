// @ts-check
// GET /api/auth/oidc/callback → exchange the code (with PKCE + client secret), read the user from
// the IdP's userinfo endpoint (fetched server-to-server over TLS with the fresh access token),
// map to a Muse Live account and role, and start a session.
import { json, readCookie, verifyToken, signSession, sessionCookies } from '../../../_lib/session.js';
import { oidcConfigured, discovery, redirectUri } from '../../../_lib/oidc.js';
import { getUser, normEmail } from '../../../_lib/users.js';
import { audit } from '../../../_lib/audit.js';

export async function onRequestGet({ request, env }) {
  if (!oidcConfigured(env)) return json({ ok: false, error: 'SSO is not configured.' }, 404);
  const url = new URL(request.url);
  const tx = await verifyToken(env, readCookie(request, 'muse_oidc'));
  if (!tx || tx.u !== url.searchParams.get('state')) return json({ ok: false, error: 'Sign-in expired. Try again.' }, 400);
  const [verifier, next] = String(tx.n).split('|');
  try {
    const meta = await discovery(env);
    const tok = await fetch(meta.token_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: redirectUri(url),
        client_id: env.OIDC_CLIENT_ID, client_secret: env.OIDC_CLIENT_SECRET, code_verifier: verifier }),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error(tok.error_description || tok.error || 'Token exchange failed');
    const info = await fetch(meta.userinfo_endpoint, { headers: { Authorization: 'Bearer ' + tok.access_token }, signal: AbortSignal.timeout(8000) }).then((r) => r.json());
    const email = normEmail(info.email);
    if (!email || info.email_verified !== true) throw new Error('The identity provider did not return a verified email.');
    const domains = String(env.OIDC_ALLOWED_DOMAINS || '').split(/[\s,]+/).filter(Boolean);
    if (domains.length && !domains.includes(email.split('@')[1])) throw new Error('This account’s domain is not allowed.');
    const account = await getUser(env, email);
    if (account && account.disabled) throw new Error('This account is disabled.');
    const role = (account && account.role) || env.OIDC_DEFAULT_ROLE || 'viewer';
    const who = { u: email, n: (account && account.name) || info.name || email, r: role };
    await audit(env, { who: email, role, action: 'login', detail: 'sso' });
    const headers = new Headers({ Location: next || '/', 'Cache-Control': 'no-store' });
    for (const c of sessionCookies(await signSession(env, who), url.protocol === 'https:')) headers.append('Set-Cookie', c);
    headers.append('Set-Cookie', 'muse_oidc=; Path=/api/auth/oidc; Max-Age=0; HttpOnly; SameSite=Lax');
    return new Response(null, { status: 302, headers });
  } catch (e) {
    await audit(env, { who: 'sso', action: 'login.failed', detail: String(e.message || e) });
    return json({ ok: false, error: String(e.message || e) }, 401);
  }
}
