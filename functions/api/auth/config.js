// @ts-check
// GET /api/auth/config (public) → which sign-in methods the gate should offer.
import { json } from '../../_lib/session.js';
import { hasUsers } from '../../_lib/users.js';
export async function onRequestGet({ env }) {
  const users = await hasUsers(env);
  return json({
    ok: true,
    sso: !!(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET),
    ssoLabel: env.OIDC_LABEL || 'Continue with SSO',
    accounts: users,
    sharedPassword: !users || env.ALLOW_SHARED_PASSWORD === 'true',
    storage: !!env.MUSE_KV,
    guest: env.GUEST_DEMO !== 'off',
  });
}
