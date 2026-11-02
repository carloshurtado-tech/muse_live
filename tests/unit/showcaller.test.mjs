import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrowserModule, ROOT } from './helpers.mjs';

// Day 2 eval set: 14 failure scenarios (single-module + cross-module). Each one
// asserts what Show Caller must detect AND what fix it must propose — nothing
// here executes anything. Scenario 14 runs against the real seed modules.
const productions = { demo: { name: 'Demo Show', tab: 'Demo' } };

// A show with one problem in every module: live stream alert, double-book,
// open SEV-2, open crew slot, unpacked gear. Nothing here writes anywhere.
function base() {
  return {
    productions,
    order: ['demo'],
    MuseSchedule: {
      byProduction: () => [{ id: 'b1', res: 'CRK 4' }, { id: 'b2', res: 'CRK 4' }],
      conflicts: () => [{ kind: 'double-book', res: 'CRK 4', ids: ['b1', 'b2'], text: 'CRK 4 booked twice Sunday 18:00' }],
      ruleFindings: () => [],
    },
    MuseStreaming: {
      stateOf: () => 'LIVE',
      health: () => ({ state: 'LIVE', health: 'Degraded', viewers: 1000, alerts: [{ text: 'SRT loss 2.1% on primary' }] }),
      anomalies: () => [],
    },
    MuseIncidents: {
      byProduction: () => [{ id: 'INC-1', title: 'Encoder dropped', severity: 'SEV-2', status: 'Open' }],
      brief: (i) => ({ id: i.id, title: i.title, severity: i.severity, status: i.status }),
    },
    museaiCrewFull: () => [{ pos: 'A1', name: 'Sam' }, { pos: 'A2', name: '' }],
    museaiCheckinsFull: () => ({ on_count: 1, total_named: 1 }),
    museaiPacklist: () => [{ name: 'Encoder', status: 'Packed' }, { name: 'Cable', status: 'Draft' }],
    buildMuseAiContext: () => JSON.stringify({ ops_backbone: { transmission_conflicts: ['Demo Show uplink clash'] } }),
  };
}
function makeWin(over = {}) {
  const g = base();
  for (const k of Object.keys(over)) {
    g[k] = over[k] === null ? undefined : (typeof over[k] === 'object' && typeof g[k] === 'object' && !Array.isArray(over[k]) && typeof over[k] !== 'function'
      ? Object.assign({}, g[k], over[k]) : over[k]);
  }
  return loadBrowserModule('js/muse-showcaller.js', g);
}
const healthyStreams = { stateOf: () => 'STANDBY', health: () => ({ state: 'STANDBY', health: 'Healthy', viewers: 0, alerts: [] }), anomalies: () => [] };
const quietSchedule = { byProduction: () => [], conflicts: () => [], ruleFindings: () => [] };
const quietIncidents = { byProduction: () => [] };
const fullCrew = () => [{ pos: 'A1', name: 'Sam' }, { pos: 'A2', name: 'Jo' }];
const packedGear = () => [{ name: 'Encoder', status: 'Packed' }];
const emptyOps = () => JSON.stringify({ ops_backbone: {} });

test('snapshot gathers every area without writing', () => {
  const s = makeWin().MuseShowCaller.snapshot('demo');
  assert.equal(s.show, 'Demo Show');
  for (const a of ['schedule', 'streams', 'incidents', 'crew', 'equipment', 'ops']) {
    assert.ok(!s[a].unavailable, a + ' unavailable: ' + (s[a].unavailable || ''));
  }
  assert.equal(makeWin().MuseShowCaller.readOnly, true);
});

test('brief ranks high first and cites a source per risk', () => {
  const b = makeWin().MuseShowCaller.brief('demo');
  assert.ok(b.risks.length >= 5, 'expected risks from every area, got ' + b.risks.length);
  const rank = { high: 0, med: 1, low: 2 };
  for (let i = 1; i < b.risks.length; i++) assert.ok(rank[b.risks[i - 1].level] <= rank[b.risks[i].level], 'not ranked');
  assert.equal(b.risks[0].level, 'high');
  for (const r of b.risks) assert.ok(r.sources && r.sources.length >= 1, 'risk without source: ' + r.text);
  assert.equal(b.unknown.length, 0, 'unexpected unknowns: ' + JSON.stringify(b.unknown));
  assert.ok(b.risks.some((r) => r.sources.join(' ').includes('INC-1')), 'incident source missing');
  assert.ok(b.risks.some((r) => r.sources.join(' ').includes('b1')), 'booking source missing');
});

