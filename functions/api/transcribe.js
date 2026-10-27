// @ts-check
// POST /api/transcribe — transcribe one audio clip (Meta Voice Transcribe).
// Body: { audio: base64 WAV (RIFF/WAVE mono PCM 16/24 kHz, ≤10 MB) }.
// → { ok, transcript, final: true }. Writers only. One clip per call; the
// client chunks program audio into windows (see js/muse-captions.js).
import { json, sameOrigin } from '../_lib/session.js';
import { who, canWrite } from '../_lib/who.js';
import { audit } from '../_lib/audit.js';

const MODEL = 'muse-voice-transcribe-1.0';
const MAX_AUDIO = 10000000;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await who(context);
  if (!user) return json({ ok: false, error: 'Sign in required' }, 401);
  if (!canWrite(user)) return json({ ok: false, error: 'Your role is read-only.' }, 403);
  if (!sameOrigin(request)) return json({ ok: false, error: 'Forbidden origin' }, 403);
  const key = env && env.MODEL_API_KEY;
  if (!key) return json({ ok: false, configured: false, error: 'Model API is not connected.' }, 503);
  if (+(request.headers.get('Content-Length') || 0) > 14000000) return json({ ok: false, error: 'Body too large.' }, 413);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request.' }, 400); }
  const audio = String((body && body.audio) || '');
  if (!/^[A-Za-z0-9+/=]+$/.test(audio) || audio.length < 1000 || audio.length > MAX_AUDIO) {
    return json({ ok: false, error: 'audio must be base64 WAV under 10 MB.' }, 400);
  }
  const bytes = b64ToBytes(audio);
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) {
    return json({ ok: false, error: 'audio must be a WAV (RIFF) clip.' }, 400);
  }
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify({ model: MODEL, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })], { type: 'application/json' }));
  form.append('audio', new Blob([bytes], { type: 'audio/wav' }), 'clip.wav');
  let up = null, okUp = false;
  try {
    const r = await fetch('https://api.meta.ai/v1/asr/transcribe', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
      body: form, signal: AbortSignal.timeout(90000),
    });
    okUp = r.ok;
    up = await r.json();
  } catch (e) { up = null; }
  const transcript = up ? String(up.transcript || up.text || '') : '';
  if (!okUp || !transcript) {
    const why = up && up.error ? (typeof up.error === 'string' ? up.error : JSON.stringify(up.error)) : 'empty';
    await audit(env, { who: user.u, role: user.r, action: 'showcaller.transcribe.failed', key: 'asr', detail: String(why).slice(0, 80) });
    return json({ ok: false, error: 'Transcription failed. Retry the clip.' }, 502);
  }
  await audit(env, { who: user.u, role: user.r, action: 'showcaller.transcribe', key: 'asr', detail: transcript.slice(0, 80) });
  return json({ ok: true, transcript, final: true });
}
