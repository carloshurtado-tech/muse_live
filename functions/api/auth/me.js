// @ts-check
// GET /api/auth/me → the signed-in user ({email, name, role}) for the user chip and role-aware UI.
import { json } from '../../_lib/session.js';
import { who } from '../../_lib/who.js';
export async function onRequestGet(context) {
  const u = await who(context);
  if (!u) return json({ ok: false, error: 'Sign in required' }, 401);
  return json({ ok: true, user: { email: u.u === 'team' ? null : u.u, name: u.n, role: u.r, shared: u.u === 'team' } });
}