test('missing modules become unknowns, never guesses', () => {
  const w = loadBrowserModule('js/muse-showcaller.js', { productions, order: ['demo'] });
  const b = w.MuseShowCaller.brief('demo');
  assert.equal(b.risks.length, 0);
  assert.equal(b.unknown.length, 6);
});

test('unknown show is an error, not an empty brief', () => {
  assert.ok(makeWin().MuseShowCaller.brief('nope').error);
});

// --- Day 2: detection → proposed fix (nothing executes) ---

function schedFixStubs(free) {
  return {
    byProduction: () => [{ id: 'b1' }, { id: 'b2' }],
    conflicts: () => [{ kind: 'double-booking', res: 'CRK 4', ids: ['b1', 'b2'], text: 'CRK 4 overlap Sunday 18:00' }],
    ruleFindings: () => [],
    get: (id) => id === 'b1'
      ? { id: 'b1', res: 'crk4', title: 'Keynote uplink', start: '2026-11-01T17:00', end: '2026-11-01T21:30', onAir: true }
      : { id: 'b2', res: 'crk4', title: 'Summit line-up test', start: '2026-11-01T18:00', end: '2026-11-01T19:00', onAir: false },
    types: () => [{ id: 'circuit', label: 'Circuits' }],
    resources: () => [{ id: 'crk4', name: 'CRK 4', type: 'circuit' }, { id: 'crk6', name: 'CRK 6', type: 'circuit' }],
    isFree: (id) => free.indexOf(id) >= 0,
  };
}

test('1. sched-reassign: double-book moves the non-on-air booking to a verified-free resource', () => {
  const w = makeWin({ MuseSchedule: schedFixStubs(['crk6']) });
  const p = w.MuseShowCaller.propose('demo');
  const mv = p.plans.filter((x) => x.action === 'reassign_booking');
  assert.equal(mv.length, 1, 'expected one reassign plan: ' + JSON.stringify(p.plans));
  assert.ok(/Summit line-up/.test(mv[0].detail.booking), 'wrong booking moved');
  assert.equal(mv[0].detail.to, 'CRK 6');
  assert.ok(mv[0].sources.join(' ').includes('b2'));
  assert.ok(!JSON.stringify(p.plans).includes('b1'), 'on-air booking touched');
});

test('2. sched-push-noalt: with nothing free, the fix pushes after the on-air booking', () => {
  const w = makeWin({ MuseSchedule: schedFixStubs([]) });
  const p = w.MuseShowCaller.propose('demo');
  const mv = p.plans.filter((x) => x.action === 'push_booking');
  assert.equal(mv.length, 1, 'expected one push plan: ' + JSON.stringify(p.plans));
  assert.ok(/Summit line-up/.test(mv[0].detail.booking));
  assert.ok(mv[0].detail.after, 'push has no after time');
});

test('3. sched-both-onair: two on-air bookings are uncovered, never auto-moved', () => {
  const s = schedFixStubs(['crk6']);
  const g = s.get;
  s.get = (id) => Object.assign({}, g(id), { onAir: true });
  const p = makeWin({ MuseSchedule: s }).MuseShowCaller.propose('demo');
  assert.equal(p.plans.filter((x) => /booking/.test(x.action)).length, 0, 'auto-moved an on-air booking');
  assert.ok(p.uncovered.some((u) => /on-air|on air/i.test(u.why)), 'no human-escalation note');
});

test('4. stream-apply: anomaly recommendation becomes an apply plan with its kind', () => {
  const w = makeWin({ MuseStreaming: {
    stateOf: () => 'LIVE',
    health: () => ({ state: 'LIVE', health: 'Degraded', viewers: 100, alerts: [] }),
    anomalies: () => [{ key: 'demo', stage: 'CDN', level: 'high', text: 'Edge 5xx 2%', recommendation: { kind: 'cdn_shift', label: 'Shift EU to CloudFront', args: { cloudfront: 80, akamai: 20 } } }],
  } });
  const p = w.MuseShowCaller.propose('demo');
  const fx = p.plans.filter((x) => x.action === 'apply_stream_fix');
  assert.equal(fx.length, 1);
  assert.equal(fx[0].detail.kind, 'cdn_shift');
});

