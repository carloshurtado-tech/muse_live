// @ts-check
// Muse Live local dev server — a small Cloudflare Pages emulator in plain Node (>= 18).
// Why: Cloudflare's workerd (wrangler pages dev) needs macOS 13.5+; this runs anywhere Node does.
// It serves the repo as static files, runs functions/_middleware.js and functions/api/**
// (including [param].js routes), applies the "/*" block of _headers, and emulates the MUSE_KV
// binding (persisted to .dev-kv.json).
//
//   npm run dev                        # http://127.0.0.1:8788, env from .dev.vars
//   node tools/dev-server.mjs --port 9000 --env .dev.vars,.dev.test.vars
//   node tools/dev-server.mjs --host 0.0.0.0   # opt-in LAN exposure (NOT the default)
//
// The server binds 127.0.0.1 unless --host says otherwise. It is NOT hardened
// (no rate limits, in-memory sessions fall back to defaults) — never expose it
// beyond loopback except for a moment on a trusted LAN, and never to the internet.
//
// .dev.vars (gitignored) holds secrets, e.g. MODEL_API_KEY=… and MUSE_PASSWORD_HASH=…
// (sha256 of "muse-live:" + your local password). It is NOT a production server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const argv = process.argv.slice(2);
const arg = (name, d) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +arg('port', process.env.PORT || 8788);
const HOST = arg('host', '127.0.0.1');
const ENVFILE = arg('env', path.join(ROOT, '.dev.vars'));
if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
  console.warn(`WARNING: Muse Live dev server binding to ${HOST} — this exposes an unhardened dev server`
    + ' (default secrets, no rate limits). Use only on a trusted LAN, never on the public internet.');
}
const PUB = ROOT, FN = path.join(ROOT, 'functions');

const env = {};
for (const ef of (ENVFILE||'').split(',').filter(f=>f&&fs.existsSync(f))) for (const line of fs.readFileSync(ef, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

/* ---- MUSE_KV emulation (Workers KV API subset) ---- */
function makeKV(file) {
  let store = {};
  try { store = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(store)); } catch (e) { console.error('kv save', e.message); } };
  const live = (k) => { const e = store[k]; if (!e) return null; if (e.exp && e.exp < Date.now() / 1000) { delete store[k]; return null; } return e; };
  const cast = (v, o) => { const t = typeof o === 'string' ? o : (o && o.type) || 'text'; return v == null ? null : t === 'json' ? JSON.parse(v) : v; };
  return {
    async get(k, o) { const e = live(k); return e ? cast(e.v, o) : null; },
    async getWithMetadata(k, o) { const e = live(k); return { value: e ? cast(e.v, o) : null, metadata: e ? e.m || null : null }; },
    async put(k, v, o = {}) {
      store[k] = { v: typeof v === 'string' ? v : JSON.stringify(v), m: o.metadata || null,
        exp: o.expiration || (o.expirationTtl ? Math.floor(Date.now() / 1000) + o.expirationTtl : 0) };
      save();
    },
    async delete(k) { delete store[k]; save(); },
    async list(o = {}) {
      const names = Object.keys(store).filter((k) => live(k) && k.startsWith(o.prefix || '')).sort();
      const start = o.cursor ? +o.cursor : 0, limit = Math.min(o.limit || 1000, 1000);
      const page = names.slice(start, start + limit);
      const done = start + limit >= names.length;
      return { keys: page.map((name) => ({ name, metadata: store[name].m || undefined, expiration: store[name].exp || undefined })), list_complete: done, cursor: done ? undefined : String(start + limit) };
    },
  };
}
if (!process.env.NO_KV) env.MUSE_KV = makeKV(process.env.DEV_KV_FILE || path.join(ROOT, '.dev-kv.json'));

