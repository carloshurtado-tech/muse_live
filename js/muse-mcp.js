/* Headless Muse Live — discover / describe / dispatch. MuseAi-branded. Writes Confirm-to-act. */
(function (root) {
  'use strict';
  var OPS = [
    { name: 'briefing.morning', kind: 'read', summary: 'Ranked morning briefing from live portfolio', args: [] },
    { name: 'portfolio.at_risk', kind: 'read', summary: 'Shows under 90% or with missing fields', args: [] },
    { name: 'show.health', kind: 'read', summary: 'Health of one production', args: ['show'] },
    { name: 'show.prep', kind: 'read', summary: 'Call-prep pack for a production', args: ['show'] },
    { name: 'crew.open_seats', kind: 'read', summary: 'OPEN crew seats', args: ['show'] },
    { name: 'tx.conflicts', kind: 'read', summary: 'Transmission booking conflicts', args: [] },
    { name: 'eng.open', kind: 'read', summary: 'ENG requests not complete', args: [] },
    { name: 'wiki.search', kind: 'read', summary: 'Wiki knowledge hits', args: ['q'] },
    { name: 'show.open_tab', kind: 'write', summary: 'Open a production tab', args: ['show', 'tab'] },
    { name: 'dept.set_status', kind: 'write', summary: 'Set a department status (Confirm)', args: ['show', 'dept', 'status'] },
    { name: 'techbook.export', kind: 'write', summary: 'Export live techbook PDF (Confirm)', args: ['show'] }
  ];

  function discover(q) {
    var s = String(q || '').toLowerCase();
    if (!s.trim()) return OPS.slice();
    return OPS.filter(function (op) {
      return (op.name + ' ' + op.summary).toLowerCase().indexOf(s) >= 0;
    }).sort(function (a, b) {
      return (a.name.indexOf(s) === 0 ? -1 : 0) - (b.name.indexOf(s) === 0 ? -1 : 0);
    });
  }
  function describe(name) {
    for (var i = 0; i < OPS.length; i++) if (OPS[i].name === name) return OPS[i];
    return null;
  }
  function resolveShow(args) {
    var q = (args && (args.show || args.q || args.key)) || '';
    if (typeof findProd === 'function') {
      var k = findProd(String(q));
      if (k) return k;
    }
    if (q && typeof productions !== 'undefined' && productions[q]) return q;
    if (typeof museaiFocusKey === 'function') return museaiFocusKey();
    return (typeof order !== 'undefined' && order[0]) || null;
  }
  function dispatchReadonly(name, args) {
    var skills = typeof museOpsSkills === 'function' ? museOpsSkills(resolveShow(args)) : {};
    if (name === 'briefing.morning' || name === 'portfolio.at_risk') return skills.briefing_now || skills;
    if (name === 'tx.conflicts') return (skills.briefing_now && skills.briefing_now.tx_conflicts) || ['none'];
    if (name === 'eng.open') return (skills.briefing_now && skills.briefing_now.eng_open) || [];
    if (name === 'show.health' || name === 'show.prep') {
      var key = resolveShow(args);
      var p = (typeof productions !== 'undefined' && key) ? productions[key] : null;
      if (!p) return { error: 'unknown show' };
      var pct = typeof computePct === 'function' ? computePct(p) : 0;
      var c = typeof countStatus === 'function' ? countStatus(p) : {};
      return { show: p.name, key: key, pct: pct, missing: c.missing || 0, depts: (p.dept || []).map(function (d) { return d[0] + '=' + d[1]; }) };
    }
    if (name === 'wiki.search' && typeof MuseKB !== 'undefined' && MuseKB.chunksForMuseAi) {
      return MuseKB.chunksForMuseAi(String((args && args.q) || ''), 8).map(function (d) {
        return { title: d.title, slug: d.slug, body: String(d.body || '').slice(0, 400) };
      });
    }
    if (name === 'crew.open_seats') return { note: 'Ask Muse: Who is open on crew?' };
    return { error: 'unknown or write-only op', name: name };
  }
  function dispatch(name, args) {
    var spec = describe(name);
    if (!spec) return { ok: false, error: 'unknown op' };
    if (spec.kind === 'read') return { ok: true, result: dispatchReadonly(name, args) };
    var key = resolveShow(args);
    if (name === 'dept.set_status') {
      return { ok: true, needs_confirm: true, action: { kind: 'deptStatus', key: key, dept: args.dept, status: args.status } };
    }
    if (name === 'show.open_tab') {
      return { ok: true, needs_confirm: true, action: { kind: 'nav', key: key, tab: args.tab || 'overview' } };
    }
    if (name === 'techbook.export') {
      return { ok: true, needs_confirm: true, action: { kind: 'techbook', key: key } };
    }
    return { ok: false, error: 'unhandled' };
  }

  root.MuseMCP = {
    ops: OPS,
    discover: discover,
    describe: describe,
    dispatch: dispatch,
    dispatchReadonly: dispatchReadonly
  };
})(typeof window !== 'undefined' ? window : this);
