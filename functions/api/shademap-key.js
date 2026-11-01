// ShadeMap API key for the browser sun-shadow simulator.
//
// GET /api/shademap-key → { key } ('' when unconfigured; the panels degrade to a note).
//
// The key is public by design — the simulator SDK requires it client-side — but it lives
// in env (SHADEMAP_API_KEY), never the repo, so a public checkout doesn't publish it.
// Reads need sign-in (the access-gate middleware answers first); guests included.
import { json, sameOrigin } from '../_lib/session.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const key = (env && typeof env.SHADEMAP_API_KEY === 'string') ? env.SHADEMAP_API_KEY : '';
  return json({ key });
}
