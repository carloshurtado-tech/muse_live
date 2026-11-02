// GET /api/omni/slack-thread?channel=<id>&ts=<ts> → replies in a Slack thread,
// so an Omni thread mirrors its Slack channel thread (and vice versa).
//
// Reads need the bot token (webhooks cannot read) with conversations:history
// for public channels — plus groups:history / im:history / mpim:history for
// private groups, DMs and group DMs. A missing scope surfaces as Slack's
// own missing_scope error, not a silent empty list.

import { who } from '../../_lib/who.js';
import { sameOrigin } from '../../_lib/session.js';

const clean = (s) => String(s || '').replace(/[<>&"']/g, '').slice(0, 120) || 'unknown_error';
const okChannel = (s) => typeof s === 'string' && /^[CGD][A-Z0-9]{8,}$/.test(s);
const okTs = (s) => typeof s === 'string' && /^\d{10,}\.\d{1,6}$/.test(s);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const token = env && env.SLACK_BOT_TOKEN;
  if (!token) return json({ ok: false, configured: false, error: 'Slack is not connected.' }, 503);
  const u = new URL(request.url);
  const channel = u.searchParams.get('channel') || '';
  const ts = u.searchParams.get('ts') || '';
  if (!okChannel(channel) || !okTs(ts)) return json({ ok: false, error: 'channel (ID) and ts are required.' }, 400);
  let j = null;
  try {
    const r = await fetch('https://slack.com/api/conversations.replies?channel=' + encodeURIComponent(channel) + '&ts=' + encodeURIComponent(ts) + '&limit=100&inclusive=true', {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000),
    });
    j = await r.json();
  } catch (e) { j = null; }
  if (!j || !j.ok) return json({ ok: false, error: 'Slack read failed (' + clean(j && j.error) + ').' }, 502);
  const messages = (j.messages || []).map(function (m) {
    return {
      ts: String(m.ts || ''), thread_ts: String(m.thread_ts || m.ts || ''),
      user: String(m.user || m.bot_id || 'slack'),
      name: String((m.username || (m.bot_profile && m.bot_profile.name)) || ''),
      text: String(m.text || '').slice(0, 4000),
    };
  }).filter(function (m) { return m.ts; });
  return json({ ok: true, channel, messages });
}