test('5. stream-alert-no-rec: alert without a recommendation is uncovered for diagnosis', () => {
  const p = makeWin().MuseShowCaller.propose('demo');
  assert.ok(p.uncovered.some((u) => /diagnos/i.test(u.why)), 'alert silently planned or dropped: ' + JSON.stringify(p.uncovered));
});

test('6. incident-review: open incident yields a review plan citing similar precedent', () => {
  const w = makeWin({ MuseIncidents: {
    byProduction: () => [{ id: 'INC-9', title: 'Encoder dropped', severity: 'SEV-2', status: 'Open' }],
    brief: (i) => ({ id: i.id, title: i.title, severity: i.severity, status: i.status }),
    get: (id) => ({ id, title: 'Encoder dropped', severity: 'SEV-2', status: 'Open', actions: [{ text: 'Fix it', status: 'Open' }] }),
    similar: () => [{ id: 'INC-1', title: 'Encoder dropped before' }],
  } });
  const p = w.MuseShowCaller.propose('demo');
  const rv = p.plans.filter((x) => x.action === 'review_incident');
  assert.equal(rv.length, 1);
  assert.ok(rv[0].detail.similar.join(' ').includes('INC-1'), 'precedent missing');
});

test('7. crew-uncovered: open position needs a human pick, never an auto-assign', () => {
  const p = makeWin().MuseShowCaller.propose('demo');
  assert.equal(p.plans.filter((x) => x.area === 'crew').length, 0, 'auto-assigned crew');
  assert.ok(p.uncovered.some((u) => /crew|position/i.test(u.for)), 'open position not escalated');
});

test('8. equip-packcheck: unpacked gear becomes a pack-check task, not an execution', () => {
  const p = makeWin().MuseShowCaller.propose('demo');
  const pk = p.plans.filter((x) => x.action === 'pack_check');
  assert.equal(pk.length, 1);
  assert.equal(pk[0].detail.count, 1);
});

test('9. x-onair-all: live show with conflict + alert + incident plans each area', () => {
  const w = makeWin({ MuseSchedule: schedFixStubs(['crk6']) });
  const b = w.MuseShowCaller.brief('demo');
  assert.ok(b.risks.filter((r) => r.level === 'high').length >= 3, 'expected 3+ highs');
  const areas = new Set(w.MuseShowCaller.propose('demo').plans.map((x) => x.area));
  assert.ok(areas.has('schedule') && areas.has('incidents'), 'missing area plan: ' + [...areas]);
});

test('10. quiet: healthy show has no risks and no plans', () => {
  const w = makeWin({ MuseSchedule: quietSchedule, MuseStreaming: healthyStreams, MuseIncidents: quietIncidents,
    museaiCrewFull: fullCrew, museaiPacklist: packedGear, buildMuseAiContext: emptyOps });
  assert.equal(w.MuseShowCaller.brief('demo').risks.length, 0);
  const p = w.MuseShowCaller.propose('demo');
  assert.equal(p.plans.length, 0);
  assert.equal(p.uncovered.length, 0);
});

test('11. missing: no modules means no plans and preserved unknowns', () => {
  const w = loadBrowserModule('js/muse-showcaller.js', { productions, order: ['demo'] });
  const p = w.MuseShowCaller.propose('demo');
  assert.equal(p.plans.length, 0);
  assert.equal(p.uncovered.length, 0);
  assert.equal(w.MuseShowCaller.brief('demo').unknown.length, 6);
});

test('12. rule-uncovered: labor finding without booking ids escalates, not guesses', () => {
  const w = makeWin({ MuseSchedule: { byProduction: () => [], conflicts: () => [],
    ruleFindings: () => [{ kind: 'turnaround', res: 'Alex M', rule: 'crew-10h', text: 'Demo Show: Alex M has 8 h turnaround' }] } });
  const p = w.MuseShowCaller.propose('demo');
  assert.equal(p.plans.filter((x) => /Alex M|Labor rule/.test(x.for)).length, 0, 'guessed a labor fix');
  assert.ok(p.uncovered.some((u) => /Alex M/.test(u.for) && /booking/i.test(u.why)), 'labor finding not escalated');
});

