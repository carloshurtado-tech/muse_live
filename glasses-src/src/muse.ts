// Ask Muse from the glasses: a "glance" request (no tools, live snapshot only, ≤ 2 sentences)
// to the same /api/museai endpoint the desktop agent uses. Voice goes through /api/voice
// (Meta Muse Voice Transcribe) first. Every failure path still gives the wearer an answer.
import { onAir, fmtViewers, recommendationFor, type Status } from './data';

export interface MuseAnswer { text: string; source: 'muse' | 'local'; }

export async function askMuse(question: string, status: Status): Promise<MuseAnswer> {
  try {
    const r = await fetch('/api/museai', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'glance', messages: [{ role: 'user', content: question }], snapshot: JSON.stringify(status) }),
    });
    const j = await r.json().catch(() => ({}));
    const text = j && j.ok && j.message && typeof j.message.content === 'string' ? j.message.content.trim() : '';
    if (text) return { text: clampSentences(text, 2), source: 'muse' };
  } catch { /* fall through */ }
  return { text: localAnswer(question, status), source: 'local' };
}

function clampSentences(t: string, n: number): string {
  const plain = t.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  const parts = plain.match(/[^.!?]+[.!?]+/g);
  return parts && parts.length > n ? parts.slice(0, n).join(' ').trim() : plain;
}

// Deterministic answer from the snapshot when the model can't be reached.
export function localAnswer(q: string, s: Status): string {
  const live = onAir(s);
  const bad = live.filter((x) => x.health === 'warn' || x.health === 'crit');
  const ql = q.toLowerCase();
  if (/next|upcoming|when/.test(ql) && s.next) {
    const mins = Math.max(0, Math.round((s.next.startsAt - Date.now()) / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${s.next.name} goes on air in ${h ? h + ' h ' : ''}${m} min.`;
  }
  if (/risk|worst|problem|issue/.test(ql)) {
    if (bad.length) return `${bad[0].name}: ${bad[0].alerts[0] || 'degraded'}. ${recommendationFor(bad[0])}`;
    const inc = s.openIncidents[0];
    return inc ? `No stream is degraded. Top open incident is ${inc.id} (${inc.severity}) on ${inc.show}.` : 'No stream is degraded and nothing is open.';
  }
  if (!live.length) return 'Nothing is on air right now.';
  if (!bad.length) return `All ${live.length} streams on air are healthy, ${fmtViewers(live.reduce((a, x) => a + x.viewers, 0))} viewers.`;
  return `${bad.length} of ${live.length} streams degraded. ${bad[0].name}: ${bad[0].alerts[0] || 'check the chain'}.`;
}

/* ---------------- push-to-talk ---------------- */
let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];

export function voiceSupported(): boolean {
  return typeof window !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

export async function startTalking(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start();
}

export async function stopTalking(): Promise<string> {
  const r = rec; rec = null;
  if (!r) return '';
  const done = new Promise<void>((res) => { r.onstop = () => res(); });
  r.stop();
  await done;
  r.stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
  const resp = await fetch('/api/voice', { method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type }, body: blob });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || !j.ok) throw new Error(j.error || 'Voice is unavailable right now.');
  return String(j.text || '').trim();
}
