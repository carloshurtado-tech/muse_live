import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

function win(extra = {}) {
  return loadBrowserModule('js/muse-launch.js', extra);
}

test('poll: one NO-GO holds, missing votes stay pending', () => {
  const L = win().MuseLaunch;
  let p = L.poll('s');
  assert.equal(p.result, 'PENDING');
  L.DISCIPLINES.forEach((d) => L.setVote('s', d, 'GO'));
  assert.equal(L.poll('s').result, 'GO');
  L.setVote('s', 'rf', 'NO-GO', 'Intermod on channel 4');
  p = L.poll('s');
  assert.equal(p.result, 'HOLD');
  assert.deepEqual(JSON.parse(JSON.stringify(p.holdBy)), ['rf']);
});

test('votes are validated; constrained GO names its constraint', () => {
  const L = win().MuseLaunch;
  assert.equal(L.setVote('s', 'bogus', 'GO').ok, false);
  assert.equal(L.setVote('s', 'video', 'MAYBE').ok, false);
  assert.equal(L.setVote('s', 'video', 'GO-WITH-CONSTRAINT').ok, false);
  assert.equal(L.setVote('s', 'video', 'GO-WITH-CONSTRAINT', 'Single feed, genny on standby').ok, true);
});

test('weather hold casts a system safety NO-GO and clears itself', () => {
  const L = win().MuseLaunch;
  L.DISCIPLINES.forEach((d) => L.setVote('s', d, 'GO'));
  L.weatherHold('s', true);
  const p = L.poll('s');
  assert.equal(p.result, 'HOLD');
  assert.deepEqual(JSON.parse(JSON.stringify(p.holdBy)), ['safety']);
  L.weatherHold('s', false);
  assert.equal(L.poll('s').result, 'GO');
});

test('countdown stops the clock during holds and resumes cleanly', () => {
  const L = win().MuseLaunch;
  assert.equal(L.countdown('s').state, 'NO-T0');
  // Synthetic time before any hold exists.
  L.setT0('s', 2000000);
  const c0 = L.countdown('s', 1000000);
  assert.equal(c0.state, 'COUNTING');
  assert.equal(c0.remaining, 1000000);
  // Real clock once holds are involved: during a hold, remaining is frozen.
  L.setT0('s', Date.now() + 120000);
  L.hold('s', 'Talent not on mark');
  const h1 = L.countdown('s');
  assert.equal(h1.state, 'HOLD');
  assert.equal(L.countdown('s').remaining, h1.remaining, 'clock must not run during the hold');
  L.release('s');
  const r = L.countdown('s');
  assert.equal(r.state, 'COUNTING');
  assert.ok(r.remaining <= h1.remaining, 'only unheld time counts down');
});

test('hold refuses a second hold; release refuses when none open', () => {
  const L = win().MuseLaunch;
  assert.equal(L.release('s').ok, false);
  assert.equal(L.hold('s', 'a').ok, true);
  assert.equal(L.hold('s', 'b').ok, false);
  assert.equal(L.release('s').ok, true);
});

test('flight rules map every actionable Show Caller action', () => {
  const L = win().MuseLaunch;
  for (const a of ['failover_backup', 'reassign_booking', 'raise_srt_latency', 'cdn_shift', 'escalate_transmission', 'review_incident', 'check_gear', 'contact_vendor', 'streamcheck_review', 'action_stream_fix']) {
    assert.ok(L.ruleFor(a), 'no flight rule for ' + a);
  }
  assert.equal(L.ruleFor('nope'), null);
});

test('critical path finds the longest open chain; andon files a flag; punch list flags orphans', () => {
  const T = { tasks: [], n: 0 };
  T.add = (key, f) => {
    const id = 't' + (++T.n);
    T.tasks.push({ id, key, title: String(f.title || ''), status: 'open', deps: (f.deps || []).filter((d) => T.tasks.some((t) => t.id === d)), owner: f.owner || '', due: f.due || '', notes: f.notes || '' });
    return { ok: true, id };
  };
  T.list = (key) => T.tasks.filter((t) => t.key === key);
  const L2 = loadBrowserModule('js/muse-launch.js', { MuseTasks: T }).MuseLaunch;
  const a = T.add('s', { title: 'Book uplink', owner: 'Sam' }).id;
  const b = T.add('s', { title: 'Encoder test', owner: 'Sam', deps: [a] }).id;
  T.add('s', { title: 'Catering confirm', owner: 'Maya' });
  const cp = L2.criticalPath('s');
  assert.deepEqual(JSON.parse(JSON.stringify(cp.chain)), [a, b]);
  const r = L2.andon('s', 'Smoke backstage');
  assert.equal(r.ok, true);
  assert.equal(L2.andon('s', '').ok, false);
  const pl = L2.punchList('s');
  assert.ok(pl.open.length >= 4);
  assert.ok(pl.orphans.some((t) => t.id === r.id), 'ownerless Andon flag must be an orphan');
});

test('BUG-43: every poll row names its owner (voter, system, or Unassigned)', () => {
  const L = loadBrowserModule('js/muse-launch.js', { permUser: () => 'Sam Reyes' }).MuseLaunch;
  const fresh = L.poll('s');
  assert.ok(fresh.votes.every((v) => v.owner === 'Unassigned'), 'pending checks must still name an owner slot: ' + JSON.stringify(fresh.votes));
  L.setVote('s', 'video', 'GO');
  const p = L.poll('s');
  assert.equal(p.votes.find((v) => v.discipline === 'video').owner, 'Sam Reyes', 'a cast vote must display who cast it');
  L.weatherHold('s', true);
  assert.equal(L.poll('s').votes.find((v) => v.discipline === 'safety').owner, 'system', 'a system hold must display as system-owned');
});

test('setCriteria guards blanks and unknown disciplines', () => {
  const L = win().MuseLaunch;
  assert.equal(L.setCriteria('s', 'bogus', 'x').ok, false);
  assert.equal(L.setCriteria('s', 'video', '').ok, false);
  assert.equal(L.setCriteria('s', 'video', 'All chains tested.').ok, true);
  assert.equal(L.poll('s').votes.find((v) => v.discipline === 'video').criteria, 'All chains tested.');
});