test('13. tx-uncovered: transmission conflict stays human-decided', () => {
  const p = makeWin().MuseShowCaller.propose('demo');
  assert.equal(p.plans.filter((x) => x.area === 'ops').length, 0, 'auto-planned a transmission move');
  assert.ok(p.uncovered.some((u) => /transmission/i.test(u.for)), 'transmission risk not escalated');
});

test('15. approve executes the reassign and files the Slack send in Omni', async () => {
  const comms = [], saved = [];
  const w = makeWin({ MuseSchedule: Object.assign(schedFixStubs(['crk6']), { update: (id, patch) => { saved.push([id, patch]); } }),
    comms, saveComms: () => {},
    fetch: async (url) => ({ status: 200, json: async () => /slack/.test(url) ? { ok: true, ts: 'ts1', channel: 'C1', path: 'bot' } : { ok: false } }) });
  const SC = w.MuseShowCaller;
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'reassign_booking')[0];
  const a = SC.requestApproval(plan, 'demo');
  const r = SC.approve(a.id, { by: 'Cara', targets: { slack: 'C1' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(JSON.stringify(saved), JSON.stringify([['b2', { res: 'crk6' }]]));
  await new Promise((done) => setTimeout(done, 20)); // let the fire-and-forget notify land
  assert.equal(comms.length, 1);
  assert.equal(comms[0].channel, 'teams'); // canonical in-app Slack channel: 'slack' hid the message from every Slack surface
  assert.equal(comms[0].status, 'sent');
  assert.equal(comms[0].ext_id, 'ts1');
  assert.equal(comms[0].thread, 'showcaller-demo');
  assert.equal(comms[0].linkId, 'demo');
  assert.ok(comms[0].payload, 'no retry payload stored');
});

test('16. approve pushes with the proposed window', () => {
  const saved = [];
  const w = makeWin({ MuseSchedule: Object.assign(schedFixStubs([]), { update: (id, patch) => { saved.push([id, patch]); } }) });
  const SC = w.MuseShowCaller;
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'push_booking')[0];
  const r = SC.approve(SC.requestApproval(plan, 'demo').id, {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(saved[0][0], 'b2');
  assert.equal(saved[0][1].start, plan.detail.new_start);
  assert.equal(saved[0][1].end, plan.detail.new_end);
});

test('17. stale world refuses: changed booking and taken alternative never execute', () => {
  const saved = [];
  // booking moved since the proposal
  const moved = schedFixStubs(['crk6']);
  moved.get = (id) => ({ id, res: 'crk4', title: 'x', start: '2026-11-01T19:00', end: '2026-11-01T20:00', onAir: false });
  moved.update = (id, patch) => { saved.push([id, patch]); };
  const w1 = makeWin({ MuseSchedule: Object.assign(schedFixStubs(['crk6']), {}) });
  const plan = w1.MuseShowCaller.propose('demo').plans.filter((x) => x.action === 'reassign_booking')[0];
  const w2 = makeWin({ MuseSchedule: moved });
  const r1 = w2.MuseShowCaller.approve(w2.MuseShowCaller.requestApproval(plan, 'demo').id, {});
  assert.equal(r1.ok, false);
  assert.equal(r1.stale, true);
  // alternative taken since the proposal
  const taken = schedFixStubs([]);
  taken.update = (id, patch) => { saved.push([id, patch]); };
  const w3 = makeWin({ MuseSchedule: taken });
  const r2 = w3.MuseShowCaller.approve(w3.MuseShowCaller.requestApproval(plan, 'demo').id, {});
  assert.equal(r2.ok, false);
  assert.equal(saved.length, 0, 'executed despite stale state');
});

test('18. live stream fix needs explicit confirmation, then runs with the show key', () => {
  const applied = [];
  const streams = { stateOf: () => 'LIVE', health: () => ({ state: 'LIVE', alerts: [] }),
    anomalies: () => [{ key: 'demo', stage: 'CDN', text: 'Edge 5xx', recommendation: { kind: 'cdn_shift', label: 'Shift', args: { cloudfront: 80 } } }],
    apply: (r) => { applied.push(r); return { ok: true, text: 'shifted' }; } };
  const w = makeWin({ MuseSchedule: quietSchedule, MuseStreaming: streams });
  const SC = w.MuseShowCaller;
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'apply_stream_fix')[0];
  const id = SC.requestApproval(plan, 'demo').id;
  const r1 = SC.approve(id, {});
  assert.equal(r1.needsLiveConfirm, true);
  assert.equal(applied.length, 0);
  const r2 = SC.approve(id, { liveConfirmed: true });
  assert.equal(r2.ok, true);
  assert.equal(JSON.stringify(applied[0]), JSON.stringify({ kind: 'cdn_shift', args: { cloudfront: 80, key: 'demo' } }));
});

test('19. reject logs the reason and executes nothing', () => {
  let updated = 0;
  const w = makeWin({ MuseSchedule: Object.assign(schedFixStubs(['crk6']), { update: () => { updated++; } }) });
  const SC = w.MuseShowCaller;
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'reassign_booking')[0];
  const r = SC.reject(SC.requestApproval(plan, 'demo').id, 'holding for the director', 'Cara');
  assert.equal(r.ok, true);
  assert.equal(updated, 0);
  assert.equal(SC.pendingList().length, 0);
  const r2 = SC.approve(r.id, {});
  assert.equal(r2.ok, false, 'rejected approval executed');
});

test('20. dead notify channel never rolls back the fix; one-click retry recovers', async () => {
  const comms = [];
  let live = false;
  const w = makeWin({ MuseSchedule: Object.assign(schedFixStubs(['crk6']), { update: () => {} }),
    comms, saveComms: () => {},
    fetch: async () => { if (!live) throw new Error('down'); return { status: 200, json: async () => ({ ok: true, ts: 'ts9', channel: 'C1', path: 'bot' }) }; } });
  const SC = w.MuseShowCaller;
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'reassign_booking')[0];
  const a = SC.requestApproval(plan, 'demo');
  const r = SC.approve(a.id, { targets: { slack: 'C1' } });
  assert.equal(r.ok, true, 'execution rolled back by notify failure');
  await SC.notify(Object.assign({}, a, { by: 'Cara' }), r.result, { slack: 'C1' });
  assert.equal(comms[0].status, 'failed');
  assert.ok(comms[0].error, 'failure stored without the error');
  live = true;
  assert.equal((await SC.retry(comms[0].id)).ok, true);
  assert.equal(comms[0].status, 'sent');
  assert.equal(comms[0].ext_id, 'ts9');
});

