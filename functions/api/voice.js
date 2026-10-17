// Voice Muse — push-to-talk speech-to-text through Meta Model API (Muse Voice Transcribe).
//
// POST /api/voice  body: a mono 16-bit PCM WAV (16 or 24 kHz), Content-Type audio/wav, ≤ 2 MB / 30 s.
// The browser records and encodes the WAV (js/muse-voice.js); this function holds the key and
// forwards it as the one-shot transcription request:
//   POST https://api.meta.ai/v1/asr/transcribe   (Authorization: Bearer MODEL_API_KEY)
//   multipart: request = {"mode","model","audioEncoding":"WAV","keywords"} (JSON part), audio = the WAV
// Response → { ok, text, durationMs }.

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MS = 31000;
const DEFAULT_BASE = 'https://api.meta.ai/v1';
const MODEL = 'muse-voice-transcribe-1.0';
// Words the recognizer would otherwise mis-hear on comms.
const KEYWORDS = ['Muse', 'Muse Live', 'Muse AI', 'World Tour', 'Muse AI World Tour', 'Creator Week', 'Launch Keynote', 'Ray-Ban', 'Ray-Ban Meta', 'Orion', 'MetLife', 'WhatsApp', 'Instagram', 'Charm', 'LlamaCon',
  'PCR', 'ACR', 'CRK', 'REMI', 'EVS', 'IFB', 'RVON', 'LiveU', 'SRT', 'HLS', 'CDN', 'MediaLive', 'Makito', 'techbook'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// Minimal WAV sanity check: RIFF/WAVE, PCM, mono, 16-bit, 16 or 24 kHz; returns duration in ms.
function inspectWav(buf) {
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { error: 'Expected a WAV recording.' };
  let off = 12, fmt = null, dataLen = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off), len = v.getUint32(off + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(off + 8, true), channels: v.getUint16(off + 10, true), rate: v.getUint32(off + 12, true), bits: v.getUint16(off + 22, true) };
    if (id === 'data') { dataLen = Math.min(len, buf.byteLength - off - 8); break; }
    off += 8 + len + (len % 2);
  }
  if (!fmt || fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || (fmt.rate !== 16000 && fmt.rate !== 24000)) return { error: 'Recording must be mono 16-bit PCM at 16 or 24 kHz.' };
  return { durationMs: Math.round(dataLen / 2 / fmt.rate * 1000) };
}

export async function onRequestPost({ request, env }) {
  const key = env && env.MODEL_API_KEY;
  if (!key) return json({ ok: false, configured: false, error: 'Voice needs the Muse model to be connected.' }, 503);
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BYTES) return json({ ok: false, error: 'That recording is too long. Keep it under 30 seconds.' }, 413);
  const audio = await request.arrayBuffer();
  if (audio.byteLength > MAX_BYTES) return json({ ok: false, error: 'That recording is too long. Keep it under 30 seconds.' }, 413);
  const info = inspectWav(audio);
  if (info.error) return json({ ok: false, error: info.error }, 400);
  if (info.durationMs > MAX_MS) return json({ ok: false, error: 'That recording is too long. Keep it under 30 seconds.' }, 413);
  if (info.durationMs < 250) return json({ ok: false, error: 'I didn\'t catch anything. Hold the mic button while you speak.' }, 400);

  const form = new FormData();
  form.append('request', new Blob([JSON.stringify({ mode: 'PUSH_TO_TALK', model: MODEL, audioEncoding: 'WAV', keywords: KEYWORDS })], { type: 'application/json' }));
  form.append('audio', new Blob([audio], { type: 'audio/wav' }), 'speech.wav');
  const base = (env.MUSE_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  let r, j;
  try {
    r = await fetch(base + '/asr/transcribe', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form });
    const text = await r.text();
    try { j = JSON.parse(text); } catch (e) { j = { raw: text.slice(0, 300) }; }
  } catch (e) {
    return json({ ok: false, error: 'Voice could not reach Meta Model API.' }, 502);
  }
  if (!r.ok) {
    console.log('voice upstream', r.status, j && (j.error ? JSON.stringify(j.error) : j.raw));
    const msg = r.status === 401 || r.status === 403 ? 'Voice transcription is not enabled for this Meta Model API key.'
      : r.status === 404 ? 'Voice transcription is not available on this account yet.'
      : r.status === 429 ? 'Voice is busy right now. Try again in a moment.'
      : 'Voice transcription failed. Type your question instead.';
    return json({ ok: false, error: msg }, r.status === 429 ? 429 : 502);
  }
  let text = typeof j.transcript === 'string' ? j.transcript : '';
  if (!text && Array.isArray(j.turns)) text = j.turns.map((t) => t.transcript || '').join(' ');
  return json({ ok: true, text: text.trim(), durationMs: j.audioDurationMs || info.durationMs });
}
