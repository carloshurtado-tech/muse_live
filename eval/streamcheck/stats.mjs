// Eval math over run rows ONLY. A row is one scored sample:
// { fault, stream, t, window: {start,end}|null, truth: 'fault'|'clean',
//   flagged: bool, latency_ms, model_calls }.
// Rates and time-to-detect are derived from these rows; nothing here may
// guess, smooth or hard-code an outcome. A rate over zero samples is null,
// never zero, so an empty cell cannot masquerade as a measured miss.
export function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return null;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length))];
}

function rate(num, den) {
  return den ? +(num / den).toFixed(3) : null;
}

export function summarize(rows) {
  const byFault = {};
  for (const r of rows) {
    const f = byFault[r.fault] || (byFault[r.fault] = { rows: [], streams: {} });
    f.rows.push(r);
    (f.streams[r.stream] || (f.streams[r.stream] = [])).push(r);
  }
  const table = [];
  for (const fault of Object.keys(byFault).sort()) {
    const f = byFault[fault];
    const faultRows = f.rows.filter((r) => r.truth === 'fault');
    const cleanRows = f.rows.filter((r) => r.truth === 'clean');
    const flaggedFault = faultRows.filter((r) => r.flagged).length;
    const flaggedClean = cleanRows.filter((r) => r.flagged).length;
    const ttds = [];
    for (const stream of Object.keys(f.streams).sort()) {
      const rs = f.streams[stream].slice().sort((a, b) => a.t - b.t);
      const start = rs.find((r) => r.window) ? rs.find((r) => r.window).window.start : null;
      if (start === null) continue;
      const first = rs.find((r) => r.flagged && r.t >= start);
      if (first) ttds.push(first.t - start);
    }
    ttds.sort((a, b) => a - b);
    const lat = f.rows.map((r) => r.latency_ms).filter((v) => typeof v === 'number');
    table.push({
      fault,
      streams: Object.keys(f.streams).sort().join('+'),
      samples: f.rows.length,
      fault_samples: faultRows.length,
      detected: flaggedFault,
      detection_rate: fault === 'clean' ? null : rate(flaggedFault, faultRows.length),
      clean_samples: cleanRows.length,
      false_alarms: flaggedClean,
      false_alarm_rate: rate(flaggedClean, cleanRows.length),
      ttd_s: ttds,
      ttd_p50_s: fault === 'clean' ? null : quantile(ttds, 0.5),
      ttd_p90_s: fault === 'clean' ? null : quantile(ttds, 0.9),
      mean_latency_ms: lat.length ? +(lat.reduce((s, v) => s + v, 0) / lat.length).toFixed(1) : null,
      model_calls: f.rows.reduce((s, r) => s + (r.model_calls || 0), 0),
    });
  }
  return table;
}

const COLS = ['fault', 'streams', 'samples', 'fault_samples', 'detected', 'detection_rate',
  'clean_samples', 'false_alarms', 'false_alarm_rate', 'ttd_p50_s', 'ttd_p90_s',
  'mean_latency_ms', 'model_calls'];

export function toCSV(table) {
  const cell = (v) => (v === null || v === undefined ? '' : String(v));
  return [COLS.join(','), ...table.map((r) => COLS.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