test('21. gmail notify posts recipients/subject/body and files the gmail id', async () => {
  const comms = [], posts = [];
  const w = makeWin({ comms, saveComms: () => {},
    fetch: async (url, init) => { posts.push([url, JSON.parse(init.body)]); return { status: 200, json: async () => ({ ok: true, id: 'm1', threadId: 't1' }) }; } });
  const SC = w.MuseShowCaller;
  const out = await SC.notify({ show: 'demo', by: 'Cara' }, 'Moved it.', { mail: ['ops@example.com'] });
  assert.equal(out.mail.sent, true);
  assert.equal(posts[0][0], '/api/omni/mail');
  assert.deepEqual(posts[0][1].to, ['ops@example.com']);
  assert.equal(comms[0].channel, 'gmail');
  assert.equal(comms[0].ext_id, 'm1');
  assert.equal(comms[0].ext_thread, 't1');
  assert.equal(comms[0].thread, 'showcaller-demo');
});

test('22. pushTally republishes live status for the glasses', () => {
  const puts = [];
  const w = makeWin({ MuseStreaming: { liveStatus: () => ({ ts: 1 }), stateOf: () => 'LIVE' }, MuseSync: { put: (k, v) => { puts.push([k, v]); } } });
  assert.equal(w.MuseShowCaller.pushTally('demo').ok, true);
  assert.deepEqual(puts, [['live-status', { ts: 1 }]]);
  const w2 = makeWin({ MuseStreaming: null });
  assert.equal(w2.MuseShowCaller.pushTally('demo').ok, false);
});

