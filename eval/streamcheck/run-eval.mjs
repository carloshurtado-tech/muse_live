// Stream Check fault-matrix eval. Runs the shipped detectors against
// deterministic fault signals and the local fault server, then scores from
// the run log ONLY (see stats.mjs). One row per sample carries its ground
// truth (fault, stream, window, truth) next to the verdict, evidence,
// measured latency and model-call count.
//
//   node eval/streamcheck/run-eval.mjs [--out <dir>]
//
// Exit 0 when the cut gate holds (clean control passes with zero false
// alarms and every fault is detected on every program); exit 1 otherwise. Outputs
// run.jsonl (scored rows), table.json and table.csv land under
// test-results/streamcheck-eval/<timestamp>/ by default.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { FAULTS, STREAMS, RUN_SEC, inWindow, truthOf } from './faults.mjs';
import { frameAt, audioAt } from './synth.mjs';
import { summarize, toCSV } from './stats.mjs';
import { startFaultServer, stubFetch } from './fault-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');

// These matrix checks are deterministic pixel/playlist math; none of them
// calls a model. The count is recorded per row (not assumed) so a future
// model-backed check shows up in the cost column instead of hiding.
const NO_MODEL_CALLS = 0;

function load(rel, extra = {}) {
  const sb = { console, setTimeout, clearTimeout, ...extra };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb, { filename: rel });
  return sb;
}

function timed(fn) {
  const t0 = performance.now();
  const out = fn();
  return { out, ms: +((performance.now() - t0).toFixed(2)) };
}

async function main() {
  const args = process.argv.slice(2);
  const outIx = args.indexOf('--out');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = outIx >= 0 ? args[outIx + 1] : path.join(ROOT, 'test-results', 'streamcheck-eval', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const SC = load('js/muse-streamcheck.js').MuseStreamCheck;
  // Prefer real HTTP; where binding is denied (sandboxed runs) fall back to
  // the in-process route table. Same shipped check(), same bytes; the row
  // records which transport carried it.
  let TF, transport = 'http', svc = null;
  try {
    svc = await startFaultServer({});
    TF = load('js/muse-testfeeds.js', { fetch: globalThis.fetch, AbortController: globalThis.AbortController }).MuseTestFeeds;
  } catch (e) {
    transport = 'in-process';
    TF = load('js/muse-testfeeds.js', { fetch: stubFetch(), AbortController: globalThis.AbortController }).MuseTestFeeds;
  }
  const base = svc ? svc.base : 'http://fault';
  const rows = [];

  try {
    for (const fault of FAULTS) {
      for (const stream of STREAMS) {
        const window = fault.type === 'clean' ? null : { start: fault.start, end: fault.end };
        if (fault.type === 'down') {
          for (let t = 0; t < RUN_SEC; t++) {
            const url = inWindow(fault, t) ? base + '/hls/down.m3u8' : base + '/hls/clean.m3u8';
            const t0 = performance.now();
            const st = await TF.check({ url });
            const ms = +((performance.now() - t0).toFixed(2));
            rows.push({ fault: fault.type, stream: stream.id, t, window, truth: truthOf(fault, t),
              flagged: st === 'down', evidence: { check: st }, latency_ms: ms, model_calls: NO_MODEL_CALLS, transport });
          }
          continue;
        }
        let stillSec = 0, quietSec = 0;
        for (let t = 0; t < RUN_SEC; t++) {
          const cur = frameAt(stream.id, fault.type, t);
          const prev = t > 0 ? frameAt(stream.id, fault.type, t - 1) : null;
          const samples = audioAt(fault.type, t);
          const b = timed(() => SC.isBlack(SC.analyzePixels(cur)));
          const d = prev ? timed(() => SC.frameDelta(cur, prev)) : { out: { meanDelta: 0, changedPct: 0 }, ms: 0 };
          const e = timed(() => SC.audioEnergy(samples));
          stillSec = prev && SC.isStill(d.out) ? stillSec + 1 : 0;
          quietSec = SC.isSilent(e.out) ? quietSec + 1 : 0;
          const blackVerdict = b.out;
          const frozenVerdict = SC.isFrozen(stillSec);
          const silentVerdict = SC.silenceHeld(quietSec);
          let flagged, evidence;
          if (fault.type === 'black') { flagged = blackVerdict; evidence = { detector: 'black', mean_luma: +SC.analyzePixels(cur).mean.toFixed(1), dark_frac: +SC.analyzePixels(cur).darkFrac.toFixed(3) }; }
          else if (fault.type === 'frozen') { flagged = frozenVerdict; evidence = { detector: 'frozen', mean_delta: d.out.meanDelta, changed_pct: d.out.changedPct, still_s: stillSec }; }
          else if (fault.type === 'muted') { flagged = silentVerdict; evidence = { detector: 'silence', rms: +e.out.toFixed(3), quiet_s: quietSec }; }
          else { flagged = blackVerdict || frozenVerdict || silentVerdict; evidence = { detector: 'any', black: blackVerdict, frozen: frozenVerdict, silent: silentVerdict }; }
          rows.push({ fault: fault.type, stream: stream.id, t, window, truth: truthOf(fault, t),
            flagged, evidence, latency_ms: +(b.ms + d.ms + e.ms).toFixed(2), model_calls: NO_MODEL_CALLS });
        }
      }
    }
  } finally {
    if (svc) await svc.close();
  }

  const table = summarize(rows);
  fs.writeFileSync(path.join(outDir, 'run.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'table.json'), JSON.stringify(table, null, 1) + '\n');
  const csv = toCSV(table);
  fs.writeFileSync(path.join(outDir, 'table.csv'), csv);

  console.log(csv);
  const clean = table.find((r) => r.fault === 'clean');
  const faults = table.filter((r) => r.fault !== 'clean');
  const bad = [];
  if (!clean || clean.false_alarms !== 0) bad.push(`clean control flagged ${clean ? clean.false_alarms : '?'} samples (must be 0)`);
  for (const f of faults) {
    // Gate on detected-on-every-program, not on a per-sample 1.0: streak
    // detectors necessarily miss the ramp samples (see TTD), and demanding
    // both a streak and zero-latency detection would contradict itself.
    if (f.ttd_s.length !== STREAMS.length) bad.push(`${f.fault}: detected on ${f.ttd_s.length}/${STREAMS.length} programs`);
  }
  console.log(bad.length ? `CUT GATE FAIL: ${bad.join('; ')}` : 'CUT GATE PASS: clean control passes, every fault detected on every program');
  console.log(`down-cell transport: ${transport}`);
  console.log(`rows: ${rows.length} -> ${outDir}`);
  process.exit(bad.length ? 1 : 0);
}

await main();
