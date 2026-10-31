// Feed-down rehearsal: drives the shipped playlist check (MuseTestFeeds.check)
// against the local fault server and confirms the wall's down path and its
// retry behave. Covers the playlist-fetch half of feed-down; the playback
// verify half (video element states) needs a browser and stays manual.
//
//   node eval/streamcheck/rehearse-feed-down.mjs
//
// Exit 0 when down reads down, clean reads up, and a flaky feed reads down
// once then up on retry. Every step logs ground truth next to the verdict.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { startFaultServer, stubFetch } from './fault-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');

function loadTestFeeds(fetchImpl) {
  const sb = { console, setTimeout, clearTimeout, fetch: fetchImpl, AbortController: globalThis.AbortController };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/muse-testfeeds.js'), 'utf8'), sb, { filename: 'js/muse-testfeeds.js' });
  return sb.MuseTestFeeds;
}

async function main() {
  // Prefer real HTTP; fall back to the in-process route table where binding
  // is denied. Same shipped check(), same bytes; the transport is printed.
  let fetchImpl = globalThis.fetch, transport = 'http', svc = null;
  try {
    svc = await startFaultServer({});
  } catch (e) {
    transport = 'in-process';
    fetchImpl = stubFetch();
  }
  const TF = loadTestFeeds(fetchImpl);
  const base = svc ? svc.base : 'http://fault';
  const steps = [];
  try {
    await fetchImpl(base + '/reset', { method: 'POST' });
    const down = await TF.check({ url: base + '/hls/down.m3u8' });
    steps.push({ step: 'down feed', ground_truth: 'down', verdict: down, pass: down === 'down' });
    const clean = await TF.check({ url: base + '/hls/clean.m3u8' });
    steps.push({ step: 'clean control', ground_truth: 'up', verdict: clean, pass: clean === 'up' });
    const first = await TF.check({ url: base + '/hls/flaky.m3u8' });
    steps.push({ step: 'flaky first read', ground_truth: 'down', verdict: first, pass: first === 'down' });
    const retry = await TF.check({ url: base + '/hls/flaky.m3u8' });
    steps.push({ step: 'flaky retry (wall Retry button path)', ground_truth: 'up', verdict: retry, pass: retry === 'up' });
  } finally {
    if (svc) await svc.close();
  }
  console.log(`transport: ${transport}`);
  for (const s of steps) console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.step}: truth=${s.ground_truth} verdict=${s.verdict}`);
  const ok = steps.every((s) => s.pass);
  console.log(ok ? 'FEED-DOWN REHEARSAL PASS' : 'FEED-DOWN REHEARSAL FAIL');
  process.exit(ok ? 0 : 1);
}

await main();
