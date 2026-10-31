// Real stream telemetry for Muse Live's Streaming tab.
//
// GET  /api/telemetry?status=1        → which sources this deployment can reach
// GET  /api/telemetry?oembed=<id>     → YouTube embeddability probe (pre-flight)
// POST /api/telemetry  { aws: { region?, medialiveChannelId?, mediaconnectFlowArn?, cloudfrontDistributionId? },
//                        mux: { videoId? } }
//      → { ok, stages: { cloud|contribution|cdn|viewers: { source, metrics } }, errors }
//
// Secrets / vars (never sent to the browser):
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (optional), AWS_REGION
//   MUX_TOKEN_ID, MUX_TOKEN_SECRET
// Metric names follow the AWS namespaces AWS/MediaLive, AWS/MediaConnect and AWS/CloudFront and the
// Mux Data metric ids (viewer_experience_score, rebuffer_percentage, video_startup_time,
// playback_failure_percentage) plus the realtime metric current-concurrent-viewers.
// Fields we return use the client's telemetry names so values replace the simulation 1:1.

import { who, canWrite } from '../_lib/who.js';
import { guardJsonWrite, readCappedBody } from '../_lib/abuse.js';

const enc = new TextEncoder();

// POST body allowlist: which provider sections exist and which fields each
// accepts. Anything else is rejected (400) so a tampered client cannot smuggle
// unexpected identifiers into server-side AWS/Mux calls.
const TELEMETRY_FIELDS = {
  aws: ['region', 'medialiveChannelId', 'mediaconnectFlowArn', 'cloudfrontDistributionId'],
  mux: ['videoId'],
};
const MAX_FIELD_LEN = 256;
const MAX_BODY = 16 * 1024;

// Pure validator (exported for unit tests): null when valid, else an error string.
export function validateTelemetryConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return 'Body must be a JSON object';
  for (const section of Object.keys(cfg)) {
    const allowed = TELEMETRY_FIELDS[section];
    if (!allowed) return 'Unknown field: ' + section;
    const sub = cfg[section];
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return 'Field must be an object: ' + section;
    for (const key of Object.keys(sub)) {
      if (!allowed.includes(key)) return 'Unknown field: ' + section + '.' + key;
      const v = sub[key];
      if (typeof v !== 'string') return 'Field must be a string: ' + section + '.' + key;
      if (v.length > MAX_FIELD_LEN) return 'Field too long: ' + section + '.' + key;
    }
  }
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function sha256Hex(data) { return hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data)); }
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
function rfc3986(s) { return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }

