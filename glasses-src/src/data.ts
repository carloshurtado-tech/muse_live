// Live status for the glasses. Muse Live (the desktop app) publishes a compact snapshot to
// /api/kv/live-status every 10 s; the glasses poll it. When it's missing or stale (> 60 s),
// a built-in demo status is shown and clearly marked "Demo data".

export type Health = 'ok' | 'warn' | 'crit' | 'off';

export interface Show {
  key: string;
  name: string;
  state: string; // LIVE | REHEARSAL | STANDBY | SCHEDULED | ENDED
  health: Health;
  viewers: number;
  latency: number | null; // seconds glass-to-glass
  alerts: string[];
  stage?: string; // stage at fault, when known
  recommendation?: string;
}

export interface Incident {
  id: string;
  severity: string;
  title: string;
  show: string;
}

export interface NextShow {
  name: string;
  startsAt: number; // epoch ms
  venue?: string;
}

export interface Status {
  ts: number;
  shows: Show[];
  openIncidents: Incident[];
  next: NextShow | null;
  demo: boolean;
}

const STALE_MS = 60_000;

function normHealth(h: unknown): Health {
  const s = String(h ?? '').toLowerCase();
  if (/crit|fail|down|neg/.test(s)) return 'crit';
  if (/degrad|warn|caution/.test(s)) return 'warn';
  if (/off|ended|standby|sched/.test(s)) return 'off';
  return 'ok';
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

// Infer which stage of the chain is at fault from the alert text.
export function stageOf(alerts: string[]): string | undefined {
  const a = alerts.join(' ').toLowerCase();
  if (/cdn|edge|5xx|cache/.test(a)) return 'Deliver · CDN';
  if (/srt|contribution|bonded|modem|rtt/.test(a)) return 'Contribute · SRT / bonded';
  if (/rebuffer|qoe|startup|failure/.test(a)) return 'Watch · viewer QoE';
  if (/encoder|cpu|fps|loudness/.test(a)) return 'Encode';
  if (/segment|origin|packag/.test(a)) return 'Package · origin';
  return undefined;
}

export function recommendationFor(show: Show): string {
  if (show.recommendation) return show.recommendation;
  const s = (show.stage || stageOf(show.alerts) || '').toLowerCase();
  if (s.includes('cdn')) return 'Shift traffic to CloudFront and open a case with the edge provider.';
  if (s.includes('srt')) return 'Watch the SRT path; fail over to the LiveU backup if loss stays above 0.5%.';
  if (s.includes('qoe')) return 'Cap the top ladder rung until rebuffering drops under 1%.';
  if (s.includes('encode')) return 'Check encoder CPU and audio levels on the program bus.';
  if (s.includes('origin')) return 'Check the packager; segments are arriving late.';
  return show.health === 'ok' ? 'No action needed. All stages healthy.' : 'Open Muse Live for the full chain.';
}

function normalize(raw: any): Status | null {
  if (!raw) return null;
  let v = raw;
  if (typeof v.value === 'string') { try { v = JSON.parse(v.value); } catch { return null; } }
  else if (v.value && typeof v.value === 'object') v = v.value;
  if (!Array.isArray(v.shows)) return null;
  const ts = num(v.ts) ?? (Date.parse(v.ts) || 0);
  const shows: Show[] = v.shows.map((s: any) => {
    const alerts: string[] = Array.isArray(s.alerts) ? s.alerts.map(String) : [];
    return {
      key: String(s.key ?? s.name),
      name: String(s.name ?? s.key),
      state: String(s.state ?? 'SCHEDULED').toUpperCase(),
      health: normHealth(s.health),
      viewers: num(s.viewers) ?? 0,
      latency: num(s.latency),
      alerts,
      stage: s.stage ? String(s.stage) : stageOf(alerts),
      recommendation: s.recommendation ? String(s.recommendation) : undefined,
    };
  });
  const openIncidents: Incident[] = (Array.isArray(v.openIncidents) ? v.openIncidents : []).map((i: any) => ({
    id: String(i.id), severity: String(i.severity ?? 'SEV-4'), title: String(i.title ?? ''), show: String(i.show ?? ''),
  }));
  let next: NextShow | null = null;
  if (v.next && v.next.name) {
    const t = num(v.next.startsAt) ?? Date.parse(v.next.startsAt);
    if (t) next = { name: String(v.next.name), startsAt: t, venue: v.next.venue ? String(v.next.venue) : undefined };
  }
  return { ts: ts || Date.now(), shows, openIncidents, next, demo: false };
}

/* ---------------- demo status (fallback) ---------------- */
let demoSeed = 1;
function wobble(base: number, pct: number) {
  demoSeed = (demoSeed * 16807) % 2147483647;
  return base * (1 + ((demoSeed / 2147483647) - 0.5) * pct);
}
function tomorrowAt(h: number) {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d.getTime();
}
/* Demo-only incident seed (presenter deep link ?incident=encoder2). Everything stays
   fictional per the demo-data rule; in-memory only, resets on reload. */
const resolvedDemoIncidents = new Set<string>();
export const DEMO_INCIDENT_ID = 'INC-2026-1101';
export function resolveDemoIncident(id: string): void {
  resolvedDemoIncidents.add(id);
}
export function demoStatus(incident?: string): Status {
  const cycle = (Date.now() / 1000) % 120; // CDN burst every two minutes, like the desktop simulation
  const cdnBad = cycle > 30 && cycle < 62;
  const seedEncoder2 = incident === 'encoder2' && !resolvedDemoIncidents.has(DEMO_INCIDENT_ID);
  const encoder2Healed = incident === 'encoder2' && resolvedDemoIncidents.has(DEMO_INCIDENT_ID);
  return {
    ts: Date.now(),
    demo: true,
    shows: [
      {
        key: 'museaitour', name: 'Muse AI World Tour 2026', state: 'LIVE', health: cdnBad ? 'warn' : 'ok',
        viewers: Math.round(wobble(1_240_000, 0.03)), latency: +wobble(4.6, 0.06).toFixed(1),
        alerts: cdnBad ? ['CDN 5xx 1.8% · cache hit 93.5% · TTFB 160 ms'] : [],
      },
      {
        key: 'igcreators', name: 'Instagram Creator Week', state: 'LIVE', health: 'ok',
        viewers: Math.round(wobble(615_000, 0.03)), latency: +wobble(15.8, 0.04).toFixed(1), alerts: [],
      },
      {
        key: 'museailaunch', name: 'Muse AI Launch Keynote', state: 'REHEARSAL', health: 'ok',
        viewers: Math.round(wobble(340, 0.1)), latency: +wobble(4.8, 0.05).toFixed(1), alerts: [],
      },
      ...(seedEncoder2
        ? [{
            key: 'mconnect26', name: 'Meta Connect 2026 Keynote', state: 'LIVE', health: 'crit' as Health,
            viewers: Math.round(wobble(882_000, 0.03)), latency: +wobble(5.1, 0.05).toFixed(1),
            alerts: ['Encoder 2 · black frame 45 s · backup path clean'],
          }]
        : []),
      ...(encoder2Healed
        ? [{
            key: 'mconnect26', name: 'Meta Connect 2026 Keynote', state: 'LIVE', health: 'ok' as Health,
            viewers: Math.round(wobble(882_000, 0.03)), latency: +wobble(5.1, 0.05).toFixed(1), alerts: [],
          }]
        : []),
    ].map((s) => ({ ...s, health: s.health as Health, stage: stageOf(s.alerts) })),
    openIncidents: [
      ...(seedEncoder2
        ? [{ id: DEMO_INCIDENT_ID, severity: 'SEV-2', title: 'Encoder 2 black frame — backup path clean, awaiting approval', show: 'Meta Connect 2026 Keynote' }]
        : []),
      { id: 'INC-2026-1017', severity: 'SEV-2', title: 'Akamai EU-West edge 5xx spikes. Traffic weighted to CloudFront.', show: 'Muse AI World Tour 2026' },
      { id: 'INC-2026-1009', severity: 'SEV-4', title: 'Stream test: LL-HLS latency 9 s vs 4 s target', show: 'WhatsApp Business Summit' },
      { id: 'INC-2026-1002', severity: 'SEV-4', title: 'Venue firewall blocks outbound UDP 5000 (SRT)', show: 'Orion AR Glasses Reveal' },
    ],
    next: { name: 'Muse AI Launch Keynote', startsAt: tomorrowAt(18), venue: 'Meta NYC · Studio M1' },
  };
}

export async function fetchStatus(): Promise<Status> {
  try {
    const r = await fetch('/api/kv/live-status', { credentials: 'include', cache: 'no-store' });
    if (r.ok) {
      const s = normalize(await r.json());
      if (s && Date.now() - s.ts < STALE_MS) {
        // No invented "next": when the desktop sends none, next stays null
        // and the glasses show it as unknown (BUG-17).
        return s;
      }
    }
  } catch { /* offline or not signed in: fall through to demo */ }
  return demoStatus();
}

export function fmtViewers(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return Math.round(n / 1e3) + 'K';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

export const onAir = (s: Status) => s.shows.filter((x) => x.state === 'LIVE' || x.state === 'REHEARSAL');
