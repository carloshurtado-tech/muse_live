// @ts-check
// POST /api/omni/slack — post a Show Caller notification to a Slack channel.
// Body: { channel, text, show? } → { ok, ts, channel, path }.
// Bot token first; the incoming webhook fires once as fallback. Writers only.
import { json, sameOrigin } from '../../_lib/session.js';
import { who, canWrite } from '../../_lib/who.js';
import { audit } from '../../_lib/audit.js';

const clean = (s) => String(s == null ? '' : s).replace(/[^a-z0-9_]/gi, '').slice(0, 80) || 'slack_error';

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const token = env && env.SLACK_BOT_TOKEN;
  if (!token) return json({ ok: false, configured: false, error: 'Slack is not connected.' }, 503);
  if (+(request.headers.get('Content-Length') || 0) > 65536) return json({ ok: false, error: 'Body too large.' }, 413);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request.' }, 400); }
  const channel = String((body && body.channel) || '').slice(0, 80);
  const text = String((body && body.text) || '').slice(0, 4000);
  if (!channel || !text) return json({ ok: false, error: 'channel and text are required.' }, 400);

  let j = null;
  try {
    const r = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(15000),
    });
    j = await r.json();
  } catch (e) { j = null; }
  if (j && j.ok) {
    await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify', key: 'slack', detail: channel });
    return json({ ok: true, ts: String(j.ts || ''), channel: String(j.channel || channel), path: 'bot' });
  }
  const hook = env.SLACK_WEBHOOK_URL;
  if (hook) {
    try {
      const w = await fetch(hook, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000),
      });
      if (w.ok) {
        await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify', key: 'slack', detail: channel + ' via webhook' });
        return json({ ok: true, ts: '', channel, path: 'webhook' });
      }
    } catch (e) { /* fall through to the failure below */ }
  }
  const err = clean(j && j.error);
  await audit(env, { who: user.u, role: user.r, action: 'showcaller.notify.failed', key: 'slack', detail: err });
  return json({ ok: false, error: 'Slack post failed (' + err + ').' }, 502);
}