// AWS Signature Version 4 (header-based), implemented with WebCrypto so it runs on Workers.
// Returns the full header map to send (including authorization and x-amz-date; host is included
// for signing and must not be passed to fetch).
export async function sigv4Sign({ method, url, headers = {}, body = '', service, region, accessKeyId, secretAccessKey, sessionToken, amzDate }) {
  const u = new URL(url);
  amzDate = amzDate || new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  h.host = u.host;
  h['x-amz-date'] = amzDate;
  if (sessionToken) h['x-amz-security-token'] = sessionToken;
  const signed = Object.keys(h).sort();
  const canonHeaders = signed.map((k) => k + ':' + h[k] + '\n').join('');
  const query = [...u.searchParams.entries()].map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([k, v]) => k + '=' + v).join('&');
  const path = u.pathname.split('/').map((seg) => rfc3986(decodeURIComponent(seg))).join('/') || '/';
  const canonical = [method.toUpperCase(), path, query, canonHeaders, signed.join(';'), await sha256Hex(body)].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  let k = await hmac('AWS4' + secretAccessKey, date);
  k = await hmac(k, region); k = await hmac(k, service); k = await hmac(k, 'aws4_request');
  h.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${hex(await hmac(k, toSign))}`;
  return h;
}

// CloudWatch GetMetricData over the AWS JSON 1.0 protocol.
async function getMetricData(env, region, queries) {
  const url = `https://monitoring.${region}.amazonaws.com/`;
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ StartTime: now - 15 * 60, EndTime: now, MetricDataQueries: queries, ScanBy: 'TimestampDescending' });
  const headers = await sigv4Sign({
    method: 'POST', url, body, service: 'monitoring', region,
    headers: { 'content-type': 'application/x-amz-json-1.0', 'x-amz-target': 'GraniteServiceVersion20100801.GetMetricData' },
    accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN,
  });
  delete headers.host;
  const r = await fetch(url, { method: 'POST', headers, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('CloudWatch ' + r.status + ': ' + (j.message || j.Message || j.__type || 'request failed'));
  const out = {};
  for (const res of j.MetricDataResults || []) out[res.Id] = res.Values && res.Values.length ? res.Values[0] : null; // newest first
  return out;
}
const q = (id, ns, name, dims, stat) => ({ Id: id, ReturnData: true, MetricStat: { Metric: { Namespace: ns, MetricName: name, Dimensions: dims }, Period: 60, Stat: stat } });
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

async function awsStages(env, cfg, stages, errors) {
  const region = /^[a-z]{2}-[a-z]+-\d$/.test(cfg.region || '') ? cfg.region : env.AWS_REGION || 'us-east-1';
  try {
    if (cfg.medialiveChannelId) {
      const d = [{ Name: 'ChannelId', Value: String(cfg.medialiveChannelId) }, { Name: 'Pipeline', Value: '0' }];
      const v = await getMetricData(env, region, [
        q('loss', 'AWS/MediaLive', 'InputLossSeconds', d, 'Sum'), q('outs', 'AWS/MediaLive', 'ActiveOutputs', [{ Name: 'ChannelId', Value: String(cfg.medialiveChannelId) }], 'Minimum'),
        q('nin', 'AWS/MediaLive', 'NetworkIn', d, 'Average'), q('nout', 'AWS/MediaLive', 'NetworkOut', d, 'Average')]);
      stages.cloud = { source: 'CloudWatch · MediaLive', metrics: { input_loss_s: r2(v.loss), active_outputs: v.outs, net_in_mbps: r2(v.nin), net_out_mbps: r2(v.nout), input: v.loss > 0 ? 'Input loss' : v.loss === 0 ? 'Primary' : null } };
    }
    if (cfg.mediaconnectFlowArn) {
      const d = [{ Name: 'FlowARN', Value: String(cfg.mediaconnectFlowArn) }];
      const v = await getMetricData(env, region, [q('drop', 'AWS/MediaConnect', 'SourceDroppedPackets', d, 'Sum'), q('rtt', 'AWS/MediaConnect', 'SourceRoundTripTime', d, 'Average')]);
      stages.contribution = { source: 'CloudWatch · MediaConnect', metrics: { src_dropped_packets: v.drop, srt_rtt: r2(v.rtt) } };
    }
    if (cfg.cloudfrontDistributionId) {
      const d = [{ Name: 'DistributionId', Value: String(cfg.cloudfrontDistributionId) }, { Name: 'Region', Value: 'Global' }];
      const v = await getMetricData(env, 'us-east-1', [q('e5', 'AWS/CloudFront', '5xxErrorRate', d, 'Average'), q('req', 'AWS/CloudFront', 'Requests', d, 'Sum')]);
      stages.cdn = { source: 'CloudWatch · CloudFront', metrics: { cdn_5xx: r2(v.e5), cdn_requests: v.req } };
    }
  } catch (e) { errors.push(String(e.message || e)); }
}

async function muxStages(env, cfg, stages, errors) {
  const auth = 'Basic ' + btoa(env.MUX_TOKEN_ID + ':' + env.MUX_TOKEN_SECRET);
  const filt = cfg.videoId ? '&filters[]=' + encodeURIComponent('video_id:' + cfg.videoId) : '';
  const get = async (path) => {
    const r = await fetch('https://api.mux.com' + path, { headers: { Authorization: auth } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Mux ' + r.status + ': ' + ((j.error && j.error.messages && j.error.messages[0]) || 'request failed'));
    return j.data;
  };
  const overall = async (metric) => { const d = await get(`/data/v1/metrics/${metric}/overall?timeframe[]=1:hour${filt}`); return d && typeof d.value === 'number' ? d.value : null; };
  try {
    const [vx, reb, start, fail, cc] = await Promise.all([
      overall('viewer_experience_score'), overall('rebuffer_percentage'), overall('video_startup_time'), overall('playback_failure_percentage'),
      get(`/data/v1/realtime/metrics/current-concurrent-viewers/timeseries?${filt.slice(1)}`).catch(() => null),
    ]);
    let viewers = null;
    if (Array.isArray(cc) && cc.length) { const last = cc[cc.length - 1]; viewers = ['concurrent_viewers', 'value', 'current'].map((k) => last[k]).find((x) => typeof x === 'number') ?? null; }
    stages.viewers = { source: 'Mux Data', metrics: {
      vx_score: vx == null ? null : Math.round(vx * 100), rebuffer: reb == null ? null : r2(reb * 100), startup: start == null ? null : r2(start / 1000),
      failures: fail == null ? null : r2(fail * 100), viewers } };
  } catch (e) { errors.push(String(e.message || e)); }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.has('oembed')) {
    const id = url.searchParams.get('oembed');
    if (!/^[\w-]{11}$/.test(id || '')) return json({ ok: false, error: 'Bad video id' }, 400);
    try {
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
      if (!r.ok) return json({ ok: true, embeddable: false, error: r.status === 401 || r.status === 403 ? 'The owner has disabled embedding' : 'Video unavailable (HTTP ' + r.status + ')' });
      const j = await r.json();
      return json({ ok: true, embeddable: true, title: j.title, author: j.author_name });
    } catch (e) { return json({ ok: false, error: 'Could not reach YouTube' }, 502); }
  }
  return json({ ok: true, aws: !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY), region: env.AWS_REGION || null, mux: !!(env.MUX_TOKEN_ID && env.MUX_TOKEN_SECRET) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const guard = guardJsonWrite(request, { maxBytes: MAX_BODY, perMin: 60, ns: 'telemetry' });
  if (guard) return guard;
  if (!canWrite(await who(context))) return json({ ok: false, error: 'Your role is read-only.' }, 403);
  const read = await readCappedBody(request, MAX_BODY);
  if (typeof read !== 'string') return read;
  let cfg;
  try { cfg = JSON.parse(read); } catch (e) { return json({ ok: false, error: 'Bad request' }, 400); }
  const invalid = validateTelemetryConfig(cfg);
  if (invalid) return json({ ok: false, error: invalid }, 400);
  const stages = {}, errors = [];
  const hasAws = env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY, hasMux = env.MUX_TOKEN_ID && env.MUX_TOKEN_SECRET;
  if (cfg && cfg.aws && hasAws) await awsStages(env, cfg.aws, stages, errors);
  else if (cfg && cfg.aws) errors.push('AWS credentials are not configured on the server');
  if (cfg && cfg.mux && hasMux) await muxStages(env, cfg.mux, stages, errors);
  else if (cfg && cfg.mux) errors.push('Mux Data credentials are not configured on the server');
  return json({ ok: true, stages, errors });
}
