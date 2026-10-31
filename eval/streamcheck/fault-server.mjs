// Local fault-injection HLS server for the Stream Check eval. Serves a small
// set of deterministic playlists — a clean control plus one fault variant
// each — over plain node:http with no dependencies, so eval runs work
// offline and reproduce exactly. Pairing: mock-hls-server (global,
// fake-live from a VOD playlist) supplies player motion for browser
// rehearsal; this server supplies the faults, which that tool cannot
// express. Segment bodies are placeholder TS (sync bytes only): enough to
// validate playlist plumbing and the feed-down path, not a decode test.
//
// All overlay/program labels here are fictional rehearsal names; nothing
// references production programming.
//
//   node eval/streamcheck/fault-server.mjs [port]   # default 8077
import http from 'node:http';

const SEG_DUR = 6;
const SEG_N = 6;
const FICTIONAL_TAG = '# Rehearsal loop - fictional lineup, not production programming';

// One 188-byte TS packet with a sync byte, repeated: a placeholder body
// that is honest about being plumbing-only (see header comment).
function placeholderTS() {
  const pkt = Buffer.alloc(188, 0);
  pkt[0] = 0x47;
  return Buffer.concat(Array.from({ length: 10 }, () => pkt));
}
const TS = placeholderTS();

function segs(name, n = SEG_N) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ uri: `/hls/seg/${name}-${i}.ts`, dur: SEG_DUR, gap: false });
  return out;
}

// Frozen picture: window segments repeat one URI, so the player holds one
// picture for the window. Ground truth: segs 2-3 repeat seg 1 (12 s).
function frozenSegs() {
  const list = segs('frozen');
  list[2] = { ...list[1] };
  list[3] = { ...list[1] };
  return list;
}

// Black window: EXT-X-GAP marks intentionally missing content; a renderer
// shows black or holds its last picture for the gap. Ground truth: segs
// 2-3 are gap (12 s).
function blackSegs() {
  const list = segs('black');
  list[2].gap = true;
  list[3].gap = true;
  return list;
}

function mediaPlaylist(list, note) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:' + SEG_DUR,
    '#EXT-X-MEDIA-SEQUENCE:0', FICTIONAL_TAG];
  if (note) lines.push('# Fault: ' + note);
  for (const s of list) {
    lines.push('#EXTINF:' + s.dur.toFixed(1) + ',');
    if (s.gap) lines.push('#EXT-X-GAP');
    lines.push(s.uri);
  }
  return lines.join('\n') + '\n';
}

function masterPlaylist(withAudio) {
  const lines = ['#EXTM3U', FICTIONAL_TAG,
    '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360' + (withAudio ? ',AUDIO="audio"' : ''),
    withAudio ? '/hls/clean.m3u8' : '/hls/muted.m3u8'];
  if (withAudio) lines.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="program",DEFAULT=YES,URI="/hls/audio.m3u8"');
  else lines.push('# No audio rendition (video-only program - ground truth: muted)');
  return lines.join('\n') + '\n';
}

function audioPlaylist() {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:' + SEG_DUR,
    '#EXT-X-MEDIA-SEQUENCE:0', FICTIONAL_TAG];
  for (let i = 0; i < SEG_N; i++) { lines.push('#EXTINF:' + SEG_DUR.toFixed(1) + ','); lines.push(`/hls/seg/audio-${i}.ts`); }
  return lines.join('\n') + '\n';
}

// Pure route table: (method, pathname, hits) -> { status, headers, body }.
// Unit tests and the in-process fallback call this directly; startFaultServer
// is a thin HTTP wrapper over the same table, so both paths serve identical
// bytes and statuses.
export function route(method, p, hits = { flaky: 0 }) {
  const m3u8 = (body) => ({ status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }, body });
  const ts = () => ({ status: 200, headers: { 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-store' }, body: TS });
  const down = (retry) => ({ status: 503, headers: { 'Retry-After': String(retry), 'Cache-Control': 'no-store' }, body: 'feed down' });
  if (method === 'POST' && p === '/reset') { hits.flaky = 0; return { status: 200, headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' }; }
  if (method === 'GET' && p === '/health') {
    return { status: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, mode: 'local-static', faults: ['clean', 'black', 'frozen', 'muted', 'down', 'flaky'] }) };
  }
  if (method === 'GET' && p === '/hls/clean.m3u8') return m3u8(mediaPlaylist(segs('clean')));
  if (method === 'GET' && p === '/hls/black.m3u8') return m3u8(mediaPlaylist(blackSegs(), 'black window, segs 2-3 are EXT-X-GAP (ground truth 12 s)'));
  if (method === 'GET' && p === '/hls/frozen.m3u8') return m3u8(mediaPlaylist(frozenSegs(), 'frozen picture, segs 2-3 repeat seg 1 (ground truth 12 s)'));
  if (method === 'GET' && p === '/hls/muted.m3u8') return m3u8(mediaPlaylist(segs('muted'), 'video-only program, no audio rendition (ground truth: muted)'));
  if (method === 'GET' && p === '/hls/clean-master.m3u8') return m3u8(masterPlaylist(true));
  if (method === 'GET' && p === '/hls/muted-master.m3u8') return m3u8(masterPlaylist(false));
  if (method === 'GET' && p === '/hls/audio.m3u8') return m3u8(audioPlaylist());
  if (method === 'GET' && p === '/hls/down.m3u8') return down(5);
  if (method === 'GET' && p === '/hls/flaky.m3u8') {
    hits.flaky++;
    if (hits.flaky < 2) return down(1);
    return m3u8(mediaPlaylist(segs('clean')));
  }
  if (method === 'GET' && /^\/hls\/seg\/[a-z0-9-]+\.ts$/.test(p)) return ts();
  return { status: 404, headers: { 'Cache-Control': 'no-store' }, body: 'no such feed' };
}

// In-process fetch over route(): same bytes check() would see over HTTP,
// for sandboxes where binding a listener is denied. Each eval row records
// which transport it used.
export function stubFetch(hits = { flaky: 0 }) {
  return async (url, init = {}) => {
    const r = route(init.method || 'GET', new URL(String(url), 'http://fault').pathname, hits);
    const body = Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body));
    return { ok: r.status >= 200 && r.status < 300, status: r.status,
      headers: { get: (k) => r.headers[k] || null }, text: async () => body.toString(), arrayBuffer: async () => body };
  };
}

export function startFaultServer({ port = 0, host = '127.0.0.1' } = {}) {
  const hits = { flaky: 0 };
  const server = http.createServer((req, res) => {
    const p = new URL(req.url || '/', 'http://x').pathname;
    const r = route(req.method, p, hits);
    res.writeHead(r.status, r.headers);
    res.end(r.body);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, hits, port: addr.port, base: `http://${host}:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const direct = process.argv[1] && process.argv[1].endsWith('fault-server.mjs');
if (direct) {
  const port = +(process.argv[2] || 8077);
  startFaultServer({ port }).then(({ base }) => {
    console.log(`fault server on ${base} (clean/black/frozen/muted/down/flaky under /hls/)`);
  });
}
