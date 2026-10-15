/**
 * Muse Live — Broadcast Ops Engine v2.0 (Wave C complete)
 * Signal path integrity · Truck/plant · Power load · RF coordination · Satellite · Go/No-Go · Techbook diff
 * ES5-friendly IIFE. Depends on host: productions, stampEdit, saveState, toast, esc, renderProjectView
 */
(function (global) {
  'use strict';

  var HOP_TYPES = [
    'Camera / Source',
    'Embed / Stagebox',
    'Contribution Fiber',
    'Contribution Cellular',
    'Contribution Satellite',
    'Contribution SRT/IP',
    'RX / Demod',
    'Plant Router / Matrix',
    'Encoder / TX',
    'Distribution / TOC',
    'Return / IFB',
    'Backup Path'
  ];
  var HOP_STATUS = ['green', 'amber', 'red', 'unknown'];
  var RF_BANDS = ['VHF', 'UHF', '700 MHz', '2.4 GHz', '5 GHz', '6 GHz', 'Ku', 'C-band', 'Ka', 'Other'];
  var RF_STATUS = ['coordinated', 'pending', 'clash', 'licensed', 'cleared'];
  var SAT_STATUS = ['booked', 'confirmed', 'window-open', 'live', 'standby', 'released', 'failed'];
  var POWER_BUSES = ['A', 'B', 'Shore', 'Gen', 'UPS'];

  function esc(s) {
    if (typeof global.esc === 'function') return global.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function uid(pfx) {
    return (pfx || 'id') + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  }
  function nowISO() {
    try {
      return new Date().toISOString();
    } catch (e) {
      return '';
    }
  }
  function stamp(key) {
    try {
      if (typeof global.stampEdit === 'function') global.stampEdit(key);
      else if (typeof global.saveState === 'function') global.saveState();
    } catch (e) {}
  }
  function rerender(key) {
    try {
      if (typeof global.renderProjectView === 'function' && document.getElementById('view-' + key))
        global.renderProjectView(key);
    } catch (e) {}
  }
  function toast(msg) {
    try {
      if (typeof global.toast === 'function') global.toast(msg);
    } catch (e) {}
  }

  function emptyOps() {
    return {
      v: 1,
      signalPath: [],
      truck: {
        name: '',
        type: 'Flypack',
        matrix: '',
        bulkheadFiber: 0,
        bulkheadCoax: 0,
        hvac: '',
        weightLbs: 0,
        bayMap: '',
        notes: ''
      },
      power: {
        shoreA: 0,
        genA: 0,
        busA: 0,
        busB: 0,
        loads: [],
        notes: ''
      },
      rf: [],
      sat: [],
      remi: {
        contribMs: 0,
        returnMs: 0,
        budgetMs: 250,
        path: 'REMI / remote plant',
        notes: ''
      },
      weatherHold: false,
      goNoGoNotes: '',
      lastTechbookSnap: null
    };
  }

  function ensure(p) {
    if (!p) return emptyOps();
    if (!p.broadcastOps || typeof p.broadcastOps !== 'object') p.broadcastOps = emptyOps();
    var o = p.broadcastOps;
    if (!Array.isArray(o.signalPath)) o.signalPath = [];
    if (!o.truck || typeof o.truck !== 'object') o.truck = emptyOps().truck;
    if (!o.power || typeof o.power !== 'object') o.power = emptyOps().power;
    if (!Array.isArray(o.power.loads)) o.power.loads = [];
    if (!Array.isArray(o.rf)) o.rf = [];
    if (!Array.isArray(o.sat)) o.sat = [];
    if (!o.remi || typeof o.remi !== 'object') o.remi = emptyOps().remi;
    if (o.remi.contribMs == null) o.remi.contribMs = 0;
    if (o.remi.returnMs == null) o.remi.returnMs = 0;
    if (o.remi.budgetMs == null) o.remi.budgetMs = 250;
    if (o.weatherHold == null) o.weatherHold = false;
    if (o.goNoGoNotes == null) o.goNoGoNotes = '';
    o.v = o.v || 1;
    return o;
  }

  /* ---- Showcase seeds (Muse AI World Tour / Ray-Ban Meta) ---- */
  function seedWorldCup(p) {
    var o = ensure(p);
    if (o.signalPath.length) {
      if (!o.remi || !(parseFloat(o.remi.budgetMs) > 0))
        o.remi = { contribMs: 85, returnMs: 95, budgetMs: 250, path: "Harmonic XOS→Miami + Makito SRT return", notes: 'REMI delay budget 250ms end-to-end; measure at tech reh' };
      return o;
    }
    o.signalPath = [
      { id: 'sp1', order: 1, name: 'Presentation Studio Cam 1–4', type: 'Camera / Source', from: 'Studio floor', to: 'Stagebox A', status: 'green', lastGood: nowISO(), notes: "HDC-3500 · Canon CJ45ex9.7B/22x" },
      { id: 'sp2', order: 2, name: 'Stagebox A → Flypack', type: 'Embed / Stagebox', from: 'Stagebox A', to: 'Meta Field Ops', status: 'green', lastGood: nowISO(), notes: 'SMPTE hybrid' },
      { id: 'sp3', order: 3, name: "Harmonic XOS–6", type: 'Encoder / TX', from: "Jupiter", to: 'NYNJ FO hand-off', status: 'green', lastGood: nowISO(), notes: '12 enc / 6 dec · 1GB×2' },
      { id: 'sp4', order: 4, name: 'NYNJ → Miami FO', type: 'Contribution Fiber', from: 'HBS Port 1/2', to: 'TC Miami', status: 'green', lastGood: nowISO(), notes: "Harmonic XOS path" },
      { id: 'sp5', order: 5, name: "LiveU LU800/U", type: 'Contribution Cellular', from: 'Harbor compound', to: 'TC Miami', status: 'amber', lastGood: '', notes: 'Serial validation on spare LU800' },
      { id: 'sp6', order: 6, name: "Harmonic XOS returns", type: 'Return / IFB', from: 'TC Miami', to: "Saturn", status: 'green', lastGood: nowISO(), notes: 'PGM + multiview' },
      { id: 'sp7', order: 7, name: "Evertz EQX 32×32 plant", type: 'Plant Router / Matrix', from: 'Flypack router', to: 'ISO / EVS / GFX', status: 'green', lastGood: nowISO(), notes: '128² class matrix' },
      { id: 'sp8', order: 8, name: 'TOC distribution', type: 'Distribution / TOC', from: 'TC Miami', to: 'Network / affiliates', status: 'green', lastGood: nowISO(), notes: 'Final air path' }
    ];
    o.truck = {
      name: "Jupiter",
      type: 'Double Technical Cabin + Flypack',
      matrix: "Evertz EQX 32×32 · ~128²",
      bulkheadFiber: 48,
      bulkheadCoax: 32,
      hvac: 'Dual-zone · gen-independent A/C',
      weightLbs: 18500,
      bayMap: 'Bay A: Appear/Evertz EQX 32×32 · Bay B: Audio Calrec Artemis · Bay C: EVS/ISO · Bulkhead stern',
      notes: 'HBS compound power primary; UPS in-line on TX bus'
    };
    o.power = {
      shoreA: 300,
      genA: 200,
      busA: 180,
      busB: 95,
      loads: [
        { id: 'pl1', name: 'Cameras + CCUs', amps: 48, bus: 'A' },
        { id: 'pl2', name: "Harmonic XOS + Evertz EQX 32×32", amps: 42, bus: 'A' },
        { id: 'pl3', name: 'Audio console + RF', amps: 28, bus: 'B' },
        { id: 'pl4', name: 'EVS / Replay / GFX', amps: 36, bus: 'A' },
        { id: 'pl5', name: 'HVAC + lights', amps: 55, bus: 'Shore' },
        { id: 'pl6', name: 'Comms / Arcadia', amps: 12, bus: 'UPS' }
      ],
      notes: '3×125V 2-phase 100A Cam-Lock · continuous derate 80%'
    };
    o.rf = [
      { id: 'rf1', service: 'Host lav 1–4', txFreq: '518.000', rxFreq: '518.000', band: 'UHF', license: 'FWC-RF-2026-A', status: 'coordinated', venue: 'MetLife', notes: "Shure Axient Digital AD4Q + AD1" },
      { id: 'rf2', service: 'IFB Elite 1–6', txFreq: '470.125', rxFreq: '470.125', band: 'UHF', license: 'FWC-RF-2026-B', status: 'coordinated', venue: 'MetLife', notes: 'RTS IFB-325 cord packs' },
      { id: 'rf3', service: 'FreeSpeak beltpacks', txFreq: '1920–1930', rxFreq: '1920–1930', band: '1.9 GHz DECT', license: 'Part 15', status: 'cleared', venue: 'Compound', notes: "Riedel Bolero" },
      { id: 'rf4', service: 'Cam RF (ENG B/U)', txFreq: '2.412', rxFreq: '2.412', band: '2.4 GHz', license: 'unlicensed', status: 'pending', venue: 'Stadium bowl', notes: 'Coordinate vs Wi-Fi AP plan' }
    ];
    o.sat = [
      {
        id: 'sat1',
        bird: 'SES-1',
        tp: '12C',
        pol: 'H',
        fec: '3/4',
        symbolRate: '30 Msym/s',
        uplinkTruck: "Neptune",
        windowStart: '2026-07-19T14:00:00Z',
        windowEnd: '2026-07-19T23:30:00Z',
        contingency: 'Galaxy 17 Ku',
        status: 'confirmed',
        notes: 'Contingency path if FO fails; dual-illuminate rehersal Jul 18'
      }
    ];
    o.goNoGoNotes = "FO primary + LiveU LU800/U + sat contingency. TOC signal confirmation required T-90.";
    o.remi = { contribMs: 85, returnMs: 95, budgetMs: 250, path: "Harmonic XOS→Miami + Makito SRT return", notes: 'REMI delay budget 250ms end-to-end; measure at tech reh' };
    o.weatherHold = false;
    return o;
  }

  function seedSail(p) {
    var o = ensure(p);
    if (o.signalPath.length) {
      if (!o.remi || !(parseFloat(o.remi.budgetMs) > 0))
        o.remi = { contribMs: 180, returnMs: 40, budgetMs: 350, path: "LiveU LU800 bonded → PCR 4", notes: 'Harbor cellular; raise budget if rain fade' };
      return o;
    }
    o.signalPath = [
      { id: 'sp1', order: 1, name: 'Dockside Cam package', type: 'Camera / Source', from: 'Harbor set', to: "Venus", status: 'green', lastGood: nowISO(), notes: '4× HDC-3500' },
      { id: 'sp2', order: 2, name: "LiveU LU800 primary", type: 'Contribution Cellular', from: "Venus", to: 'PCR 4', status: 'green', lastGood: nowISO(), notes: 'Bonded 5-band' },
      { id: 'sp3', order: 3, name: 'PCR 4 plant', type: 'Plant Router / Matrix', from: 'PCR 4', to: 'Network', status: 'green', lastGood: nowISO(), notes: '16× HD-SDI' },
      { id: 'sp4', order: 4, name: 'TOC final', type: 'Distribution / TOC', from: 'PCR 4', to: 'Air', status: 'green', lastGood: nowISO(), notes: 'Confirmed' }
    ];
    o.truck = {
      name: "Venus",
      type: 'Flypack',
      matrix: '16× HD-SDI',
      bulkheadFiber: 12,
      bulkheadCoax: 16,
      hvac: 'Portable',
      weightLbs: 4200,
      bayMap: "Single bay · LiveU LU800 · audio rack",
      notes: '200A shore dockside'
    };
    o.power = {
      shoreA: 200,
      genA: 0,
      busA: 85,
      busB: 0,
      loads: [
        { id: 'pl1', name: 'Cameras', amps: 32, bus: 'A' },
        { id: 'pl2', name: "LiveU LU800 + TX", amps: 18, bus: 'A' },
        { id: 'pl3', name: 'Audio CL5', amps: 14, bus: 'A' },
        { id: 'pl4', name: "EVS XT-VIA", amps: 12, bus: 'A' }
      ],
      notes: 'Shore only · gen not staged'
    };
    o.rf = [
      { id: 'rf1', service: 'Talent lav', txFreq: '524.000', rxFreq: '524.000', band: 'UHF', license: 'SAIL-RF-1', status: 'coordinated', venue: 'Battery Park', notes: "DPA 4066" },
      { id: 'rf2', service: 'IFB Telex', txFreq: '470.500', rxFreq: '470.500', band: 'UHF', license: 'SAIL-RF-2', status: 'cleared', venue: 'Dock', notes: 'BTR-800' }
    ];
    o.sat = [];
    o.goNoGoNotes = 'Cellular primary — weather hold if bond <15 Mbps.';
    o.remi = { contribMs: 180, returnMs: 40, budgetMs: 350, path: "LiveU LU800 bonded → PCR 4", notes: 'Harbor cellular; raise budget if rain fade' };
    o.weatherHold = false;
    return o;
  }

  function seedShowcase() {
    try {
      var prods = global.productions;
      if (!prods) return;
      if (prods.museaitour) seedWorldCup(prods.museaitour);
      if (prods.raybangen3) seedSail(prods.raybangen3);
      /* Orion Reveal gets sparse red path so Go/No-Go demonstrates risk */
      if (prods.orion) {
        var o = ensure(prods.orion);
        if (!o.signalPath.length) {
          o.signalPath = [
            { id: 'sp1', order: 1, name: 'Venue fiber survey', type: 'Contribution Fiber', from: 'Levi\'s compound', to: 'PCR TBD', status: 'red', lastGood: '', notes: '6,000m survey pending' },
            { id: 'sp2', order: 2, name: 'Power plant', type: 'Plant Router / Matrix', from: 'Shore', to: 'Truck', status: 'red', lastGood: '', notes: '400A not confirmed' }
          ];
          o.truck = {
            name: "Mars",
            type: 'OB Truck',
            matrix: 'TBD',
            bulkheadFiber: 0,
            bulkheadCoax: 0,
            hvac: 'TBD',
            weightLbs: 0,
            bayMap: '',
            notes: 'Power confirmation outstanding'
          };
          o.power = {
            shoreA: 400,
            genA: 0,
            busA: 0,
            busB: 0,
            loads: [{ id: 'pl1', name: 'Unconfirmed plant', amps: 0, bus: 'Shore' }],
            notes: 'Escalated to VP — no continuous load plan'
          };
          o.rf = [
            { id: 'rf1', service: 'TBD host RF', txFreq: '', rxFreq: '', band: 'UHF', license: '', status: 'pending', venue: 'Levi\'s', notes: 'Spec draft' }
          ];
          o.goNoGoNotes = 'NO-GO until power + fiber survey clear.';
        }
      }
    } catch (e) {}
  }

  /* ---- Power math ---- */
  function powerRollup(power) {
    power = power || {};
    var loads = power.loads || [];
    var total = 0;
    var invalid = false;
    function amps(value) {
      if (value == null || value === '') return 0;
      var n = Number(value);
      if (!isFinite(n) || n < 0) { invalid = true; return 0; }
      return n;
    }
    loads.forEach(function (l) {
      total += amps(l.amps);
    });
    var available = Math.max(amps(power.shoreA), amps(power.genA));
    var buses = amps(power.busA) + amps(power.busB);
    if (!available) available = buses;
    var pct = available > 0 ? Math.round((total / available) * 100) : 0;
    var level = invalid || available <= 0 ? 'unknown' : pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green';
    return { totalAmps: Math.round(total * 10) / 10, available: available, pct: pct, level: level };
  }

  /* ---- RF clash detector ---- */
  function rfClashes(rfRows, allProductions, exceptKey) {
    var clashes = [];
    var rows = (rfRows || []).slice();
    /* intra-production */
    for (var i = 0; i < rows.length; i++) {
      for (var j = i + 1; j < rows.length; j++) {
        var a = rows[i],
          b = rows[j];
        if (freqClash(a, b)) {
          clashes.push({
            a: a.service || a.id,
            b: b.service || b.id,
            reason: 'Same production: TX/RX overlap on ' + (a.band || 'band'),
            severity: 'high'
          });
        }
      }
    }
    /* cross-production same venue keyword */
    try {
      var prods = allProductions || global.productions || {};
      var order = global.order || Object.keys(prods);
      order.forEach(function (k) {
        if (k === exceptKey) return;
        var other = prods[k];
        if (!other || !other.broadcastOps || !other.broadcastOps.rf) return;
        other.broadcastOps.rf.forEach(function (or) {
          rows.forEach(function (r) {
            if (freqClash(r, or) && sameVenueHint(r.venue, or.venue)) {
              clashes.push({
                a: r.service || r.id,
                b: (other.name || k) + ' · ' + (or.service || or.id),
                reason: 'Cross-show RF near same venue',
                severity: 'medium'
              });
            }
          });
        });
      });
    } catch (e) {}
    return clashes;
  }

  function parseFreqMHz(s) {
    if (s == null || s === '') return null;
    var t = String(s).trim().toLowerCase();
    var m = t.match(/([\d.]+)\s*(ghz|mhz|khz)?/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (isNaN(n)) return null;
    var u = m[2] || 'mhz';
    if (u === 'ghz') n *= 1000;
    if (u === 'khz') n /= 1000;
    return n;
  }

  function freqClash(a, b) {
    var fa = parseFreqMHz(a.txFreq) || parseFreqMHz(a.rxFreq);
    var fb = parseFreqMHz(b.txFreq) || parseFreqMHz(b.rxFreq);
    if (fa == null || fb == null) return false;
    /* 200 kHz guard for UHF-class services */
    return Math.abs(fa - fb) < 0.2;
  }

  function sameVenueHint(va, vb) {
    va = String(va || '').toLowerCase();
    vb = String(vb || '').toLowerCase();
    if (!va || !vb) return false;
    return va.indexOf(vb) >= 0 || vb.indexOf(va) >= 0;
  }

  /* ---- Go / No-Go ---- */
  function computeGoNoGo(key) {
    var prods = global.productions || {};
    var p = prods[key];
    if (!p) return { decision: 'NO-GO', score: 0, checks: [], summary: 'Unknown production' };
    var o = ensure(p);
    var checks = [];

    /* Signal path */
    var hops = o.signalPath || [];
    var redHops = hops.filter(function (h) {
      return h.status === 'red';
    });
    var amberHops = hops.filter(function (h) {
      return h.status === 'amber';
    });
    var greenHops = hops.filter(function (h) {
      return h.status === 'green';
    });
    var staleHops = greenHops.filter(function (h) {
      var verified = Date.parse(h.lastGood || '');
      return !isFinite(verified) || verified > Date.now() || Date.now() - verified > 24 * 60 * 60 * 1000;
    });
    if (!hops.length) {
      checks.push({ id: 'signal', label: 'Signal path', ok: false, level: 'amber', detail: 'No hops defined' });
    } else if (redHops.length) {
      checks.push({
        id: 'signal',
        label: 'Signal path',
        ok: false,
        level: 'red',
        detail: redHops.length + ' red hop(s): ' + redHops.map(function (h) {
          return h.name;
        }).join(', ')
      });
    } else if (greenHops.length !== hops.length || staleHops.length) {
      checks.push({
        id: 'signal',
        label: 'Signal path',
        ok: false,
        level: 'amber',
        detail: greenHops.length + ' green · ' + amberHops.length + ' amber · ' + (hops.length - greenHops.length - amberHops.length) + ' unverified' + (staleHops.length ? ' · ' + staleHops.length + ' need a current last-good check' : '')
      });
    } else {
      checks.push({
        id: 'signal',
        label: 'Signal path',
        ok: true,
        level: 'green',
        detail: hops.length + ' hops green'
      });
    }

    /* Power */
    var pr = powerRollup(o.power);
    if (pr.level === 'red') {
      checks.push({ id: 'power', label: 'Power load', ok: false, level: 'red', detail: pr.pct + '% of available (' + pr.totalAmps + 'A / ' + pr.available + 'A)' });
    } else if (pr.level === 'amber') {
      checks.push({ id: 'power', label: 'Power load', ok: true, level: 'amber', detail: pr.pct + '% continuous — above 80% derate' });
    } else if (pr.level === 'unknown') {
      checks.push({ id: 'power', label: 'Power load', ok: false, level: 'amber', detail: 'Capacity unverified or invalid power data — confirm supply and loads' });
    } else {
      checks.push({ id: 'power', label: 'Power load', ok: true, level: 'green', detail: pr.pct + '% · ' + pr.totalAmps + 'A of ' + pr.available + 'A' });
    }

    /* RF */
    var clashes = rfClashes(o.rf, prods, key);
    var pendingRf = (o.rf || []).filter(function (r) {
      return r.status === 'pending' || r.status === 'clash';
    });
    if (clashes.length || pendingRf.some(function (r) {
      return r.status === 'clash';
    })) {
      checks.push({ id: 'rf', label: 'RF coordination', ok: false, level: 'red', detail: (clashes.length || pendingRf.length) + ' clash/pending issue(s)' });
    } else if (pendingRf.length) {
      checks.push({ id: 'rf', label: 'RF coordination', ok: true, level: 'amber', detail: pendingRf.length + ' pending coordination' });
    } else if (!(o.rf || []).length) {
      checks.push({ id: 'rf', label: 'RF coordination', ok: true, level: 'amber', detail: 'No RF rows (ok for hardwire-only)' });
    } else {
      checks.push({ id: 'rf', label: 'RF coordination', ok: true, level: 'green', detail: o.rf.length + ' service(s) clear' });
    }

    /* Sat windows if any */
    var sats = o.sat || [];
    if (sats.length) {
      var badSat = sats.filter(function (s) {
        return s.status === 'failed' || !s.bird;
      });
      var openish = sats.filter(function (s) {
        return s.status === 'confirmed' || s.status === 'booked' || s.status === 'window-open' || s.status === 'live';
      });
      if (badSat.length) {
        checks.push({ id: 'sat', label: 'Satellite', ok: false, level: 'red', detail: badSat.length + ' failed/incomplete booking(s)' });
      } else if (openish.length) {
        checks.push({ id: 'sat', label: 'Satellite', ok: true, level: 'green', detail: openish.length + ' bird(s) booked/confirmed' });
      } else {
        checks.push({ id: 'sat', label: 'Satellite', ok: true, level: 'amber', detail: 'Sat rows present — status not confirmed' });
      }
    }

    /* Weather hold flag + live band if present */
    try {
      if (o.weatherHold) {
        checks.push({ id: 'weather', label: 'Weather', ok: false, level: 'red', detail: 'Weather hold active — ops notes' });
      } else if (p._wx && p._wx.current) {
        var wcode = p._wx.current.weather_code;
        var wgust = p._wx.current.wind_gusts_10m || p._wx.current.wind_speed_10m || 0;
        var severe = (typeof global.wxSevere === 'function')
          ? global.wxSevere(wcode, wgust, (p._wx.daily && p._wx.daily.precipitation_probability_max && p._wx.daily.precipitation_probability_max[0]) || 0)
          : (wcode >= 95 || wgust >= 45);
        if (severe) checks.push({ id: 'weather', label: 'Weather', ok: false, level: 'amber', detail: 'Severe / high wind in venue forecast' });
        else checks.push({ id: 'weather', label: 'Weather', ok: true, level: 'green', detail: 'No weather hold · forecast nominal' });
      } else {
        checks.push({ id: 'weather', label: 'Weather', ok: true, level: 'amber', detail: 'No live forecast yet · open production for weather band' });
      }
    } catch (eW) {}

    /* REMI delay budget */
    try {
      var rm = o.remi || {};
      var totalMs = (parseFloat(rm.contribMs) || 0) + (parseFloat(rm.returnMs) || 0);
      var budget = parseFloat(rm.budgetMs) || 0;
      if (budget > 0 && totalMs > 0) {
        if (totalMs > budget) checks.push({ id: 'remi', label: 'REMI delay', ok: false, level: 'red', detail: totalMs + 'ms > ' + budget + 'ms budget' });
        else if (totalMs > budget * 0.85) checks.push({ id: 'remi', label: 'REMI delay', ok: true, level: 'amber', detail: totalMs + 'ms of ' + budget + 'ms budget' });
        else checks.push({ id: 'remi', label: 'REMI delay', ok: true, level: 'green', detail: totalMs + 'ms ≤ ' + budget + 'ms budget' });
      } else if (budget > 0) {
        checks.push({ id: 'remi', label: 'REMI delay', ok: true, level: 'amber', detail: 'Budget ' + budget + 'ms — measure contrib/return' });
      }
    } catch (eR) {}

    /* Crew check-in if available */

    try {
      if (typeof global.checkinSummary === 'function') {
        var cs = global.checkinSummary(key);
        if (cs && cs.total > 0) {
          var pct = Math.round((cs.on / cs.total) * 100);
          if (pct < 50) checks.push({ id: 'crew', label: 'Crew on site', ok: false, level: 'amber', detail: cs.on + '/' + cs.total + ' (' + pct + '%)' });
          else checks.push({ id: 'crew', label: 'Crew on site', ok: true, level: pct >= 80 ? 'green' : 'amber', detail: cs.on + '/' + cs.total + ' (' + pct + '%)' });
        }
      }
    } catch (e) {}

    /* Dept critical */
    try {
      var crit = (p.dept || []).filter(function (d) {
        return /Transmission|Power|Cameras|Audio|Legal/i.test(d[0]) && d[1] !== 'approved';
      });
      if (crit.length) {
        checks.push({
          id: 'depts',
          label: 'Critical depts',
          ok: false,
          level: crit.some(function (d) {
            return d[1] === 'missing';
          })
            ? 'red'
            : 'amber',
          detail: crit.map(function (d) {
            return d[0] + '=' + d[1];
          }).join('; ')
        });
      } else {
        checks.push({ id: 'depts', label: 'Critical depts', ok: true, level: 'green', detail: 'TX · Power · Cam · Audio · Legal approved or N/A' });
      }
    } catch (e2) {}

    /* Air readiness if present */
    try {
      if (typeof global.readiness === 'function') {
        var rd = global.readiness(p);
        if (rd && typeof rd.air === 'number') {
          checks.push({
            id: 'air',
            label: 'Air readiness',
            ok: rd.air >= 70,
            level: rd.air >= 80 ? 'green' : rd.air >= 50 ? 'amber' : 'red',
            detail: rd.air + '%'
          });
        }
      }
    } catch (e3) {}

    if(global.MuseLive){try{checks=checks.concat(global.MuseLive.readiness(key));}catch(e){checks.push({id:'live-error',label:'Live operations',level:'amber',detail:'Live evidence could not be verified'});}}
    var reds = checks.filter(function (c) {
      return c.level === 'red';
    }).length;
    var ambers = checks.filter(function (c) {
      return c.level === 'amber';
    }).length;
    var greens = checks.filter(function (c) {
      return c.level === 'green';
    }).length;
    var score = checks.length ? Math.round((greens * 100 + ambers * 50) / (checks.length * 100) * 100) : 0;
    var decision = reds > 0 ? 'NO-GO' : ambers > 0 ? 'CONDITIONAL' : 'GO';
    return {
      decision: decision,
      score: score,
      checks: checks,
      summary: decision + ' · ' + greens + ' green · ' + ambers + ' amber · ' + reds + ' red',
      notes: o.goNoGoNotes || ''
    };
  }

  /* ---- Techbook snapshot / diff ---- */
  function snapshotFields(p) {
    var out = {};
    try {
      var tf = p.tbFields || {};
      Object.keys(tf).forEach(function (dep) {
        var fields = tf[dep] || {};
        Object.keys(fields).forEach(function (fk) {
          var v = fields[fk];
          if (v == null || v === '') return;
          if (Array.isArray(v)) {
            try {
              v = JSON.stringify(v);
            } catch (e) {
              v = String(v);
            }
          }
          out[dep + '.' + fk] = String(v);
        });
      });
      (p.dept || []).forEach(function (d) {
        out['dept.' + d[0] + '.status'] = d[1] || '';
        out['dept.' + d[0] + '.note'] = d[2] || '';
      });
      var o = ensure(p);
      out['_ops.signal_hops'] = String((o.signalPath || []).length);
      out['_ops.rf_rows'] = String((o.rf || []).length);
      out['_ops.sat_rows'] = String((o.sat || []).length);
      var pr = powerRollup(o.power);
      out['_ops.power_pct'] = String(pr.pct);
    } catch (e) {}
    return out;
  }

  function simpleHash(obj) {
    var s = '';
    try {
      s = JSON.stringify(obj);
    } catch (e) {
      s = '';
    }
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function recordTechbookExport(key) {
    var prods = global.productions || {};
    var p = prods[key];
    if (!p) return null;
    var o = ensure(p);
    var fields = snapshotFields(p);
    o.lastTechbookSnap = {
      at: nowISO(),
      hash: simpleHash(fields),
      fields: fields
    };
    stamp(key);
    return o.lastTechbookSnap;
  }

  function techbookDiff(key) {
    var prods = global.productions || {};
    var p = prods[key];
    if (!p) return { hasSnap: false, changes: [], at: null };
    var o = ensure(p);
    var snap = o.lastTechbookSnap;
    var cur = snapshotFields(p);
    if (!snap || !snap.fields) {
      return { hasSnap: false, changes: [], at: null, currentHash: simpleHash(cur) };
    }
    var prev = snap.fields;
    var keys = {};
    Object.keys(prev).forEach(function (k) {
      keys[k] = 1;
    });
    Object.keys(cur).forEach(function (k) {
      keys[k] = 1;
    });
    var changes = [];
    Object.keys(keys).forEach(function (k) {
      var a = prev[k];
      var b = cur[k];
      if (a === b) return;
      if (a == null && b != null) changes.push({ field: k, from: '(none)', to: b, kind: 'added' });
      else if (a != null && b == null) changes.push({ field: k, from: a, to: '(removed)', kind: 'removed' });
      else changes.push({ field: k, from: a, to: b, kind: 'changed' });
    });
    changes.sort(function (x, y) {
      return x.field < y.field ? -1 : 1;
    });
    return {
      hasSnap: true,
      at: snap.at,
      changes: changes,
      count: changes.length,
      currentHash: simpleHash(cur),
      prevHash: snap.hash
    };
  }

  /* ---- Mutators (called from inline onclick) ---- */
  function getP(key) {
    return (global.productions || {})[key];
  }

  function setHopField(key, hopId, field, val) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    for (var i = 0; i < o.signalPath.length; i++) {
      if (o.signalPath[i].id === hopId) {
        o.signalPath[i][field] = val;
        if (field === 'status' && val === 'green') o.signalPath[i].lastGood = nowISO();
        break;
      }
    }
    stamp(key);
    rerender(key);
  }

  function addHop(key) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.signalPath.push({
      id: uid('sp'),
      order: o.signalPath.length + 1,
      name: 'New hop',
      type: 'Contribution Fiber',
      from: '',
      to: '',
      status: 'unknown',
      lastGood: '',
      notes: ''
    });
    stamp(key);
    rerender(key);
    toast('Signal hop added');
  }

  function delHop(key, hopId) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.signalPath = o.signalPath.filter(function (h) {
      return h.id !== hopId;
    });
    stamp(key);
    rerender(key);
  }

  function setTruckField(key, field, val) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    if (field === 'bulkheadFiber' || field === 'bulkheadCoax' || field === 'weightLbs') val = parseFloat(val) || 0;
    o.truck[field] = val;
    stamp(key);
  }

  function setPowerField(key, field, val) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    if (/A$|shore|gen|bus/i.test(field)) val = parseFloat(val) || 0;
    o.power[field] = val;
    stamp(key);
    rerender(key);
  }

  function addPowerLoad(key) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.power.loads.push({ id: uid('pl'), name: 'New load', amps: 10, bus: 'A' });
    stamp(key);
    rerender(key);
  }

  function setPowerLoad(key, loadId, field, val) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    for (var i = 0; i < o.power.loads.length; i++) {
      if (o.power.loads[i].id === loadId) {
        if (field === 'amps') val = parseFloat(val) || 0;
        o.power.loads[i][field] = val;
        break;
      }
    }
    stamp(key);
    if (field === 'amps' || field === 'bus') rerender(key);
  }

  function delPowerLoad(key, loadId) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.power.loads = o.power.loads.filter(function (l) {
      return l.id !== loadId;
    });
    stamp(key);
    rerender(key);
  }

  function addRf(key) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.rf.push({
      id: uid('rf'),
      service: 'New service',
      txFreq: '',
      rxFreq: '',
      band: 'UHF',
      license: '',
      status: 'pending',
      venue: '',
      notes: ''
    });
    stamp(key);
    rerender(key);
  }

  function setRfField(key, rfId, field, val) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    for (var i = 0; i < o.rf.length; i++) {
      if (o.rf[i].id === rfId) {
        o.rf[i][field] = val;
        break;
      }
    }
    stamp(key);
    if (field === 'txFreq' || field === 'rxFreq' || field === 'status' || field === 'venue') rerender(key);
  }

  function delRf(key, rfId) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.rf = o.rf.filter(function (r) {
      return r.id !== rfId;
    });
    stamp(key);
    rerender(key);
  }

  function addSat(key) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.sat.push({
      id: uid('sat'),
      bird: '',
      tp: '',
      pol: 'H',
      fec: '3/4',
      symbolRate: '',
      uplinkTruck: '',
      windowStart: '',
      windowEnd: '',
      contingency: '',
      status: 'booked',
      notes: ''
    });
    stamp(key);
    rerender(key);
  }

  function setSatField(key, satId, field, val) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    for (var i = 0; i < o.sat.length; i++) {
      if (o.sat[i].id === satId) {
        o.sat[i][field] = val;
        break;
      }
    }
    stamp(key);
    if (field === 'status' || field === 'bird') rerender(key);
  }

  function delSat(key, satId) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    o.sat = o.sat.filter(function (s) {
      return s.id !== satId;
    });
    stamp(key);
    rerender(key);
  }

  function setGoNotes(key, val) {
    var p = getP(key);
    if (!p) return;
    ensure(p).goNoGoNotes = val;
    stamp(key);
  }

  /* ---- HTML builders ---- */
  function statusDot(st) {
    var c = st === 'green' ? '#31A24C' : st === 'amber' ? '#f56c0b' : st === 'red' ? '#ef4461' : '#9ba2b0';
    return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + ';box-shadow:0 0 0 2px ' + c + '22"></span>';
  }

  function levelBadge(level, text) {
    var map = {
      green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      amber: 'bg-amber-50 text-amber-900 border-amber-200',
      red: 'bg-red-50 text-red-800 border-red-200',
      unknown: 'bg-gray-50 text-gray-600 border-gray-200'
    };
    var cls = map[level] || map.unknown;
    return '<span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ' + cls + '">' + esc(text || level) + '</span>';
  }

  function goNoGoStripHTML(key, compact) {
    var g = computeGoNoGo(key);
    var decCol =
      g.decision === 'GO'
        ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-white'
        : g.decision === 'CONDITIONAL'
          ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-white'
          : 'border-red-300 bg-gradient-to-r from-red-50 to-white';
    var decText =
      g.decision === 'GO' ? 'text-emerald-700' : g.decision === 'CONDITIONAL' ? 'text-amber-800' : 'text-red-700';
    var chips = g.checks
      .map(function (c) {
        return (
          '<div class="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border border-gray-100 bg-white/80">' +
          statusDot(c.level) +
          '<span class="font-semibold text-gray-800">' +
          esc(c.label) +
          '</span>' +
          '<span class="text-gray-500 truncate max-w-[10rem]" title="' +
          esc(c.detail) +
          '">' +
          esc(c.detail) +
          '</span></div>'
        );
      })
      .join('');
    if (compact) {
      return (
        '<div class="rounded-xl border ' +
        decCol +
        ' px-3 py-2 flex flex-wrap items-center justify-between gap-2">' +
        '<div class="flex items-center gap-2"><span class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Day-of Go/No-Go</span>' +
        '<span class="text-lg font-black mono ' +
        decText +
        '">' +
        esc(g.decision) +
        '</span>' +
        '<span class="text-[10px] mono text-gray-500">' +
        g.score +
        '%</span></div>' +
        '<button onclick="setProjTab(\'' +
        key +
        '\',\'ops\')" class="text-[10px] font-bold text-blue-700 hover:underline">Open Broadcast Ops →</button></div>'
      );
    }
    return (
      '<div class="rounded-2xl border ' +
      decCol +
      ' p-4" style="box-shadow:0 4px 20px rgba(0,0,0,.04)">' +
      '<div class="flex flex-wrap items-start justify-between gap-3 mb-3">' +
      '<div><p class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Day-of Go / No-Go Board</p>' +
      '<p class="text-3xl font-black mono ' +
      decText +
      ' tracking-tight">' +
      esc(g.decision) +
      '</p>' +
      '<p class="text-[11px] text-gray-600 mt-0.5">' +
      esc(g.summary) +
      '</p></div>' +
      '<div class="text-right"><p class="text-[9px] uppercase text-gray-400">Score</p><p class="text-2xl font-bold mono text-gray-800">' +
      g.score +
      '%</p></div></div>' +
      '<div class="flex flex-wrap gap-1.5 mb-3">' +
      chips +
      '</div>' +
      '<label class="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">Ops notes</label>' +
      '<textarea onchange="MuseBOps.setGoNotes(\'' +
      key +
      '\',this.value)" rows="2" class="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5" placeholder="Weather hold · TOC T-90 · contingency…">' +
      esc(g.notes) +
      '</textarea></div>'
    );
  }


  function hopChainHTML(key) {
    var p = getP(key);
    if (!p) return '';
    var o = ensure(p);
    var hops = (o.signalPath || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    if (!hops.length) {
      return '<div class="mb-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-400">Define hops below — chain visualization appears here.</div>';
    }
    var nodes = hops
      .map(function (h, i) {
        var col =
          h.status === 'green'
            ? '#31A24C'
            : h.status === 'amber'
              ? '#f56c0b'
              : h.status === 'red'
                ? '#ef4461'
                : '#9ba2b0';
        var arrow =
          i < hops.length - 1
            ? '<span style="color:#9ba2b1;font-size:14px;padding:0 2px;flex-shrink:0">→</span>'
            : '';
        return (
          '<div style="display:flex;align-items:center;gap:0">' +
          '<div title="' +
          esc(h.type || '') +
          (h.notes ? ' · ' + esc(h.notes) : '') +
          '" style="min-width:4.5rem;max-width:7.5rem;padding:6px 8px;border-radius:10px;border:2px solid ' +
          col +
          ';background:' +
          col +
          '14;text-align:center">' +
          '<div style="font:800 9px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:' +
          col +
          ';text-transform:uppercase;letter-spacing:.04em">' +
          esc(h.status || 'unknown') +
          '</div>' +
          '<div style="font:700 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B1C1D;line-height:1.2;margin-top:2px">' +
          esc((h.name || 'Hop').slice(0, 28)) +
          '</div>' +
          '<div style="font:600 8px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#727479;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          esc((h.from || '') + (h.to ? ' → ' + h.to : '')) +
          '</div></div>' +
          arrow +
          '</div>'
        );
      })
      .join('');
    return (
      '<div class="mb-3 rounded-xl border border-gray-100 bg-gradient-to-r from-slate-50 to-white px-3 py-3 overflow-x-auto">' +
      '<p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 mb-2">End-to-end path · live status</p>' +
      '<div style="display:flex;align-items:center;gap:4px;min-width:max-content">' +
      nodes +
      '</div></div>'
    );
  }

  function signalPathHTML(key) {
    var p = getP(key);
    if (!p) return '';
    var o = ensure(p);
    var hops = (o.signalPath || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    var typeOpts = HOP_TYPES.map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
    }).join('');
    var rows = hops
      .map(function (h, idx) {
        var stOpts = HOP_STATUS.map(function (s) {
          return '<option value="' + s + '"' + (h.status === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
        var tOpts = HOP_TYPES.map(function (t) {
          return '<option value="' + esc(t) + '"' + (h.type === t ? ' selected' : '') + '>' + esc(t) + '</option>';
        }).join('');
        return (
          '<tr class="border-b border-gray-50 hover:bg-gray-50/60">' +
          '<td class="py-2 px-1 mono text-[10px] text-gray-400">' +
          (idx + 1) +
          '</td>' +
          '<td class="py-2 px-1">' +
          statusDot(h.status) +
          '</td>' +
          '<td class="py-2 px-1"><input value="' +
          esc(h.name) +
          '" onchange="MuseBOps.setHopField(\'' +
          key +
          '\',\'' +
          h.id +
          '\',\'name\',this.value)" class="w-full text-[11px] font-semibold border border-transparent hover:border-gray-200 rounded px-1" style="outline:none"></td>' +
          '<td class="py-2 px-1"><select onchange="MuseBOps.setHopField(\'' +
          key +
          '\',\'' +
          h.id +
          '\',\'type\',this.value)" class="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white max-w-[9rem]">' +
          tOpts +
          '</select></td>' +
          '<td class="py-2 px-1"><input value="' +
          esc(h.from) +
          '" onchange="MuseBOps.setHopField(\'' +
          key +
          '\',\'' +
          h.id +
          '\',\'from\',this.value)" class="w-full text-[10px] mono border border-transparent hover:border-gray-200 rounded px-1" style="outline:none" placeholder="from"></td>' +
          '<td class="py-2 px-1 text-gray-300">→</td>' +
          '<td class="py-2 px-1"><input value="' +
          esc(h.to) +
          '" onchange="MuseBOps.setHopField(\'' +
          key +
          '\',\'' +
          h.id +
          '\',\'to\',this.value)" class="w-full text-[10px] mono border border-transparent hover:border-gray-200 rounded px-1" style="outline:none" placeholder="to"></td>' +
          '<td class="py-2 px-1"><select onchange="MuseBOps.setHopField(\'' +
          key +
          '\',\'' +
          h.id +
          '\',\'status\',this.value)" class="text-[10px] font-bold border border-gray-200 rounded px-1 py-0.5 bg-white">' +
          stOpts +
          '</select></td>' +
          '<td class="py-2 px-1 text-[9px] mono text-gray-400">' +
          (h.lastGood ? esc(String(h.lastGood).slice(0, 16).replace('T', ' ')) : '—') +
          '</td>' +
          '<td class="py-2 px-1"><input value="' +
          esc(h.notes || '') +
          '" onchange="MuseBOps.setHopField(\'' +
          key +
          '\',\'' +
          h.id +
          '\',\'notes\',this.value)" class="w-full text-[10px] border border-transparent hover:border-gray-200 rounded px-1" style="outline:none" placeholder="notes"></td>' +
          '<td class="py-2 px-1"><button onclick="MuseBOps.delHop(\'' +
          key +
          '\',\'' +
          h.id +
          '\')" class="text-red-400 hover:text-red-600 text-xs">✕</button></td></tr>'
        );
      })
      .join('');
    return (
      '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
      '<div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Signal Path Integrity</h3>' +
      '<p class="text-[10px] text-gray-500 mt-0.5">Source → embed → contribution → RX → plant → encoder → distribution. Last-known-good stamps when hop goes green.</p></div>' +
      '<button onclick="MuseBOps.addHop(\'' +
      key +
      '\')" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-3 py-1.5 hover:bg-gray-800">+ Hop</button></div>' +
      hopChainHTML(key) +
      '<div class="overflow-x-auto"><table class="w-full text-left" style="min-width:860px"><thead><tr class="text-[8px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-200">' +
      '<th class="pb-2 pr-1">#</th><th class="pb-2 pr-1"></th><th class="pb-2 pr-1">Hop</th><th class="pb-2 pr-1">Type</th><th class="pb-2 pr-1">From</th><th></th><th class="pb-2 pr-1">To</th><th class="pb-2 pr-1">Status</th><th class="pb-2 pr-1">Last good</th><th class="pb-2 pr-1">Notes</th><th></th>' +
      '</tr></thead><tbody>' +
      (rows ||
        '<tr><td colspan="11" class="py-6 text-center text-[11px] text-gray-400">No hops yet — add the end-to-end path for this venue.</td></tr>') +
      '</tbody></table></div></div>'
    );
  }

  function truckPowerHTML(key) {
    var p = getP(key);
    if (!p) return '';
    var o = ensure(p);
    var t = o.truck;
    var pow = o.power;
    var pr = powerRollup(pow);
    var barCol = pr.level === 'red' ? '#ef4461' : pr.level === 'amber' ? '#f56c0b' : '#31A24C';
    var loadRows = (pow.loads || [])
      .map(function (l) {
        var busOpts = POWER_BUSES.map(function (b) {
          return '<option value="' + b + '"' + (l.bus === b ? ' selected' : '') + '>' + b + '</option>';
        }).join('');
        return (
          '<tr class="border-b border-gray-50">' +
          '<td class="py-1.5"><input value="' +
          esc(l.name) +
          '" onchange="MuseBOps.setPowerLoad(\'' +
          key +
          '\',\'' +
          l.id +
          '\',\'name\',this.value)" class="w-full text-[11px] border border-transparent hover:border-gray-200 rounded px-1" style="outline:none"></td>' +
          '<td class="py-1.5"><input type="number" step="0.1" value="' +
          (l.amps || 0) +
          '" onchange="MuseBOps.setPowerLoad(\'' +
          key +
          '\',\'' +
          l.id +
          '\',\'amps\',this.value)" class="w-20 text-[11px] mono border border-gray-200 rounded px-1 py-0.5" style="outline:none"></td>' +
          '<td class="py-1.5"><select onchange="MuseBOps.setPowerLoad(\'' +
          key +
          '\',\'' +
          l.id +
          '\',\'bus\',this.value)" class="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white">' +
          busOpts +
          '</select></td>' +
          '<td class="py-1.5"><button onclick="MuseBOps.delPowerLoad(\'' +
          key +
          '\',\'' +
          l.id +
          '\')" class="text-red-400 text-xs">✕</button></td></tr>'
        );
      })
      .join('');
    return (
      '<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">' +
      '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">' +
      '<h3 class="text-xs font-bold uppercase tracking-wider text-gray-600 mb-3">Truck / Plant Profile</h3>' +
      '<div class="grid grid-cols-2 gap-2 text-[11px]">' +
      fld('Name', t.name, 'MuseBOps.setTruckField(\'' + key + '\',\'name\',this.value)') +
      fld('Type', t.type, 'MuseBOps.setTruckField(\'' + key + '\',\'type\',this.value)') +
      fld('Matrix', t.matrix, 'MuseBOps.setTruckField(\'' + key + '\',\'matrix\',this.value)') +
      fld('HVAC', t.hvac, 'MuseBOps.setTruckField(\'' + key + '\',\'hvac\',this.value)') +
      numFld('Fiber bulkhead', t.bulkheadFiber, 'MuseBOps.setTruckField(\'' + key + '\',\'bulkheadFiber\',this.value)') +
      numFld('Coax bulkhead', t.bulkheadCoax, 'MuseBOps.setTruckField(\'' + key + '\',\'bulkheadCoax\',this.value)') +
      numFld('Weight (lbs)', t.weightLbs, 'MuseBOps.setTruckField(\'' + key + '\',\'weightLbs\',this.value)') +
      '</div>' +
      '<label class="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-3 mb-1">Bay map</label>' +
      '<textarea onchange="MuseBOps.setTruckField(\'' +
      key +
      '\',\'bayMap\',this.value)" rows="2" class="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5">' +
      esc(t.bayMap || '') +
      '</textarea>' +
      '<label class="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-2 mb-1">Notes</label>' +
      '<textarea onchange="MuseBOps.setTruckField(\'' +
      key +
      '\',\'notes\',this.value)" rows="2" class="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5">' +
      esc(t.notes || '') +
      '</textarea></div>' +
      '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">' +
      '<div class="flex items-center justify-between mb-2"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Power Bus &amp; Load</h3>' +
      levelBadge(pr.level, pr.level === 'unknown' ? 'Unverified' : pr.pct + '% load') +
      '</div>' +
      '<div class="mb-3"><div style="height:10px;background:#eeeff2;border-radius:5px;overflow:hidden"><div style="width:' +
      Math.min(pr.pct, 100) +
      '%;height:100%;background:' +
      barCol +
      '"></div></div>' +
      '<p class="text-[10px] mono text-gray-600 mt-1">' +
      pr.totalAmps +
      'A continuous · ' +
      pr.available +
      'A available · warn ≥80%</p></div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">' +
      numFld('Shore A', pow.shoreA, 'MuseBOps.setPowerField(\'' + key + '\',\'shoreA\',this.value)') +
      numFld('Gen A', pow.genA, 'MuseBOps.setPowerField(\'' + key + '\',\'genA\',this.value)') +
      numFld('Bus A', pow.busA, 'MuseBOps.setPowerField(\'' + key + '\',\'busA\',this.value)') +
      numFld('Bus B', pow.busB, 'MuseBOps.setPowerField(\'' + key + '\',\'busB\',this.value)') +
      '</div>' +
      '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-bold text-gray-600">Loads</span>' +
      '<button onclick="MuseBOps.addPowerLoad(\'' +
      key +
      '\')" class="text-[10px] font-bold text-blue-700">+ Load</button></div>' +
      '<table class="w-full text-left text-[11px]"><thead><tr class="text-[8px] uppercase text-gray-400 border-b"><th class="pb-1">Circuit</th><th class="pb-1">Amps</th><th class="pb-1">Bus</th><th></th></tr></thead><tbody>' +
      (loadRows || '<tr><td colspan="4" class="py-3 text-gray-400 text-center">No loads</td></tr>') +
      '</tbody></table>' +
      '<label class="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-2 mb-1">Power notes</label>' +
      '<textarea onchange="MuseBOps.setPowerField(\'' +
      key +
      '\',\'notes\',this.value)" rows="2" class="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5">' +
      esc(pow.notes || '') +
      '</textarea></div></div>'
    );
  }

  function fld(label, val, onchange) {
    return (
      '<div><label class="text-[8px] font-bold uppercase tracking-wider text-gray-400">' +
      esc(label) +
      '</label><input value="' +
      esc(val || '') +
      '" onchange="' +
      onchange +
      '" class="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1 mt-0.5" style="outline:none"></div>'
    );
  }
  function numFld(label, val, onchange) {
    return (
      '<div><label class="text-[8px] font-bold uppercase tracking-wider text-gray-400">' +
      esc(label) +
      '</label><input type="number" step="1" value="' +
      (val || 0) +
      '" onchange="' +
      onchange +
      '" class="w-full text-[11px] mono border border-gray-200 rounded-lg px-2 py-1 mt-0.5" style="outline:none"></div>'
    );
  }

  function rfHTML(key) {
    var p = getP(key);
    if (!p) return '';
    var o = ensure(p);
    var clashes = rfClashes(o.rf, global.productions, key);
    var clashBanner = clashes.length
      ? '<div class="mb-3 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><span class="font-bold">RF CLASH</span> — ' +
        clashes
          .map(function (c) {
            return esc(c.a) + ' ↔ ' + esc(c.b) + ' (' + esc(c.reason) + ')';
          })
          .join(' · ') +
        '</div>'
      : '<div class="mb-3 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-semibold">No frequency clashes detected (intra + cross-show same venue).</div>';
    var rows = (o.rf || [])
      .map(function (r) {
        var stOpts = RF_STATUS.map(function (s) {
          return '<option value="' + s + '"' + (r.status === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
        var bOpts = RF_BANDS.map(function (b) {
          return '<option value="' + esc(b) + '"' + (r.band === b ? ' selected' : '') + '>' + esc(b) + '</option>';
        }).join('');
        return (
          '<tr class="border-b border-gray-50">' +
          '<td class="py-1.5"><input value="' +
          esc(r.service) +
          '" onchange="MuseBOps.setRfField(\'' +
          key +
          '\',\'' +
          r.id +
          '\',\'service\',this.value)" class="w-full text-[11px] font-semibold border-0 bg-transparent" style="outline:none"></td>' +
          '<td class="py-1.5"><input value="' +
          esc(r.txFreq) +
          '" onchange="MuseBOps.setRfField(\'' +
          key +
          '\',\'' +
          r.id +
          '\',\'txFreq\',this.value)" class="w-24 text-[10px] mono border border-gray-200 rounded px-1" placeholder="MHz"></td>' +
          '<td class="py-1.5"><input value="' +
          esc(r.rxFreq) +
          '" onchange="MuseBOps.setRfField(\'' +
          key +
          '\',\'' +
          r.id +
          '\',\'rxFreq\',this.value)" class="w-24 text-[10px] mono border border-gray-200 rounded px-1"></td>' +
          '<td class="py-1.5"><select onchange="MuseBOps.setRfField(\'' +
          key +
          '\',\'' +
          r.id +
          '\',\'band\',this.value)" class="text-[10px] border border-gray-200 rounded px-1 bg-white">' +
          bOpts +
          '</select></td>' +
          '<td class="py-1.5"><input value="' +
          esc(r.license) +
          '" onchange="MuseBOps.setRfField(\'' +
          key +
          '\',\'' +
          r.id +
          '\',\'license\',this.value)" class="w-28 text-[10px] mono border border-gray-200 rounded px-1"></td>' +
          '<td class="py-1.5"><select onchange="MuseBOps.setRfField(\'' +
          key +
          '\',\'' +
          r.id +
          '\',\'status\',this.value)" class="text-[10px] font-bold border border-gray-200 rounded px-1 bg-white">' +
          stOpts +
          '</select></td>' +
          '<td class="py-1.5"><input value="' +
          esc(r.venue) +
          '" onchange="MuseBOps.setRfField(\'' +
          key +
          '\',\'' +
          r.id +
          '\',\'venue\',this.value)" class="w-24 text-[10px] border border-gray-200 rounded px-1"></td>' +
          '<td class="py-1.5"><button onclick="MuseBOps.delRf(\'' +
          key +
          '\',\'' +
          r.id +
          '\')" class="text-red-400 text-xs">✕</button></td></tr>'
        );
      })
      .join('');
    return (
      '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
      '<div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">RF Coordination</h3>' +
      '<p class="text-[10px] text-gray-500">TX/RX · band · license · clash detector (200 kHz guard + cross-show venue match)</p></div>' +
      '<button onclick="MuseBOps.addRf(\'' +
      key +
      '\')" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-3 py-1.5">+ Service</button></div>' +
      clashBanner +
      '<div class="overflow-x-auto"><table class="w-full text-left" style="min-width:720px"><thead><tr class="text-[8px] font-bold uppercase text-gray-400 border-b">' +
      '<th class="pb-2">Service</th><th class="pb-2">TX</th><th class="pb-2">RX</th><th class="pb-2">Band</th><th class="pb-2">License</th><th class="pb-2">Status</th><th class="pb-2">Venue</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8" class="py-4 text-center text-gray-400 text-[11px]">No RF services</td></tr>') +
      '</tbody></table></div></div>'
    );
  }

  function satHTML(key) {
    var p = getP(key);
    if (!p) return '';
    var o = ensure(p);
    var cards = (o.sat || [])
      .map(function (s) {
        var stOpts = SAT_STATUS.map(function (st) {
          return '<option value="' + st + '"' + (s.status === st ? ' selected' : '') + '>' + st + '</option>';
        }).join('');
        return (
          '<div class="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4">' +
          '<div class="flex items-start justify-between gap-2 mb-2">' +
          '<div class="flex items-center gap-2"><span class="text-lg">🛰</span><div>' +
          '<input value="' +
          esc(s.bird) +
          '" placeholder="Bird (e.g. SES-1)" onchange="MuseBOps.setSatField(\'' +
          key +
          '\',\'' +
          s.id +
          '\',\'bird\',this.value)" class="text-sm font-bold text-gray-900 bg-transparent border-0 w-full" style="outline:none">' +
          '<p class="text-[9px] mono text-indigo-600">TP ' +
          esc(s.tp || '—') +
          ' · Pol ' +
          esc(s.pol || '—') +
          '</p></div></div>' +
          '<div class="flex items-center gap-1"><select onchange="MuseBOps.setSatField(\'' +
          key +
          '\',\'' +
          s.id +
          '\',\'status\',this.value)" class="text-[9px] font-bold border border-indigo-200 rounded px-1.5 py-0.5 bg-white">' +
          stOpts +
          '</select>' +
          '<button onclick="MuseBOps.delSat(\'' +
          key +
          '\',\'' +
          s.id +
          '\')" class="text-red-400 text-xs px-1">✕</button></div></div>' +
          '<div class="grid grid-cols-2 gap-2 text-[11px]">' +
          mini('Transponder', s.tp, key, s.id, 'tp') +
          mini('Polarization', s.pol, key, s.id, 'pol') +
          mini('FEC', s.fec, key, s.id, 'fec') +
          mini('Symbol rate', s.symbolRate, key, s.id, 'symbolRate') +
          mini('Uplink truck', s.uplinkTruck, key, s.id, 'uplinkTruck') +
          mini('Contingency bird', s.contingency, key, s.id, 'contingency') +
          mini('Window start (UTC)', s.windowStart, key, s.id, 'windowStart') +
          mini('Window end (UTC)', s.windowEnd, key, s.id, 'windowEnd') +
          '</div>' +
          '<textarea onchange="MuseBOps.setSatField(\'' +
          key +
          '\',\'' +
          s.id +
          '\',\'notes\',this.value)" rows="2" class="w-full mt-2 text-[10px] border border-indigo-100 rounded-lg px-2 py-1" placeholder="Notes…">' +
          esc(s.notes || '') +
          '</textarea></div>'
        );
      })
      .join('');
    return (
      '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
      '<div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Satellite Contribution</h3>' +
      '<p class="text-[10px] text-gray-500">Bird · TP · pol · FEC · symbol rate · uplink truck · UTC window · contingency</p></div>' +
      '<button onclick="MuseBOps.addSat(\'' +
      key +
      '\')" class="text-[10px] font-bold text-white bg-indigo-700 rounded-lg px-3 py-1.5 hover:bg-indigo-800">+ Booking</button></div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
      (cards ||
        '<p class="text-[11px] text-gray-400 col-span-2 py-4 text-center">No satellite bookings — FO/cellular-only path is fine.</p>') +
      '</div></div>'
    );
  }

  function mini(label, val, key, id, field) {
    return (
      '<div><label class="text-[8px] font-bold uppercase text-gray-400">' +
      esc(label) +
      '</label><input value="' +
      esc(val || '') +
      '" onchange="MuseBOps.setSatField(\'' +
      key +
      '\',\'' +
      id +
      '\',\'' +
      field +
      '\',this.value)" class="w-full text-[10px] mono border border-gray-200 rounded px-1.5 py-1 mt-0.5" style="outline:none"></div>'
    );
  }

  function techbookDiffHTML(key) {
    var d = techbookDiff(key);
    var body;
    if (!d.hasSnap) {
      body =
        '<p class="text-[11px] text-gray-600">No prior techbook export snapshot yet. The next <b>Techbook PDF · live</b> download will create a baseline; subsequent exports will list every field that changed.</p>';
    } else if (!d.changes.length) {
      body =
        '<p class="text-[11px] text-emerald-700 font-semibold">No changes since last export (' +
        esc(String(d.at || '').slice(0, 19).replace('T', ' ')) +
        ' UTC).</p>';
    } else {
      body =
        '<p class="text-[11px] text-amber-800 font-semibold mb-2">' +
        d.changes.length +
        ' change(s) since ' +
        esc(String(d.at || '').slice(0, 19).replace('T', ' ')) +
        ' UTC</p>' +
        '<div class="max-h-48 overflow-y-auto border border-gray-100 rounded-lg">' +
        d.changes
          .slice(0, 80)
          .map(function (c) {
            return (
              '<div class="px-2 py-1.5 border-b border-gray-50 text-[10px]"><span class="font-bold mono text-gray-700">' +
              esc(c.field) +
              '</span><br><span class="text-red-600 line-through">' +
              esc(String(c.from).slice(0, 80)) +
              '</span> → <span class="text-emerald-700">' +
              esc(String(c.to).slice(0, 80)) +
              '</span></div>'
            );
          })
          .join('') +
        (d.changes.length > 80 ? '<p class="text-[9px] text-gray-400 p-2">…and ' + (d.changes.length - 80) + ' more</p>' : '') +
        '</div>';
    }
    return (
      '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
      '<div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Techbook Change Control</h3>' +
      '<p class="text-[10px] text-gray-500">Diff vs last PDF export — what changed in the plan of record</p></div>' +
      '<button onclick="downloadTechbook(\'' +
      key +
      '\')" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-3 py-1.5">⬇ Export live + snapshot</button></div>' +
      body +
      '</div>'
    );
  }


  function remiHTML(key) {
    var p = getP(key);
    if (!p) return '';
    var o = ensure(p);
    var r = o.remi || emptyOps().remi;
    var total = (parseFloat(r.contribMs) || 0) + (parseFloat(r.returnMs) || 0);
    var budget = parseFloat(r.budgetMs) || 0;
    var pct = budget > 0 ? Math.round((total / budget) * 100) : 0;
    var level = !budget ? 'unknown' : total > budget ? 'red' : total > budget * 0.85 ? 'amber' : 'green';
    var barCol = level === 'red' ? '#ef4461' : level === 'amber' ? '#f56c0b' : '#31A24C';
    return (
      '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
      '<div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">REMI / Network Delay Budget</h3>' +
      '<p class="text-[10px] text-gray-500">Contribution + return path latency (ms) vs agreed air delay budget</p></div>' +
      levelBadge(level, total + ' / ' + budget + ' ms') +
      '</div>' +
      '<div class="mb-3"><div style="height:8px;background:#eeeff2;border-radius:4px;overflow:hidden"><div style="width:' +
      Math.min(pct, 100) +
      '%;height:100%;background:' +
      barCol +
      '"></div></div>' +
      '<p class="text-[10px] mono text-gray-500 mt-1">' +
      pct +
      '% of budget · warn ≥85% · fail &gt;100%</p></div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' +
      numFld('Contrib ms', r.contribMs, "MuseBOps.setRemiField('" + key + "','contribMs',this.value)") +
      numFld('Return ms', r.returnMs, "MuseBOps.setRemiField('" + key + "','returnMs',this.value)") +
      numFld('Budget ms', r.budgetMs, "MuseBOps.setRemiField('" + key + "','budgetMs',this.value)") +
      fld('Path label', r.path || '', "MuseBOps.setRemiField('" + key + "','path',this.value)") +
      '</div>' +
      '<label class="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-2 mb-1">REMI notes</label>' +
      '<textarea onchange="MuseBOps.setRemiField(\'' +
      key +
      '\',\'notes\',this.value)" rows="2" class="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5">' +
      esc(r.notes || '') +
      '</textarea>' +
      '<label class="flex items-center gap-2 mt-3 text-[11px] font-semibold text-gray-700">' +
      '<input type="checkbox" ' +
      (o.weatherHold ? 'checked ' : '') +
      'onchange="MuseBOps.setWeatherHold(\'' +
      key +
      '\',this.checked)" class="rounded border-gray-300">' +
      'Weather hold active (forces Go/No-Go to NO-GO)</label></div>'
    );
  }
  function setRemiField(key, field, val) {
    var p = getP(key);
    if (!p) return;
    var o = ensure(p);
    if (/Ms$/.test(field)) val = parseFloat(val) || 0;
    o.remi[field] = val;
    stamp(key);
    if (/Ms$/.test(field)) rerender(key);
  }
  function setWeatherHold(key, on) {
    var p = getP(key);
    if (!p) return;
    ensure(p).weatherHold = !!on;
    stamp(key);
    rerender(key);
    toast(on ? 'Weather hold ON — Go/No-Go forced red' : 'Weather hold cleared');
  }

  function opsPaneHTML(key) {
    ensure(getP(key));
    return (
      '<div class="space-y-5">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
      '<div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Broadcast Ops</h3>' +
      '<p class="text-[10px] text-gray-500 mt-0.5">Signal truth · truck power · RF · satellite · go/no-go — the remote engineer\'s book of record.</p></div>' +
      levelBadge(computeGoNoGo(key).decision === 'GO' ? 'green' : computeGoNoGo(key).decision === 'CONDITIONAL' ? 'amber' : 'red', computeGoNoGo(key).decision) +
      '</div>' +
      goNoGoStripHTML(key, false) +
      (function () {
        try {
          if (typeof MuseThingsBoard !== 'undefined' && MuseThingsBoard.bindToOps) return MuseThingsBoard.bindToOps(key);
        } catch (e) {}
        return '';
      })() +
      signalPathHTML(key) +
      truckPowerHTML(key) +
      remiHTML(key) +
      rfHTML(key) +
      satHTML(key) +
      techbookDiffHTML(key) +
      '</div>'
    );
  }


  function techbookSections(p, key) {
    if (!p) return [];
    var o = ensure(p);
    function B(sub, head, rows, kind) {
      return { sub: sub, head: head, rows: rows, kind: kind };
    }
    var g = computeGoNoGo(key || '');
    var pr = powerRollup(o.power);
    var hops = (o.signalPath || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    var hopRows = hops.length
      ? hops.map(function (h, i) {
          return [
            String(i + 1),
            h.name || '',
            h.type || '',
            (h.from || '') + ' → ' + (h.to || ''),
            h.status || '',
            h.lastGood ? String(h.lastGood).slice(0, 16).replace('T', ' ') : '—',
            h.notes || ''
          ];
        })
      : [['—', 'No hops defined', '—', '—', '—', '—', '—']];
    var loadRows = (o.power.loads || []).map(function (l) {
      return [l.name || '', String(l.amps || 0) + 'A', l.bus || ''];
    });
    if (!loadRows.length) loadRows = [['—', '—', '—']];
    var rfRows = (o.rf || []).map(function (r) {
      return [r.service || '', r.txFreq || '', r.rxFreq || '', r.band || '', r.license || '', r.status || '', r.venue || ''];
    });
    if (!rfRows.length) rfRows = [['—', '—', '—', '—', '—', '—', '—']];
    var satRows = (o.sat || []).map(function (s) {
      return [
        s.bird || '',
        s.tp || '',
        s.pol || '',
        s.fec || '',
        s.symbolRate || '',
        s.uplinkTruck || '',
        (s.windowStart || '') + ' → ' + (s.windowEnd || ''),
        s.contingency || '',
        s.status || ''
      ];
    });
    if (!satRows.length) satRows = [['—', '—', '—', '—', '—', '—', '—', '—', 'none']];
    var rm = o.remi || {};
    var totalMs = (parseFloat(rm.contribMs) || 0) + (parseFloat(rm.returnMs) || 0);
    var blocks = [
      B('Day-of Go / No-Go', ['Field', 'Detail'], [
        ['Decision', g.decision + ' (' + g.score + '%)'],
        ['Summary', g.summary || ''],
        ['Weather hold', o.weatherHold ? 'ACTIVE' : 'No'],
        ['Ops notes', o.goNoGoNotes || '—']
      ].concat(
        (g.checks || []).map(function (c) {
          return [c.label, (c.level || '') + ' · ' + (c.detail || '')];
        })
      )),
      B('Signal Path Integrity', ['#', 'Hop', 'Type', 'From → To', 'Status', 'Last good', 'Notes'], hopRows),
      B(
        'Truck / Plant',
        ['Field', 'Detail'],
        [
          ['Name', (o.truck && o.truck.name) || '—'],
          ['Type', (o.truck && o.truck.type) || '—'],
          ['Matrix', (o.truck && o.truck.matrix) || '—'],
          ['Fiber bulkhead', String((o.truck && o.truck.bulkheadFiber) || 0)],
          ['Coax bulkhead', String((o.truck && o.truck.bulkheadCoax) || 0)],
          ['HVAC', (o.truck && o.truck.hvac) || '—'],
          ['Weight (lbs)', String((o.truck && o.truck.weightLbs) || 0)],
          ['Bay map', (o.truck && o.truck.bayMap) || '—'],
          ['Notes', (o.truck && o.truck.notes) || '—']
        ]
      ),
      B(
        'Power Bus',
        ['Field', 'Detail'],
        [
          ['Shore A', String(o.power.shoreA || 0)],
          ['Gen A', String(o.power.genA || 0)],
          ['Bus A / B', String(o.power.busA || 0) + ' / ' + String(o.power.busB || 0)],
          ['Load rollup', pr.totalAmps + 'A of ' + pr.available + 'A (' + pr.pct + '% · ' + pr.level + ')'],
          ['Notes', o.power.notes || '—']
        ]
      ),
      B('Power Loads', ['Circuit', 'Amps', 'Bus'], loadRows),
      B(
        'REMI Delay Budget',
        ['Field', 'Detail'],
        [
          ['Path', rm.path || '—'],
          ['Contrib ms', String(rm.contribMs || 0)],
          ['Return ms', String(rm.returnMs || 0)],
          ['Total ms', String(totalMs)],
          ['Budget ms', String(rm.budgetMs || 0)],
          ['Notes', rm.notes || '—']
        ]
      ),
      B('RF Coordination', ['Service', 'TX', 'RX', 'Band', 'License', 'Status', 'Venue'], rfRows),
      B(
        'Satellite Contribution',
        ['Bird', 'TP', 'Pol', 'FEC', 'Symbol rate', 'Uplink truck', 'UTC window', 'Contingency', 'Status'],
        satRows
      )
    ];
    return [{ title: 'Broadcast Ops — Signal · Power · RF · Satellite · Go/No-Go', blocks: blocks }];
  }

  function portfolioGngHTML() {
    var order = global.order || [];
    var prods = global.productions || {};
    if (!order.length) return '';
    var cells = order
      .map(function (k) {
        var p = prods[k];
        if (!p) return '';
        ensure(p);
        var g = computeGoNoGo(k);
        var col =
          g.decision === 'GO' ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : g.decision === 'CONDITIONAL' ? 'border-amber-200 bg-amber-50/70 text-amber-900' : 'border-red-200 bg-red-50/70 text-red-800';
        return (
          '<button onclick="openProject(\'' +
          k +
          '\');setTimeout(function(){try{setProjTab(\'' +
          k +
          '\',\'ops\');}catch(e){}},80)" class="text-left rounded-xl border px-2.5 py-2 hover:shadow-md transition-shadow ' +
          col +
          '">' +
          '<p class="text-[9px] font-bold truncate">' +
          esc(p.tab || p.name) +
          '</p>' +
          '<p class="text-sm font-black mono leading-tight">' +
          esc(g.decision) +
          '</p>' +
          '<p class="text-[8px] mono opacity-80">' +
          g.score +
          '%</p></button>'
        );
      })
      .join('');
    return (
      '<div class="mb-3">' +
      '<div class="flex items-center justify-between mb-1.5"><h4 class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Broadcast Ops · Go/No-Go</h4>' +
      '<span class="text-[9px] text-gray-400">Signal · power · RF · sat · weather · REMI</span></div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">' +
      cells +
      '</div></div>'
    );
  }

  function museaiBrief(key) {
    var g = computeGoNoGo(key);
    var p = getP(key);
    if (!p) return null;
    var o = ensure(p);
    var pr = powerRollup(o.power);
    var clashes = rfClashes(o.rf, global.productions, key);
    return {
      decision: g.decision,
      score: g.score,
      summary: g.summary,
      signal_hops: (o.signalPath || []).length,
      signal_red: (o.signalPath || []).filter(function (h) {
        return h.status === 'red';
      }).length,
      power_pct: pr.pct,
      power_level: pr.level,
      rf_services: (o.rf || []).length,
      rf_clashes: clashes.length,
      sat_bookings: (o.sat || []).length,
      truck: o.truck && o.truck.name,
      remi_ms: (parseFloat((o.remi || {}).contribMs) || 0) + (parseFloat((o.remi || {}).returnMs) || 0),
      remi_budget: (o.remi && o.remi.budgetMs) || 0,
      weather_hold: !!o.weatherHold,
      notes: o.goNoGoNotes || ''
    };
  }

  var API = {
    version: '2.0.0',
    ensure: ensure,
    seedShowcase: seedShowcase,
    powerRollup: powerRollup,
    rfClashes: rfClashes,
    computeGoNoGo: computeGoNoGo,
    goNoGoStripHTML: goNoGoStripHTML,
    opsPaneHTML: opsPaneHTML,
    signalPathHTML: signalPathHTML,
    hopChainHTML: hopChainHTML,
    truckPowerHTML: truckPowerHTML,
    remiHTML: remiHTML,
    rfHTML: rfHTML,
    satHTML: satHTML,
    techbookDiffHTML: techbookDiffHTML,
    techbookSections: techbookSections,
    portfolioGngHTML: portfolioGngHTML,
    recordTechbookExport: recordTechbookExport,
    techbookDiff: techbookDiff,
    museaiBrief: museaiBrief,
    setRemiField: setRemiField,
    setWeatherHold: setWeatherHold,
    setHopField: setHopField,
    addHop: addHop,
    delHop: delHop,
    setTruckField: setTruckField,
    setPowerField: setPowerField,
    addPowerLoad: addPowerLoad,
    setPowerLoad: setPowerLoad,
    delPowerLoad: delPowerLoad,
    addRf: addRf,
    setRfField: setRfField,
    delRf: delRf,
    addSat: addSat,
    setSatField: setSatField,
    delSat: delSat,
    setGoNotes: setGoNotes
  };

  global.MuseBOps = API;
})(typeof window !== 'undefined' ? window : global);


