// @ts-check
// Asset serial records on D1 (binding MUSE_D1).
//   GET  /api/assets/:serial → { asset, history } (signed-in; 404 when absent)
//   POST /api/assets/:serial → mutate (writers only):
//     { action: 'checkout', to } | { action: 'checkin' }
//     { action: 'condition', condition } | { action: 'maintenance', maintenance_due }
//     { action: 'firmware', firmware } | { action: 'note', detail }
// Every mutation appends an asset_history row — the register's paper trail.
import { json, sameOrigin } from '../../_lib/session.js';
import { who, canWrite } from '../../_lib/who.js';
import { audit } from '../../_lib/audit.js';

const SERIAL = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CONDITIONS = ['excellent', 'good', 'fair', 'needs-repair'];

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.MUSE_D1) return json({ ok: false, configured: false, error: 'Asset database is not configured (MUSE_D1 binding).' }, 503);
  const serial = String(params.serial || '');
  if (!SERIAL.test(serial)) return json({ ok: false, error: 'Invalid serial' }, 400);
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  const db = env.MUSE_D1;

  if (request.method === 'GET') {
    const asset = await db.prepare('SELECT * FROM assets WHERE serial = ?').bind(serial).first();
    if (!asset) return json({ ok: false, error: 'Not found' }, 404);
    const h = await db.prepare('SELECT ts, "by", action, detail FROM asset_history WHERE serial = ? ORDER BY ts DESC LIMIT 100').bind(serial).all();
    return json({ ok: true, asset, history: (h.results || []) });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);

  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Body must be JSON' }, 400); }
  const action = body && body.action;
  const now = Date.now();
  const asset = await db.prepare('SELECT * FROM assets WHERE serial = ?').bind(serial).first();
  if (!asset) return json({ ok: false, error: 'Not found' }, 404);

  let detail = '';
  const set = [];
  const args = [];
  if (action === 'checkout') {
    const to = String((body && body.to) || '').slice(0, 120);
    if (!to) return json({ ok: false, error: 'Checkout needs a destination (person or show).' }, 400);
    if (asset.status === 'checked-out') return json({ ok: false, error: 'Already checked out to ' + (asset.checked_out_to || 'someone') + '.' }, 409);
    set.push('status = ?', 'checked_out_to = ?', 'checked_out_at = ?'); args.push('checked-out', to, now);
    detail = '→ ' + to;
  } else if (action === 'checkin') {
    set.push('status = ?', 'checked_out_to = ?', 'checked_out_at = ?'); args.push('available', '', 0);
    detail = '← ' + (asset.checked_out_to || 'field');
  } else if (action === 'condition') {
    if (CONDITIONS.indexOf(body && body.condition) < 0) return json({ ok: false, error: 'Condition is ' + CONDITIONS.join(' | ') + '.' }, 400);
    set.push('condition = ?'); args.push(body.condition);
    detail = String(body.condition);
  } else if (action === 'maintenance') {
    set.push('maintenance_due = ?'); args.push(String((body && body.maintenance_due) || '').slice(0, 10));
    detail = 'due ' + String((body && body.maintenance_due) || '');
  } else if (action === 'firmware') {
    set.push('firmware = ?'); args.push(String((body && body.firmware) || '').slice(0, 40));
    detail = 'fw ' + String((body && body.firmware) || '');
  } else if (action === 'note') {
    detail = String((body && body.detail) || '').slice(0, 500);
    if (!detail) return json({ ok: false, error: 'A note needs text.' }, 400);
  } else if (action === 'attach') {
    const key = String((body && body.key) || '').slice(0, 220);
    if (!/^[a-z0-9][a-z0-9_./-]{0,200}$/.test(key)) return json({ ok: false, error: 'Invalid media key.' }, 400);
    let keys = [];
    try { keys = JSON.parse(asset.media_keys || '[]'); } catch (e) { keys = []; }
    if (keys.indexOf(key) < 0) keys.push(key);
    set.push('media_keys = ?'); args.push(JSON.stringify(keys.slice(0, 100)));
    detail = key;
  } else {
    return json({ ok: false, error: 'Unknown action' }, 400);
  }
  set.push('updated = ?', 'updated_by = ?'); args.push(now, user.u);

  await db.prepare('UPDATE assets SET ' + set.join(', ') + ' WHERE serial = ?').bind(...args, serial).run();
  await db.prepare('INSERT INTO asset_history (serial, ts, "by", action, detail) VALUES (?, ?, ?, ?, ?)').bind(serial, now, user.u, action, detail).run();
  await db.prepare('DELETE FROM asset_fts WHERE serial = ?').bind(serial).run();
  await db.prepare('INSERT INTO asset_fts (serial, name, category, location) VALUES (?, ?, ?, ?)').bind(serial, asset.name, asset.category, asset.location || '').run();
  await audit(env, { who: user.u, role: user.r, action: 'asset.' + action, key: serial, detail });
  const next = await db.prepare('SELECT * FROM assets WHERE serial = ?').bind(serial).first();
  return json({ ok: true, asset: next });
}
