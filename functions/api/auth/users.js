// @ts-check
// Admin user management (KV `users:<email>`).
//   GET   /api/auth/users                              → list (no hashes)
//   POST  /api/auth/users {email,name,role,password}   → create
//   PATCH /api/auth/users {email, name?, role?, disabled?, password?} → update
import { json, sameOrigin, ROLES } from '../../_lib/session.js';
import { who, isAdmin } from '../../_lib/who.js';
import { getUser, putUser, listUsers, normEmail, validEmail, hashPassword, publicUser } from '../../_lib/users.js';
import { audit } from '../../_lib/audit.js';

function checkPassword(p) { return typeof p === 'string' && p.length >= 10 && p.length <= 256; }

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.MUSE_KV) return json({ ok: false, configured: false, error: 'Accounts need the MUSE_KV binding.' }, 503);
  const me = await who(context);
  if (!isAdmin(me)) return json({ ok: false, error: 'Admins only' }, 403);
  if (request.method === 'GET') return json({ ok: true, roles: ROLES, users: (await listUsers(env)).map(publicUser) });
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Body must be JSON' }, 400); }
  const email = normEmail(b.email);
  if (!validEmail(email)) return json({ ok: false, error: 'Enter a valid email.' }, 400);
  if (b.role !== undefined && !ROLES.includes(b.role)) return json({ ok: false, error: 'Role must be one of ' + ROLES.join(', ') }, 400);
  const now = new Date().toISOString();

  if (request.method === 'POST') {
    if (await getUser(env, email)) return json({ ok: false, error: 'That account already exists.' }, 409);
    if (!checkPassword(b.password)) return json({ ok: false, error: 'Passwords need at least 10 characters.' }, 400);
    const user = { email, name: String(b.name || email).slice(0, 80), role: b.role || 'viewer', disabled: false, created: now, updated: now, ...(await hashPassword(b.password)) };
    await putUser(env, user);
    await audit(env, { who: me.u, role: me.r, action: 'user.create', key: email, detail: user.role });
    return json({ ok: true, user: publicUser(user) }, 201);
  }
  if (request.method === 'PATCH') {
    const user = await getUser(env, email);
    if (!user) return json({ ok: false, error: 'No such account.' }, 404);
    const changes = [];
    if (b.name !== undefined) { user.name = String(b.name).slice(0, 80); changes.push('name'); }
    if (b.role !== undefined) { user.role = b.role; changes.push('role=' + b.role); }
    if (b.disabled !== undefined) { user.disabled = !!b.disabled; changes.push(user.disabled ? 'disabled' : 'enabled'); }
    if (b.password !== undefined) {
      if (!checkPassword(b.password)) return json({ ok: false, error: 'Passwords need at least 10 characters.' }, 400);
      Object.assign(user, await hashPassword(b.password)); changes.push('password');
    }
    user.updated = now;
    await putUser(env, user);
    await audit(env, { who: me.u, role: me.r, action: 'user.update', key: email, detail: changes.join(', ') });
    return json({ ok: true, user: publicUser(user) });
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
