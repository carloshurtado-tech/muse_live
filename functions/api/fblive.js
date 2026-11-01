// Facebook / Instagram Live status for Muse Live's Streaming tab (server-side Graph API proxy;
// the token never reaches the browser).
//
// GET /api/fblive?status=1                 → { configured, version }
// GET /api/fblive?page=<page-id>[&ig=<ig>] → a Page's live videos (+ Instagram live media)
// GET /api/fblive?video=<live-video-id>    → one live video
//
// Secrets / vars: FB_GRAPH_TOKEN (a Page access token), FB_GRAPH_VERSION (default v26.0 — the
// version shown in Meta's Graph API reference at the time of writing).
// Fields: LiveVideo id, status (e.g. LIVE / LIVE_STOPPED / SCHEDULED_*; the /live_videos edge takes
// status values UNPUBLISHED, LIVE_NOW, SCHEDULED_UNPUBLISHED, SCHEDULED_LIVE, SCHEDULED_CANCELED),
// title, live_views, permalink_url, embed_html, creation_time, and ingest_streams — LiveVideoInputStream
// with stream_health (LiveVideoStreamHealth) and is_master, per
// https://developers.facebook.com/docs/graph-api/reference/live-video-input-stream/ . Instagram:
// /{ig-user-id}/live_media (Instagram Graph API). Verify field availability against your app's
// permissions (pages_read_engagement, pages_show_list, publish_video for Pages; instagram_basic).

const FIELDS = 'id,status,title,live_views,permalink_url,embed_html,creation_time,ingest_streams{stream_health,is_master}';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function graph(env, path, params) {
  const v = /^v\d+\.\d+$/.test(env.FB_GRAPH_VERSION || '') ? env.FB_GRAPH_VERSION : 'v26.0';
  const u = new URL(`https://graph.facebook.com/${v}/${path}`);
  for (const [k, val] of Object.entries(params || {})) u.searchParams.set(k, val);
  u.searchParams.set('access_token', env.FB_GRAPH_TOKEN);
  const r = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    throw new Error('Graph API ' + (e.code ? 'error ' + e.code : r.status) + ': ' + (e.message || 'request failed'));
  }
  return j;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const configured = !!env.FB_GRAPH_TOKEN;
  if (url.searchParams.has('status')) return json({ ok: true, configured, version: env.FB_GRAPH_VERSION || 'v26.0' });
  if (!configured) return json({ ok: false, configured: false, error: 'Facebook Live is not connected. Add the FB_GRAPH_TOKEN secret.' }, 503);
  const id = (k) => { const v = url.searchParams.get(k); return v && /^[0-9_]{3,40}$/.test(v) ? v : null; };
  const page = id('page'), video = id('video'), ig = id('ig');
  if (!page && !video) return json({ ok: false, error: 'Give a page or video id.' }, 400);
  try {
    const out = { ok: true };
    if (video) out.video = await graph(env, video, { fields: FIELDS });
    else out.videos = (await graph(env, page + '/live_videos', { fields: FIELDS, limit: '10' })).data || [];
    if (ig) {
      try { out.instagram = (await graph(env, ig + '/live_media', { fields: 'id,media_type,media_product_type,username,timestamp' })).data || []; }
      catch (e) { out.instagram_error = String(e.message || e); }
    }
    return json(out);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}
