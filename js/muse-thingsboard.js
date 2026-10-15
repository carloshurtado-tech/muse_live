/**
 * Muse Live — ThingsBoard Truck Telemetry (demo + plug-and-play ingest)
 * ES5-friendly IIFE. Multiple trucks per production. Host: productions, esc.
 * Attaches window.MuseThingsBoard / window.MuseTB
 */
(function (global) {
  'use strict';

  var HISTORY_CAP = 40;
  var TICK_MS = 1500;
  var MAJOR = { orion: 1, museaitour: 1, raybangen3: 1 };
  var SENSOR_KEYS = ['tempC', 'vibrationMmS', 'voltageV', 'networkMbps', 'humidityPct', 'cpuLoad', 'upsLoadPct'];
  var HIST_KEYS = ['tempC', 'vibrationMmS', 'voltageV', 'networkMbps', 'humidityPct', 'cpuLoad', 'upsLoadPct'];

  var _loopId = null;
  var _activeKey = null;
  var _selectedByKey = {};
  var _visBound = false;

  function esc(s) {
    if (typeof global.esc === 'function') return global.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  function getP(key) {
    try {
      var prods = global.productions;
      return prods && prods[key] ? prods[key] : null;
    } catch (e) {
      return null;
    }
  }

  function emptyHistory() {
    return { tempC: [], vibrationMmS: [], voltageV: [], networkMbps: [], humidityPct: [], cpuLoad: [], upsLoadPct: [] };
  }

  function emptySensors(bias) {
    bias = bias || {};
    return {
      tempC: round1(bias.tempC != null ? bias.tempC : rnd(22, 28)),
      vibrationMmS: round2(bias.vibrationMmS != null ? bias.vibrationMmS : rnd(0.4, 1.2)),
      voltageV: round1(bias.voltageV != null ? bias.voltageV : rnd(118, 122)),
      networkMbps: round1(bias.networkMbps != null ? bias.networkMbps : rnd(180, 420)),
      humidityPct: round1(bias.humidityPct != null ? bias.humidityPct : rnd(35, 55)),
      cpuLoad: round1(bias.cpuLoad != null ? bias.cpuLoad : rnd(28, 55)),
      upsLoadPct: round1(bias.upsLoadPct != null ? bias.upsLoadPct : rnd(22, 48))
    };
  }

  function emptyRule() {
    return {
      healthScore: 88,
      riskLabel: 'Nominal',
      failureMode: 'None indicated',
      confidence: 0.82
    };
  }
  function emptyMl() {
    return emptyRule();
  }

  function makeTruck(id, name, bias, status) {
    var sensors = emptySensors(bias);
    var hist = emptyHistory();
    var i;
    for (i = 0; i < 12; i++) {
      HIST_KEYS.forEach(function (k) {
        hist[k].push(sensors[k]);
      });
    }
    return {
      id: id,
      name: name,
      thingsboardDeviceId: '',
      status: status || 'online',
      sensors: sensors,
      history: hist,
      ml: emptyMl()
    };
  }

  function emptyTB() {
    return {
      enabled: true,
      mode: 'demo',
      endpoint: '',
      deviceToken: '',
      trucks: [],
      activeTruckId: null
    };
  }

  function getTBNode(p) {
    if (!p) return null;
    if (p.broadcastOps && p.broadcastOps.thingsboard && typeof p.broadcastOps.thingsboard === 'object') {
      return { root: p.broadcastOps, key: 'thingsboard', tb: p.broadcastOps.thingsboard };
    }
    if (p.thingsboard && typeof p.thingsboard === 'object') {
      return { root: p, key: 'thingsboard', tb: p.thingsboard };
    }
    return null;
  }

  function setTB(p, tb) {
    if (!p.broadcastOps || typeof p.broadcastOps !== 'object') p.broadcastOps = {};
    p.broadcastOps.thingsboard = tb;
    /* keep top-level mirror in sync when already present */
    if (p.thingsboard) p.thingsboard = tb;
    return tb;
  }

  function truckSeeds(key) {
    if (key === 'orion') {
      return [
        makeTruck('TB-1', "Mars", { tempC: 26, vibrationMmS: 0.9, voltageV: 119, networkMbps: 310 }, 'online'),
        makeTruck('TB-2', "Earth", { tempC: 31, vibrationMmS: 1.8, voltageV: 114, networkMbps: 95 }, 'degraded'),
        makeTruck('TB-3', "Neptune", { tempC: 24, vibrationMmS: 0.5, voltageV: 121, networkMbps: 480 }, 'online')
      ];
    }
    if (key === 'museaitour') {
      return [
        makeTruck('TB-1', "Jupiter", { tempC: 25, vibrationMmS: 0.7, voltageV: 120, networkMbps: 380 }, 'online'),
        makeTruck('TB-2', "Saturn", { tempC: 27, vibrationMmS: 1.1, voltageV: 118, networkMbps: 290 }, 'online'),
        makeTruck('TB-3', "Uranus", { tempC: 29, vibrationMmS: 1.4, voltageV: 116, networkMbps: 140 }, 'degraded')
      ];
    }
    if (key === 'raybangen3') {
      return [
        makeTruck('TB-1', "Venus", { tempC: 24, vibrationMmS: 0.8, voltageV: 120, networkMbps: 210 }, 'online'),
        makeTruck('TB-2', "Mercury", { tempC: 23, vibrationMmS: 0.6, voltageV: 121, networkMbps: 175 }, 'online')
      ];
    }
    /* other productions: 1–2 trucks */
    var n = Math.random() < 0.55 ? 2 : 1;
    var list = [makeTruck('TB-1', global.MusePlanetTrucks ? global.MusePlanetTrucks.name('', key, 0) : 'Earth', null, 'online')];
    if (n === 2) list.push(makeTruck('TB-2', global.MusePlanetTrucks ? global.MusePlanetTrucks.name('', key, 1) : 'Venus', { tempC: 27, networkMbps: 160 }, 'online'));
    return list;
  }

  function normalizeTruck(t, idx) {
    if (!t || typeof t !== 'object') t = {};
    if (!t.id) t.id = 'TB-' + (idx + 1);
    if (global.MusePlanetTrucks) t.name = global.MusePlanetTrucks.name(t.name, '', idx);
    else if (!t.name) t.name = ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'][idx % 8];
    if (t.thingsboardDeviceId == null) t.thingsboardDeviceId = '';
    if (!t.status || (t.status !== 'online' && t.status !== 'degraded' && t.status !== 'offline')) t.status = 'online';
    if (!t.sensors || typeof t.sensors !== 'object') t.sensors = emptySensors();
    SENSOR_KEYS.forEach(function (k) {
      if (t.sensors[k] == null || isNaN(t.sensors[k])) t.sensors[k] = emptySensors()[k];
    });
    if (!t.history || typeof t.history !== 'object') t.history = emptyHistory();
    HIST_KEYS.forEach(function (k) {
      if (!Array.isArray(t.history[k])) t.history[k] = [];
      if (t.history[k].length > HISTORY_CAP) t.history[k] = t.history[k].slice(-HISTORY_CAP);
    });
    if (!t.ml || typeof t.ml !== 'object') t.ml = emptyMl();
    return t;
  }

  function ensure(key) {
    var p = getP(key);
    if (!p) return emptyTB();
    var node = getTBNode(p);
    var tb;
    if (node) {
      tb = node.tb;
    } else {
      tb = emptyTB();
      setTB(p, tb);
    }
    if (tb.enabled == null) tb.enabled = true;
    if (!tb.mode) tb.mode = 'demo';
    if (tb.endpoint == null) tb.endpoint = '';
    if (tb.deviceToken == null) tb.deviceToken = '';
    if (!Array.isArray(tb.trucks)) tb.trucks = [];
    if (!tb.trucks.length) {
      tb.trucks = truckSeeds(key);
      if (!MAJOR[key] && tb.trucks.length > 2) tb.trucks = tb.trucks.slice(0, 2);
    }
    tb.trucks = tb.trucks.map(normalizeTruck);
    if (!tb.activeTruckId || !findTruck(tb, tb.activeTruckId)) {
      tb.activeTruckId = tb.trucks[0] ? tb.trucks[0].id : null;
    }
    if (!_selectedByKey[key]) _selectedByKey[key] = tb.activeTruckId;
    if (!tb.hil || typeof tb.hil !== 'object') tb.hil = { fault: null, log: [], signed: null };
    if (!Array.isArray(tb.hil.log)) tb.hil.log = [];
    /* prefer broadcastOps home */
    if (!p.broadcastOps || typeof p.broadcastOps !== 'object') p.broadcastOps = {};
    p.broadcastOps.thingsboard = tb;
    return tb;
  }

  function findTruck(tb, id) {
    if (!tb || !tb.trucks) return null;
    for (var i = 0; i < tb.trucks.length; i++) {
      if (tb.trucks[i].id === id) return tb.trucks[i];
    }
    return null;
  }

  function getTrucks(key) {
    var tb = ensure(key);
    return (tb && tb.trucks) || [];
  }

  function setActiveTruck(key, truckId) {
    var tb = ensure(key);
    if (!tb) return null;
    var t = findTruck(tb, truckId);
    if (!t) return null;
    tb.activeTruckId = truckId;
    _selectedByKey[key] = truckId;
    return t;
  }

  function selectTruck(key, truckId) {
    var t = setActiveTruck(key, truckId);
    rerenderHost(key);
    return t;
  }

  function recomputeMl(truck) {
    var s = truck.sensors;
    var score = 100;
    var modes = [];

    /* temp high → score down */
    if (s.tempC > 38) {
      score -= 28;
      modes.push('HVAC / thermal runaway');
    } else if (s.tempC > 34) {
      score -= 16;
      modes.push('Rack thermal stress');
    } else if (s.tempC > 30) {
      score -= 8;
    }

    /* vibration high */
    if (s.vibrationMmS > 4) {
      score -= 30;
      modes.push('Chassis / genset vibration');
    } else if (s.vibrationMmS > 2.5) {
      score -= 18;
      modes.push('Mechanical resonance');
    } else if (s.vibrationMmS > 1.6) {
      score -= 8;
    }

    /* voltage sag */
    if (s.voltageV < 108) {
      score -= 32;
      modes.push('Shore / gen voltage sag');
    } else if (s.voltageV < 113) {
      score -= 18;
      modes.push('Bus voltage instability');
    } else if (s.voltageV < 116) {
      score -= 8;
    } else if (s.voltageV > 128) {
      score -= 12;
      modes.push('Over-voltage event');
    }

    /* network drop */
    if (s.networkMbps < 40) {
      score -= 28;
      modes.push('Contribution path collapse');
    } else if (s.networkMbps < 90) {
      score -= 16;
      modes.push('Bonded cellular / FO degrade');
    } else if (s.networkMbps < 150) {
      score -= 7;
    }

    if (s.upsLoadPct > 92) {
      score -= 14;
      modes.push('UPS overload');
    } else if (s.upsLoadPct > 80) {
      score -= 6;
    }

    if (s.cpuLoad > 92) {
      score -= 10;
      modes.push('Plant CPU saturation');
    } else if (s.cpuLoad > 78) {
      score -= 4;
    }

    if (s.humidityPct > 75) {
      score -= 8;
      modes.push('Condensation / humidity risk');
    }

    score = Math.round(clamp(score, 4, 99));

    var risk = 'Nominal';
    if (score < 45) risk = 'Critical';
    else if (score < 72) risk = 'Watch';

    var conf = clamp(0.55 + (100 - score) * 0.0035 + rnd(-0.05, 0.08), 0.45, 0.96);

    truck.ml = {
      healthScore: score,
      riskLabel: risk,
      failureMode: modes.length ? modes[0] : 'None indicated',
      confidence: round2(conf)
    };

    /* Offline is operator/adapter only — never auto-flip from score. */
    if (truck.status !== 'offline') {
      if (score < 70) truck.status = 'degraded';
      else truck.status = 'online';
    }
  }

  function pushHist(truck) {
    var h = truck.history;
    var s = truck.sensors;
    HIST_KEYS.forEach(function (k) {
      if (!Array.isArray(h[k])) h[k] = [];
      h[k].push(s[k]);
      if (h[k].length > HISTORY_CAP) h[k] = h[k].slice(-HISTORY_CAP);
    });
  }

  function stamp() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }
  function hilLog(tb, kind, msg) {
    if (!tb.hil) tb.hil = { fault: null, log: [], signed: null };
    tb.hil.log.unshift({ ts: stamp(), kind: kind, msg: msg });
    tb.hil.log = tb.hil.log.slice(0, 24);
    tb.hil.signed = null;
  }
  function actor() {
    try {
      if (typeof global.permUser === 'function') return String(global.permUser() || 'Ops');
    } catch (e) {}
    return 'Ops';
  }

  function tickTruck(truck, fault) {
    if (!truck || truck.status === 'offline') return;
    var s = truck.sensors;
    var drift = truck.status === 'degraded' ? 1.6 : 1;

    s.tempC = round1(clamp(s.tempC + rnd(-0.35, 0.45) * drift + (Math.random() < 0.04 ? rnd(0.8, 2.2) : 0), 18, 46));
    s.vibrationMmS = round2(clamp(s.vibrationMmS + rnd(-0.12, 0.15) * drift + (Math.random() < 0.03 ? rnd(0.4, 1.5) : 0), 0.15, 6.5));
    s.voltageV = round1(clamp(s.voltageV + rnd(-0.6, 0.55) * drift - (Math.random() < 0.05 ? rnd(1, 4) : 0), 102, 132));
    s.networkMbps = round1(clamp(s.networkMbps + rnd(-18, 16) * drift - (Math.random() < 0.06 ? rnd(20, 80) : 0), 8, 620));
    s.humidityPct = round1(clamp(s.humidityPct + rnd(-0.8, 0.9), 20, 90));
    s.cpuLoad = round1(clamp(s.cpuLoad + rnd(-3.5, 4.2) * drift, 8, 99));
    s.upsLoadPct = round1(clamp(s.upsLoadPct + rnd(-2.2, 2.8) * drift, 5, 98));

    if (fault === 'voltage') {
      s.voltageV = round1(clamp(s.voltageV * 0.88 + 105 * 0.12 + rnd(-1.2, 0.2), 100, 114));
      s.upsLoadPct = round1(clamp(s.upsLoadPct + rnd(1.4, 3.2), 48, 97));
    } else if (fault === 'liveu') {
      s.networkMbps = round1(clamp(s.networkMbps * 0.62 + rnd(-12, 3), 6, 55));
    } else if (fault === 'rf') {
      s.cpuLoad = round1(clamp(s.cpuLoad + rnd(2, 7), 55, 99));
      s.networkMbps = round1(clamp(s.networkMbps + rnd(-40, 8), 35, 180));
    } else if (fault === 'thermal') {
      s.tempC = round1(clamp(s.tempC + rnd(0.5, 1.3), 30, 46));
    }

    /* occasional recovery toward nominal in demo */
    if (!fault && Math.random() < 0.08) {
      s.tempC = round1(s.tempC * 0.92 + 25 * 0.08);
      s.voltageV = round1(s.voltageV * 0.9 + 120 * 0.1);
      s.networkMbps = round1(s.networkMbps * 0.85 + 280 * 0.15);
      s.vibrationMmS = round2(s.vibrationMmS * 0.88 + 0.7 * 0.12);
    }

    pushHist(truck);
    recomputeMl(truck);
  }

  function tick(key) {
    var tb = ensure(key);
    if (!tb || !tb.enabled) return tb;
    if (tb.mode !== 'demo') return tb;
    var fault = (tb.hil && tb.hil.fault) || null;
    (tb.trucks || []).forEach(function (t) { tickTruck(t, fault); });
    return tb;
  }

  function injectFault(key, kind) {
    var tb = ensure(key);
    tb.hil.fault = kind;
    var names = { voltage: 'voltage sag', liveu: "LiveU LU800 drop", rf: 'RF clash', thermal: 'rack overtemp' };
    hilLog(tb, 'inject', 'Plant ← ' + (names[kind] || kind));
    (tb.trucks || []).forEach(function (t) { tickTruck(t, kind); });
    rerenderHost(key);
    try { if (typeof global.toast === 'function') global.toast('HIL inject · ' + (names[kind] || kind)); } catch (e) {}
  }

  function operatorAct(key, act) {
    var tb = ensure(key);
    var truck = findTruck(tb, tb.activeTruckId) || (tb.trucks && tb.trucks[0]);
    if (act === 'failover' && truck) {
      truck.sensors.networkMbps = round1(clamp(truck.sensors.networkMbps + 180, 120, 520));
      hilLog(tb, 'act', 'Operator → failover TX / backup path');
    } else if (act === 'gng') {
      hilLog(tb, 'act', 'Operator → GNG HOLD (masts / flown PA down)');
      try {
        if (typeof global.MuseBOps !== 'undefined' && global.MuseBOps.setGoNoGo) global.MuseBOps.setGoNoGo(key, 'CONDITIONAL');
      } catch (eG) {}
    } else if (act === 'restore') {
      tb.hil.fault = null;
      (tb.trucks || []).forEach(function (t) {
        t.sensors = emptySensors();
        t.status = 'online';
        recomputeMl(t);
      });
      hilLog(tb, 'act', 'Operator → restore plant to nominal');
    }
    rerenderHost(key);
  }

  function signRun(key) {
    var tb = ensure(key);
    var truck = findTruck(tb, tb.activeTruckId) || (tb.trucks && tb.trucks[0]);
    var ml = (truck && truck.ml) || emptyMl();
    var result = tb.hil.fault ? 'FAIL' : (ml.riskLabel === 'Nominal' ? 'PASS' : 'WATCH');
    var rec = {
      by: actor(),
      at: new Date().toISOString(),
      result: result,
      health: ml.healthScore,
      fault: tb.hil.fault || 'none'
    };
    tb.hil.signed = rec;
    hilLog(tb, 'sign', rec.result + ' · signed by ' + rec.by + ' · health ' + rec.health);
    try {
      if (typeof global.MuseKB !== 'undefined' && global.MuseKB.logIncident) {
        global.MuseKB.logIncident({
          title: 'HIL ' + rec.result + ' — ' + key,
          show: key,
          team: 'ENG',
          body: 'Hardware-in-the-loop run ' + rec.result + '. Health ' + rec.health + '. Fault ' + rec.fault + '. Signed by ' + rec.by + '.\n\n#hil #eng'
        });
      }
    } catch (eK) {}
    try { if (typeof global.toast === 'function') global.toast('HIL run signed · ' + rec.result); } catch (eT) {}
    rerenderHost(key);
    return rec;
  }

  var _sparkSeq = 0;

  /* ---- SVG sparkline ---- */
  function sparklineSVG(arr, color) {
    arr = arr || [];
    color = color || 'var(--pk-blue)';
    var w = 120;
    var h = 32;
    var gid = 'tbspg' + (++_sparkSeq);
    if (arr.length < 2) {
      return (
        '<svg width="' +
        w +
        '" height="' +
        h +
        '" viewBox="0 0 ' +
        w +
        ' ' +
        h +
        '" style="display:block"><polyline fill="none" stroke="' +
        color +
        '" stroke-width="1.5" points="0,' +
        h / 2 +
        ' ' +
        w +
        ',' +
        h / 2 +
        '"/></svg>'
      );
    }
    var min = arr[0];
    var max = arr[0];
    var i;
    for (i = 1; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
    }
    var span = max - min || 1;
    var pts = [];
    for (i = 0; i < arr.length; i++) {
      var x = (i / (arr.length - 1)) * (w - 2) + 1;
      var y = h - 2 - ((arr[i] - min) / span) * (h - 4);
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    var last = arr[arr.length - 1];
    var lx = (w - 2) + 1;
    var ly = h - 2 - ((last - min) / span) * (h - 4);
    return (
      '<svg width="' +
      w +
      '" height="' +
      h +
      '" viewBox="0 0 ' +
      w +
      ' ' +
      h +
      '" style="display:block">' +
      '<defs><linearGradient id="' +
      gid +
      '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' +
      color +
      '" stop-opacity="0.35"/><stop offset="100%" stop-color="' +
      color +
      '" stop-opacity="0"/></linearGradient></defs>' +
      '<polyline fill="url(#' +
      gid +
      ')" stroke="none" points="' +
      pts.join(' ') +
      ' ' +
      (w - 1) +
      ',' +
      h +
      ' 1,' +
      h +
      '"/><polyline fill="none" stroke="' +
      color +
      '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="' +
      pts.join(' ') +
      '"/>' +
      '<circle cx="' +
      lx.toFixed(1) +
      '" cy="' +
      ly.toFixed(1) +
      '" r="2.2" fill="' +
      color +
      '"/></svg>'
    );
  }

  function statusColor(st) {
    if (st === 'online') return 'rgb(var(--st-ready))';
    if (st === 'degraded') return 'rgb(var(--st-caution))';
    return 'rgb(var(--st-blocked))';
  }

  function riskColor(label) {
    if (label === 'Critical') return 'rgb(var(--st-blocked))';
    if (label === 'Watch') return 'rgb(var(--st-caution))';
    return 'rgb(var(--st-ready))';
  }

  function kpiTile(label, value, unit, hist, color, kpiKey) {
    return (
      '<div class="tb-kpi" data-tb-kpi-wrap="' +
      esc(kpiKey || label) +
      '" style="flex:1 1 140px;min-width:132px;max-width:200px;padding:10px 12px;border-radius:14px;' +
      'background:rgb(var(--c-surface));color:rgb(var(--c-ink));border:1px solid rgb(var(--c-line, 228 230 235))">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">' +
      '<div><div style="font:700 9px/1.2 var(--font-ui),system-ui,sans-serif;letter-spacing:.06em;color:rgb(var(--c-ink-3))">' +
      esc(label) +
      '</div>' +
      '<div style="margin-top:4px;font:800 18px/1.1 var(--font-ui),system-ui,sans-serif;font-variant-numeric:tabular-nums;color:rgb(var(--c-ink))">' +
      '<span data-tb-kpi="' +
      esc(kpiKey || '') +
      '">' +
      esc(String(value)) +
      '</span>' +
      '<span style="font-size:10px;font-weight:600;color:rgb(var(--c-ink-3));margin-left:3px">' +
      esc(unit) +
      '</span></div></div>' +
      '<div class="tb-spark" data-tb-spark="' +
      esc(kpiKey || '') +
      '" data-tb-spark-color="' +
      esc(color || 'var(--pk-blue)') +
      '" style="opacity:.95">' +
      sparklineSVG(hist, color) +
      '</div></div></div>'
    );
  }

  function panelHTML(key) {
    var tb = ensure(key);
    var trucks = tb.trucks || [];
    var selId = _selectedByKey[key] || tb.activeTruckId || (trucks[0] && trucks[0].id);
    var truck = findTruck(tb, selId) || trucks[0];
    if (truck) {
      selId = truck.id;
      _selectedByKey[key] = selId;
      tb.activeTruckId = selId;
    }

    var pills = trucks
      .map(function (t) {
        var active = t.id === selId;
        var col = statusColor(t.status);
        return (
          '<button type="button" class="tb-pill" data-tb-truck="' +
          esc(t.id) +
          '" onclick="MuseThingsBoard.selectTruck(\'' +
          esc(key) +
          '\',\'' +
          esc(t.id) +
          '\')" style="appearance:none;cursor:pointer;border-radius:999px;padding:6px 12px;font:700 11px var(--font-ui),system-ui,sans-serif;' +
          'border:1px solid ' +
          (active ? 'rgb(var(--st-info))' : 'rgb(var(--c-line, 228 230 235))') +
          ';background:' +
          (active ? 'rgb(var(--st-info-wash, 231 243 255))' : 'rgb(var(--c-surface))') +
          ';color:rgb(var(--c-ink));display:inline-flex;align-items:center;gap:7px;transition:background .15s,transform .1s">' +
          '<span data-tb-truck-dot style="width:7px;height:7px;border-radius:50%;background:' +
          col +
          '"></span>' +
          esc(t.name) +
          '</button>'
        );
      })
      .join('');

    var body = '';
    if (!truck) {
      body =
        '<div class="tb-muted" style="padding:18px;text-align:center;color:rgb(var(--c-ink-3));font:600 12px var(--font-ui),system-ui,sans-serif">No trucks seeded for this production.</div>';
    } else {
      var s = truck.sensors;
      var h = truck.history;
      var ml = truck.ml || emptyMl();
      var rc = riskColor(ml.riskLabel);
      var offline = truck.status === 'offline';
      var cpuShow = offline ? '—' : String(s.cpuLoad) + '%';
      var scoreRing =
        '<div style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'background:conic-gradient(' +
        rc +
        ' ' +
        ml.healthScore +
        '%, rgb(var(--c-surface-3)) 0);padding:3px">' +
        '<div data-tb-score style="width:100%;height:100%;border-radius:50%;background:rgb(var(--c-surface));color:rgb(var(--c-ink));display:flex;align-items:center;justify-content:center;' +
        'font:800 15px var(--font-ui),system-ui,sans-serif;font-variant-numeric:tabular-nums">' +
        ml.healthScore +
        '</div></div>';

      body =
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
        kpiTile('Temp', s.tempC, '°C', h.tempC, 'var(--pk-red)', 'tempC') +
        kpiTile('Vibration', s.vibrationMmS, 'mm/s', h.vibrationMmS, 'var(--pk-purple)', 'vibrationMmS') +
        kpiTile('Voltage', s.voltageV, 'V', h.voltageV, 'var(--pk-green)', 'voltageV') +
        kpiTile('Network', s.networkMbps, 'Mbps', h.networkMbps, 'var(--pk-blue)', 'networkMbps') +
        kpiTile('Humidity', s.humidityPct, '%', h.humidityPct || [s.humidityPct], 'var(--pk-blue)', 'humidityPct') +
        kpiTile('UPS load', s.upsLoadPct, '%', h.upsLoadPct || [s.upsLoadPct], 'var(--pk-yellow)', 'upsLoadPct') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:10px">' +
        '<div style="padding:12px 14px;border-radius:14px;background:rgb(var(--c-surface));color:rgb(var(--c-ink));border:1px solid rgb(var(--c-line, 228 230 235))">' +
        '<div style="font:700 9px/1 var(--font-ui),system-ui,sans-serif;letter-spacing:.07em;color:rgb(var(--c-ink-3));margin-bottom:10px">Rule score · simulated</div>' +
        '<div style="display:flex;gap:14px;align-items:center">' +
        scoreRing +
        '<div style="flex:1;min-width:0">' +
        '<div data-tb-risk style="font:800 16px var(--font-ui),system-ui,sans-serif;color:' +
        rc +
        '">' +
        esc(ml.riskLabel) +
        '</div>' +
        '<div style="font:600 11px var(--font-ui),system-ui,sans-serif;color:rgb(var(--c-ink-3));margin-top:2px">Threshold score (not a forecast)</div>' +
        '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">' +
        '<span style="font:700 10px var(--font-ui),system-ui,sans-serif;padding:4px 8px;border-radius:8px;background:rgb(var(--c-surface-2));color:rgb(var(--c-ink-2))">rule of thumb</span>' +
        ((ml.riskLabel === 'Nominal' || !ml.failureMode || ml.failureMode === 'None indicated')
          ? ''
          : '<span data-tb-fail style="font:600 10px var(--font-ui),system-ui,sans-serif;padding:4px 8px;border-radius:8px;background:rgb(var(--c-surface-2));color:rgb(var(--c-ink-2))">' +
            esc(ml.failureMode) +
            '</span>') +
        '</div></div></div>' +
        '<div style="margin-top:10px;font:500 10px/1.45 var(--font-ui),system-ui,sans-serif;color:rgb(var(--c-ink-3))">Simulated sensors. Connect ThingsBoard to replace the walk with live ingest.</div></div>' +
        '<div style="padding:12px 14px;border-radius:14px;background:rgb(var(--c-surface));color:rgb(var(--c-ink));border:1px solid rgb(var(--c-line, 228 230 235))">' +
        '<div style="font:700 9px/1 var(--font-ui),system-ui,sans-serif;letter-spacing:.07em;color:rgb(var(--c-ink-3));margin-bottom:8px">Truck status</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<span data-tb-status-dot style="width:8px;height:8px;border-radius:50%;background:' +
        statusColor(truck.status) +
        '"></span>' +
        '<span data-tb-status style="font:800 13px var(--font-ui),system-ui,sans-serif;color:rgb(var(--c-ink));text-transform:capitalize">' +
        esc(truck.status) +
        '</span>' +
        '<span style="font:600 10px var(--font-ui),system-ui,sans-serif;font-variant-numeric:tabular-nums;color:rgb(var(--c-ink-3))">' +
        esc(truck.id) +
        '</span></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div style="padding:8px;border-radius:10px;background:rgb(var(--c-surface-2))"><div style="font:700 8px var(--font-ui),sans-serif;color:rgb(var(--c-ink-3))">CPU</div>' +
        '<div data-tb-kpi="cpuLoad" style="font:800 14px var(--font-ui),system-ui,sans-serif;font-variant-numeric:tabular-nums;color:rgb(var(--c-ink))">' +
        esc(cpuShow) +
        '</div></div>' +
        '<div style="padding:8px;border-radius:10px;background:rgb(var(--c-surface-2))"><div style="font:700 8px var(--font-ui),sans-serif;color:rgb(var(--c-ink-3))">Device ID</div>' +
        '<div style="font:600 11px var(--font-ui),system-ui,sans-serif;font-variant-numeric:tabular-nums;color:rgb(var(--c-ink-2));overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(truck.thingsboardDeviceId || '— plug-and-play') +
        '</div></div></div></div></div>';
    }

    /* Demo never paints LIVE. Live ingest uses Ingest, not a LIVE badge. */
    var modeBadge =
      tb.mode === 'live'
        ? '<span class="tb-pill" style="font:800 9px var(--font-ui),sans-serif;padding:3px 8px;border-radius:999px;background:rgb(var(--st-ready-wash));color:rgb(var(--st-ready-ink));border:1px solid rgb(var(--st-ready))">Ingest</span>'
        : '<span class="tb-pill" style="font:800 9px var(--font-ui),sans-serif;padding:3px 8px;border-radius:999px;background:rgb(var(--c-surface-2));color:rgb(var(--c-ink-2));border:1px solid rgb(var(--c-line, 228 230 235))">Demo</span>';

    return (
      '<div class="tb-panel pui-pane tb-telemetry-panel" style="border-radius:18px;padding:14px 14px 12px;' +
      'background:rgb(var(--c-surface));color:rgb(var(--c-ink));border:1px solid rgb(var(--c-line, 228 230 235))">' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<div style="font:800 13px/1.2 var(--font-ui),system-ui,sans-serif;color:rgb(var(--c-ink))">Truck sensors · simulated</div>' +
      modeBadge +
      '</div>' +
      '<div style="font:500 10px var(--font-ui),system-ui,sans-serif;color:rgb(var(--c-ink-3))">Threshold rules on temp · vibration · voltage · network — not a live ingest</div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">' +
      pills +
      '</div>' +
      hilPanelHTML(key, tb) +
      body +
      '<details style="margin-top:12px;border-radius:12px;border:1px solid rgb(var(--c-line, 228 230 235));background:rgb(var(--c-surface-2));color:rgb(var(--c-ink));padding:8px 10px">' +
      '<summary style="cursor:pointer;font:700 9px var(--font-ui),system-ui,sans-serif;letter-spacing:.06em;color:rgb(var(--c-ink-3));list-style:none">Config · plug-and-play fields</summary>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">' +
      '<label style="display:block"><span style="font:700 8px var(--font-ui),sans-serif;color:rgb(var(--c-ink-3))">Endpoint</span>' +
      '<input disabled placeholder="https://thingsboard.cloud/api/…" value="' +
      esc(tb.endpoint || '') +
      '" style="width:100%;margin-top:4px;padding:7px 9px;border-radius:8px;border:1px solid rgb(var(--c-line, 228 230 235));' +
      'background:rgb(var(--c-surface));color:rgb(var(--c-ink-3));font:600 11px var(--font-ui),system-ui,sans-serif;font-variant-numeric:tabular-nums"/></label>' +
      '<label style="display:block"><span style="font:700 8px var(--font-ui),sans-serif;color:rgb(var(--c-ink-3))">Device token</span>' +
      '<input disabled placeholder="•••••••• (access token)" value="' +
      esc(tb.deviceToken || '') +
      '" style="width:100%;margin-top:4px;padding:7px 9px;border-radius:8px;border:1px solid rgb(var(--c-line, 228 230 235));' +
      'background:rgb(var(--c-surface));color:rgb(var(--c-ink-3));font:600 11px var(--font-ui),system-ui,sans-serif"/></label></div>' +
      '<p style="margin:8px 0 0;font:500 10px var(--font-ui),system-ui,sans-serif;color:rgb(var(--c-ink-3))">ThingsBoard REST / MQTT / WS ingest reserved for plug-and-play. Per-truck device IDs map when mode flips to ingest.</p>' +
      '</details></div>'
    );
  }

  function hilPanelHTML(key, tb) {
    tb = tb || ensure(key);
    var hil = tb.hil || { fault: null, log: [], signed: null };
    var k = esc(key);
    var btn = function (lab, fn, extra) {
      return (
        '<button type="button" onclick="' +
        fn +
        '" style="appearance:none;cursor:pointer;border-radius:9px;padding:6px 10px;font:700 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
        'border:1px solid #e4e6eb;background:#ffffff;color:#1C1E21">' +
        esc(lab) +
        '</button>'
      );
    };
    var log = (hil.log || []).slice(0, 8).map(function (row) {
      var col = row.kind === 'sign' ? '#1e7b34' : row.kind === 'inject' ? '#e41e3f' : '#0866ff';
      return (
        '<div style="display:flex;gap:8px;font:500 11px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#3E4042">' +
        '<span style="font-variant-numeric:tabular-nums;color:#b0b3b8;min-width:54px">' +
        esc(row.ts) +
        '</span>' +
        '<span style="font-weight:800;color:' +
        col +
        ';text-transform:uppercase;font-size:9px;letter-spacing:.04em;min-width:44px">' +
        esc(row.kind) +
        '</span>' +
        '<span>' +
        esc(row.msg) +
        '</span></div>'
      );
    }).join('');
    var signed = hil.signed
      ? '<div style="margin-top:8px;padding:8px 10px;border-radius:10px;background:#e6f4ea;border:1px solid #a8dab5;color:#1E7B34;font:700 11px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
        'Signed ' +
        esc(hil.signed.result) +
        ' · ' +
        esc(hil.signed.by) +
        ' · health ' +
        esc(String(hil.signed.health)) +
        '</div>'
      : '';
    return (
      '<div class="hil-loop" style="margin:0 0 12px;padding:12px 14px;border-radius:14px;border:1px solid #e4e6eb;background:#f7f8fa">' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
      '<div><div style="font:800 13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1C1E21">Hardware-in-the-loop</div>' +
      '<div style="font:500 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#65676B;margin-top:2px">Closed loop: inject a plant fault · act from Muse Live · sign the run. Simulated — not live ingest.</div></div>' +
      (hil.fault
        ? '<span style="font:800 9px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:3px 8px;border-radius:999px;background:#fde7ea;color:#e41e3f;border:1px solid #fde7ea">FAULT · ' +
          esc(hil.fault) +
          '</span>'
        : '<span style="font:800 9px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:3px 8px;border-radius:999px;background:#e6f4ea;color:#1e7b34;border:1px solid #a8dab5">PLANT NOMINAL</span>') +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' +
      btn('Voltage sag', "MuseThingsBoard.injectFault('" + k + "','voltage')") +
      btn("Contribution drop", "MuseThingsBoard.injectFault('" + k + "','liveu')") +
      btn('RF clash', "MuseThingsBoard.injectFault('" + k + "','rf')") +
      btn('Overtemp', "MuseThingsBoard.injectFault('" + k + "','thermal')") +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' +
      btn('Failover TX', "MuseThingsBoard.operatorAct('" + k + "','failover')") +
      btn('GNG hold', "MuseThingsBoard.operatorAct('" + k + "','gng')") +
      btn('Restore plant', "MuseThingsBoard.operatorAct('" + k + "','restore')") +
      '<button type="button" onclick="MuseThingsBoard.signRun(\'' +
      k +
      '\')" style="appearance:none;cursor:pointer;border-radius:9px;padding:6px 12px;font:700 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;border:0;background:#0866FF;color:#ffffff">Sign HIL run</button>' +
      '</div>' +
      '<div data-hil-log style="display:flex;flex-direction:column;gap:4px;max-height:132px;overflow:auto">' +
      (log || '<div style="font:500 11px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#b0b3b8">No events yet. Inject a fault to close the loop.</div>') +
      '</div>' +
      signed +
      '</div>'
    );
  }

  function patchPanelLive(host, key) {
    if (!host) return;
    var tb = ensure(key);
    var trucks = tb.trucks || [];
    var selId = _selectedByKey[key] || tb.activeTruckId;
    var truck = findTruck(tb, selId) || trucks[0];
    if (!truck) return;
    var s = truck.sensors;
    var h = truck.history;
    var ml = truck.ml || emptyMl();
    var offline = truck.status === 'offline';
    function setText(sel, text) {
      var n = host.querySelector(sel);
      if (n) n.textContent = text;
    }
    setText('[data-tb-kpi="tempC"]', String(s.tempC));
    setText('[data-tb-kpi="vibrationMmS"]', String(s.vibrationMmS));
    setText('[data-tb-kpi="voltageV"]', String(s.voltageV));
    setText('[data-tb-kpi="networkMbps"]', String(s.networkMbps));
    setText('[data-tb-kpi="humidityPct"]', String(s.humidityPct));
    setText('[data-tb-kpi="upsLoadPct"]', String(s.upsLoadPct));
    setText('[data-tb-kpi="cpuLoad"]', offline ? '—' : String(s.cpuLoad) + '%');
    var sparks = host.querySelectorAll('[data-tb-spark]');
    var si;
    for (si = 0; si < sparks.length; si++) {
      var sk = sparks[si].getAttribute('data-tb-spark');
      var col = sparks[si].getAttribute('data-tb-spark-color') || 'var(--pk-blue)';
      var arr = (h && sk && h[sk]) || (s && sk ? [s[sk]] : []);
      sparks[si].innerHTML = sparklineSVG(arr, col);
    }
    setText('[data-tb-score]', String(ml.healthScore));
    var riskEl = host.querySelector('[data-tb-risk]');
    if (riskEl) {
      riskEl.textContent = String(ml.riskLabel);
      riskEl.style.color = riskColor(ml.riskLabel);
    }
    setText('[data-tb-fail]', String(ml.failureMode || ''));
    setText('[data-tb-status]', String(truck.status));
    var stDot = host.querySelector('[data-tb-status-dot]');
    if (stDot) stDot.style.background = statusColor(truck.status);
    trucks.forEach(function (t) {
      var pill = host.querySelector('[data-tb-truck="' + t.id + '"] [data-tb-truck-dot]');
      if (pill) pill.style.background = statusColor(t.status);
    });
  }

  function rerenderHost(key) {
    try {
      var host = document.getElementById('tbTelemetryHost');
      if (!host) return;
      var hostKey = host.getAttribute('data-key') || _activeKey;
      if (key && hostKey && key !== hostKey) return;
      var k = key || hostKey || _activeKey;
      if (!k) return;
      var keepOpen = false;
      try {
        keepOpen = !!(host.querySelector && host.querySelector('details[open]'));
      } catch (eOpen) {}
      host.innerHTML = panelHTML(k);
      if (keepOpen) {
        var d = host.querySelector('details');
        if (d) d.open = true;
      }
    } catch (e) {}
  }

  function onVisibility() {
    try {
      if (document.hidden) {
        if (_loopId != null) {
          clearInterval(_loopId);
          _loopId = null;
        }
      } else if (_activeKey) {
        startDemoLoop(_activeKey);
      }
    } catch (e) {}
  }

  function bindVisibility() {
    if (_visBound) return;
    _visBound = true;
    try {
      document.addEventListener('visibilitychange', onVisibility);
    } catch (e) {}
  }

  function stopDemoLoop() {
    if (_loopId != null) {
      try {
        clearInterval(_loopId);
      } catch (e) {}
      _loopId = null;
    }
  }

  function startDemoLoop(key) {
    if (key) _activeKey = key;
    bindVisibility();
    stopDemoLoop();
    if (typeof document !== 'undefined' && document.hidden) return;
    _loopId = setInterval(function () {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
        var host = document.getElementById('tbTelemetryHost');
        if (!host) return;
        var k = host.getAttribute('data-key') || _activeKey;
        if (!k) return;
        _activeKey = k;
        tick(k);
        /* Never host.innerHTML on the 1.5s tick — patch KPI text / sparks only.
           details[open] (CONFIG) stays put because we never rebuild the tree. */
        patchPanelLive(host, k);
      } catch (e) {}
    }, TICK_MS);
  }

  function bindToOps(key) {
    _activeKey = key;
    ensure(key);
    try {
      startDemoLoop(key);
    } catch (e) {}
    return (
      '<div id="tbTelemetryHost" data-key="' +
      esc(key) +
      '" class="tb-telemetry-host" style="margin:0 0 12px">' +
      panelHTML(key) +
      '</div>'
    );
  }

  var API = {
    version: '1.0.0',
    ensure: ensure,
    tick: tick,
    panelHTML: panelHTML,
    bindToOps: bindToOps,
    startDemoLoop: startDemoLoop,
    stopDemoLoop: stopDemoLoop,
    getTrucks: getTrucks,
    setActiveTruck: setActiveTruck,
    selectTruck: selectTruck,
    rerenderHost: rerenderHost,
    patchPanelLive: patchPanelLive,
    injectFault: injectFault,
    operatorAct: operatorAct,
    signRun: signRun
  };

  global.MuseThingsBoard = API;
  global.MuseTB = API;
})(typeof window !== 'undefined' ? window : global);

