// @ts-check
// POST /api/omni/slack — post a Show Caller notification to a Slack channel.
// Body: { channel, text, show?, idempotencyKey?/approvalId? } → { ok, ts, channel, path }.
// Bot token first; the incoming webhook fires once as fallback (and is a valid
// standalone setup when no bot token exists). Writers only. A repeated send
// carrying the same idempotency/approval id returns the first result instead
// of posting again.
import { json, sameOrigin } from '../../_lib/session.js';
import { who, canWrite } from '../../_lib/who.js';
import { audit } from '../../_lib/audit.js';

const clean = (s) => String(s == null ? '' : s).replace(/[^a-z0-9_]/gi, '').slice(0, 80) || 'slack_error';
// Idempotency store: KV when bound, per-isolate memory otherwise.
const dedupeMem = globalThis.__museOmniSlackDedupe || (globalThis.__museOmniSlackDedupe = new Map());
async function dedupeGet(env, k) {
  if (env && env.MUSE_KV) { try { return await env.MUSE_KV.get(k, 'json'); } catch (e) { /* fall through */ } }
  return dedupeMem.get(k) || null;
}
async function dedupePut(env, k, v) {
  dedupeMem.set(k, v);
  if (env && env.MUSE_KV) { try { await env.MUSE_KV.put(k, JSON.stringify(v), { expirationTtl: 86400 }); } catch (e) { /* memory copy stands */ } }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const token = env && env.SLACK_BOT_TOKEN;
  const hook = env && env.SLACK_WEBHOOK_URL;
  if (!token && !hook) return json({ ok: false, configured: false, error: 'Slack is not connected.' }, 503);
  if (+(request.headers.get('Content-Length') || 0) > 65536) return json({ ok: false, error: 'Body too large.' }, 413);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request.' }, 400); }
  const channel = String((body && body.channel) || '').slice(0, 80);
  const text = String((body && body.text) || '').slice(0, 4000);
  if (!channel || !text) return json({ ok: false, error: 'channel and text are required.' }, 400);
  // Thread replies keep Omni threads and Slack threads as mirrors of each other.
  // Webhook delivery cannot thread (no ts comes back), so threading needs the bot token.
  const threadTs = typeof (body && body.thread_ts) === 'string' && /^\d{10,}\.\d{1,6}$/.test(body.thread_ts) ? body.thread_ts : '';
  const idem = String((body && (body.idempotencyKey || body.approvalId || body.id)) || '').slice(0, 120);
  const dedupeKey = idem ? 'omni:slack:' + idem : null;
  if (dedupeKey) {
    const prior = await dedupeGet(env, dedupeKey);
    if (prior && prior.ok) return json(prior);
  }

  let j = null;
  if (token) {
    try {
      const r = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(Object.assign({ channel, text, unfurl_links: false, unfurl_media: false }, threadTs ? { thread_ts: threadTs } : {})),
        signal: AbortSignal.timeout(15000),
      });
      j = await r.json();
    } catch (e) { j = null; }
  }
  if (j && j.ok) {
    const out = { ok: true, ts: String(j.ts || ''), channel: String(j.channel || channel), path: 'bot' };
    if (dedupeKey) await dedupePut(env, dedupeKey, out);
    await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify', key: 'slack', detail: channel });
    return json(out);
  }
  if (hook) {
    try {
      const w = await fetch(hook, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000),
      });
      if (w.ok) {
        const out = { ok: true, ts: '', channel, path: 'webhook' };
        if (dedupeKey) await dedupePut(env, dedupeKey, out);
        await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify', key: 'slack', detail: channel + ' via webhook' });
        return json(out);
      }
    } catch (e) { /* fall through to the failure below */ }
  }
  const err = clean(j && j.error);
  await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify.failed', key: 'slack', detail: err });
  return json({ ok: false, error: 'Slack post failed (' + err + ').' }, 502);
}