test('23. approval card escapes hostile titles', () => {
  const w = makeWin({});
  const html = w.MuseShowCaller.cardHTML({ id: 'SC-1', show: 'demo', plan: { action: 'reassign_booking', detail: { booking: '"><script>x</script>', from: 'a', to: 'b' }, sources: ['booking b1'] } });
  assert.ok(!html.includes('<script>'), 'unescaped title in card');
  assert.ok(html.includes('role="dialog"'));
});

test('24. advisory approvals close the loop without module writes', () => {
  const w = makeWin({});
  const SC = w.MuseShowCaller;
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'review_incident')[0];
  const r = SC.approve(SC.requestApproval(plan, 'demo').id, { by: 'Cara' });
  assert.equal(r.ok, true);
  assert.equal(SC.pendingList().length, 0);
});

test('26. expired plans refuse without executing', () => {
  let updated = 0;
  const w = makeWin({ MuseSchedule: Object.assign(schedFixStubs(['crk6']), { update: () => { updated++; } }) });
  const SC = w.MuseShowCaller;
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'reassign_booking')[0];
  const a = SC.requestApproval(plan, 'demo', { exp: Date.now() - 1000 });
  const r = SC.approve(a.id, {});
  assert.equal(r.ok, false);
  assert.equal(r.expired, true);
  assert.equal(updated, 0, 'expired plan executed');
  assert.equal(SC.pendingList().length, 0);
});

test('27. unknown actions fail closed, never thrown', () => {
  const SC = makeWin({}).MuseShowCaller;
  const a = SC.requestApproval({ action: 'bogus', detail: {}, sources: [] }, 'demo');
  const r = SC.approve(a.id, {});
  assert.equal(r.ok, false);
  assert.ok(/Unknown action/.test(r.error));
});

test('28. non-JSON notify responses degrade to failed records, not crashes', async () => {
  const comms = [];
  const w = makeWin({ comms, saveComms: () => {},
    fetch: async () => ({ status: 200, json: async () => { throw new Error('not json'); } }) });
  const SC = w.MuseShowCaller;
  const out = await SC.notify({ show: 'demo', by: 'Cara' }, 'Moved it.', { slack: 'C1', mail: ['ops@example.com'] });
  assert.equal(out.slack.sent, false);
  assert.equal(out.mail.sent, false);
  assert.equal(comms.filter((c) => c.status === 'failed').length, 2);
  assert.ok(comms.every((c) => c.error), 'failures stored without errors');
});