const MIME = { html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', mjs:'text/javascript', css:'text/css; charset=utf-8', svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', webm:'video/webm', json:'application/json', wasm:'application/wasm', woff2:'font/woff2', webmanifest:'application/manifest+json', txt:'text/plain', ico:'image/x-icon', pdf:'application/pdf', dwg:'application/octet-stream', xml:'application/xml', map:'application/json', ics:'text/calendar; charset=utf-8' };
const headerRules = []; // [{ rx, lines: [[name, value|null]] }] in file order, as Pages applies them
try {
  for (const l of fs.readFileSync(path.join(PUB, '_headers'), 'utf8').split('\n')) {
    if (/^\s*#/.test(l) || !l.trim()) continue;
    if (/^\S/.test(l)) { headerRules.push({ rx: new RegExp('^' + l.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), lines: [] }); continue; }
    const t = l.trim(), cur = headerRules[headerRules.length - 1];
    if (!cur) continue;
    if (t.startsWith('!')) cur.lines.push([t.slice(1).trim(), null]);
    else if (t.includes(':')) { const i = t.indexOf(':'); cur.lines.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]); }
  }
} catch {}
function staticHeaders(pathname) {
  const h = {};
  for (const r of headerRules) if (r.rx.test(pathname)) for (const [k, v] of r.lines) { if (v === null) delete h[k]; else h[k] = v; }
  return h;
}
const bust = () => '?t=' + Date.now();
async function load(file) { return import(pathToFileURL(file).href + bust()); }
function staticResponse(p) {
  let f = path.join(PUB, decodeURIComponent(p));
  if (!f.startsWith(PUB) || /^\/(functions|node_modules|\.git)\b|\/\.dev[^/]*$/.test(p)) return new Response('Not found', { status: 404 });
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html'; // Pages pretty URLs: /about → about.html
  if (!fs.existsSync(f)) return new Response('Not found', { status: 404 });
  const ext = path.extname(f).slice(1).toLowerCase();
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
}
async function route(request, data) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    const seg = url.pathname.slice(5).split('/').filter(Boolean);
    let file = path.join(FN, 'api', ...seg) + '.js', params = {};
    if (!fs.existsSync(file) && fs.existsSync(path.join(FN, 'api', ...seg, 'index.js'))) file = path.join(FN, 'api', ...seg, 'index.js');
    if (!fs.existsSync(file) && seg.length) {
      const dir = path.join(FN, 'api', ...seg.slice(0, -1));
      const dyn = fs.existsSync(dir) && fs.readdirSync(dir).find((n) => /^\[[^\]]+\]\.js$/.test(n));
      if (dyn) { file = path.join(dir, dyn); params[dyn.slice(1, -4)] = decodeURIComponent(seg[seg.length - 1]); }
    }
    if (fs.existsSync(file)) {
      const mod = await load(file);
      const m = 'onRequest' + request.method[0] + request.method.slice(1).toLowerCase();
      const h = mod[m] || mod.onRequest;
      if (h) return h({ request, env, params, next: async () => new Response('Not found', { status: 404 }), waitUntil() {}, data });
      return new Response('Method not allowed', { status: 405 });
    }
    return new Response('Not found', { status: 404 });
  }
  return staticResponse(url.pathname);
}
http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request('http://127.0.0.1:' + PORT + req.url, { method: req.method, headers: /** @type {any} */ (req.headers), body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    let resp;
    const data = {}; // shared between middleware and the route, as on Pages
    const mw = path.join(FN, '_middleware.js');
    if (fs.existsSync(mw)) { const mod = await load(mw); resp = await mod.onRequest({ request, env, next: () => route(request, data), waitUntil() {}, data }); }
    else resp = await route(request, data);
    /** @type {Record<string, any>} */
    const headers = staticHeaders(new URL(request.url).pathname);
    delete headers['Strict-Transport-Security'];
    resp.headers.forEach((v, k) => { if (k.toLowerCase() !== 'set-cookie') headers[k] = v; });
    const cookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
    if (cookies.length) headers['Set-Cookie'] = cookies;
    res.writeHead(resp.status, headers);
    res.end(Buffer.from(await resp.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e && e.stack || e)); }
}).listen(PORT, HOST, () => console.log('Muse Live dev on http://' + HOST + ':' + PORT, Object.keys(env)));
