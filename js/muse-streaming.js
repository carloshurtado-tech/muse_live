/* Muse Live — Streaming.
   The live-streaming layer on top of the linear plan of record:
   • a per-production streaming plan (destinations, contribution, encoding ladder, packaging,
     CDN, audio/captions, venue network, monitoring, go-live checklist, escalation),
   • embedded HLS monitors (hls.js; native HLS on Safari) with player-side measurements,
   • end-to-end stream health telemetry (encoder → contribution → cloud → origin → CDN → viewers),
   • the project "Streaming" tab, the "Live Streams" wall and the dashboard "Live now" panel.
   Pipeline telemetry is a seeded simulation unless a real source is connected per stream
   (AWS CloudWatch for MediaConnect / MediaLive / CloudFront, Mux Data for viewer QoE — via
   /api/telemetry); every simulated surface says "Demo data", connected stages say "Live · <source>".
   Player rows, QoE beacons (/api/qoe, CMCD on) and pre-flight checks are always real.
   Muse reads all of it, and acts on anomalies() through apply(). */
(function (root) {
  'use strict';

  var STORE = 'muselive_streams_v1';
  var TICK_MS = 2000;
  var HISTORY = 90; // samples kept per stream (3 minutes)

  // Public test streams with open CORS, used as stand-ins for each show's program feeds.
  var FEEDS = {
    liveA: 'https://demo.unified-streaming.com/k8s/live/stable/live.isml/.m3u8',
    liveB: 'https://demo.unified-streaming.com/k8s/live/stable/live.isml/.m3u8?time_shift=90', // same channel 90 s behind: reads as the backup path
    liveCmaf: 'https://demo.unified-streaming.com/k8s/live/stable/live.isml/.m3u8?hls_fmp4',      // CMAF / fMP4 packaging
    liveScte: 'https://demo.unified-streaming.com/k8s/live/scte35.isml/.m3u8',
    vodBunny: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    vodSteel: 'https://test-streams.mux.dev/tos_ismc/main.m3u8',
    vodBipbop: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    vodAngel: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8'
  };

  // Official Meta event recordings on YouTube (Meta / Meta Developers channels, embeddable).
  // [video id, title, duration in seconds] — monitors join halfway through so they read as mid-broadcast.
  var VIDEOS = {
    connect26: ['dnT9cVv3Spw', 'Meta Connect 2026: Opening Keynote', 3315],
    connect25: ['80s0chTOsK0', 'Meta Connect 2025: Opening Keynote', 5415],
    connect25b: ['Q9eLemEd9FY', 'Meta Connect 2025 Keynote', 3515],
    devkey25: ['KWdUxc24dIw', 'Meta Connect 2025: Developer Keynote', 21980],
    llamacon: ['FZ-RZ0dKO8o', 'LlamaCon 2025: Closing Session', 3710]
  };
  var DURATION = {}; Object.keys(VIDEOS).forEach(function (k) { DURATION[VIDEOS[k][0]] = VIDEOS[k][2]; });
  function yt(name, offset) { var v = VIDEOS[name]; return 'yt:' + v[0] + ':' + (offset || 0) + ':' + v[1]; }
  function parseYt(url) {
    var m = /^yt:([\w-]{11}):(-?\d+):(.*)$/.exec(url || ''); if (m) return { id: m[1], offset: +m[2], title: m[3] };
    m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url || '');
    if (!m) return null;
    var t = /[?&]t=(\d+)/.exec(url); return { id: m[1], offset: t ? +t[1] : 0, title: 'YouTube' };
  }

  var STATES = {
    LIVE: { label: 'LIVE', cls: 'is-live' },
    REHEARSAL: { label: 'REHEARSAL', cls: 'is-reh' },
    STANDBY: { label: 'STANDBY', cls: 'is-standby' },
    SCHEDULED: { label: 'SCHEDULED', cls: 'is-standby' },
    ENDED: { label: 'ENDED · VOD', cls: 'is-ended' }
  };

  /* ---------------- seed plans (per production) ---------------- */
  var LADDER_169 = [
    ['1080p60', '1920×1080', 60, 'H.264 High 4.2', 8.0], ['1080p30', '1920×1080', 30, 'H.264 High 4.0', 6.0],
    ['720p60', '1280×720', 60, 'H.264 Main 3.2', 4.5], ['720p30', '1280×720', 30, 'H.264 Main 3.1', 3.0],
    ['540p30', '960×540', 30, 'H.264 Main 3.1', 2.0], ['360p30', '640×360', 30, 'H.264 Main 3.0', 1.0],
    ['234p15', '416×234', 15, 'H.264 Baseline 3.0', 0.4]
  ];
  var LADDER_916 = [
    ['1080x1920', '1080×1920', 30, 'H.264 High 4.0', 6.0], ['720x1280', '720×1280', 30, 'H.264 Main 3.1', 3.5],
    ['540x960', '540×960', 30, 'H.264 Main 3.1', 2.0], ['360x640', '360×640', 30, 'H.264 Main 3.0', 0.9]
  ];

  var SHOWS = {
    museaitour: {
      state: 'LIVE', peak: 1850000, viewers: 1240000, latency: 'LL-HLS · 4–6 s glass-to-glass (standard HLS fallback 18 s)',
      destinations: ['Facebook Live · Meta AI Page (RTMPS)', 'Instagram Live · @meta (RTMPS, 9:16 cut-down)', 'meta.com/events embed (HLS via CloudFront + Akamai)', 'Workplace Live · company-wide simulcast', 'Threads · live clips (post-show)'],
      venueNet: 'Meta MPK campus network: 2× 10 GbE on diverse paths from Hacker Square to the Menlo Park POP · Starlink Business ×2 standby · 1 Gbps measured 942↓ / 936↑',
      primary: 'Haivision Makito X4 (×2, 1+1) · SRT caller → AWS Elemental MediaConnect us-east-1 · UDP 5000 · 1,200 ms latency · AES-256',
      backup: 'LiveU LU800 bonded (4× 5G + Starlink) → LiveU Matrix → MediaConnect input 2',
      cloud: 'AWS Elemental MediaLive Standard channel (2 pipelines) · automatic input failover after 2 s input loss',
      loudness: '-24 LKFS ±2 (ATSC A/85) · true peak -2 dBTP',
      captions: 'CART writer → EEG Falcon (iCap) → CEA-608/708 embedded → WebVTT sidecar',
      ladder: LADDER_169, streams: [['Program · Clean feed', 'program', FEEDS.liveA], ['Backup · LiveU bonded', 'backup', FEEDS.liveB], ['Vertical · Instagram 9:16', 'vertical', FEEDS.liveScte], ['Confidence return · HLS (CMAF)', 'return', FEEDS.liveCmaf]]
    },
    raybangen3: {
      state: 'ENDED', peak: 412000, viewers: 0, latency: 'Standard HLS · 15–20 s (6 s segments)',
      destinations: ['Facebook Live · Ray-Ban Meta Page (RTMPS)', 'Instagram Live · @rayban + @meta collab (RTMPS)', 'meta.com/rayban launch page (HLS)'],
      venueNet: 'Classroom Stage IDF: single 1 GbE campus fiber uplink + 5 GHz point-to-point bridge to MPK Building 23 · Starlink standby',
      primary: 'Haivision Makito X4 · SRT caller → MediaConnect us-east-1 · 1,200 ms latency',
      backup: 'LiveU LU800 bonded (4× 5G) → LiveU Matrix → MediaConnect input 2',
      cloud: 'MediaLive Standard (2 pipelines) · input failover after 10 s input loss (raised from default — see INC-2026-0612)',
      loudness: '-24 LKFS (ATSC A/85)', captions: 'EEG Falcon → CEA-608 → WebVTT',
      ladder: LADDER_169, streams: [['Program · archive (VOD)', 'program', FEEDS.vodBunny], ['ISO · stage cam (VOD)', 'iso', FEEDS.vodSteel]]
    },
    orion: {
      state: 'STANDBY', peak: 0, viewers: 0, latency: 'LL-HLS target 4 s',
      destinations: ['Facebook Live · Meta Reality Labs (RTMPS)', 'meta.com/orion reveal embed (LL-HLS)', 'Horizon Worlds · watch party (HLS)'],
      venueNet: 'Levi\'s Stadium, Santa Clara: 2× 1 GbE stadium IT circuits to the broadcast compound · firewall change pending for UDP 5000–5010 (INC-2026-1002)',
      primary: 'AWS Elemental Live L800 (1+1) · SRT caller → MediaConnect us-west-2', backup: 'LiveU LU800 bonded → LiveU Matrix',
      cloud: 'MediaLive Standard (2 pipelines) · input failover 2 s', loudness: '-24 LKFS (ATSC A/85)', captions: 'AI captions (live) + CART QC',
      ladder: LADDER_169, streams: [['Program · stream test', 'program', FEEDS.liveScte]]
    },
    museailaunch: {
      state: 'REHEARSAL', peak: 0, viewers: 340, latency: 'LL-HLS · 4 s',
      destinations: ['Facebook Live · Meta AI (RTMPS)', 'meta.ai live keynote embed (LL-HLS)', 'Workplace Live'],
      venueNet: 'Hudson Yards venue: 10 GbE fiber + Verizon 5G UWB bonded',
      primary: 'Haivision Makito X4 · SRT → MediaConnect us-east-1', backup: 'LiveU LU800 → LiveU Matrix',
      cloud: 'MediaLive Standard (2 pipelines)', loudness: '-24 LKFS (ATSC A/85)', captions: 'EEG Falcon → CEA-708 → WebVTT',
      ladder: LADDER_169, streams: [['Program · dress rehearsal', 'program', FEEDS.liveA]]
    },
    whatsapp: {
      state: 'STANDBY', peak: 0, viewers: 0, latency: 'LL-HLS target 4 s (measured 9 s in the Oct 9 stream test — INC-2026-1009)',
      destinations: ['Facebook Live · WhatsApp Business (RTMPS)', 'business.whatsapp.com summit embed (LL-HLS)'],
      venueNet: 'Miami Beach Convention Center: 1 GbE house + Comcast Business backup',
      primary: 'AWS Elemental Live · SRT → MediaConnect us-east-1', backup: 'LiveU LU800 → LiveU Matrix',
      cloud: 'MediaLive Standard (2 pipelines)', loudness: '-24 LKFS (ATSC A/85)', captions: 'CART → EEG Falcon · English + Spanish (dual 608 CC1/CC3)',
      ladder: LADDER_169, streams: [['Program · stream test', 'program', FEEDS.liveB]]
    },
    igcreators: {
      state: 'LIVE', peak: 960000, viewers: 615000, latency: 'Instagram Live native (≈3–5 s) · HLS mirror 8 s',
      destinations: ['Instagram Live · @creators (vertical 9:16, RTMPS)', 'Facebook Live · Instagram (16:9)', 'meta.com creators hub embed'],
      venueNet: 'Street takeover, Times Square: LiveU LU800 bonded only (4 carriers) + venue Wi-Fi 6E for comms',
      primary: 'LiveU LU800 bonded (Verizon, T-Mobile, AT&T, Starlink Mini) → LiveU Matrix → MediaConnect', backup: 'Second LU800 on alternate carriers',
      cloud: 'MediaLive Standard (2 pipelines) · vertical 9:16 output group', loudness: '-24 LKFS (ATSC A/85)', captions: 'Instagram auto-captions + CART on 16:9',
      ladder: LADDER_916, streams: [['Vertical program · 9:16', 'program', FEEDS.liveScte], ['Roaming cam · LiveU', 'iso', FEEDS.liveCmaf]]
    },
    charm: {
      state: 'SCHEDULED', peak: 0, viewers: 0, latency: 'Standard HLS · 12 s (EU)',
      destinations: ['Facebook Live · Meta (RTMPS)', 'Instagram Live · @meta (RTMPS)', 'meta.com/charm Milan embed (HLS, EU CDN)'],
      venueNet: 'Milan venue: 1 GbE Fastweb fiber + Vodafone 5G bonded',
      primary: 'Haivision Makito X4 · SRT → MediaConnect eu-south-1 (Milan)', backup: 'LiveU LU800 → LiveU Matrix (EU)',
      cloud: 'MediaLive Standard eu-south-1 (2 pipelines)', loudness: '-23 LUFS ±1 (EBU R128) · true peak -1 dBTP', captions: 'Italian + English (CART) → WebVTT',
      ladder: LADDER_169, streams: [['Program · archive (VOD)', 'program', FEEDS.vodAngel]]
    }
  };
  function defaultShow(key) {
    return { state: 'SCHEDULED', peak: 0, viewers: 0, latency: 'Standard HLS · 15 s', destinations: ['Facebook Live (RTMPS)'], venueNet: 'Venue network to be surveyed',
      primary: 'Hardware encoder · SRT → AWS MediaConnect', backup: 'LiveU LU800 bonded', cloud: 'MediaLive Standard (2 pipelines)',
      loudness: '-24 LKFS (ATSC A/85)', captions: 'CART → CEA-608 → WebVTT', ladder: LADDER_169, streams: [] };
  }

  var CHECKLIST = [
    ['T-7d', 'End-to-end test: venue encoder → MediaConnect → MediaLive → MediaPackage → CDN → players'],
    ['T-7d', 'Venue bandwidth test ≥ 3× top rung per path (upload), jitter < 5 ms'],
    ['T-7d', 'Firewall: outbound UDP 5000–5010 (SRT) + TCP 443 (RTMPS) open on venue network'],
    ['T-3d', 'Stream keys issued per destination, stored in vault, rotated after rehearsal'],
    ['T-24h', 'Full rehearsal on air-path: failover drill (pull primary SRT, confirm auto input failover)'],
    ['T-24h', 'Caption path verified on every destination (608/708 + WebVTT)'],
    ['T-24h', 'Loudness check on program bus at target, true peak within spec'],
    ['T-2h', 'Encoders 1+1 locked to house reference, NTP in sync, ingest healthy on both pipelines'],
    ['T-2h', 'Player QA on iOS / Android / desktop browsers / smart TV, all ladder rungs'],
    ['T-30m', 'Slate + countdown live on all destinations, QoE monitors green'],
    ['T-10m', 'Go / no-go call with TOC, streaming engineer, EIC and producer'],
    ['T+0', 'Post-show: archive VOD, export QoE report, open incidents for anything that paged']
  ];

  /* ---------------- persistence ---------------- */
  var db = load();
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) {} }
  function rec(key) {
    if (!db[key]) db[key] = { added: [], removed: {}, checklist: {} };
    return db[key];
  }
  function showFor(key) { return SHOWS[key] || defaultShow(key); }
  function streamsFor(key) {
    var r = rec(key), s = showFor(key);
    var base = s.streams.map(function (x, i) { return { id: key + '-s' + i, name: x[0], role: x[1], url: x[2], seeded: true }; });
    return base.filter(function (x) { return !r.removed[x.id]; }).concat(r.added);
  }
  // Operators can override the stream state per show (e.g. for a rehearsal or a demo).
  function stateOf(key) {
    if (db[key] && db[key].state) return db[key].state;
    try { var d = root.MuseDemo && root.MuseDemo.stateFor && root.MuseDemo.stateFor(key); if (d && STATES[d]) return d; } catch (e) {}
    return showFor(key).state;
  }

  /* ---------------- telemetry engine (seeded simulation) ---------------- */
  var tele = {}; // sid -> {m: metrics, hist: {...}, events}
  function rng(seed) { var s = 0; for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function walk(v, target, spread, r, lo, hi) { v += (target - v) * 0.15 + (r() - 0.5) * spread; return Math.max(lo, Math.min(hi, v)); }
  function teleFor(key, st) {
    if (tele[st.id]) return tele[st.id];
    var show = showFor(key), r = rng(st.id), live = stateOf(key) === 'LIVE' || stateOf(key) === 'REHEARSAL';
    var top = (show.ladder[0] || [0, 0, 0, 0, 6])[4];
    var t = tele[st.id] = { key: key, r: r, live: live, top: top, base: show.viewers || (stateOf(key) === 'LIVE' ? 25000 : 150), t0: Date.now(), hist: { viewers: [], rebuffer: [], loss: [], egress: [] },
      m: {
        enc_cpu: 38 + r() * 12, enc_temp: 51 + r() * 6, enc_out: top * 1.02, enc_fps: 59.94, enc_drops: 0, audio_lufs: -24 + (r() - 0.5),
        srt_rtt: 18 + r() * 10, srt_loss: 0.02, srt_retx: 0.1, srt_buffer: 1200, srt_bw: top * 1.25,
        bond_up: 4, bond_total: 4, bond_mbps: 18 + r() * 8,
        input: 'Primary', pipelines: 2, seg_age: 2.1, origin_5xx: 0,
        cdn_hit: 97.8, cdn_gbps: 0, cdn_5xx: 0.01, cdn_ttfb: 42,
        viewers: show.viewers || 0, rebuffer: 0.35, startup: 1.4, failures: 0.08, bitrate: top * 0.78, latency: /LL-HLS/.test(show.latency) ? 4.8 : 16
      } };
    if (st.role === 'program' && key === 'museaitour') t.events = 'cdn_eu'; // matches the open CDN incident
    t.visibleS = 0; // seconds of viewer-visible degradation this session (feeds the SLO)
    if (st.role === 'iso' && key === 'igcreators') t.events = 'bond_drop';
    return t;
  }
  function stepTele(t) {
    var m = t.m, r = t.r;
    if (!t.live) { return; }
    var phase = ((Date.now() - t.t0) / 1000) % 120; // two-minute event cycle
    m.enc_cpu = walk(m.enc_cpu, 44, 3, r, 20, 98); m.enc_temp = walk(m.enc_temp, 54, 0.6, r, 40, 85);
    m.enc_out = walk(m.enc_out, t.top * 1.02, t.top * 0.04, r, 0, t.top * 1.3); m.enc_fps = r() < 0.02 ? 59.6 : 59.94;
    if (r() < 0.03) m.enc_drops += 1;
    m.audio_lufs = walk(m.audio_lufs, -24, 0.5, r, -40, -10);
    var lossTarget = 0.03, rttTarget = 22, ops = rec(t.key);
    if (t.events === 'bond_drop' && phase > 70 && phase < 95) { m.bond_up = 3; lossTarget = 0.9; rttTarget = 65; }
    else m.bond_up = 4;
    if (ops.srtLatency >= 2000) lossTarget *= 0.4;           // bigger SRT buffer rides out bursts
    m.input = ops.failover ? 'Backup (LiveU)' : 'Primary';
    if (ops.failover) { lossTarget = 0.03; rttTarget = 48; }   // clean bonded path, higher RTT
    m.srt_loss = walk(m.srt_loss, lossTarget, 0.04, r, 0, 25); m.srt_rtt = walk(m.srt_rtt, rttTarget, 3, r, 4, 400);
    m.srt_retx = Math.max(0, m.srt_loss * 2.4 + (r() - 0.5) * 0.05); m.srt_bw = walk(m.srt_bw, t.top * 1.25, 0.5, r, 0, 100);
    m.bond_mbps = walk(m.bond_mbps, m.bond_up * 6, 1.2, r, 0, 60);
    m.seg_age = walk(m.seg_age, 2.1, 0.2, r, 0.5, 30);
    var cdnErr = 0.01, hit = 97.8;
    var akamai = ops.cdn ? ops.cdn.akamai : 40;               // default weighting 60/40 CloudFront/Akamai
    if (t.events === 'cdn_eu' && phase > 30 && phase < 62) { var share = akamai / 40; cdnErr = 0.01 + 1.8 * share; hit = 97.8 - 4.3 * share; }
    m.cdn_5xx = walk(m.cdn_5xx, cdnErr, 0.08, r, 0, 20); m.cdn_hit = walk(m.cdn_hit, hit, 0.3, r, 60, 100);
    m.cdn_ttfb = walk(m.cdn_ttfb, cdnErr > 1 ? 160 : 42, 6, r, 10, 900);
    m.viewers = Math.max(0, Math.round(walk(m.viewers, t.base * (1 + 0.04 * Math.sin(Date.now() / 60000)), (t.base || 10) * 0.004, r, 0, 1e9)));
    m.cdn_gbps = m.viewers * m.bitrate / 1000;
    var rebTarget = 0.35 + (m.cdn_5xx > 1 ? 1.6 : 0) + (m.srt_loss > 0.5 ? 0.9 : 0);
    m.rebuffer = walk(m.rebuffer, rebTarget, 0.05, r, 0, 30); m.startup = walk(m.startup, m.cdn_ttfb > 120 ? 2.6 : 1.4, 0.08, r, 0.4, 15);
    m.failures = walk(m.failures, m.cdn_5xx > 1 ? 0.6 : 0.08, 0.02, r, 0, 20); m.bitrate = walk(m.bitrate, t.top * (m.rebuffer > 1 ? 0.62 : 0.78), 0.1, r, 0.3, 12);
    m.latency = walk(m.latency, /LL-HLS/.test(showFor(t.key).latency) ? 4.8 : 16, 0.25, r, 1, 60);
    if (t.real) Object.keys(t.real).forEach(function (f) { m[f] = t.real[f]; }); // connected sources win
    if (m.rebuffer > 3 || m.failures > 2) t.visibleS += TICK_MS / 1000;
    push(t.hist.viewers, m.viewers); push(t.hist.rebuffer, m.rebuffer); push(t.hist.loss, m.srt_loss); push(t.hist.egress, m.cdn_gbps);
  }
  function push(a, v) { a.push(v); if (a.length > HISTORY) a.shift(); }

  // Thresholds a streaming engineer would page on.
  function grade(m, live) {
    if (!live) return { overall: 'off', stages: {} };
    function lvl(v, warn, crit, invert) { return invert ? (v < crit ? 'crit' : v < warn ? 'warn' : 'ok') : (v > crit ? 'crit' : v > warn ? 'warn' : 'ok'); }
    var s = {
      encoder: worst([lvl(m.enc_cpu, 80, 92), lvl(m.enc_temp, 70, 80), m.enc_fps < 59.9 ? 'warn' : 'ok', lvl(Math.abs(m.audio_lufs + 24), 2, 4)]),
      contribution: worst([lvl(m.srt_loss, 0.5, 3), lvl(m.srt_rtt, 120, 300), m.bond_up < m.bond_total ? 'warn' : 'ok']),
      cloud: worst([m.pipelines < 2 ? 'warn' : 'ok', m.input !== 'Primary' ? 'warn' : 'ok']),
      origin: worst([lvl(m.seg_age, 6, 12), lvl(m.origin_5xx, 0.5, 2)]),
      cdn: worst([lvl(m.cdn_5xx, 0.5, 2), lvl(m.cdn_hit, 95, 90, true), lvl(m.cdn_ttfb, 120, 300)]),
      viewers: worst([lvl(m.rebuffer, 1, 3), lvl(m.failures, 0.5, 2), lvl(m.startup, 2.5, 5)])
    };
    return { overall: worst(Object.keys(s).map(function (k) { return s[k]; })), stages: s };
  }
  function worst(list) { return list.indexOf('crit') >= 0 ? 'crit' : list.indexOf('warn') >= 0 ? 'warn' : 'ok'; }
  function alertsFor(m, g) {
    var out = [];
    if (g.stages.cdn && g.stages.cdn !== 'ok') out.push('CDN 5xx ' + m.cdn_5xx.toFixed(2) + '% · cache hit ' + m.cdn_hit.toFixed(1) + '% · TTFB ' + Math.round(m.cdn_ttfb) + ' ms');
    if (g.stages.contribution && g.stages.contribution !== 'ok') out.push('Contribution: SRT loss ' + m.srt_loss.toFixed(2) + '% · RTT ' + Math.round(m.srt_rtt) + ' ms · bonded ' + m.bond_up + '/' + m.bond_total + ' modems');
    if (g.stages.viewers && g.stages.viewers !== 'ok') out.push('QoE: rebuffer ' + m.rebuffer.toFixed(2) + '% · failures ' + m.failures.toFixed(2) + '% · startup ' + m.startup.toFixed(1) + ' s');
    if (g.stages.encoder && g.stages.encoder !== 'ok') out.push('Encoder: CPU ' + Math.round(m.enc_cpu) + '% · ' + m.enc_fps + ' fps · loudness ' + m.audio_lufs.toFixed(1) + ' LKFS');
    return out;
  }

  /* ---------------- players (hls.js pool) ---------------- */
  var players = {}; // slotKey -> {video, hls, url, stats}
  var hlsLoading = null;
  function ensureHls() {
    if (root.Hls) return Promise.resolve(root.Hls);
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'js/vendor/hls.min.js?v=1.5.20';
      s.onload = function () { res(root.Hls); }; s.onerror = function () { hlsLoading = null; rej(new Error('hls.js failed to load')); };
      document.head.appendChild(s);
    });
    return hlsLoading;
  }
  // YouTube: muted autoplay, chrome hidden, and a start point that follows the wall clock so
  // every reload lands where a live broadcast would be.
  function makeYt(slotKey, info, live) {
    var f = document.createElement('iframe');
    // Halfway point + a slice of the wall clock, so every load lands mid-broadcast (backup feed runs -8 s).
    var d = DURATION[info.id], now = Math.floor(Date.now() / 1000), start;
    if (d) start = Math.min(d - 30, Math.max(0, Math.floor(d / 2) + (now % Math.max(1, Math.floor(d / 4))) + info.offset));
    else start = Math.max(0, info.offset + (live ? now % 2700 : 0));
    f.src = 'https://www.youtube-nocookie.com/embed/' + info.id + '?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0&disablekb=1&loop=1&playlist=' + info.id +
      '&start=' + start + '&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    f.className = 'ms-video ms-yt'; f.title = info.title; f.setAttribute('tabindex', '-1'); f.loading = 'lazy'; // off-screen monitors don't boot a player
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture'); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    return players[slotKey] = { video: f, yt: info, url: 'yt:' + info.id, stats: { state: 'playing', stalls: 0, errors: 0 }, muted: true };
  }
  // Slate = the poster behind every monitor; hidden once a frame plays, labelled when the feed never arrives.
  function slate(p, state) {
    p.stats.state = state; var s = p.video.parentNode; if (!s) return;
    s.classList.toggle('is-playing', state === 'playing' || state === 'buffering');
    if (state === 'slate') { var e = s.querySelector('.ms-slate span'); if (e) e.textContent = 'Simulated feed'; }
  }
  function ytCmd(p, func, args) { try { p.video.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (e) {} }
  function makePlayer(slotKey, url, live) {
    var info = parseYt(url); if (info) return makeYt(slotKey, info, live);
    var v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.className = 'ms-video'; v.setAttribute('aria-label', 'Live stream monitor');
    var p = players[slotKey] = { video: v, hls: null, url: url, stats: { stalls: 0, errors: 0, state: 'loading' },
      qoe: { session: Math.random().toString(36).slice(2, 10), created: Date.now(), startup_ms: null, rebuffer_ms: 0, play_ms: 0, rebuffer_events: 0, switches: 0, errors: 0, waitSince: 0, playSince: 0 } };
    var q = p.qoe;
    v.addEventListener('waiting', function () { p.stats.stalls++; if (p.played) p.stats.state = 'buffering'; if (q.startup_ms != null) { q.rebuffer_events++; q.waitSince = Date.now(); } if (q.playSince) { q.play_ms += Date.now() - q.playSince; q.playSince = 0; } });
    v.addEventListener('playing', function () { p.played = true; slate(p, 'playing'); if (q.startup_ms == null) q.startup_ms = Date.now() - q.created; if (q.waitSince) { q.rebuffer_ms += Date.now() - q.waitSince; q.waitSince = 0; } q.playSince = Date.now(); });
    v.addEventListener('pause', function () { if (q.playSince) { q.play_ms += Date.now() - q.playSince; q.playSince = 0; } });
    v.addEventListener('error', function () { p.stats.errors++; q.errors++; slate(p, 'slate'); });
    setTimeout(function () { if (players[slotKey] === p && !p.played) slate(p, 'slate'); }, 10000); // never leave a tile on "connecting"
    // iOS Safari has no MediaSource: use its native HLS player. Everywhere else, hls.js.
    if (!(root.MediaSource || root.ManagedMediaSource) && v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(function () {}); return p; }
    ensureHls().then(function (Hls) {
      if (!Hls.isSupported()) { v.src = url; return; }
      // CMCD (CTA-5004) as query args so origins / CDNs can correlate requests with this session.
      var h = p.hls = new Hls({ lowLatencyMode: true, capLevelToPlayerSize: true, maxBufferLength: 12, backBufferLength: 10, liveSyncDurationCount: 3, enableWorker: true, subtitleDisplay: false,
        cmcd: { sessionId: q.session, contentId: slotKey.split(':')[1] || slotKey, useHeaders: false } });
      h.on(Hls.Events.LEVEL_SWITCHED, function () { q.switches++; });
      h.on(Hls.Events.ERROR, function (e, d) {
        p.stats.errors++; if (d && d.fatal) q.errors++;
        if (d && d.fatal) {
          slate(p, 'slate'); p.stats.lastError = d.details;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) setTimeout(function () { try { h.startLoad(); } catch (x) {} }, 3000);
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { try { h.recoverMediaError(); } catch (x) {} }
        }
      });
      h.loadSource(url); h.attachMedia(v);
      h.on(Hls.Events.MANIFEST_PARSED, function () { v.play().catch(function () {}); });
    }).catch(function () { slate(p, 'slate'); p.stats.lastError = 'player library unavailable'; });
    return p;
  }
  function destroy(slotKey) {
    var p = players[slotKey]; if (!p) return;
    try { if (p.hls) p.hls.destroy(); } catch (e) {}
    try { p.video.removeAttribute('src'); p.video.load(); } catch (e) {}
    delete players[slotKey];
  }
  function measure(p) {
    if (p.yt) return { source: 'YouTube embed', title: p.yt.title, state: 'playing' };
    var v = p.video, out = { state: p.stats.state, stalls: p.stats.stalls, errors: p.stats.errors };
    try {
      var b = v.buffered, ahead = 0;
      for (var i = 0; i < b.length; i++) if (v.currentTime >= b.start(i) && v.currentTime <= b.end(i)) ahead = b.end(i) - v.currentTime;
      out.buffer_s = +ahead.toFixed(1);
      out.resolution = v.videoWidth ? v.videoWidth + '×' + v.videoHeight : null;
      var q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      if (q) out.dropped_frames = q.droppedVideoFrames;
      if (p.hls) {
        var lv = p.hls.levels && p.hls.levels[p.hls.currentLevel];
        if (lv) out.rendition_kbps = Math.round(lv.bitrate / 1000);
        out.bandwidth_estimate_mbps = p.hls.bandwidthEstimate ? +(p.hls.bandwidthEstimate / 1e6).toFixed(1) : null;
        if (p.hls.latency) out.live_latency_s = +p.hls.latency.toFixed(1);
        out.renditions = (p.hls.levels || []).length;
      }
    } catch (e) {}
    return out;
  }
  // Attach (or re-attach) players into every slot under `rootEl`. Video nodes are moved, not
  // rebuilt, so a pane re-render never interrupts playback.
  function mount(rootEl) {
    var slots = (rootEl || document).querySelectorAll('[data-hls-slot]');
    Array.prototype.forEach.call(slots, function (slot) {
      if (slot.getAttribute('data-defer') === '1') return; // off-air tile: plays on click
      var k = slot.getAttribute('data-hls-slot'), url = slot.getAttribute('data-url');
      var p = players[k];
      if (p && p.url !== url) { destroy(k); p = null; }
      if (!p) p = makePlayer(k, url, slot.getAttribute('data-live') === '1');
      if (p.video.parentNode !== slot) { slot.insertBefore(p.video, slot.firstChild); slate(p, p.stats.state); }
      if (!p.yt && p.video.paused && !p.userPaused) p.video.play().catch(function () {});
    });
  }
  function gcPlayers() {
    Object.keys(players).forEach(function (k) {
      var p = players[k];
      if (!document.body.contains(p.video)) { if (!p.orphanSince) p.orphanSince = Date.now(); else if (Date.now() - p.orphanSince > 6000) destroy(k); return; }
      p.orphanSince = 0;
      var visible = p.video.offsetParent !== null;
      if (p.yt) { if (visible !== p.wasVisible) { ytCmd(p, visible ? 'playVideo' : 'pauseVideo'); p.wasVisible = visible; } return; }
      if (!visible && !p.video.paused) p.video.pause();
      else if (visible && p.video.paused && !p.userPaused) p.video.play().catch(function () {});
    });
  }

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function P() { return root.productions || {}; }
  function keys() { return (root.order || Object.keys(P())).filter(function (k) { return P()[k]; }); }
  function nameOf(key) { var p = P()[key]; return p ? (p.name || key) : key; }
  function gbps(g) { return g >= 1000 ? (g / 1000).toFixed(2) + ' Tbps' : g.toFixed(1) + ' Gbps'; }
  function fmtN(n) { n = Math.round(n || 0); return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n); }
  function spark(arr, cls) {
    if (!arr || arr.length < 2) return '<svg class="ms-spark ' + (cls || '') + '" viewBox="0 0 100 24" preserveAspectRatio="none"></svg>';
    var mx = Math.max.apply(null, arr), mn = Math.min.apply(null, arr), rg = (mx - mn) || 1;
    var pts = arr.map(function (v, i) { return (i / (arr.length - 1) * 100).toFixed(1) + ',' + (22 - (v - mn) / rg * 20).toFixed(1); }).join(' ');
    return '<svg class="ms-spark ' + (cls || '') + '" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }
  function badge(state) { var s = STATES[state] || STATES.SCHEDULED; return '<span class="ms-state ' + s.cls + '">' + (state === 'LIVE' ? '<i></i>' : '') + s.label + '</span>'; }
  function dot(level) { return '<span class="ms-dot is-' + level + '" aria-hidden="true"></span>'; }
  var LEVEL_TXT = { ok: 'Healthy', warn: 'Degraded', crit: 'Critical', off: 'Off air' };
  function programOf(key) { var s = streamsFor(key); return s.filter(function (x) { return x.role === 'program'; })[0] || s[0] || null; }
  function liveOf(key) { var st = stateOf(key); return st === 'LIVE' || st === 'REHEARSAL'; }
  function healthOf(key) {
    var pr = programOf(key); if (!pr) return { overall: 'off', stages: {}, m: null };
    var t = teleFor(key, pr), g = grade(t.m, t.live); g.m = t.m; g.t = t; return g;
  }

  /* ---------------- tile + pane HTML ---------------- */
  function tileHTML(key, st, ctx, opts) {
    opts = opts || {};
    var t = teleFor(key, st), g = grade(t.m, t.live), slot = ctx + ':' + st.id;
    var defer = !t.live && ctx !== 'proj' && !players[slot];
    return '<figure class="ms-tile' + (opts.big ? ' is-big' : '') + (st.role === 'vertical' || (opts.vertical) ? ' is-vertical' : '') + '" data-sid="' + st.id + '">' +
      '<div class="ms-screen" data-hls-slot="' + esc(slot) + '" data-url="' + esc(st.url) + '"' + (t.live ? ' data-live="1"' : '') + (defer ? ' data-defer="1"' : '') + '>' +
        (st.role === 'vertical' ? '<span class="ms-vframe" aria-hidden="true"></span>' : '') +
        '<div class="ms-slate" aria-hidden="true"><b>' + esc(st.name) + '</b><span>' + (defer ? 'Off air' : 'Connecting') + '</span></div>' +
        (defer ? '<button type="button" class="ms-play" onclick="MuseStreaming.play(this)" aria-label="Play ' + esc(st.name) + '">▶</button>' : '') +
        '<div class="ms-osd">' + badge(stateOf(key)) + '<span class="ms-health" data-tm="' + st.id + ':health">' + dot(g.overall) + LEVEL_TXT[g.overall] + '</span></div>' +
        '<button type="button" class="ms-audio" onclick="MuseStreaming.toggleAudio(\'' + esc(slot) + '\',this)" aria-pressed="false" aria-label="Listen to ' + esc(st.name) + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button>' +
      '</div>' +
      '<figcaption class="ms-cap"><div class="ms-cap-main"><b>' + esc(opts.showName ? nameOf(key) : st.name) + '</b><span>' + esc(opts.showName ? st.name : st.role) + '</span></div>' +
        '<div class="ms-cap-kpis"><span title="Concurrent viewers">👁 <b data-tm="' + st.id + ':viewers">' + (t.live ? fmtN(t.m.viewers) : '—') + '</b></span>' +
        '<span title="Rebuffer ratio">⟳ <b data-tm="' + st.id + ':rebuffer">' + (t.live ? t.m.rebuffer.toFixed(2) + '%' : '—') + '</b></span>' +
        '<span title="Glass-to-glass latency">⏱ <b data-tm="' + st.id + ':latency">' + (t.live ? t.m.latency.toFixed(1) + 's' : '—') + '</b></span>' +
        (t.live ? srcBadge(t, 'viewers', true) : '') + '</div>' +
        '<div class="ms-meas" data-pm="' + esc(slot) + '">' + (defer ? 'Off air · press ▶ to preview the recording' : 'Player: connecting…') + '</div>' +
        (opts.actions ? '<div class="ms-cap-actions">' + opts.actions + '</div>' : '') +
      '</figcaption></figure>';
  }
  function srcBadge(t, stage, compact) {
    var src = t && t.src && t.src[stage];
    if (src) return '<span class="ms-src is-live" title="Real metrics from ' + esc(src) + '">Live · ' + esc(src) + '</span>';
    return '<span class="ms-src" title="Simulated telemetry — connect AWS CloudWatch or Mux Data under Data sources for real values">' + (compact ? 'Demo' : 'Demo data') + '</span>';
  }
  function anyDemo(t) { return ['encoder', 'contribution', 'cloud', 'origin', 'cdn', 'viewers'].some(function (s) { return !(t.src && t.src[s]); }); }
  function stageCard(id, title, sub, rows, level, srcHTML) {
    return '<div class="ms-stage is-' + level + '" data-stage="' + id + '"><div class="ms-stage-h">' + dot(level) + '<b>' + title + '</b>' + (srcHTML || '') + '</div><p class="ms-stage-sub">' + esc(sub) + '</p><dl>' +
      rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd data-tm="' + r[2] + '">' + r[1] + '</dd></div>'; }).join('') + '</dl></div>';
  }
  function chainHTML(key) {
    var pr = programOf(key); if (!pr) return '';
    var t = teleFor(key, pr), m = t.m, g = grade(m, t.live), s = showFor(key), id = pr.id, off = !t.live;
    function v(x) { return off ? '—' : x; }
    function sb(stage) { return off ? '' : srcBadge(t, stage, true); }
    function extra(stage) { // rows only real sources provide
      var r = t.real || {}, out = [];
      if (stage === 'contribution' && r.src_dropped_packets != null) out.push(['Dropped pkts', r.src_dropped_packets, id + ':x_drop']);
      if (stage === 'cloud' && r.input_loss_s != null) out.push(['Input loss', r.input_loss_s + ' s/min', id + ':x_loss']);
      if (stage === 'cloud' && r.net_in_mbps != null) out.push(['Network in', r.net_in_mbps + ' Mbps', id + ':x_netin']);
      if (stage === 'cdn' && r.cdn_requests != null) out.push(['Requests', fmtN(r.cdn_requests) + '/min', id + ':x_req']);
      if (stage === 'viewers' && r.vx_score != null) out.push(['Experience', r.vx_score + ' / 100', id + ':x_vx']);
      return out;
    }
    var ops = rec(key), w = ops.cdn || { cloudfront: 60, akamai: 40 };
    return '<div class="ms-chain" data-chain="' + id + '">' +
      stageCard('encoder', 'Encode', s.primary.split('·')[0], [['CPU', v(Math.round(m.enc_cpu) + '%'), id + ':enc_cpu'], ['Output', v(m.enc_out.toFixed(1) + ' Mbps'), id + ':enc_out'], ['Frame rate', v(m.enc_fps + ' fps'), id + ':enc_fps'], ['Loudness', v(m.audio_lufs.toFixed(1) + ' LKFS'), id + ':audio_lufs']], g.stages.encoder || 'off', sb('encoder')) +
      stageCard('contribution', 'Contribute', ops.srtLatency >= 2000 ? 'SRT primary (2,000 ms) · bonded backup' : 'SRT primary · bonded backup', [['SRT loss', v(m.srt_loss.toFixed(2) + '%'), id + ':srt_loss'], ['RTT', v(Math.round(m.srt_rtt) + ' ms'), id + ':srt_rtt'], ['Retransmit', v(m.srt_retx.toFixed(2) + '%'), id + ':srt_retx'], ['Bonded', v(m.bond_up + '/' + m.bond_total + ' · ' + m.bond_mbps.toFixed(0) + ' Mbps'), id + ':bond']].concat(extra('contribution')), g.stages.contribution || 'off', sb('contribution')) +
      stageCard('cloud', 'Ingest', 'MediaConnect → MediaLive', [['Active input', v(m.input), id + ':input'], ['Pipelines', v(m.pipelines + '/2 running'), id + ':pipelines']].concat(extra('cloud')), g.stages.cloud || 'off', sb('cloud')) +
      stageCard('origin', 'Package', 'MediaPackage · HLS / LL-HLS / DASH', [['Segment age', v(m.seg_age.toFixed(1) + ' s'), id + ':seg_age'], ['Origin 5xx', v(m.origin_5xx.toFixed(2) + '%'), id + ':origin_5xx']], g.stages.origin || 'off', sb('origin')) +
      stageCard('cdn', 'Deliver', 'CloudFront ' + w.cloudfront + ' / Akamai ' + w.akamai, [['Cache hit', v(m.cdn_hit.toFixed(1) + '%'), id + ':cdn_hit'], ['Edge 5xx', v(m.cdn_5xx.toFixed(2) + '%'), id + ':cdn_5xx'], ['TTFB', v(Math.round(m.cdn_ttfb) + ' ms'), id + ':cdn_ttfb'], ['Egress', v(gbps(m.cdn_gbps)), id + ':cdn_gbps']].concat(extra('cdn')), g.stages.cdn || 'off', sb('cdn')) +
      stageCard('viewers', 'Watch', 'Player QoE (all destinations)', [['Viewers', v(fmtN(m.viewers)), id + ':viewers2'], ['Rebuffer', v(m.rebuffer.toFixed(2) + '%'), id + ':rebuffer2'], ['Startup', v(m.startup.toFixed(1) + ' s'), id + ':startup'], ['Failures', v(m.failures.toFixed(2) + '%'), id + ':failures']].concat(extra('viewers')), g.stages.viewers || 'off', sb('viewers')) +
    '</div>';
  }
  function chartsHTML(key) {
    var pr = programOf(key); if (!pr) return '';
    var t = teleFor(key, pr), id = pr.id;
    function card(label, histKey, cls, unit) {
      return '<div class="ms-chart"><div class="ms-chart-h"><span>' + label + '</span><b data-tm="' + id + ':h_' + histKey + '">—</b></div><div data-spark="' + id + ':' + histKey + '" class="' + cls + '">' + spark(t.hist[histKey], cls) + '</div><p class="ms-chart-u">' + unit + '</p></div>';
    }
    return '<div class="ms-charts">' + card('Concurrent viewers', 'viewers', 'is-blue', 'last 3 min' + (t.src && t.src.viewers ? ' · ' + t.src.viewers : ' · demo data')) + card('Rebuffer ratio', 'rebuffer', 'is-amber', '% of watch time') + card('SRT packet loss', 'loss', 'is-red', '% · primary contribution') + card('CDN egress', 'egress', 'is-green', 'Gbps') + '</div>';
  }
  function section(title, body, extra, defaultOpen) {
    /* defaultOpen === false → collapse by default; the top-of-fold sections stay open */
    if (defaultOpen === false) {
      // A summary can't contain controls (nested-interactive): buttons move to the top of the body.
      var ctl = /<(button|a|select|input)\b/.test(extra || '');
      return '<details class="ms-card ms-card-fold"><summary class="ms-card-h"><h3>' + title + '</h3>' + (ctl ? '' : (extra || '')) + '</summary><div class="ms-card-body">' +
        (ctl ? '<div class="ms-fold-actions">' + extra + '</div>' : '') + body + '</div></details>';
    }
    return '<section class="ms-card"><div class="ms-card-h"><h3>' + title + '</h3>' + (extra || '') + '</div>' + body + '</section>';
  }
  function kv(rows) { return '<dl class="ms-kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>'; }

  function paneHTML(key) {
    var s = showFor(key), streams = streamsFor(key), state = stateOf(key), g = healthOf(key), r = rec(key);
    var done = CHECKLIST.filter(function (c, i) { return r.checklist[i]; }).length;
    var incidents = root.MuseIncidents ? root.MuseIncidents.byProduction(key) : [];
    var openInc = incidents.filter(function (i) { return i.status !== 'Closed' && i.status !== 'Resolved'; }).length;
    var tiles = streams.length ? streams.map(function (st, i) {
      return tileHTML(key, st, 'proj', { big: i === 0, actions: '<button type="button" class="ms-link" onclick="MuseStreaming.copyUrl(\'' + esc(st.url) + '\')">Copy URL</button>' + '<button type="button" class="ms-link" onclick="MuseStreaming.removeStream(\'' + key + '\',\'' + st.id + '\')">Remove</button>' });
    }).join('') : '<p class="ms-empty">No streams yet. Add the program HLS URL below.</p>';
    var head = '<div class="ms-head">' +
      '<div class="ms-head-l">' + badge(state) + '<select class="ms-state-sel" aria-label="Stream state" onchange="MuseStreaming.setState(\'' + key + '\',this.value)">' +
        Object.keys(STATES).map(function (x) { return '<option value="' + x + '"' + (x === state ? ' selected' : '') + '>' + STATES[x].label + '</option>'; }).join('') + '</select>' + '<span class="ms-head-health" data-tm="' + (programOf(key) ? programOf(key).id : '') + ':health">' + dot(g.overall) + LEVEL_TXT[g.overall] + '</span>' +
        '<span class="ms-head-meta">' + esc(s.latency) + '</span></div>' +
      '<div class="ms-head-r"><button type="button" class="ms-btn" onclick="navGo(\'streams\')">Live Streams wall</button>' +
        '<button type="button" class="ms-btn" onclick="MuseIncidents.openNew(\'' + key + '\')">Log incident</button>' +
        '<button type="button" class="ms-btn ms-btn-primary" onclick="museaiAsk(\'How is the stream for ' + esc(nameOf(key)).replace(/'/g, '') + ' doing right now?\')">Ask Muse</button></div></div>';
    var alerts = g.m && g.overall !== 'off' ? alertsFor(g.m, g) : [];
    var alertHTML = '<div class="ms-alerts" data-alerts="' + (programOf(key) ? programOf(key).id : '') + '">' + alerts.map(function (a) { return '<div class="ms-alert">' + esc(a) + '</div>'; }).join('') + '</div>';
    var ladder = '<div class="ms-table"><table><thead><tr><th>Rung</th><th>Resolution</th><th>fps</th><th>Codec / profile</th><th>Video</th></tr></thead><tbody>' +
      s.ladder.map(function (l) { return '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td><td>' + l[2] + '</td><td>' + l[3] + '</td><td>' + l[4].toFixed(1) + ' Mbps</td></tr>'; }).join('') +
      '</tbody></table></div><p class="ms-note">Audio AAC-LC 128 kbps 48 kHz stereo on every rung · 2 s GOP, closed, IDR-aligned across rungs · CBR with 1.1× VBV.</p>';
    var checklist = '<ol class="ms-check">' + CHECKLIST.map(function (c, i) {
      return '<li><label><input type="checkbox" ' + (r.checklist[i] ? 'checked ' : '') + 'onchange="MuseStreaming.tick(\'' + key + '\',' + i + ',this.checked)"><span class="ms-tminus">' + c[0] + '</span><span>' + esc(c[1]) + '</span></label></li>';
    }).join('') + '</ol>';
    var incHTML = root.MuseIncidents ? root.MuseIncidents.listHTML(incidents, { compact: true }) : '';
    return '<div class="ms-wrap">' + head + alertHTML +
      section('Stream monitors', '<div class="ms-grid">' + tiles + '</div>' +
        '<form class="ms-add" onsubmit="event.preventDefault();MuseStreaming.addStream(\'' + key + '\',this)"><input name="name" placeholder="Name (e.g. Program · clean)" aria-label="Stream name" required>' +
        '<input name="url" type="url" placeholder="HLS .m3u8 or YouTube link" aria-label="HLS (.m3u8) or YouTube URL" required pattern="https://.+"><select name="role" aria-label="Role"><option value="program">Program</option><option value="backup">Backup</option><option value="iso">ISO / camera</option><option value="vertical">Vertical 9:16</option><option value="return">Return / confidence</option></select>' +
        '<button type="submit" class="ms-btn ms-btn-primary">Add stream</button></form>',
        '<span class="ms-sub">Player stats are measured live in this browser</span>') +
      section('Live health · end-to-end', chainHTML(key) + chartsHTML(key), '<span class="ms-sub">Encoder → contribution → cloud → origin → CDN → viewers ' +
        (programOf(key) && anyDemo(teleFor(key, programOf(key))) ? '<span class="ms-src" title="Simulated telemetry — see Data sources">Demo data</span>' : '') + '</span>' +
        (rec(key).failover ? '<button type="button" class="ms-btn" onclick="MuseStreaming.returnToPrimary(\'' + key + '\')">Return to primary input</button>' : '')) +
      '<div class="ms-two">' +
        section('Measured QoE · your players', '<div data-qoe="' + key + '"><p class="ms-empty is-loading">Loading…</p></div>', '<span class="ms-src is-live">Real</span>') +
        section('SLO · ' + SLO_TARGET + '% availability', sloHTML(key)) +
      '</div>' +
      section('Pre-flight', '<div data-preflight="' + key + '">' + preflightBody(key) + '</div>', '<button type="button" class="ms-btn ms-btn-primary" onclick="MuseStreaming.preflight(\'' + key + '\')">Run pre-flight</button>', false) +
      '<div class="ms-two">' +
        section('Destinations & ingest', '<ul class="ms-list">' + s.destinations.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul><p class="ms-note">RTMPS primary + backup ingest per destination · stream keys in vault, never in the run-of-show.</p>' + fbHTML(key), '', false) +
        section('Contribution & redundancy', kv([['Primary', esc(s.primary)], ['Backup', esc(s.backup)], ['Cloud', esc(s.cloud)], ['Venue network', esc(s.venueNet)]]), '', false) +
      '</div>' +
      section('Encoding ladder', ladder, '<span class="ms-sub">' + (s.ladder === LADDER_916 ? 'Vertical 9:16' : '16:9') + ' · ' + s.ladder.length + ' rungs</span>', false) +
      '<div class="ms-two">' +
        section('Packaging & delivery', kv([['Formats', 'HLS (TS + fMP4/CMAF) · LL-HLS partial segments 0.33 s · DASH CMAF'], ['Segments', '2 s (LL) · 6 s (standard) · 3 segments live sync'], ['DVR / start-over', '2 h window · VOD archive at T+0'], ['Latency', esc(s.latency)], ['CDN', 'CloudFront + Akamai, origin shield, weighted ' + (r.cdn ? r.cdn.cloudfront + '/' + r.cdn.akamai : '60/40') + ' with health-based failover'], ['Access', 'Signed URLs / token auth on embeds · geo rules per rights']]), '', false) +
        section('Audio · captions · accessibility', kv([['Loudness', esc(s.loudness)], ['Captions', esc(s.captions)], ['Audio description', 'Secondary audio rendition on request'], ['Ad / slate markers', 'SCTE-35 splice_insert for slates & breaks · countdown slate T-15 min']]), '', false) +
      '</div>' +
      '<div class="ms-two">' +
        section('Monitoring & alerting', kv([['Probes', 'TAG multiviewer probe on program + backup · MediaConnect & MediaLive CloudWatch alarms'], ['QoE', 'Player beacons (rebuffer, startup, failures, bitrate) per destination'], ['Paging', 'PagerDuty: SEV-1/2 → streaming on-call + TOC · Slack #live-ops-bridge'], ['Thresholds', 'SRT loss > 0.5% · segment age > 6 s · edge 5xx > 0.5% · rebuffer > 1%']]), '', false) +
        section('Go-live checklist', checklist, '<span class="ms-sub">' + done + ' / ' + CHECKLIST.length + ' done</span>', false) +
      '</div>' +
      '<details class="ms-card ms-details"><summary><h3>Data sources</h3><span class="ms-sub">Map this show\'s streams to AWS CloudWatch and Mux Data</span></summary>' + sourcesHTML(key) + '</details>' +
      section('Incidents · ' + esc(nameOf(key)), incHTML || '<p class="ms-empty">No incidents logged for this show.</p>', '<span class="ms-sub">' + openInc + ' open · <button type="button" class="ms-link" onclick="navGo(\'incidents\')">All incident reports</button></span>') +
    '</div>';
  }

  function wallHTML() {
    var ks = keys(), totalV = 0, live = 0, reb = [], openInc = 0;
    ks.forEach(function (k) { var g = healthOf(k); if (g.m && liveOf(k)) { live++; totalV += g.m.viewers; reb.push(g.m.rebuffer); } });
    try { openInc = root.MuseIncidents.all().filter(function (i) { return i.status === 'Open' || i.status === 'Monitoring'; }).length; } catch (e) {}
    var avgReb = reb.length ? reb.reduce(function (a, b) { return a + b; }, 0) / reb.length : 0;
    var sorted = ks.slice().sort(function (a, b) { var o = { LIVE: 0, REHEARSAL: 1, STANDBY: 2, SCHEDULED: 3, ENDED: 4 }; var x = o[stateOf(a)], y = o[stateOf(b)]; return (x == null ? 9 : x) - (y == null ? 9 : y); });
    var tiles = sorted.map(function (k) {
      var pr = programOf(k); if (!pr) return '';
      return tileHTML(k, pr, 'wall', { showName: true, actions: '<button type="button" class="ms-link" onclick="MuseStreaming.openShow(\'' + k + '\')">Open streaming plan →</button>' });
    }).join('');
    return '<div class="ms-wrap">' +
      '<div class="ms-page-h"><div><h1>Live Streams</h1><p>Every program feed across Meta live events, with end-to-end health. For executives and engineers.</p></div>' +
        '<div class="ms-head-r"><button type="button" class="ms-btn" onclick="window.open(\'glasses/preview.html\',\'_blank\',\'noopener\')">Muse on Ray-Ban Display ↗</button>' +
        '<button type="button" class="ms-btn ms-btn-primary" onclick="museaiAsk(\'Give me a health check on every live stream right now\')">Ask Muse for a health check</button></div></div>' +
      '<p class="ms-note ms-demo-note"><span class="ms-src">Demo data</span> Viewer and pipeline numbers are simulated until real sources are connected per stream (AWS CloudWatch, Mux Data, Facebook Live). Video monitors and pre-flight checks are real.</p>' +
      '<div class="ms-kpis"><div><span>Live now</span><b id="msK-live">' + live + '</b></div><div><span>Concurrent viewers</span><b id="msK-viewers">' + fmtN(totalV) + '</b></div>' +
        '<div><span>Avg rebuffer</span><b id="msK-reb">' + avgReb.toFixed(2) + '%</b></div><div><span>Open incidents</span><b>' + openInc + '</b></div></div>' +
      '<div class="ms-wall">' + tiles + '</div>' +
      section('SLO · ' + SLO_TARGET + '% availability by show', '<div class="ms-table"><table><thead><tr><th>Show</th><th>State</th><th>Last event</th><th>Event budget left</th><th>Last 30 days</th><th>30-day budget left</th></tr></thead><tbody>' +
        sorted.map(function (k) { var o = sloFor(k), e = o.event, mo = o.last_30_days;
          return '<tr><td><button type="button" class="ms-link" onclick="MuseStreaming.openShow(\'' + k + '\')">' + esc(nameOf(k)) + '</button></td><td>' + badge(stateOf(k)) + '</td><td>' + (e ? e.availability_pct.toFixed(2) + '%' : '—') + '</td><td>' + (e ? '<span class="ms-dot is-' + e.status + '"></span> ' + budgetTxt(e) : '—') + '</td><td>' + mo.availability_pct.toFixed(3) + '%</td><td><span class="ms-dot is-' + mo.status + '"></span> ' + budgetTxt(mo) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="ms-note">Error budget from incident reports (viewer-visible seconds, or duration × share of viewers affected) plus degradation measured this session.</p>') +
    '</div>';
  }
  function dashHTML() {
    var ks = keys().filter(liveOf);
    if (!ks.length) return '';
    var totalV = 0; ks.forEach(function (k) { var g = healthOf(k); if (g.m) totalV += g.m.viewers; });
    var tiles = ks.slice(0, 3).map(function (k) { var pr = programOf(k); return pr ? tileHTML(k, pr, 'dash', { showName: true }) : ''; }).join('');
    return '<div class="ms-dash-h"><div class="ms-dash-title"><span class="ms-state is-live"><i></i>LIVE NOW</span><h2>Live streams</h2><span class="ms-sub">' + ks.length + ' on air · <b id="msD-viewers">' + fmtN(totalV) + '</b> concurrent viewers</span><span class="ms-src" title="Simulated viewer and pipeline numbers">Demo data</span></div>' +
      '<button type="button" class="ms-btn" onclick="navGo(\'streams\')">Open Live Streams wall →</button></div><div class="ms-dash-grid">' + tiles + '</div>';
  }

  /* ---------------- dashboard home header (Meta Business Suite-style) ---------------- */
  function homeHTML() {
    var name = ''; try { name = (root.permUser && root.permUser()) || ''; } catch (e) {}
    if (!name) { var el = document.getElementById('userChipName'); name = el ? el.textContent.trim() : ''; }
    var first = (name || '').split(' ')[0];
    var h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    var ks = keys(), live = ks.filter(liveOf), viewers = 0, risk = 0, openInc = 0;
    live.forEach(function (k) { var g = healthOf(k); if (g.m) viewers += g.m.viewers; });
    ks.forEach(function (k) { var p = P()[k]; try { if (root.computePct(p) < 40 && p.status !== 'Complete') risk++; /* the portfolio At-risk band */ } catch (e) {} });
    try { openInc = root.MuseIncidents.all().filter(function (i) { return i.status === 'Open' || i.status === 'Monitoring'; }).length; } catch (e) {}
    var next = null; ks.forEach(function (k) { (P()[k].schedule || []).forEach(function (r) { if (!r[4] || r[4] === '—') return; var d = /^\d{4}-\d{2}-\d{2}$/.test(r[0]) ? new Date(r[0] + 'T' + (/^\d{1,2}:\d{2}$/.test(r[1] || '') ? ('0' + r[1]).slice(-5) : '12:00')) : new Date(r[0]), t = d.getTime();
      if (!isNaN(t) && t >= Date.now() - 36e5 && (!next || t < next.t)) next = { t: t, k: k, when: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (r[1] ? ' · ' + r[1] : '') }; }); });
    function stat(label, val, cls, go) { return '<button type="button" class="mh-stat" onclick="' + go + '"><span>' + label + '</span><b class="' + (cls || '') + '">' + val + '</b></button>'; }
    return '<div class="mh-text"><p class="mh-date">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + '</p>' +
      '<h1>' + greet + (first ? ', ' + esc(first) : '') + '</h1>' +
      '<p class="mh-sub">' + (live.length ? live.length + ' stream' + (live.length > 1 ? 's' : '') + ' on air for <b id="mhViewers">' + fmtN(viewers) + '</b> viewers <span class="ms-src">Demo data</span>' : 'Nothing on air right now') +
        (next ? ' · next on air: <b>' + esc(nameOf(next.k)) + '</b>, ' + esc(next.when) : '') + '</p>' +
      '<div class="mh-actions"><button type="button" class="ms-btn ms-btn-primary" onclick="museaiAsk(\'Give me my morning briefing across every show\')">Ask Muse for a briefing</button>' +
        '<button type="button" class="ms-btn" onclick="navGo(\'streams\')">Live Streams</button><button type="button" class="ms-btn" onclick="navGo(\'incidents\')">Incidents</button>' +
        '<button type="button" class="ms-btn" onclick="navGo(\'schedule\')">Schedule</button></div></div>' +
      '<div class="mh-stats">' + stat('On air', live.length, live.length ? 'is-live' : '', "navGo('streams')") + stat('Viewers now', '<span id="mhViewers2">' + fmtN(viewers) + '</span>', '', "navGo('streams')") +
        stat('Shows at risk', risk, risk ? 'is-warn' : '', "navGo('dashboard');document.getElementById('dashRowMain')&&document.getElementById('dashRowMain').scrollIntoView({behavior:'smooth'})") +
        stat('Open incidents', openInc, openInc ? 'is-warn' : '', "navGo('incidents')") + '</div>';
  }
  function renderHome() {
    var dash = document.getElementById('view-dashboard'); if (!dash) return;
    var host = document.getElementById('dashHome');
    if (!host) {
      host = document.createElement('section'); host.id = 'dashHome'; host.className = 'meta-home'; host.setAttribute('aria-label', 'Today');
      var anchor = document.getElementById('npcAlertHost'); anchor = anchor ? anchor.parentNode : null;
      var first = dash.querySelector('section'); dash.insertBefore(host, (anchor && anchor.parentNode === dash ? anchor : first) || dash.firstChild);
    }
    host.innerHTML = homeHTML();
  }

  /* ---------------- integrations: real telemetry, Facebook Live, QoE beacons ---------------- */
  var integ = { telemetry: null, fb: null }, fbCache = {};
  function api(url, opts) {
    return fetch(url, Object.assign({ credentials: 'include', cache: 'no-store' }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function postJSON(url, body) { return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  function probeIntegrations() {
    api('/api/telemetry?status=1').then(function (j) { integ.telemetry = j; pollReal(); }).catch(function () { integ.telemetry = { aws: false, mux: false }; });
    api('/api/fblive?status=1').then(function (j) { integ.fb = j; }).catch(function () { integ.fb = { configured: false }; });
  }
  function srcCfg(key, sid) { var r = rec(key); return (r.src || {})[sid] || null; }
  function pollReal() {
    var T = integ.telemetry; if (!T || !(T.aws || T.mux)) return;
    keys().forEach(function (k) {
      streamsFor(k).forEach(function (st) {
        var cfg = srcCfg(k, st.id); if (!cfg) return;
        var t = teleFor(k, st);
        postJSON('/api/telemetry', cfg).then(function (res) {
          t.real = {}; t.src = {};
          Object.keys(res.stages || {}).forEach(function (stage) {
            var g = res.stages[stage], any = false; if (!g || !g.metrics) return;
            Object.keys(g.metrics).forEach(function (f) { if (g.metrics[f] != null) { t.real[f] = g.metrics[f]; any = true; } });
            if (any) t.src[stage] = g.source;
          });
          t.realErr = (res.errors || []).join('; ') || null;
          refreshChain(k);
        }).catch(function (e) { t.realErr = e.message; });
      });
    });
  }
  function refreshChain(k) {
    var pr = programOf(k); if (!pr) return;
    var ch = document.querySelector('[data-chain="' + pr.id + '"]'); if (ch) ch.outerHTML = chainHTML(k);
  }
  // Real player QoE from our HLS monitors (YouTube embeds expose no stats).
  function sendBeacons() {
    Object.keys(players).forEach(function (k) {
      var p = players[k]; if (p.yt || !p.qoe || p.qoe.startup_ms == null) return;
      var q = p.qoe, now = Date.now(), sid = k.split(':')[1] || k;
      var lv = p.hls && p.hls.levels && p.hls.levels[p.hls.currentLevel];
      var body = { show: sid.split('-')[0], stream: sid, session: q.session, startup_ms: q.startup_ms,
        rebuffer_ms: Math.round(q.rebuffer_ms + (q.waitSince ? now - q.waitSince : 0)), play_ms: Math.round(q.play_ms + (q.playSince ? now - q.playSince : 0)),
        rebuffer_events: q.rebuffer_events, switches: q.switches, errors: q.errors, bitrate_kbps: lv ? Math.round(lv.bitrate / 1000) : null };
      try {
        if (navigator.sendBeacon) navigator.sendBeacon('/api/qoe', new Blob([JSON.stringify(body)], { type: 'application/json' }));
        else postJSON('/api/qoe', body).catch(function () {});
      } catch (e) {}
    });
  }
  function qoeBody(key, j) {
    var rows = (j && j.streams) || [];
    if (!rows.length) return '<p class="ms-empty">No player sessions yet. HLS monitors report startup time, rebuffering, bitrate switches and errors here every 15 s (YouTube embeds can\'t be measured).</p>';
    var names = {}; streamsFor(key).forEach(function (st) { names[st.id] = st.name; });
    return '<div class="ms-table"><table><thead><tr><th>Stream</th><th>Sessions</th><th>Startup</th><th>Rebuffer</th><th>Stalls</th><th>Bitrate</th><th>Switches</th><th>Errors</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(names[r.stream] || r.stream) + '</td><td>' + r.sessions + (r.active ? ' (' + r.active + ' active)' : '') + '</td><td>' + (r.avg_startup_ms != null ? (r.avg_startup_ms / 1000).toFixed(2) + ' s' : '—') + '</td><td>' + (r.rebuffer_pct != null ? r.rebuffer_pct.toFixed(2) + '%' : '—') + '</td><td>' + r.rebuffer_events + '</td><td>' + (r.avg_bitrate_kbps ? (r.avg_bitrate_kbps / 1000).toFixed(1) + ' Mbps' : '—') + '</td><td>' + r.switches + '</td><td>' + r.errors + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="ms-note">Measured from real playback sessions of this production\'s HLS monitors · CMCD (CTA-5004) is sent on every segment request.</p>';
  }
  function refreshQoe() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-qoe]'), function (el) {
      var k = el.getAttribute('data-qoe');
      api('/api/qoe?show=' + encodeURIComponent(k)).then(function (j) { el.innerHTML = qoeBody(k, j); }).catch(function () { el.innerHTML = '<p class="ms-empty">No player beacons in demo mode.</p>'; });
    });
  }

  /* ---------------- Facebook / Instagram Live (Graph API via /api/fblive) ---------------- */
  function fbOut(d) {
    if (!d) return '';
    if (d.error) return '<p class="ms-err">' + esc(d.error) + '</p>';
    var vids = d.videos || (d.video ? [d.video] : []);
    var html = vids.length ? vids.map(function (v) {
      var ing = (v.ingest_streams && v.ingest_streams.data) || [], master = ing.filter(function (x) { return x.is_master; })[0] || ing[0];
      var h = master && master.stream_health ? Object.keys(master.stream_health).slice(0, 6).map(function (k) { return k.replace(/_/g, ' ') + ' ' + JSON.stringify(master.stream_health[k]); }).join(' · ') : 'no ingest health reported';
      return '<div class="ms-fb-row"><span class="ms-state ' + (/LIVE/.test(v.status || '') ? 'is-live' : 'is-standby') + '">' + esc(v.status || '—') + '</span><b>' + esc(v.title || v.id) + '</b>' +
        '<span>' + (v.live_views != null ? Number(v.live_views).toLocaleString() + ' live viewers' : '') + '</span>' +
        (v.permalink_url ? '<a class="ms-link" href="https://www.facebook.com' + esc(String(v.permalink_url).replace(/^https?:\/\/[^/]+/, '')) + '" target="_blank" rel="noopener noreferrer">Open</a>' : '') +
        '<span class="ms-meas">Ingest: ' + esc(h) + '</span></div>';
    }).join('') : '<p class="ms-empty">No live videos on this Page right now.</p>';
    if (d.instagram) html += '<p class="ms-note">Instagram Live: ' + (d.instagram.length ? d.instagram.length + ' live media item(s) now' : 'not live') + '</p>';
    return html;
  }
  function loadFb(key) {
    var fb = rec(key).fb; if (!fb || !(fb.page || fb.video) || !(integ.fb && integ.fb.configured)) return;
    var q = fb.video ? 'video=' + encodeURIComponent(fb.video) : 'page=' + encodeURIComponent(fb.page);
    api('/api/fblive?' + q + (fb.ig ? '&ig=' + encodeURIComponent(fb.ig) : '')).then(function (j) { fbCache[key] = j; }).catch(function (e) { fbCache[key] = { error: e.message }; })
      .then(function () { var el = document.querySelector('[data-fb-out="' + key + '"]'); if (el) el.innerHTML = fbOut(fbCache[key]); });
  }
  function fbHTML(key) {
    var fb = rec(key).fb || {}, conf = integ.fb && integ.fb.configured;
    return '<div class="ms-fb"><div class="ms-fb-h"><b>Facebook &amp; Instagram Live</b>' + (conf ? '<span class="ms-src is-live">Graph API ' + esc(integ.fb.version || '') + '</span>' : '<span class="ms-src">Not connected</span>') + '</div>' +
      (conf ? '' : '<p class="ms-note">Not connected — add the FB_GRAPH_TOKEN secret (a Page access token). Live status, viewers and ingest health appear here once it is connected; nothing is simulated.</p>') +
      '<form class="ms-add" onsubmit="event.preventDefault();MuseStreaming.connectFb(\'' + key + '\',this)">' +
        '<input name="page" placeholder="Facebook Page ID" value="' + esc(fb.page || '') + '" aria-label="Facebook Page ID" inputmode="numeric">' +
        '<input name="video" placeholder="Live video ID (optional)" value="' + esc(fb.video || '') + '" aria-label="Live video ID" inputmode="numeric">' +
        '<input name="ig" placeholder="Instagram account ID (optional)" value="' + esc(fb.ig || '') + '" aria-label="Instagram professional account ID" inputmode="numeric">' +
        '<button class="ms-btn" type="submit">Save</button></form>' +
      '<div data-fb-out="' + key + '">' + (fbCache[key] ? fbOut(fbCache[key]) : '') + '</div></div>';
  }
  function sourcesHTML(key) {
    var T = integ.telemetry || {};
    return '<p class="ms-note">Server: AWS CloudWatch <b>' + (T.aws ? 'connected (' + esc(T.region || '') + ')' : 'not configured') + '</b>' + (T.aws ? '' : ' — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION') +
      ' · Mux Data <b>' + (T.mux ? 'connected' : 'not configured') + '</b>' + (T.mux ? '' : ' — set MUX_TOKEN_ID, MUX_TOKEN_SECRET') +
      '. A stage shows "Live · source" once its stream is mapped below and the server is configured; everything else stays labelled "Demo data".</p>' +
      streamsFor(key).map(function (st) {
        var c = srcCfg(key, st.id) || {}, a = c.aws || {}, mx = c.mux || {}, t = teleFor(key, st);
        return '<form class="ms-src-form" onsubmit="event.preventDefault();MuseStreaming.saveSources(\'' + key + '\',\'' + st.id + '\',this)"><b>' + esc(st.name) + '</b>' +
          '<input name="medialive" placeholder="MediaLive channel ID" aria-label="MediaLive channel ID" value="' + esc(a.medialiveChannelId || '') + '">' +
          '<input name="mediaconnect" placeholder="MediaConnect flow ARN" aria-label="MediaConnect flow ARN" value="' + esc(a.mediaconnectFlowArn || '') + '">' +
          '<input name="cloudfront" placeholder="CloudFront distribution ID" aria-label="CloudFront distribution ID" value="' + esc(a.cloudfrontDistributionId || '') + '">' +
          '<input name="mux" placeholder="Mux video_id filter" aria-label="Mux Data video_id filter" value="' + esc(mx.videoId || '') + '">' +
          '<button class="ms-btn" type="submit">Save</button>' + (t.realErr ? '<span class="ms-err">' + esc(t.realErr) + '</span>' : '') + '</form>';
      }).join('');
  }

  /* ---------------- SLO: 99.9% availability, error budget from incidents + live degradation ---------------- */
  var SLO_TARGET = 99.9, EVENT_MIN = 140;
  var AVAIL_CATS = ['Contribution', 'Encoding', 'Cloud / packaging', 'CDN / delivery', 'Playback / QoE', 'Network / venue IT', 'Power'];
  function parseDur(txt) { if (!txt) return null; var s = 0, m, found = false, re = /(\d+)\s*(h|m|s)\b/g; while ((m = re.exec(txt))) { found = true; s += +m[1] * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1); } return found ? s : null; }
  function visibleSeconds(i) {
    if (AVAIL_CATS.indexOf(i.category) < 0) return 0;
    var im = i.impact || {}, vis = parseDur(im.duration_viewer_visible);
    if (vis != null) return vis;                                   // full viewer-visible outage
    if (!im.viewers_affected) return 0;
    var end = (i.mitigated || i.resolved) ? new Date(i.mitigated || i.resolved) : new Date();
    var secs = Math.max(0, (end - new Date(i.started)) / 1000);
    return secs * (im.peak_concurrent ? Math.min(1, im.viewers_affected / im.peak_concurrent) : 0.1); // viewer-weighted partial degradation
  }
  function sloFor(key) {
    var inc = []; try { inc = root.MuseIncidents.byProduction(key); } catch (e) {}
    var now = Date.now(), monthS = 30 * 86400, eventS = EVENT_MIN * 60, frac = 1 - SLO_TARGET / 100;
    var session = 0; streamsFor(key).forEach(function (st) { var t = tele[st.id]; if (t && st.role === 'program') session += t.visibleS || 0; });
    var used = session + inc.filter(function (i) { return now - new Date(i.started) < monthS * 1000; }).reduce(function (a, i) { return a + visibleSeconds(i); }, 0);
    var evDay = liveOf(key) ? new Date().toDateString() : null;
    if (!evDay) { var ev = inc.filter(function (i) { return visibleSeconds(i) > 0; })[0]; if (ev) evDay = new Date(ev.started).toDateString(); }
    var evUsed = evDay ? inc.filter(function (i) { return new Date(i.started).toDateString() === evDay; }).reduce(function (a, i) { return a + visibleSeconds(i); }, 0) + (liveOf(key) ? session : 0) : 0;
    function pack(u, windowS) { var budget = windowS * frac, remaining = 100 * (1 - u / budget); return { availability_pct: +(100 * (1 - u / windowS)).toFixed(3), budget_s: +budget.toFixed(1), used_s: +u.toFixed(1), budget_remaining_pct: Math.round(remaining), status: remaining >= 50 ? 'ok' : remaining >= 0 ? 'warn' : 'crit' }; }
    return { target_pct: SLO_TARGET, last_30_days: pack(used, monthS), event: evDay ? Object.assign(pack(evUsed, eventS), { day: evDay, window_min: EVENT_MIN }) : null,
      method: 'Viewer-visible seconds from incident reports (full outages) or duration × share of viewers affected (partial), plus degraded seconds measured live this session' };
  }
  function budgetTxt(x) { return x.budget_remaining_pct >= 0 ? x.budget_remaining_pct + '%' : 'Exhausted (' + (x.used_s / x.budget_s).toFixed(1) + '×)'; }
  function sloHTML(key) {
    var o = sloFor(key);
    function card(label, x) {
      if (!x) return '<div class="ms-slo is-off"><span>' + label + '</span><b>—</b><em>No on-air event on record</em></div>';
      return '<div class="ms-slo is-' + x.status + '"><span>' + label + '</span><b>' + x.availability_pct.toFixed(2) + '%</b><em>' + (x.budget_remaining_pct >= 0 ? x.budget_remaining_pct + '% of error budget left' : 'Budget exhausted · ' + (x.used_s / x.budget_s).toFixed(1) + '× the ' + (label.indexOf('Event') === 0 ? 'event' : '30-day') + ' budget') + ' · ' + x.used_s.toFixed(0) + ' s used of ' + x.budget_s.toFixed(0) + ' s</em></div>';
    }
    return '<div class="ms-slos">' + card(o.event ? 'Event · ' + o.event.day : 'Event', o.event) + card('Last 30 days', o.last_30_days) + '</div><p class="ms-note">Target ' + o.target_pct + '% availability · ' + esc(o.method) + '.</p>';
  }

  /* ---------------- anomalies → recommendations → apply (what Muse acts on) ---------------- */
  var anomalyLogs = {}, lastAnomalies = {};
  function anomalies() {
    var out = [];
    keys().forEach(function (k) {
      if (!liveOf(k)) return;
      var ops = rec(k), w = ops.cdn || { cloudfront: 60, akamai: 40 };
      streamsFor(k).forEach(function (st) {
        var t = teleFor(k, st); if (!t.live) return;
        var m = t.m, g = grade(m, true);
        Object.keys(g.stages).forEach(function (stage) {
          var lv = g.stages[stage]; if (lv === 'ok') return;
          var text, rc = { kind: 'none', label: 'Watch it and escalate if it persists', args: { key: k } };
          var shift = { kind: 'cdn_shift', label: 'Shift CDN weighting to CloudFront 80 / Akamai 20', args: { key: k, cloudfront: 80, akamai: 20 } };
          if (stage === 'cdn') { text = 'Edge 5xx ' + m.cdn_5xx.toFixed(2) + '% · cache hit ' + m.cdn_hit.toFixed(1) + '% · TTFB ' + Math.round(m.cdn_ttfb) + ' ms'; if (w.akamai > 20) rc = shift; }
          else if (stage === 'viewers') { text = 'Rebuffer ' + m.rebuffer.toFixed(2) + '% · failures ' + m.failures.toFixed(2) + '% · startup ' + m.startup.toFixed(1) + ' s'; if (g.stages.cdn !== 'ok' && w.akamai > 20) rc = shift; }
          else if (stage === 'contribution') {
            text = 'SRT loss ' + m.srt_loss.toFixed(2) + '% · RTT ' + Math.round(m.srt_rtt) + ' ms · bonded ' + m.bond_up + '/' + m.bond_total + ' modems';
            if (m.srt_loss > 0.5 && !ops.failover && st.role === 'program') rc = { kind: 'failover_backup', label: 'Fail over to the LiveU backup input', args: { key: k, streamId: st.id } };
            else if (!(ops.srtLatency >= 2000)) rc = { kind: 'raise_srt_latency', label: 'Raise SRT latency to 2,000 ms', args: { key: k, ms: 2000 } };
          }
          else if (stage === 'encoder') text = 'Encoder CPU ' + Math.round(m.enc_cpu) + '% · ' + m.enc_fps + ' fps · loudness ' + m.audio_lufs.toFixed(1) + ' LKFS';
          else if (stage === 'cloud') { text = 'Ingest running on ' + m.input + ' · ' + m.pipelines + '/2 pipelines'; if (ops.failover) rc = { kind: 'none', label: 'Return to primary during a VT once SRT holds clean for 2 min', args: { key: k } }; }
          else text = 'Segment age ' + m.seg_age.toFixed(1) + ' s · origin 5xx ' + m.origin_5xx.toFixed(2) + '%';
          out.push({ id: k + ':' + st.id + ':' + stage, key: k, show: nameOf(k), streamId: st.id, stream: st.name, stage: stage, level: lv, text: text,
            data_source: (t.src && t.src[stage]) || 'demo (simulated)', recommendation: rc });
        });
      });
    });
    return out;
  }
  function logAnomaly(k, text) { var l = anomalyLogs[k] = anomalyLogs[k] || []; l.push({ t: new Date().toISOString(), text: text }); if (l.length > 60) l.shift(); }
  function trackAnomalies() {
    var now = {}; anomalies().forEach(function (a) { now[a.id] = a; });
    Object.keys(now).forEach(function (id) { if (!lastAnomalies[id]) logAnomaly(now[id].key, '[' + now[id].stage + '] ' + now[id].stream + ': ' + now[id].text); });
    Object.keys(lastAnomalies).forEach(function (id) { if (!now[id]) logAnomaly(lastAnomalies[id].key, '[' + lastAnomalies[id].stage + '] cleared on ' + lastAnomalies[id].stream); });
    lastAnomalies = now;
  }
  function setCdnWeights(key, w) {
    var cf = Math.max(0, Math.min(100, Math.round(+((w || {}).cloudfront)))), ak = Math.max(0, Math.min(100, Math.round(+((w || {}).akamai))));
    if (isNaN(cf) && isNaN(ak)) throw new Error('Give cloudfront and akamai weights');
    if (isNaN(cf)) cf = 100 - ak; if (isNaN(ak)) ak = 100 - cf;
    var tot = cf + ak || 100; cf = Math.round(cf * 100 / tot); ak = 100 - cf;
    rec(key).cdn = { cloudfront: cf, akamai: ak }; save();
    logAnomaly(key, 'CDN weighting set to CloudFront ' + cf + ' / Akamai ' + ak);
    refreshChain(key);
    return rec(key).cdn;
  }
  function apply(r) {
    if (!r || !r.kind || r.kind === 'none') return { ok: false, text: 'There is no automatic action for this one. ' + ((r && r.label) || '') };
    var a = r.args || {}, k = a.key; if (!k || !P()[k]) return { ok: false, text: 'Unknown show.' };
    var ops = rec(k), sim = !teleOfProgramHasSource(k);
    var res;
    if (r.kind === 'cdn_shift') { var w = setCdnWeights(k, { cloudfront: a.cloudfront != null ? a.cloudfront : 80, akamai: a.akamai != null ? a.akamai : 20 }); res = 'CDN weighting for ' + nameOf(k) + ' is now CloudFront ' + w.cloudfront + ' / Akamai ' + w.akamai + '. Edge errors should settle within a minute.'; }
    else if (r.kind === 'failover_backup') { ops.failover = true; save(); logAnomaly(k, 'Failover to LiveU backup input'); refreshChain(k); res = nameOf(k) + ' is now running on the LiveU backup input. Return to primary during a VT once SRT holds clean.'; }
    else if (r.kind === 'raise_srt_latency') { ops.srtLatency = a.ms || 2000; save(); logAnomaly(k, 'SRT latency raised to ' + ops.srtLatency + ' ms'); refreshChain(k); res = 'SRT latency on ' + nameOf(k) + ' raised to ' + ops.srtLatency.toLocaleString() + ' ms.'; }
    else return { ok: false, text: 'Unknown action ' + r.kind + '.' };
    return { ok: true, text: res + (sim ? ' (Applied to the demo telemetry: no real encoder or CDN API is connected.)' : ''), simulated: sim };
  }
  function teleOfProgramHasSource(k) { var pr = programOf(k), t = pr && tele[pr.id]; return !!(t && t.src && Object.keys(t.src).length); }
  function liveStatus() {
    var shows = keys().map(function (k) {
      var g = healthOf(k), live = liveOf(k);
      return { key: k, name: nameOf(k), state: stateOf(k), health: LEVEL_TXT[live ? g.overall : 'off'], viewers: g.m && live ? Math.round(g.m.viewers) : 0,
        latency: g.m && live ? +g.m.latency.toFixed(1) : null, alerts: g.m && live ? alertsFor(g.m, g) : [], data_source: teleOfProgramHasSource(k) ? 'mixed' : 'demo' };
    });
    var open = []; try { open = root.MuseIncidents.all().filter(function (i) { return i.status === 'Open' || i.status === 'Monitoring'; }).map(function (i) { return { id: i.id, severity: i.severity, title: i.title, show: nameOf(i.production) }; }); } catch (e) {}
    return { ts: new Date().toISOString(), shows: shows, openIncidents: open };
  }

  /* ---------------- automated pre-flight (real checks from this browser) ---------------- */
  function timed(url, opts, ms) {
    var c = root.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (c) c.abort(); }, ms || 8000);
    return fetch(url, Object.assign({ cache: 'no-store', credentials: 'omit', signal: c && c.signal }, opts || {})).then(function (r) { clearTimeout(tm); return r; }, function (e) { clearTimeout(tm); throw e; });
  }
  function attrs(line) { var o = {}; String(line).replace(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g, function (_, k, v) { o[k] = v.replace(/^"|"$/g, ''); }); return o; }
  function absUrl(base, rel) { try { return new URL(rel, base).href; } catch (e) { return rel; } }
  function checkHls(st, plan) {
    var R = [], url = st.url, ll = /LL-HLS/.test(plan.latency);
    function add(status, check, detail) { R.push({ stream: st.name, check: check, status: status, detail: detail || '' }); }
    function netErr(e) { return e && e.name === 'AbortError' ? 'timed out after 8 s' : 'network error or blocked by CORS for this origin'; }
    return timed(url).then(function (r) {
      if (!r.ok) { add('fail', 'Master playlist reachable', 'HTTP ' + r.status); return R; }
      add('pass', 'Master playlist reachable', 'HTTP ' + r.status + ' · CORS allows this origin');
      var ct = r.headers.get('content-type') || '';
      add(/mpegurl/i.test(ct) ? 'pass' : 'warn', 'Playlist content-type', ct || 'missing');
      return r.text().then(function (txt) {
        var lines = txt.split(/\r?\n/);
        if ((lines[0] || '').trim() !== '#EXTM3U') { add('fail', '#EXTM3U header', 'missing — not an HLS playlist'); return R; }
        var ver = (/#EXT-X-VERSION:(\d+)/.exec(txt) || [])[1];
        add(ver ? 'pass' : 'warn', 'EXT-X-VERSION', ver ? 'version ' + ver : 'not declared');
        var variants = [];
        lines.forEach(function (l, i) { if (/^#EXT-X-STREAM-INF:/.test(l)) variants.push({ a: attrs(l.slice(18)), url: absUrl(url, (lines[i + 1] || '').trim()) }); });
        var media = lines.filter(function (l) { return /^#EXT-X-MEDIA:/.test(l); }).map(function (l) { return attrs(l.slice(13)); });
        var mediaUrls = [url];
        if (variants.length) {
          add('pass', 'Variant streams', variants.length + ' renditions · ' + variants.slice(0, 6).map(function (v) { return (v.a.RESOLUTION || 'audio') + ' @ ' + Math.round((+v.a.BANDWIDTH || 0) / 1000) + ' kbps'; }).join(', '));
          var noCodecs = variants.filter(function (v) { return !v.a.CODECS; }).length;
          add(noCodecs ? 'warn' : 'pass', 'CODECS on every variant', noCodecs ? noCodecs + ' variant(s) missing CODECS' : variants[0].a.CODECS);
          var subs = media.filter(function (m) { return m.TYPE === 'SUBTITLES' || m.TYPE === 'CLOSED-CAPTIONS'; });
          var ccNone = variants.every(function (v) { return !v.a['CLOSED-CAPTIONS'] || v.a['CLOSED-CAPTIONS'] === 'NONE'; });
          add(subs.length || !ccNone ? 'pass' : 'warn', 'Captions or subtitles advertised', subs.length ? subs.map(function (m) { return m.TYPE.toLowerCase() + ' ' + (m.LANGUAGE || m.NAME || ''); }).join(', ') : (ccNone ? 'none in the master playlist (CLOSED-CAPTIONS=NONE)' : 'embedded 608/708 declared'));
          var indep = /#EXT-X-INDEPENDENT-SEGMENTS/.test(txt);
          add(indep ? 'pass' : 'warn', 'Independent segments', indep ? 'declared' : 'not declared — rendition switching may be slower');
          mediaUrls = variants.slice(0, 3).map(function (v) { return v.url; });
        }
        return Promise.all(mediaUrls.map(function (mu) {
          return timed(mu).then(function (r2) { return r2.ok ? r2.text().then(function (t2) { return { url: mu, ok: true, txt: t2 }; }) : { url: mu, ok: false, why: 'HTTP ' + r2.status }; }, function (e) { return { url: mu, ok: false, why: netErr(e) }; });
        })).then(function (pls) {
          var bad = pls.filter(function (x) { return !x.ok; });
          if (variants.length) add(bad.length ? 'fail' : 'pass', 'Variant playlists reachable', bad.length ? bad.length + ' of ' + pls.length + ' failed (' + bad.map(function (b) { return b.why; }).join(', ') + ')' : pls.length + ' of ' + pls.length + ' checked OK');
          var p0 = pls.filter(function (x) { return x.ok; })[0]; if (!p0) return R;
          var t2 = p0.txt, td = (/#EXT-X-TARGETDURATION:(\d+(?:\.\d+)?)/.exec(t2) || [])[1];
          add(td ? (+td <= 6 ? 'pass' : 'warn') : 'fail', 'Target duration', td ? td + ' s' + (+td > 6 ? ' — long for live' : '') : 'missing');
          var live = !/#EXT-X-ENDLIST/.test(t2);
          add('info', 'Playlist type', live ? 'live (sliding window)' : 'VOD (ENDLIST present)');
          var hasPart = /#EXT-X-PART-INF/.test(t2), hasSC = /#EXT-X-SERVER-CONTROL/.test(t2);
          add(ll && live ? (hasPart && hasSC ? 'pass' : 'warn') : 'info', 'LL-HLS tags', (hasPart ? 'PART-INF' : 'no PART-INF') + ' · ' + (hasSC ? 'SERVER-CONTROL' : 'no SERVER-CONTROL') + (ll && live && !(hasPart && hasSC) ? ' — the plan targets LL-HLS' : ''));
          // PROGRAM-DATE-TIME stamps the next segment; later segments run on by their EXTINF durations.
          var pl = t2.split(/\r?\n/), cursor = null, edge = null, lastSeg = null, mapUri = null;
          pl.forEach(function (l, i) {
            if (/^#EXT-X-PROGRAM-DATE-TIME:/.test(l)) { var pdt = Date.parse(l.slice(25)); if (!isNaN(pdt)) cursor = pdt; }
            if (/^#EXTINF:/.test(l)) {
              var segDur = parseFloat(l.slice(8)) || 0, u = (pl[i + 1] || '').trim();
              if (cursor != null) { cursor += segDur * 1000; edge = cursor; }
              if (u && u[0] !== '#') lastSeg = u;
            }
            if (/^#EXT-X-MAP:/.test(l)) mapUri = attrs(l.slice(11)).URI;
          });
          if (live && edge != null) { var age = (Date.now() - edge) / 1000; add(age < 10 ? 'pass' : age < 30 ? 'warn' : 'fail', 'Live edge freshness', age < 0 ? 'live edge is ' + (-age).toFixed(1) + ' s ahead of this clock (check NTP)' : 'newest segment ends ' + age.toFixed(1) + ' s before now (from PROGRAM-DATE-TIME)'); }
          else if (live) add('warn', 'Live edge freshness', 'no PROGRAM-DATE-TIME, so latency can\'t be estimated');
          if (!lastSeg) return R;
          return timed(absUrl(p0.url, lastSeg), { headers: { Range: 'bytes=0-1023' } }).then(function (r3) {
            var ct3 = r3.headers.get('content-type') || '';
            add(r3.ok ? (/video|audio|mp2t|mp4|octet/i.test(ct3) ? 'pass' : 'warn') : 'fail', 'Segment fetch', 'HTTP ' + r3.status + ' · ' + (ct3 || 'no content-type') + (mapUri ? ' · fMP4 / CMAF' : ' · MPEG-TS'));
            return R;
          }, function (e) { add('fail', 'Segment fetch', netErr(e)); return R; });
        });
      });
    }, function (e) { add('fail', 'Master playlist reachable', netErr(e)); return R; });
  }
  function checkYt(st) {
    var y = parseYt(st.url);
    return api('/api/telemetry?oembed=' + encodeURIComponent(y.id)).then(function (j) {
      return [{ stream: st.name, check: 'YouTube embed allowed', status: j.embeddable ? 'pass' : 'fail', detail: j.embeddable ? (j.title || '') + (j.author ? ' · ' + j.author : '') : (j.error || 'embedding disabled or video unavailable') }];
    }, function (e) { return [{ stream: st.name, check: 'YouTube embed allowed', status: 'warn', detail: 'could not check (' + e.message + ')' }]; });
  }
  var MANUAL = [
    ['Venue egress UDP 5000–5010 open (SRT caller → MediaConnect)', 'Run the encoder\'s SRT test or srt-live-transmit from the venue network'],
    ['SRT handshake up on primary and backup inputs', 'Both MediaConnect sources show Connected'],
    ['RTMPS 443 reachable to every destination ingest', 'Push a test slate to each destination for 60 s'],
    ['Encoders NTP-locked; PROGRAM-DATE-TIME matches the house clock', 'Compare burnt-in timecode with PDT'],
    ['Caption encoder session up on primary and backup paths', 'Confirm 608 presence on each destination for 2 min']
  ];
  function preflightBody(key) {
    var r = rec(key), pf = r.preflight, man = r.manual || {};
    var counts = { pass: 0, warn: 0, fail: 0 };
    var rows = pf && pf.results ? pf.results.map(function (x) { if (counts[x.status] != null) counts[x.status]++; return '<tr class="is-' + x.status + '"><td><span class="ms-pf is-' + x.status + '">' + x.status.toUpperCase() + '</span></td><td>' + esc(x.stream) + '</td><td>' + esc(x.check) + '</td><td>' + esc(x.detail) + '</td></tr>'; }).join('') : '';
    var head = pf ? (pf.running ? '<p class="ms-note">Running checks…</p>' : '<p class="ms-note">Last run ' + new Date(pf.ts).toLocaleString() + ' · <b>' + counts.pass + '</b> pass · <b>' + counts.warn + '</b> warn · <b>' + counts.fail + '</b> fail</p>') : '<p class="ms-note">Checks every stream from this browser: playlists, renditions, codecs, captions, LL-HLS tags, segment delivery, live-edge freshness and YouTube embed rights.</p>';
    return head + (rows ? '<div class="ms-table"><table class="ms-pf-table"><thead><tr><th>Result</th><th>Stream</th><th>Check</th><th>Detail</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
      '<h4 class="ms-h4">Venue checks (can\'t be tested from a browser)</h4><ol class="ms-check">' + MANUAL.map(function (m, i) {
        return '<li><label><input type="checkbox" ' + (man[i] ? 'checked ' : '') + 'onchange="MuseStreaming.manual(\'' + key + '\',' + i + ',this.checked)"><span class="ms-tminus">Manual</span><span>' + esc(m[0]) + ' <span class="ms-sub">— ' + esc(m[1]) + '</span></span></label></li>';
      }).join('') + '</ol>' +
      (pf && !pf.running ? '<div class="ms-pf-actions"><button type="button" class="ms-btn" onclick="MuseStreaming.copyPreflight(\'' + key + '\')">Copy report</button>' + (counts.fail ? '<button type="button" class="ms-btn" onclick="MuseStreaming.incidentFromPreflight(\'' + key + '\')">Log incident from failures</button>' : '') + '</div>' : '');
  }
  function refreshPreflight(key) { var el = document.querySelector('[data-preflight="' + key + '"]'); if (el) el.innerHTML = preflightBody(key); }
  function runPreflight(key) {
    var r = rec(key), plan = showFor(key);
    r.preflight = { running: true, ts: new Date().toISOString(), results: [] }; refreshPreflight(key);
    return Promise.all(streamsFor(key).map(function (st) { return parseYt(st.url) ? checkYt(st) : checkHls(st, plan); })).then(function (all) {
      r.preflight = { running: false, ts: new Date().toISOString(), results: [].concat.apply([], all) }; save(); refreshPreflight(key);
      return r.preflight;
    });
  }
  function preflightReport(key) {
    var pf = rec(key).preflight, man = rec(key).manual || {};
    if (!pf || !pf.results) return 'No pre-flight run yet.';
    return ['# Pre-flight — ' + nameOf(key), 'Run ' + new Date(pf.ts).toLocaleString(), ''].concat(pf.results.map(function (x) { return '- [' + x.status.toUpperCase() + '] ' + x.stream + ' — ' + x.check + ': ' + x.detail; }))
      .concat(['', '## Venue checks']).concat(MANUAL.map(function (m, i) { return '- [' + (man[i] ? 'x' : ' ') + '] ' + m[0]; })).join('\n');
  }

  /* ---------------- live updates (in place, no re-render) ---------------- */
  // During a tick, cells come from one index of the visible [data-tm] elements (not ~30 page scans per stream),
  // and a cell is only rewritten when its text changes.
  var tmIndex = null;
  function setTm(id, html) {
    var els = tmIndex ? tmIndex[id] : document.querySelectorAll('[data-tm="' + id + '"]'); if (!els) return;
    for (var i = 0; i < els.length; i++) if (els[i].innerHTML !== html) els[i].innerHTML = html;
  }
  function indexTm() {
    var idx = {}, all = document.querySelectorAll('[data-tm]');
    for (var i = 0; i < all.length; i++) { var e = all[i]; if (e.offsetParent === null) continue; var k = e.getAttribute('data-tm'); (idx[k] = idx[k] || []).push(e); }
    return idx;
  }
  var tickN = 0;
  function tick() {
    if (document.hidden) return; // background tab: nothing to paint
    tickN++;
    tmIndex = indexTm();
    try { tickBody(); } finally { tmIndex = null; }
  }
  function tickBody() {
    keys().forEach(function (k) {
      streamsFor(k).forEach(function (st) {
        var t = teleFor(k, st); stepTele(t);
        if (!t.live) return;
        var m = t.m, g = grade(m, true), id = st.id;
        setTm(id + ':health', dot(g.overall) + LEVEL_TXT[g.overall]);
        setTm(id + ':viewers', fmtN(m.viewers)); setTm(id + ':viewers2', fmtN(m.viewers));
        setTm(id + ':rebuffer', m.rebuffer.toFixed(2) + '%'); setTm(id + ':rebuffer2', m.rebuffer.toFixed(2) + '%');
        setTm(id + ':latency', m.latency.toFixed(1) + 's');
        setTm(id + ':enc_cpu', Math.round(m.enc_cpu) + '%'); setTm(id + ':enc_out', m.enc_out.toFixed(1) + ' Mbps'); setTm(id + ':enc_fps', m.enc_fps + ' fps'); setTm(id + ':audio_lufs', m.audio_lufs.toFixed(1) + ' LKFS');
        setTm(id + ':srt_loss', m.srt_loss.toFixed(2) + '%'); setTm(id + ':srt_rtt', Math.round(m.srt_rtt) + ' ms'); setTm(id + ':srt_retx', m.srt_retx.toFixed(2) + '%'); setTm(id + ':bond', m.bond_up + '/' + m.bond_total + ' · ' + m.bond_mbps.toFixed(0) + ' Mbps');
        setTm(id + ':seg_age', m.seg_age.toFixed(1) + ' s'); setTm(id + ':cdn_hit', m.cdn_hit.toFixed(1) + '%'); setTm(id + ':cdn_5xx', m.cdn_5xx.toFixed(2) + '%'); setTm(id + ':cdn_ttfb', Math.round(m.cdn_ttfb) + ' ms'); setTm(id + ':cdn_gbps', gbps(m.cdn_gbps));
        setTm(id + ':startup', m.startup.toFixed(1) + ' s'); setTm(id + ':failures', m.failures.toFixed(2) + '%');
        setTm(id + ':h_viewers', fmtN(m.viewers)); setTm(id + ':h_rebuffer', m.rebuffer.toFixed(2) + '%'); setTm(id + ':h_loss', m.srt_loss.toFixed(2) + '%'); setTm(id + ':h_egress', gbps(m.cdn_gbps));
        ['viewers', 'rebuffer', 'loss', 'egress'].forEach(function (h) { var el = document.querySelector('[data-spark="' + id + ':' + h + '"]'); if (el) el.innerHTML = spark(t.hist[h], el.className); });
        var chain = document.querySelector('[data-chain="' + id + '"]');
        if (chain) Object.keys(g.stages).forEach(function (s) { var c = chain.querySelector('[data-stage="' + s + '"]'); if (c) { c.className = 'ms-stage is-' + g.stages[s]; var d = c.querySelector('.ms-dot'); if (d) d.className = 'ms-dot is-' + g.stages[s]; } });
        var al = document.querySelector('[data-alerts="' + id + '"]');
        if (al) al.innerHTML = alertsFor(m, g).map(function (a) { return '<div class="ms-alert">' + esc(a) + '</div>'; }).join('');
      });
    });
    // player measurements
    Object.keys(players).forEach(function (k) {
      var el = document.querySelector('[data-pm="' + k + '"]'); if (!el) return;
      var x = measure(players[k]);
      if (players[k].yt) { el.textContent = 'Source: ' + x.title + ' · YouTube'; return; }
      el.textContent = x.state === 'slate' ? 'Simulated feed · live stream not reachable from this network' + (players[k].stats.lastError ? ' (' + players[k].stats.lastError + ')' : '') : x.state === 'error' ? 'Player: stream unavailable' + (players[k].stats.lastError ? ' (' + players[k].stats.lastError + ')' : '') :
        'Player: ' + (x.resolution || '…') + (x.rendition_kbps ? ' @ ' + (x.rendition_kbps / 1000).toFixed(1) + ' Mbps' : '') +
        ' · buffer ' + (x.buffer_s != null ? x.buffer_s + ' s' : '—') + (x.live_latency_s ? ' · latency ' + x.live_latency_s + ' s' : '') +
        ' · stalls ' + x.stalls + (x.dropped_frames ? ' · dropped ' + x.dropped_frames : '');
    });
    var kv2 = document.getElementById('msK-viewers'), dv = document.getElementById('msD-viewers');
    if (kv2 || dv) { var tv = 0; keys().forEach(function (k) { var g = healthOf(k); if (g.m && liveOf(k)) tv += g.m.viewers; }); if (kv2) kv2.textContent = fmtN(tv); if (dv) dv.textContent = fmtN(tv); }
    ['mhViewers', 'mhViewers2'].forEach(function (id) { var e = document.getElementById(id); if (e) { var t2 = 0; keys().forEach(function (k) { var g = healthOf(k); if (g.m && liveOf(k)) t2 += g.m.viewers; }); e.textContent = fmtN(t2); } });
    gcPlayers();
    try { trackAnomalies(); } catch (e) {}
    var every = function (sec) { return tickN % Math.round(sec * 1000 / TICK_MS) === 0; };
    if (every(10) && root.MuseSync && typeof root.MuseSync.put === 'function') { try { root.MuseSync.put('live-status', liveStatus()); } catch (e) {} }
    if (every(15)) sendBeacons();
    if (every(15) || document.querySelector('[data-qoe] .is-loading')) refreshQoe();
    if (every(30)) { pollReal(); keys().forEach(function (k) { if (document.querySelector('[data-fb-out="' + k + '"]')) loadFb(k); }); }
  }

  /* ---------------- public API ---------------- */
  var MS = root.MuseStreaming = {
    paneHTML: paneHTML,
    mount: function (el) { mount(el); },
    renderWall: function () { var h = document.getElementById('streamsHost'); if (h) { h.innerHTML = wallHTML(); mount(h); } },
    renderDash: function () { try { renderHome(); } catch (e) {} var h = document.getElementById('dashStreams'); if (!h) return; var html = dashHTML(); h.hidden = !html; h.innerHTML = html; if (html) mount(h); },
    play: function (btn) { var slot = btn.parentNode; slot.removeAttribute('data-defer'); btn.remove(); mount(slot.parentNode); },
    openShow: function (key) { try { root.projSubTab[key] = 'streaming'; } catch (e) {} root.navGo(key); },
    toggleAudio: function (slot, btn) {
      var p = players[slot]; if (!p) return;
      var unmute = p.yt ? p.muted : p.video.muted;
      // one monitor in your ears at a time
      Object.keys(players).forEach(function (k) { var q = players[k]; if (q.yt) { if (!q.muted) { ytCmd(q, 'mute'); q.muted = true; } } else q.video.muted = true; });
      var MUTED_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      var LIVE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      document.querySelectorAll('.ms-audio').forEach(function (b) { b.innerHTML = MUTED_SVG; b.setAttribute('aria-pressed', 'false'); });
      if (unmute) { if (p.yt) { ytCmd(p, 'unMute'); ytCmd(p, 'setVolume', [80]); p.muted = false; } else { p.video.muted = false; p.video.play().catch(function () {}); } btn.innerHTML = LIVE_SVG; btn.setAttribute('aria-pressed', 'true'); }
    },
    addStream: function (key, form) {
      var url = String(form.url.value || '').trim();
      if (!/^https:\/\/\S+$/i.test(url)) { root.toast && root.toast('Use an https:// HLS or YouTube URL'); return; }
      var y = parseYt(url); if (y) url = 'yt:' + y.id + ':' + y.offset + ':' + (String(form.name.value || 'YouTube').trim().slice(0, 60));
      else {
        // The site's security policy only lets the browser load video from approved hosts (see docs/SECURITY.md, MUSE_MEDIA_HOSTS).
        var host = ''; try { host = new URL(url).hostname; } catch (e) {}
        var ok = ['demo.unified-streaming.com', 'test-streams.mux.dev', 'devstreaming-cdn.apple.com', 'storage.googleapis.com'].indexOf(host) >= 0;
        if (!ok) { root.toast && root.toast(host + ' isn’t an approved stream host yet. An admin adds it to MUSE_MEDIA_HOSTS (docs/SECURITY.md); YouTube links work now.'); return; }
      }
      rec(key).added.push({ id: key + '-u' + Date.now().toString(36), name: String(form.name.value || 'Stream').trim().slice(0, 60), role: form.role.value, url: url });
      save(); root.toast && root.toast('Stream added'); root.renderProjectView(key);
    },
    removeStream: function (key, id) {
      var r = rec(key);
      if (r.added.some(function (x) { return x.id === id; })) r.added = r.added.filter(function (x) { return x.id !== id; }); else r.removed[id] = 1;
      save(); root.renderProjectView(key);
    },
    copyUrl: function (u) { var y = parseYt(u); if (y && /^yt:/.test(u)) u = 'https://www.youtube.com/watch?v=' + y.id; try { navigator.clipboard.writeText(u); root.toast && root.toast('Stream URL copied'); } catch (e) {} },
    tick: function (key, i, on) { rec(key).checklist[i] = !!on; save(); },
    setState: function (key, st) {
      rec(key).state = st; save();
      var live = st === 'LIVE' || st === 'REHEARSAL';
      streamsFor(key).forEach(function (x) { var t = teleFor(key, x); t.live = live; t.base = showFor(key).viewers || (st === 'LIVE' ? 25000 : 150); if (live && !t.m.viewers) t.m.viewers = t.base; });
      root.renderProjectView(key); MS.renderDash();
    },
    stateOf: stateOf,
    anomalies: anomalies,
    anomalyLog: function (key) { return (anomalyLogs[key] || []).slice(); },
    apply: apply,
    setCdnWeights: setCdnWeights,
    liveStatus: liveStatus,
    slo: sloFor,
    preflight: runPreflight,
    manual: function (key, i, on) { var r = rec(key); r.manual = r.manual || {}; r.manual[i] = !!on; save(); },
    copyPreflight: function (key) { try { navigator.clipboard.writeText(preflightReport(key)); root.toast && root.toast('Pre-flight report copied'); } catch (e) {} },
    incidentFromPreflight: function (key) {
      var pf = rec(key).preflight; if (!pf || !pf.results) return;
      var fails = pf.results.filter(function (x) { return x.status === 'fail'; });
      var i = root.MuseIncidents.createRecord({ production: key, title: 'Pre-flight: ' + fails.length + ' check' + (fails.length > 1 ? 's' : '') + ' failed', severity: 'SEV-4', category: 'Process',
        summary: fails.map(function (x) { return x.stream + ' — ' + x.check + ': ' + x.detail; }).join(' · '), timeline: [[pf.ts, 'Pre-flight run in Muse Live']], tags: ['preflight'] });
      root.MuseIncidents.open(i.id);
    },
    returnToPrimary: function (key) { var r = rec(key); r.failover = false; save(); logAnomaly(key, 'Returned to primary input'); root.renderProjectView(key); },
    saveSources: function (key, sid, f) {
      var r = rec(key); r.src = r.src || {};
      var c = { aws: { region: (integ.telemetry && integ.telemetry.region) || '', medialiveChannelId: f.medialive.value.trim(), mediaconnectFlowArn: f.mediaconnect.value.trim(), cloudfrontDistributionId: f.cloudfront.value.trim() }, mux: { videoId: f.mux.value.trim() } };
      if (!c.aws.medialiveChannelId && !c.aws.mediaconnectFlowArn && !c.aws.cloudfrontDistributionId) delete c.aws;
      if (!c.mux.videoId) delete c.mux;
      if (c.aws || c.mux) r.src[sid] = c; else delete r.src[sid];
      save(); root.toast && root.toast('Data sources saved'); pollReal();
    },
    connectFb: function (key, f) {
      var ok = function (v) { return /^[0-9_]{0,40}$/.test(v); };
      var c = { page: f.page.value.trim(), video: f.video.value.trim(), ig: f.ig.value.trim() };
      if (!ok(c.page) || !ok(c.video) || !ok(c.ig)) { root.toast && root.toast('IDs are numeric'); return; }
      rec(key).fb = c; save(); delete fbCache[key]; loadFb(key); root.toast && root.toast('Facebook Live settings saved');
    },
    // Structured read for Muse and incident snapshots.
    summary: function (key) {
      var s = showFor(key), r = rec(key);
      return {
        production: nameOf(key), state: stateOf(key), latency_target: s.latency,
        destinations: s.destinations, contribution: { primary: s.primary, backup: s.backup, cloud: s.cloud }, venue_network: s.venueNet,
        loudness: s.loudness, captions: s.captions,
        ladder: s.ladder.map(function (l) { return { rung: l[0], resolution: l[1], fps: l[2], codec: l[3], mbps: l[4] }; }),
        packaging: 'HLS (TS + CMAF), LL-HLS 0.33 s parts, DASH CMAF · 2 s (LL) / 6 s segments · 2 h DVR · CloudFront + Akamai multi-CDN · signed URLs',
        go_live_checklist: CHECKLIST.map(function (c, i) { return { when: c[0], item: c[1], done: !!r.checklist[i] }; }),
        data_note: 'Pipeline and viewer telemetry is simulated (labelled Demo data in the UI) unless data_source names a real source. Player stats, QoE beacons and pre-flight results are real.',
        operations: { cdn_weights: r.cdn || { cloudfront: 60, akamai: 40 }, on_backup_input: !!r.failover, srt_latency_ms: r.srtLatency || 1200 },
        slo: sloFor(key),
        anomalies: anomalies().filter(function (a) { return a.key === key; }),
        preflight: r.preflight && !r.preflight.running ? { run_at: r.preflight.ts, results: r.preflight.results } : 'not run yet',
        facebook_live: integ.fb && integ.fb.configured ? (fbCache[key] || 'configured, no page/video id saved for this show') : 'not connected (FB_GRAPH_TOKEN not set)',
        streams: streamsFor(key).map(function (st) {
          var t = teleFor(key, st), g = grade(t.m, t.live), slot = Object.keys(players).filter(function (k) { return k.split(':')[1] === st.id; })[0];
          var y = parseYt(st.url);
          var ds = {}; ['encoder', 'contribution', 'cloud', 'origin', 'cdn', 'viewers'].forEach(function (sg) { ds[sg] = (t.src && t.src[sg]) || 'demo (simulated)'; });
          ds.player = 'measured in the browser (HLS only)';
          return { name: st.name, role: st.role, source: y ? 'YouTube · ' + y.title : 'HLS', url: y ? 'https://www.youtube.com/watch?v=' + y.id : st.url, health: LEVEL_TXT[g.overall], stage_health: g.stages, data_source: ds,
            telemetry: t.live ? roundAll(t.m) : 'off air', alerts: t.live ? alertsFor(t.m, g) : [],
            trend_last_3min: t.live ? { viewers: trend(t.hist.viewers), rebuffer_pct: trend(t.hist.rebuffer), srt_loss_pct: trend(t.hist.loss) } : null,
            measured_in_browser: slot ? measure(players[slot]) : 'not open on screen' };
        })
      };
    },
    health: function (key) { var g = healthOf(key); return { state: stateOf(key), health: LEVEL_TXT[g.overall], viewers: g.m && liveOf(key) ? Math.round(g.m.viewers) : 0, alerts: g.m && liveOf(key) ? alertsFor(g.m, g) : [] }; }
  };
  function roundAll(m) { var o = {}; Object.keys(m).forEach(function (k) { o[k] = typeof m[k] === 'number' ? Math.round(m[k] * 100) / 100 : m[k]; }); return o; }
  function trend(a) { if (!a.length) return null; return { now: Math.round(a[a.length - 1] * 100) / 100, min: Math.round(Math.min.apply(null, a) * 100) / 100, max: Math.round(Math.max.apply(null, a) * 100) / 100 }; }

  // Warm the simulation so charts have history on first view, then keep ticking.
  function boot() {
    probeIntegrations();
    keys().forEach(function (k) { streamsFor(k).forEach(function (st) { var t = teleFor(k, st); for (var i = 0; i < 40; i++) stepTele(t); }); });
    MS.renderDash();
    setInterval(tick, TICK_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  else setTimeout(boot, 300);
})(typeof window !== 'undefined' ? window : globalThis);