test('14. headline: real seed CRK-4 contention moves the non-on-air booking', () => {
  const w = loadBrowserModule('js/muse-showcaller.js', {
    productions: {
      museailaunch: { name: 'Muse AI Launch' }, whatsapp: { name: 'WhatsApp Summit' },
      museaitour: { name: 'Muse AI Tour' }, raybangen3: { name: 'Ray-Ban' }, orion: { name: 'Orion' },
    },
    order: ['museailaunch', 'whatsapp', 'museaitour', 'raybangen3', 'orion'],
    setTimeout: () => 0, // neuter deferred boots; seeds still build on demand
  });
  for (const f of ['js/muse-schedule.js', 'js/muse-incidents.js', 'js/muse-streaming.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), w, { filename: f });
  }
  const SC = w.MuseShowCaller;
  const risks = SC.brief('museailaunch').risks;
  assert.ok(risks.some((r) => r.level === 'high' && r.area === 'schedule' && /CRK 4/.test(r.text)),
    'CRK-4 risk missing: ' + JSON.stringify(risks.map((r) => r.text)));
  const plans = SC.propose('museailaunch').plans.filter((x) => /booking/.test(x.action));
  assert.ok(plans.length >= 1, 'no schedule plan proposed');
  assert.ok(!plans.some((x) => /Primary uplink/.test(x.detail.booking)), 'touched the on-air booking');
  assert.ok(plans.some((x) => /WhatsApp/.test(x.detail.booking)), 'fix moves the wrong booking: ' + JSON.stringify(plans));
});

test('25. gate: approve moves the real seed booking end to end', () => {
  const w = loadBrowserModule('js/muse-showcaller.js', {
    productions: {
      museailaunch: { name: 'Muse AI Launch' }, whatsapp: { name: 'WhatsApp Summit' },
      museaitour: { name: 'Muse AI Tour' }, raybangen3: { name: 'Ray-Ban' }, orion: { name: 'Orion' },
    },
    order: ['museailaunch', 'whatsapp', 'museaitour', 'raybangen3', 'orion'],
    setTimeout: () => 0,
  });
  for (const f of ['js/muse-schedule.js', 'js/muse-incidents.js', 'js/muse-streaming.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), w, { filename: f });
  }
  const SC = w.MuseShowCaller, S = w.MuseSchedule;
  const plan = SC.propose('museailaunch').plans.filter((x) => /booking/.test(x.action))[0];
  assert.ok(plan, 'no booking plan');
  const r = SC.approve(SC.requestApproval(plan, 'museailaunch').id, { by: 'gate' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const after = S.get(plan.detail.booking_id);
  if (plan.action === 'reassign_booking') assert.equal(after.res, plan.detail.to_id, 'booking did not move');
  else assert.equal(String(after.start), String(plan.detail.new_start), 'booking was not pushed');
  // approving twice is an error, not a double execution
  assert.equal(SC.approve(r.id, {}).ok, false);
});

test('30. BUG-04: approval card makes no Spark/citation claim and approve without targets sends nothing', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/muse-showcaller.js'), 'utf8');
  assert.doesNotMatch(src, /Muse Spark|citation-checked|Spark reasons/i, 'showcaller UI must not claim model reasoning it never calls');
  const comms = [], saved = [];
  const w = makeWin({ MuseSchedule: Object.assign(schedFixStubs(['crk6']), { update: (id, patch) => { saved.push([id, patch]); } }),
    comms, saveComms: () => {}, fetch: async () => ({ status: 200, json: async () => ({ ok: true, ts: 'ts1' }) }) });
  const SC = w.MuseShowCaller;
  assert.doesNotMatch(SC.cardHTML({ id: 'SC-x', show: 'demo', plan: { action: 'reassign_booking', detail: { booking: 'B', from: 'a', to: 'b' }, sources: ['booking b1'] } }), /Spark|citation/i);
  const plan = SC.propose('demo').plans.filter((x) => x.action === 'reassign_booking')[0];
  const r = SC.approve(SC.requestApproval(plan, 'demo').id, { by: 'Cara' });
  assert.equal(r.ok, true);
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(comms.length, 0, 'approve without targets must stay silent (no wired Omni send claimed)');
});

test('31. BUG-06: errored Stream Check is unknown in the brief, never clean', () => {
  const w = makeWin({ MuseStreamCheck: { latest: () => ({ key: 'demo', slot: 'wall:demo', ts: new Date().toISOString(),
    results: [{ check: 'lower-third', pass: false, error: 'HTTP 429' }], flags: [], unavailable: [{ check: 'lower-third', error: 'HTTP 429' }] }) } });
  const b = w.MuseShowCaller.brief('demo');
  assert.ok(b.unknown.some((u) => /streamcheck/i.test(u)), 'errored check must surface as unknown: ' + JSON.stringify(b.unknown));
  assert.doesNotMatch(b.grounding.note, /all six ops areas readable/, 'brief must not claim readable while Stream Check is blind');
});

test('29. approved test-feed fixes re-check exactly that feed', () => {
  const retried = [];
  const win = makeWin({
    MuseTestFeeds: {
      retry: (id) => retried.push(id),
      status: (id) => ({ feeds: id === 'live' ? [{ id: 'live' }] : [] }),
    },
  });
  const SC = win.MuseShowCaller;
  const plan = { area: 'streams', for: 'Test Live: stall storm — 3 playback stalls in the last minute',
    action: 'retry_feed', detail: { feed: 'live', label: 'Test Live', kind: 'stall-storm', fix: 'Re-check the feed and remount its tile' },
    sources: ['test feed · live', 'player telemetry · stall-storm'] };
  const a = SC.requestApproval(plan, 'testfeed:live', {});
  assert.match(SC.cardHTML(a), /Re-check test feed &quot;Test Live&quot;/);
  const r = SC.approve(a.id, { by: 'qa' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(retried, ['live'], 'only the degraded tile is touched');
  const gone = SC.requestApproval(Object.assign({}, plan, { detail: { feed: 'gone' } }), 'testfeed:gone', {});
  assert.equal(SC.approve(gone.id, {}).ok, false, 'a feed that no longer exists refuses');
});
