import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

function win(extra = {}) {
  return loadBrowserModule('js/muse-tasks.js', extra);
}

test('tasks validate, clean unknown deps, and refuse finishing blocked work', () => {
  const T = win().MuseTasks;
  assert.equal(T.add('', { title: 'x' }).ok, false);
  assert.equal(T.add('s', {}).ok, false);
  const a = T.add('s', { title: 'Book uplink', owner: 'Sam' });
  const b = T.add('s', { title: 'Encoder test', deps: [a.id, 'ghost'] });
  assert.equal(a.ok && b.ok, true);
  const rec = T.list('s').find((t) => t.id === b.id);
  assert.deepEqual(JSON.parse(JSON.stringify(rec.deps)), [a.id], 'unknown dep survived');
  assert.equal(T.update('s', b.id, { status: 'done' }).ok, false, 'blocked task finished');
  assert.equal(T.update('s', b.id, { status: 'bogus' }).ok, false);
  assert.equal(T.update('s', a.id, { status: 'done' }).ok, true);
  assert.equal(T.update('s', b.id, { status: 'done' }).ok, true);
  assert.deepEqual(T.blocked('s').length, 0);
  assert.deepEqual(T.ready('s').length, 0);
});

test('blocked, ready, overdue, and byOwner read the chain, not stored status', () => {
  const T = win().MuseTasks;
  const a = T.add('s', { title: 'A' });
  T.add('s', { title: 'B', deps: [a.id] });
  T.add('s', { title: 'C', owner: 'Maya', due: '2001-01-01' });
  assert.equal(T.blocked('s').length, 1);
  assert.equal(T.blocked('s')[0].title, 'B');
  assert.deepEqual(JSON.parse(JSON.stringify(T.ready('s').map(function (t) { return t.title; }).sort())), ['A', 'C'], 'blocked task listed as ready, or free task missed');
  assert.equal(T.overdue('s').length, 1);
  assert.deepEqual(Object.keys(T.byOwner('s')).sort(), ['Maya', 'unassigned']);
  assert.equal(T.remove('s', a.id).ok, true);
  assert.deepEqual(T.blocked('s').length, 0, 'removed dep still blocks');
  assert.equal(T.remove('s', 'nope').ok, false);
});

test('done-blocked guard uses live state even when the chain moves', () => {
  const T = win().MuseTasks;
  const a = T.add('s', { title: 'A' });
  const b = T.add('s', { title: 'B', deps: [a.id] });
  T.update('s', a.id, { status: 'done' });
  T.update('s', a.id, { status: 'open' });
  assert.equal(T.update('s', b.id, { status: 'done' }).ok, false, 'reopened dep did not re-block');
});

test('critical automations hold for approval; routine ones run and log', () => {
  const w = win();
  const T = w.MuseTasks;
  assert.equal(T.addRule({}).ok, false);
  assert.equal(T.addRule({ on: 'x', action: 'nuke' }).ok, false);
  const r1 = T.addRule({ on: 'incident.opened', show: '*', action: 'create_task', params: { title: 'Assess' } });
  const r2 = T.addRule({ on: 'task.done', show: '*', action: 'create_task', params: { title: 'Next' }, requireApproval: false });
  assert.equal(r1.ok && r2.ok, true);
  const held = T.runAutomations({ type: 'incident.opened', show: 's', live: true });
  assert.equal(held.length, 1);
  assert.equal(held[0].held, true, 'critical rule executed silently');
  assert.equal(T.pending().length, 1);
  assert.equal(T.list('s').length, 0, 'held action created a task anyway');
  const ap = T.approvePending(held[0].pending, 'Carlos');
  assert.deepEqual(JSON.parse(JSON.stringify(ap)), { ok: true, executed: true });
  assert.equal(T.list('s').length, 1);
  const ran = T.runAutomations({ type: 'task.done', show: 's', task: { title: 'Encoder test' } });
  assert.equal(ran[0].held, false, 'routine rule held for approval');
  assert.equal(T.rejectPending('nope').ok, false);
  assert.equal(T.removeRule(r1.id).ok, true);
  assert.equal(T.removeRule(r1.id).ok, false);
});

test('rule matching scopes by show and title', () => {
  const T = win().MuseTasks;
  T.addRule({ on: 'task.done', show: 's1', action: 'flag', params: { title: 'Check' }, requireApproval: false });
  const hit = T.runAutomations({ type: 'task.done', show: 's1', task: { title: 'Encoder test done' } });
  assert.equal(hit.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(T.runAutomations({ type: 'task.done', show: 's2', task: { title: 'Encoder test' } }))), [], 'show scope ignored');
  const rUplink = T.addRule({ on: 'task.done', show: '*', action: 'flag', params: { title: 'X' }, match: 'uplink', requireApproval: false });
  const out = T.runAutomations({ type: 'task.done', show: 's1', task: { title: 'Encoder test' } });
  assert.equal(out.length, 1, 'unmatched rule fired or matched rule missed');
  assert.notEqual(out[0].rule, rUplink.id);
});

test('Show Caller brief surfaces blocked chains, never invents tasks', () => {
  const g = {
    productions: { demo: { name: 'Demo Show', tab: 'Demo' } }, order: ['demo'],
    MuseSchedule: { byProduction: () => [], conflicts: () => [], ruleFindings: () => [] },
    MuseStreaming: { stateOf: () => 'STANDBY', health: () => ({ alerts: [] }), anomalies: () => [] },
    MuseIncidents: { byProduction: () => [] },
    museaiCrewFull: () => [{ pos: 'A1', name: 'Sam' }],
    museaiPacklist: () => [],
    buildMuseAiContext: () => JSON.stringify({ ops_backbone: {} }),
  };
  const tw = loadBrowserModule('js/muse-tasks.js', g);
  const a = tw.MuseTasks.add('demo', { title: 'Uplink booked' });
  tw.MuseTasks.add('demo', { title: 'Line check', deps: [a.id] });
  const sw = loadBrowserModule('js/muse-showcaller.js', { ...g, MuseTasks: tw.MuseTasks, localStorage: tw.localStorage });
  const b = sw.MuseShowCaller.brief('demo');
  const risks = b.risks.filter((r) => r.area === 'tasks');
  assert.equal(risks.length, 1);
  assert.ok(risks[0].text.includes('Line check') && risks[0].sources[0].includes('Demo Show'));
});
