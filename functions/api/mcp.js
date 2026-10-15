/**
 * Headless Muse Live MCP — discover / describe / dispatch_readonly / dispatch.
 * Auth: same CFP-Auth cookie as other /api routes (middleware).
 * Writes never mutate server state (Muse Live SoR is the browser). dispatch returns a Confirm action.
 */
const OPS = [
  { name: 'briefing.morning', kind: 'read', summary: 'Ranked morning briefing from posted live JSON', args: [] },
  { name: 'portfolio.at_risk', kind: 'read', summary: 'Shows under 90% or with missing fields', args: [] },
  { name: 'show.health', kind: 'read', summary: 'Health of one production', args: ['show'] },
  { name: 'show.prep', kind: 'read', summary: 'Call-prep pack for a production', args: ['show'] },
  { name: 'tx.conflicts', kind: 'read', summary: 'Transmission conflicts from live JSON', args: [] },
  { name: 'eng.open', kind: 'read', summary: 'Open ENG from live JSON', args: [] },
  { name: 'wiki.search', kind: 'read', summary: 'Wiki hits if wiki is in the posted snapshot', args: ['q'] },
  { name: 'show.open_tab', kind: 'write', summary: 'Open a production tab (Confirm in Muse Live)', args: ['show', 'tab'] },
  { name: 'dept.set_status', kind: 'write', summary: 'Set department status (Confirm in Muse Live)', args: ['show', 'dept', 'status'] },
  { name: 'techbook.export', kind: 'write', summary: 'Export techbook (Confirm in Muse Live)', args: ['show'] }
];

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function discover(q) {
  var s = String(q || '').toLowerCase();
  if (!s.trim()) return OPS;
  return OPS.filter(function (op) {
    return (op.name + ' ' + op.summary).toLowerCase().indexOf(s) >= 0;
  });
}

function describe(name) {
  for (var i = 0; i < OPS.length; i++) if (OPS[i].name === name) return OPS[i];
  return null;
}

function briefingFromMuse(muse) {
  if (!muse || typeof muse !== 'object') return { error: 'post a muse snapshot' };
  return muse.ops_skills || muse.briefing_now || { note: 'Client should POST live JSON from buildCharlieContext' };
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'GET') {
    return json({ ok: true, protocol: 'muse-mcp', tools: ['discover', 'describe', 'dispatch', 'dispatch_readonly'], ops: OPS });
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  var body = {};
  try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  var tool = String(body.tool || body.method || 'discover');
  if (tool === 'discover') return json({ ok: true, results: discover(body.q || body.query) });
  if (tool === 'describe') {
    var spec = describe(body.name || body.op);
    if (!spec) return json({ error: 'unknown op' }, 404);
    return json({ ok: true, op: spec });
  }
  if (tool === 'dispatch_readonly' || (tool === 'dispatch' && describe(body.name || body.op) && describe(body.name || body.op).kind === 'read')) {
    var n = body.name || body.op;
    var specR = describe(n);
    if (!specR) return json({ error: 'unknown op' }, 404);
    return json({ ok: true, result: briefingFromMuse(body.muse), op: specR });
  }
  if (tool === 'dispatch') {
    var nw = body.name || body.op;
    var specW = describe(nw);
    if (!specW) return json({ error: 'unknown op' }, 404);
    if (specW.kind === 'write') {
      return json({
        ok: true,
        needs_confirm: true,
        action: { op: nw, args: body.args || {} },
        note: 'Muse Live system of record is the browser. Apply via Confirm-to-act in Charlie or Omni.',
      });
    }
    return json({ ok: true, result: briefingFromMuse(body.muse) });
  }
  return json({ error: 'unknown tool' }, 400);
}
