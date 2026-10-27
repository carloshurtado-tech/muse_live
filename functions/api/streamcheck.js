// @ts-check
// POST /api/streamcheck — segment one frame with SAM 3.1 (Meta Model API).
// Body: { image: data-URL (jpeg/png/webp, ≤1.5 MB), concept: noun phrase }.
// → { ok, concept, matches: [{x1,y1,x2,y2,w,h,confidence}], count, masks, noMatch }.
// Masks are counted, not returned (kilobytes of tokens Stream Check never reads).
// Writers only; segments only — wording stays with Spark per the pipeline rule.
import { json, sameOrigin } from '../_lib/session.js';
import { who, canWrite } from '../_lib/who.js';
import { audit } from '../_lib/audit.js';

const MODEL = 'sam-3.1';
const MAX_IMAGE = 1500000;
const BOX = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+);c=([0-9.]+)\|>/g;
const MASK = /<\|mask;/g;

function outputText(j) {
  const out = [];
  for (const item of ((j && j.output) || [])) {
    for (const c of ((item && item.content) || [])) {
      if (c && c.type === 'output_text' && typeof c.text === 'string') out.push(c.text);
    }
  }
  return out.join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const key = env && env.MODEL_API_KEY;
  if (!key) return json({ ok: false, configured: false, error: 'Model API is not connected.' }, 503);
  if (+(request.headers.get('Content-Length') || 0) > 2000000) return json({ ok: false, error: 'Body too large.' }, 413);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request.' }, 400); }
  const concept = String((body && body.concept) || '').trim().slice(0, 80);
  const image = String((body && body.image) || '');
  if (!concept || /[?!]/.test(concept)) return json({ ok: false, error: 'concept must be a short noun phrase (no questions or commands).' }, 400);
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE + 30) {
    return json({ ok: false, error: 'image must be a jpeg/png/webp data URL under 1.5 MB.' }, 400);
  }
  const t0 = Date.now();
  let up = null;
  try {
    const r = await fetch('https://api.meta.ai/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: MODEL,
        metadata: { include_confidence: 'true' },
        input: [{ type: 'message', role: 'user', content: [
          { type: 'input_text', text: concept },
          { type: 'input_image', image_url: image },
        ] }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    up = await r.json();
  } catch (e) { up = null; }
  const ms = Date.now() - t0;
  if (!up || up.error || up.status === 'failed') {
    const code = up && up.error && up.error.code;
    await audit(env, { who: user.u, role: user.r, action: 'showcaller.streamcheck.failed', key: 'sam', detail: String(code || 'upstream').slice(0, 80) });
    return json({ ok: false, error: 'Segmentation failed. Retry the frame.' }, 502);
  }
  const text = outputText(up);
  const matches = [];
  let m;
  BOX.lastIndex = 0;
  while ((m = BOX.exec(text)) !== null) {
    matches.push({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], w: +m[5], h: +m[6], confidence: +m[7] });
    if (matches.length >= 50) break;
  }
  const masks = (text.match(MASK) || []).length;
  await audit(env, { who: user.u, role: user.r, action: 'showcaller.streamcheck', key: 'sam', detail: concept + ' → ' + matches.length });
  return json({ ok: true, concept, matches, count: matches.length, masks, noMatch: matches.length === 0, latency_ms: ms });
}
