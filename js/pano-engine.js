/**
 * NBC Pulse — Broadcast 360° Planner v4.0
 * FOOLPROOF MAP MODE (default):
 *   - Equirect shown as a 2:1 map you pan L/R and U/D only (no sphere gyro).
 *   - Markers & draw paths stored in texture UV (0–1) so they NEVER slide.
 * Optional LOOK mode: traditional sphere (opt-in).
 * Shot-Designer blocking + Dept Status gear. No THREE/CDN.
 */
(function (global) {
  'use strict';

  var PanoEng = { open: open, close: close, loadFile: loadFilePublic, version: '4.0.2' };
  var MAX_TEX = 4096, MAX_STORE_EDGE = 4096;

  var ICONS = {
    camera: '📷', jib: '🏗️', steadicam: '🎥', cable: '🔌', equipment: '🖥️', mic: '🎤', text: '📝',
    power: '⚡', rf: '📡', fiber: '🧵', ifb: '🎧', truck: '🚛', hazard: '⚠', talent: '🎙', exit: '🚪',
    smpte: '🎞', zone: '⬚', draw: '✏️'
  };
  var COLORS = {
    camera: '#58a6ff', jib: '#fb923c', steadicam: '#a78bfa', cable: '#f0883e', equipment: '#3fb950', mic: '#d2a8ff',
    text: '#e6edf3', power: '#fbbf24', rf: '#a78bfa', fiber: '#22d3ee', ifb: '#f472b6', truck: '#94a3b8',
    hazard: '#ef4444', talent: '#34d399', exit: '#fbbf24', smpte: '#a5f3fc', zone: '#c084fc'
  };
  var PLACE_TOOLS = [
    ['camera', 'Cam'], ['jib', 'Jib'], ['steadicam', 'Steadi'],
    ['cable', 'Cable'], ['fiber', 'Fiber'], ['smpte', 'SMPTE'],
    ['power', 'Power'], ['equipment', 'Equip'], ['mic', 'Mic'], ['rf', 'RF'],
    ['ifb', 'IFB'], ['truck', 'Truck'], ['talent', 'Talent'], ['hazard', 'Hazard'],
    ['exit', 'Exit'], ['text', 'Note'], ['zone', 'Zone']
  ];
  var CAM_TYPES = { camera: 1, jib: 1, steadicam: 1 };
  var DRAW_TOOLS = [
    ['draw_fiber', '🧵 Draw Fiber'],
    ['draw_smpte', '🎞 Draw SMPTE'],
    ['draw_power', '⚡ Draw Power'],
    ['draw_cable', '🔌 Draw Cable']
  ];

  var el = null, state = null;
  /* MAP MODE view: pan offset in UV, zoom scale of the equirect strip */
  var mapPanU = 0.5, mapPanV = 0.5, mapZoom = 1.0;
  /* LOOK MODE (optional sphere) */
  var lon = 0, lat = 0, fov = 75;
  var viewMode = 'map'; /* 'map' | 'look' */
  var drag = null, drawDraft = null;
  var gearCatalog = { packages: [], bodies: [], lenses: [], mounts: [], empty: true };
  var flipV = true, flipH = false;
  var imgEl = null, imgReady = false;
  var raf = 0;

  function isPhoneView() {
    try {
      return !!(window.matchMedia && (
        window.matchMedia('(max-width:767px)').matches ||
        window.matchMedia('(pointer:coarse) and (max-width:1024px)').matches
      ));
    } catch (e) { return (window.innerWidth || 0) <= 767; }
  }
  function syncPhonePortrait() {
    var portrait = (window.innerHeight || 0) > (window.innerWidth || 0) + 24;
    try {
      document.documentElement.classList.toggle('pulse-phone-portrait', !!portrait);
    } catch (e) {}
    return portrait;
  }
  var landBound = false;
  function onLandResize() {
    if (!el || el.style.display === 'none') return;
    syncPhonePortrait();
    try { if (typeof paint === 'function') paint(); } catch (e) {}
  }
  function lockLandscape(on) {
    try {
      document.documentElement.classList.toggle('pulse-cv-land', !!on);
      document.body.classList.toggle('pulse-cv-land', !!on);
    } catch (e0) {}
    if (on) {
      syncPhonePortrait();
      if (!landBound) {
        landBound = true;
        window.addEventListener('resize', onLandResize);
        window.addEventListener('orientationchange', onLandResize);
      }
    } else {
      try { document.documentElement.classList.remove('pulse-phone-portrait'); } catch (e2) {}
    }
    try {
      var so = screen.orientation;
      if (on && so && typeof so.lock === 'function') {
        var p = so.lock('landscape');
        if (p && p.catch) p.catch(function () {});
      } else if (!on && so && typeof so.unlock === 'function') {
        so.unlock();
      }
    } catch (e1) {}
  }

  function ensureShell() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'pulsePanoEng';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:10001;flex-direction:column;background:#0d1117;font-family:Inter,system-ui,sans-serif;color:#e6edf3';
    el.innerHTML =
      '<style>' +
      '#pulsePanoEng .pb{background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:5px 9px;border-radius:6px;font:700 10px Inter,sans-serif;cursor:pointer;white-space:nowrap}' +
      '#pulsePanoEng .pb:hover{background:#30363d}' +
      '#pulsePanoEng .pb.on{background:#58a6ff;border-color:#58a6ff;color:#0d1117}' +
      '#pulsePanoEng .pb.ok{background:#1a3d24;border-color:#3fb950;color:#3fb950}' +
      '#pulsePanoEng .pb.bad{background:#3d1f1f;border-color:#f85149;color:#f85149}' +
      '#pulsePanoEng .pb.draw{border-color:#f59e0b}' +
      '#pulsePanoEng .pb.draw.on{background:#f59e0b;border-color:#f59e0b;color:#0d1117}' +
      '#pulsePanoEng .mi{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;margin:2px 0}' +
      '#pulsePanoEng .mi:hover{background:#21262d}' +
      '#pulsePanoEng .mi.sel{background:#1f3a5f}' +
      '#pulsePanoEng .mk{position:absolute;transform:translate(-50%,-100%);cursor:pointer;z-index:4;pointer-events:auto}' +
      '#pulsePanoEng .mk-dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid;box-shadow:0 2px 10px rgba(0,0,0,.55);background:rgba(13,17,23,.9)}' +
      '#pulsePanoEng .mk-lbl{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:3px;font:700 9px Inter,sans-serif;white-space:nowrap;background:rgba(13,17,23,.92);padding:2px 6px;border-radius:4px;border:1px solid #30363d;max-width:150px;overflow:hidden;text-overflow:ellipsis}' +
      '#pulsePanoEng .mk.sel .mk-dot{box-shadow:0 0 0 2px #fff,0 2px 12px rgba(0,0,0,.6)}' +
      '#pulsePanoEng .tbx{position:absolute;transform:translate(-50%,-50%);z-index:5;pointer-events:auto;min-width:80px;max-width:200px;background:rgba(13,17,23,.92);border:1px solid #58a6ff;border-radius:8px;padding:6px 8px;font:600 11px Inter,sans-serif;color:#e6edf3;cursor:pointer}' +
      '#pulsePanoEng .tip{position:absolute;z-index:20;pointer-events:none;display:none;max-width:260px;background:rgba(22,27,34,.97);border:1px solid #30363d;border-radius:10px;padding:8px 10px;font:600 11px Inter,sans-serif;color:#e6edf3;box-shadow:0 8px 24px rgba(0,0,0,.5)}' +
      '#pulsePanoEng .tip b{color:#58a6ff;display:block;margin-bottom:3px;font-size:10px;letter-spacing:.04em;text-transform:uppercase}' +
      'html.pulse-cv-land,html.pulse-cv-land body{overflow:hidden!important}' +
      '@media (max-width:900px){#pulsePanoEng .pb{padding:8px 10px;min-height:40px}}' +
      'html.pulse-cv-land.pulse-phone-portrait #pulsePanoEng,' +
      'html.pulse-cv-land #pulsePanoEng.cv-force-land{' +
        'width:100vh!important;height:100vw!important;width:100dvh!important;height:100dvw!important;' +
        'max-width:none!important;max-height:none!important;' +
        'top:0!important;left:0!important;right:auto!important;bottom:auto!important;' +
        'transform:rotate(90deg) translateY(-100%);transform-origin:top left;' +
      '}' +
      '</style>' +
      '<div style="display:flex;align-items:center;gap:6px;padding:7px 10px;background:#161b22;border-bottom:1px solid #30363d;flex-wrap:wrap">' +
        '<div style="font:700 13px Inter,sans-serif;color:#58a6ff;margin-right:4px">📡 Broadcast 360 · Map Blocking</div>' +
        '<span style="font:600 9px DM Mono,monospace;color:#3fb950;border:1px solid #238636;border-radius:4px;padding:2px 6px">v' + PanoEng.version + '</span>' +
        '<button type="button" class="pb on" data-a="modeMap" id="ppeModeMap" title="Simple L/R U/D pan — markers stick">🗺 Map pan</button>' +
        '<button type="button" class="pb" data-a="modeLook" id="ppeModeLook" title="Optional sphere look">🌐 Sphere look</button>' +
        '<button type="button" class="pb" data-a="load">📂 Load 360°</button>' +
        '<input type="file" id="ppeFile" accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp" style="display:none">' +
        '<button type="button" class="pb" data-a="flipv">↕ Flip V</button>' +
        '<button type="button" class="pb" data-a="fliph">↔ Flip H</button>' +
        '<div style="width:1px;height:22px;background:#30363d"></div>' +
        '<span style="font-size:9px;color:#8b949e">Place</span>' +
        PLACE_TOOLS.map(function (t) {
          return '<button type="button" class="pb' + (t[0] === 'camera' ? ' on' : '') + '" data-tool="' + t[0] + '">' + (ICONS[t[0]] || '') + ' ' + t[1] + '</button>';
        }).join('') +
        '<div style="width:1px;height:22px;background:#30363d"></div>' +
        '<span style="font-size:9px;color:#f59e0b">Draw</span>' +
        DRAW_TOOLS.map(function (t) {
          return '<button type="button" class="pb draw" data-tool="' + t[0] + '">' + t[1] + '</button>';
        }).join('') +
        '<button type="button" class="pb" data-a="finish">✓ Finish path</button>' +
        '<div style="width:1px;height:22px;background:#30363d"></div>' +
        '<button type="button" class="pb ok" data-a="save">💾 Save</button>' +
        '<button type="button" class="pb" data-a="export">⬇️ JSON</button>' +
        '<button type="button" class="pb" data-a="import">⬆️ JSON</button>' +
        '<input type="file" id="ppeJson" accept=".json" style="display:none">' +
        '<button type="button" class="pb" data-a="snap">📷 Snap</button>' +
        '<button type="button" class="pb bad" data-a="clear">🗑 Clear</button>' +
        '<span style="flex:1"></span>' +
        '<span id="ppeStatus" style="font:600 10px DM Mono,monospace;color:#8b949e"></span>' +
        '<button type="button" class="pb bad" data-a="close">✕</button>' +
      '</div>' +
      '<div style="flex:1;display:flex;min-height:0">' +
        '<div id="ppeView" style="flex:1;position:relative;background:#000;min-width:0;overflow:hidden;touch-action:none">' +
          '<canvas id="ppeCanvas" style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;z-index:1"></canvas>' +
          '<canvas id="ppeDraw" style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2"></canvas>' +
          '<div id="ppeMarks" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3"></div>' +
          '<div id="ppeTip" class="tip"></div>' +
          '<div id="ppeHint" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(22,27,34,.95);border:1px solid #30363d;border-radius:12px;padding:22px 28px;text-align:center;max-width:480px;z-index:5;pointer-events:none">' +
            '<div style="font:700 18px Inter,sans-serif;margin-bottom:8px">360° Map Blocking</div>' +
            '<p style="color:#8b949e;font-size:13px;line-height:1.5">Load a panorama. <b style="color:#e6edf3">Map pan</b> = simple left/right &amp; up/down. Markers stick to the image. Drag to draw cable runs.</p>' +
          '</div>' +
          '<div id="ppeHud" style="position:absolute;left:12px;bottom:12px;background:rgba(22,27,34,.9);border:1px solid #30363d;border-radius:8px;padding:7px 12px;font:600 11px DM Mono,monospace;color:#8b949e;z-index:5;pointer-events:none">No image</div>' +
        '</div>' +
        '<div style="width:300px;background:rgba(22,27,34,.98);border-left:1px solid #30363d;display:flex;flex-direction:column;flex-shrink:0">' +
          '<div style="padding:10px 12px;border-bottom:1px solid #30363d;font:700 12px Inter,sans-serif;display:flex;justify-content:space-between">' +
            '<span>Blocking (<span id="ppeCount">0</span>)</span>' +
            '<span style="font:600 9px DM Mono,monospace;color:#3fb950">UV-LOCKED</span></div>' +
          '<div id="ppeGearBanner" style="padding:6px 10px;border-bottom:1px solid #30363d;font:600 10px Inter,sans-serif;color:#8b949e"></div>' +
          '<div id="ppeShotList" style="max-height:120px;overflow:auto;padding:6px 8px;border-bottom:1px solid #21262d;font:600 10px Inter,sans-serif;display:none"></div>' +
          '<div id="ppeList" style="flex:1;overflow:auto;padding:6px"></div>' +
          '<div id="ppeProps" style="display:none;border-top:1px solid #30363d;padding:10px;font-size:12px;max-height:48%;overflow:auto">' +
            '<label style="display:block;color:#8b949e;margin-bottom:3px">Label</label>' +
            '<input id="ppeLabel" type="text" style="width:100%;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 8px;box-sizing:border-box">' +
            '<label style="display:block;color:#8b949e;margin-bottom:3px">Type</label>' +
            '<select id="ppeType" style="width:100%;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 8px"></select>' +
            '<label style="display:block;color:#58a6ff;margin-bottom:3px;font-size:10px">DEPT STATUS PACKAGE</label>' +
            '<select id="ppeGearPkg" style="width:100%;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 8px"></select>' +
            '<label style="display:block;color:#8b949e;margin-bottom:3px">Camera body</label>' +
            '<select id="ppeBody" style="width:100%;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 8px"></select>' +
            '<label style="display:block;color:#8b949e;margin-bottom:3px">Lens</label>' +
            '<select id="ppeLens" style="width:100%;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 8px"></select>' +
            '<label style="display:block;color:#8b949e;margin-bottom:3px">Mount</label>' +
            '<select id="ppeMount" style="width:100%;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 8px"></select>' +
            '<label style="display:block;color:#8b949e;margin-bottom:3px">Description</label>' +
            '<textarea id="ppeNotes" rows="3" style="width:100%;margin-bottom:8px;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:5px 8px;box-sizing:border-box;resize:vertical;font:600 11px Inter,sans-serif"></textarea>' +
            '<button type="button" class="pb" data-a="apply" style="width:100%">Update</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    var typeSel = el.querySelector('#ppeType');
    PLACE_TOOLS.forEach(function (t) {
      typeSel.innerHTML += '<option value="' + t[0] + '">' + (ICONS[t[0]] || '') + ' ' + t[1] + '</option>';
    });
    ['fiber', 'smpte', 'power', 'cable'].forEach(function (t) {
      typeSel.innerHTML += '<option value="' + t + '">' + (ICONS[t] || '') + ' path · ' + t + '</option>';
    });

    el.querySelector('#ppeGearPkg').onchange = function () {
      var pkg = findGearPkg(this.value); if (!pkg) return;
      setSelectValue('ppeBody', pkg.body || '');
      setSelectValue('ppeLens', pkg.lens || '');
      setSelectValue('ppeMount', pkg.mount || '');
      var m = state && findItem(state.selectedId);
      if (m && CAM_TYPES[m.type]) {
        el.querySelector('#ppeLabel').value = pkg.shortLabel || pkg.label;
        el.querySelector('#ppeNotes').value = gearNotes(pkg, m.type);
      }
    };

    el.querySelector('[data-a="load"]').onclick = function () { el.querySelector('#ppeFile').click(); };
    el.querySelector('#ppeFile').onchange = function (e) {
      var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) loadImage(f);
    };
    el.querySelectorAll('[data-tool]').forEach(function (b) {
      b.onclick = function () {
        el.querySelectorAll('[data-tool]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        state.tool = b.getAttribute('data-tool');
        var canvas = el.querySelector('#ppeCanvas');
        if (String(state.tool).indexOf('draw_') === 0) {
          drawDraft = { type: state.tool.replace('draw_', ''), pts: [] };
          if (canvas) canvas.style.cursor = 'crosshair';
          setStatus('Draw ' + drawDraft.type + ' — drag freehand · Enter/✓ finish');
        } else {
          drawDraft = null;
          if (canvas) canvas.style.cursor = 'grab';
          setStatus('Place ' + b.textContent.trim() + ' — click map (markers UV-locked)');
        }
      };
    });
    el.querySelectorAll('[data-a]').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-a');
        if (a === 'close') close(true);
        else if (a === 'save') saveScene();
        else if (a === 'export') exportJSON();
        else if (a === 'import') el.querySelector('#ppeJson').click();
        else if (a === 'clear') clearAll();
        else if (a === 'apply') applyProps();
        else if (a === 'snap') snapshot();
        else if (a === 'finish') finishDraw();
        else if (a === 'flipv') { flipV = !flipV; setStatus('Flip V ' + (flipV ? 'ON' : 'OFF')); paint(); }
        else if (a === 'fliph') { flipH = !flipH; setStatus('Flip H ' + (flipH ? 'ON' : 'OFF')); paint(); }
        else if (a === 'modeMap') setViewMode('map');
        else if (a === 'modeLook') setViewMode('look');
      };
    });
    el.querySelector('#ppeJson').onchange = importJSON;
    ['dragenter', 'dragover'].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.preventDefault(); });
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.type && f.type.indexOf('image/') === 0) loadImage(f);
    });
    document.addEventListener('keydown', onKey);
    bindViewEvents();
  }

  function setViewMode(mode) {
    viewMode = mode === 'look' ? 'look' : 'map';
    var m = el.querySelector('#ppeModeMap'), l = el.querySelector('#ppeModeLook');
    if (m) m.classList.toggle('on', viewMode === 'map');
    if (l) l.classList.toggle('on', viewMode === 'look');
    setStatus(viewMode === 'map'
      ? '360° left/right wrap · limited up/down · markers stick'
      : 'Sphere look — limited pitch · markers stick');
    paint();
  }

  function onKey(e) {
    if (!el || el.style.display === 'none') return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') {
      if (drawDraft && drawDraft.pts && drawDraft.pts.length) {
        drawDraft = null; setStatus('Path cancelled'); paint(); return;
      }
      close(true); return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && drawDraft && drawDraft.pts && drawDraft.pts.length >= 2) {
      e.preventDefault(); finishDraw(); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state && state.selectedId) {
      e.preventDefault(); deleteItem(state.selectedId);
    }
  }

  /* ===================== MAP geometry (UV sticky, 360° wrap L/R) ===================== */
  /** Positive modular distance u - u0 on the circle [0,1) */
  function wrapUOffset(u, u0) {
    var d = (u - u0) % 1;
    if (d < 0) d += 1;
    return d;
  }
  function wrapU(u) {
    u = u % 1;
    if (u < 0) u += 1;
    return u;
  }
  /**
   * Visible window on equirect:
   *  - Horizontal: full 360° wrap (u0 can be any; content wraps)
   *  - Vertical: limited band (no wild pitch)
   */
  function mapViewport(W, H) {
    var viewAspect = W / Math.max(1, H);
    /* vertical: at zoom 1 show ~40% of height; never more than 55% (limits U/D) */
    var spanV = Math.min(0.55, Math.max(0.12, 0.42 / mapZoom));
    /* horizontal span from aspect of equirect (2:1) */
    var spanU = spanV * viewAspect / 2;
    spanU = Math.min(0.92, Math.max(0.12, spanU));
    /* keep panU free (wraps); clamp panV so view stays mid-band */
    var v0 = mapPanV - spanV / 2;
    var vMin = 0.18, vMax = 0.82;
    if (v0 < vMin) { mapPanV = vMin + spanV / 2; v0 = vMin; }
    if (v0 + spanV > vMax) { mapPanV = vMax - spanV / 2; v0 = vMax - spanV; }
    var u0 = mapPanU - spanU / 2; /* unwrapped start; wrap when sampling */
    return { u0: u0, v0: v0, spanU: spanU, spanV: spanV, u1: u0 + spanU, v1: v0 + spanV };
  }

  function uvToScreen(u, v, W, H) {
    if (viewMode === 'look') return lookUvToScreen(u, v, W, H);
    var vp = mapViewport(W, H);
    if (v < vp.v0 - 0.01 || v > vp.v1 + 0.01) return null;
    var du = wrapUOffset(u, wrapU(vp.u0));
    if (du > vp.spanU + 0.001) return null;
    var x = (du / vp.spanU) * W;
    var y = ((v - vp.v0) / vp.spanV) * H;
    return { x: x, y: y };
  }

  function screenToUv(clientX, clientY) {
    var view = el.querySelector('#ppeView');
    var rect = view.getBoundingClientRect();
    var W = rect.width, H = rect.height;
    var sx = clientX - rect.left, sy = clientY - rect.top;
    if (viewMode === 'look') return lookScreenToUv(sx, sy, W, H);
    var vp = mapViewport(W, H);
    var u = wrapU(wrapU(vp.u0) + (sx / Math.max(1, W)) * vp.spanU);
    var v = vp.v0 + (sy / Math.max(1, H)) * vp.spanV;
    v = Math.max(0, Math.min(1, v));
    return { u: u, v: v };
  }

  /** Draw equirect window with horizontal wrap (true 360° L/R) */
  function drawEquirectWindow(ctx, img, vp, W, H) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var remaining = vp.spanU;
    var xPos = 0;
    var uCur = wrapU(vp.u0);
    var sy = vp.v0 * ih, sh = vp.spanV * ih;
    while (remaining > 1e-6) {
      var take = Math.min(remaining, 1 - uCur);
      if (take < 1e-6) { uCur = 0; continue; }
      var sx = uCur * iw, sw = take * iw;
      var dx = (xPos / vp.spanU) * W;
      var dw = (take / vp.spanU) * W;
      try { ctx.drawImage(img, sx, sy, Math.max(1, sw), Math.max(1, sh), dx, 0, dw, H); } catch (e) {}
      remaining -= take;
      xPos += take;
      uCur = 0;
    }
  }

  /* yaw/pitch ↔ UV (equirect, with flip) */
  function uvToYawPitch(u, v) {
    var uu = flipH ? 1 - u : u;
    var vv = flipV ? 1 - v : v;
    return { yaw: (uu - 0.5) * 360, pitch: (0.5 - vv) * 180 };
  }
  function yawPitchToUv(yaw, pitch) {
    var u = yaw / 360 + 0.5;
    var v = 0.5 - pitch / 180;
    while (u < 0) u += 1; while (u > 1) u -= 1;
    v = Math.max(0, Math.min(1, v));
    if (flipH) u = 1 - u;
    if (flipV) v = 1 - v;
    return { u: u, v: v };
  }

  /* Optional sphere look — simple correct UV project */
  function lookScreenToUv(sx, sy, W, H) {
    var nx = (sx / W) * 2 - 1;
    var ny = -((sy / H) * 2 - 1);
    var f = Math.tan(fov * 0.5 * Math.PI / 180);
    var asp = W / Math.max(1, H);
    var dx = nx * f * asp, dy = ny * f, dz = -1;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;
    var cy = Math.cos(lon * Math.PI / 180), sy = Math.sin(lon * Math.PI / 180);
    var cp = Math.cos(lat * Math.PI / 180), sp = Math.sin(lat * Math.PI / 180);
    var x1 = cy * dx - sy * dz, y1 = dy, z1 = sy * dx + cy * dz;
    var x2 = x1, y2 = cp * y1 - sp * z1, z2 = sp * y1 + cp * z1;
    var yaw = Math.atan2(x2, -z2) * 180 / Math.PI;
    var pitch = Math.asin(Math.max(-1, Math.min(1, y2))) * 180 / Math.PI;
    return yawPitchToUv(yaw, pitch);
  }
  function lookUvToScreen(u, v, W, H) {
    var yp = uvToYawPitch(u, v);
    var yaw = yp.yaw * Math.PI / 180, pitch = yp.pitch * Math.PI / 180;
    var wx = Math.sin(yaw) * Math.cos(pitch);
    var wy = Math.sin(pitch);
    var wz = -Math.cos(yaw) * Math.cos(pitch);
    var cy = Math.cos(lon * Math.PI / 180), sy = Math.sin(lon * Math.PI / 180);
    var cp = Math.cos(lat * Math.PI / 180), sp = Math.sin(lat * Math.PI / 180);
    var x1 = wx, y1 = cp * wy + sp * wz, z1 = -sp * wy + cp * wz;
    var x2 = cy * x1 + sy * z1, y2 = y1, z2 = -sy * x1 + cy * z1;
    if (z2 >= -0.02) return null;
    var f = Math.tan(fov * 0.5 * Math.PI / 180);
    var asp = W / Math.max(1, H);
    var nx = (x2 / -z2) / (f * asp);
    var ny = (y2 / -z2) / f;
    if (nx < -1.4 || nx > 1.4 || ny < -1.4 || ny > 1.4) return null;
    return { x: (nx * 0.5 + 0.5) * W, y: (0.5 - ny * 0.5) * H };
  }

  /* ===================== paint ===================== */
  function paint() {
    if (!el || !state) return;
    var view = el.querySelector('#ppeView');
    var canvas = el.querySelector('#ppeCanvas');
    var drawC = el.querySelector('#ppeDraw');
    if (!view || !canvas) return;
    var W = view.clientWidth || 1, H = view.clientHeight || 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    [canvas, drawC].forEach(function (c) {
      if (!c) return;
      c.width = Math.floor(W * dpr);
      c.height = Math.floor(H * dpr);
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    });
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, W, H);

    if (imgReady && imgEl) {
      if (viewMode === 'map') {
        var vp = mapViewport(W, H);
        drawEquirectWindow(ctx, imgEl, vp, W, H);
      } else {
        paintLookApprox(ctx, W, H);
      }
    } else {
      /* checker */
      var g = 24;
      for (var y = 0; y < H; y += g) for (var x = 0; x < W; x += g) {
        ctx.fillStyle = ((x / g + y / g) % 2) ? '#12151c' : '#0d1016';
        ctx.fillRect(x, y, g, g);
      }
    }

    projectMarks(W, H);
    drawPaths(W, H, dpr);
    var hud = el.querySelector('#ppeHud');
    if (hud) {
      if (!imgReady) hud.textContent = 'No image — load 360°';
      else if (viewMode === 'map') {
        hud.textContent = '360° L/R wrap · limited U/D · zoom ' + mapZoom.toFixed(2) + '× · ' + state.items.length + ' items' +
          (flipV ? ' · FlipV' : '') + (flipH ? ' · FlipH' : '');
      } else {
        hud.textContent = 'LOOK · yaw ' + lon.toFixed(0) + '° pitch ' + lat.toFixed(0) + '° (limited) · ' + state.items.length + ' items';
      }
    }
  }

  function paintLookApprox(ctx, W, H) {
    if (!imgEl) return;
    var iw = imgEl.naturalWidth || imgEl.width;
    var ih = imgEl.naturalHeight || imgEl.height;
    /* cylindrical window around lon: span based on fov */
    var spanU = Math.min(1, (fov / 360) * (W / H) * 1.2);
    var spanV = Math.min(1, (fov / 180));
    var center = yawPitchToUv(lon, lat);
    var u0 = center.u - spanU / 2, v0 = center.v - spanV / 2;
    if (u0 < 0) u0 = 0; if (v0 < 0) v0 = 0;
    if (u0 + spanU > 1) u0 = 1 - spanU;
    if (v0 + spanV > 1) v0 = 1 - spanV;
    try {
      ctx.drawImage(imgEl, u0 * iw, v0 * ih, spanU * iw, spanV * ih, 0, 0, W, H);
    } catch (e) {}
    /* store for look uv mapping consistency via temporary overrides */
    mapPanU = center.u; mapPanV = center.v; mapZoom = 1 / Math.max(spanV, 0.05);
  }

  function projectMarks(W, H) {
    var box = el.querySelector('#ppeMarks');
    if (!box || !state) return;
    var html = '';
    state.items.forEach(function (m) {
      if (m.kind === 'path') return;
      ensureUv(m);
      var p = uvToScreen(m.u, m.v, W, H);
      if (!p) return;
      var col = COLORS[m.type] || '#58a6ff';
      var sel = m.id === state.selectedId ? ' sel' : '';
      if (m.kind === 'text') {
        html += '<div class="tbx' + sel + '" data-id="' + m.id + '" style="left:' + p.x + 'px;top:' + p.y + 'px;border-color:' + col + '">' +
          esc(m.label || 'Note') + '</div>';
      } else {
        html += '<div class="mk' + sel + '" data-id="' + m.id + '" style="left:' + p.x + 'px;top:' + p.y + 'px">' +
          '<div class="mk-dot" style="border-color:' + col + '">' + (ICONS[m.type] || '•') + '</div>' +
          '<div class="mk-lbl">' + esc(m.label) + '</div></div>';
      }
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-id]').forEach(function (node) {
      var id = node.getAttribute('data-id');
      node.addEventListener('pointerdown', function (e) {
        e.stopPropagation(); selectItem(id);
      });
      node.addEventListener('pointerenter', function (e) { showTip(id, e.clientX, e.clientY); });
      node.addEventListener('pointerleave', hideTip);
    });
  }

  function drawPaths(W, H, dpr) {
    var c = el.querySelector('#ppeDraw');
    if (!c || !state) return;
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    function stroke(pts, color, width, dash) {
      if (!pts || !pts.length) return;
      var scr = pts.map(function (pt) {
        ensureUv(pt);
        return uvToScreen(pt.u, pt.v, W, H);
      });
      if (pts.length >= 2) {
        ctx.beginPath();
        var started = false, i, p;
        for (i = 0; i < scr.length; i++) {
          p = scr[i];
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width || 4;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.setLineDash(dash || []);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      scr.forEach(function (p, i) {
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 || i === scr.length - 1 ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 1.5; ctx.stroke();
      });
    }
    state.items.forEach(function (m) {
      if (m.kind !== 'path' || !m.pts) return;
      var col = COLORS[m.type] || '#22d3ee';
      var dash = m.type === 'power' ? [8, 5] : (m.type === 'smpte' ? [4, 4] : []);
      stroke(m.pts, col, m.id === state.selectedId ? 5.5 : 4, dash);
    });
    if (drawDraft && drawDraft.pts && drawDraft.pts.length) {
      stroke(drawDraft.pts, COLORS[drawDraft.type] || '#f59e0b', 5, [7, 5]);
    }
  }

  function ensureUv(m) {
    if (m.u != null && m.v != null) return;
    if (m.yaw != null && m.pitch != null) {
      var uv = yawPitchToUv(m.yaw, m.pitch);
      m.u = uv.u; m.v = uv.v;
      return;
    }
    m.u = 0.5; m.v = 0.5;
  }

  /* ===================== input ===================== */
  function isDrawTool() {
    return !!(state && state.tool && String(state.tool).indexOf('draw_') === 0);
  }
  function bindViewEvents() {
    var canvas = el.querySelector('#ppeCanvas');
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      if (isDrawTool()) {
        if (!imgReady) { setStatus('Load a 360° image first'); return; }
        if (!drawDraft) drawDraft = { type: state.tool.replace('draw_', ''), pts: [] };
        var uv = screenToUv(e.clientX, e.clientY);
        var yp = uvToYawPitch(uv.u, uv.v);
        drawDraft.pts.push({ u: uv.u, v: uv.v, yaw: yp.yaw, pitch: yp.pitch });
        drag = { mode: 'draw', lastX: e.clientX, lastY: e.clientY };
        canvas.style.cursor = 'crosshair';
        setStatus(drawDraft.type + ' · ' + drawDraft.pts.length + ' pts · drag freehand · Enter/✓ finish');
        paint();
        return;
      }
      drag = {
        mode: 'pan',
        x: e.clientX, y: e.clientY,
        panU: mapPanU, panV: mapPanV,
        lon0: lon, lat0: lat,
        moved: false
      };
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) { hoverAt(e.clientX, e.clientY); return; }
      if (drag.mode === 'draw' && drawDraft) {
        var dist = Math.hypot(e.clientX - drag.lastX, e.clientY - drag.lastY);
        if (dist >= 4) {
          drag.lastX = e.clientX; drag.lastY = e.clientY;
          var uv = screenToUv(e.clientX, e.clientY);
          var last = drawDraft.pts[drawDraft.pts.length - 1];
          if (!last || Math.hypot(uv.u - last.u, uv.v - last.v) > 0.002) {
            var yp = uvToYawPitch(uv.u, uv.v);
            drawDraft.pts.push({ u: uv.u, v: uv.v, yaw: yp.yaw, pitch: yp.pitch });
            paint();
          }
        }
        return;
      }
      /* pure L/R U/D pan — no sphere roll */
      var view = el.querySelector('#ppeView');
      var rect = view.getBoundingClientRect();
      var W = Math.max(1, rect.width), H = Math.max(1, rect.height);
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      if (viewMode === 'map') {
        var vp = mapViewport(W, H);
        /* drag right → look left (grab image); U wraps for full 360° */
        mapPanU = wrapU(drag.panU - (dx / W) * vp.spanU);
        /* limited U/D — only a little vertical travel */
        mapPanV = drag.panV - (dy / H) * vp.spanV * 0.65;
        mapPanV = Math.max(0.28, Math.min(0.72, mapPanV));
      } else {
        var deg = fov / H;
        lon = drag.lon0 - dx * deg;
        /* limited pitch in look mode too */
        lat = Math.max(-35, Math.min(35, drag.lat0 + dy * deg * 0.7));
        while (lon > 180) lon -= 360;
        while (lon < -180) lon += 360;
      }
      paint();
    });
    canvas.addEventListener('pointerup', function (e) {
      if (drag && drag.mode === 'draw') {
        drag = null;
        canvas.style.cursor = 'crosshair';
        if (drawDraft) setStatus(drawDraft.type + ' · ' + drawDraft.pts.length + ' pts · Enter/✓ finish');
        paint();
        return;
      }
      canvas.style.cursor = isDrawTool() ? 'crosshair' : 'grab';
      if (drag && !drag.moved) {
        if (!imgReady) setStatus('Load a 360° image first');
        else clickAt(e.clientX, e.clientY);
      }
      drag = null;
    });
    canvas.addEventListener('pointercancel', function () {
      drag = null;
      canvas.style.cursor = isDrawTool() ? 'crosshair' : 'grab';
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (viewMode === 'map') {
        var factor = e.deltaY > 0 ? 0.9 : 1.12;
        mapZoom = Math.max(1, Math.min(12, mapZoom * factor));
      } else {
        fov = Math.max(28, Math.min(100, fov * (e.deltaY > 0 ? 1.06 : 0.94)));
      }
      paint();
    }, { passive: false });
    canvas.addEventListener('dblclick', function (e) {
      if (drawDraft && drawDraft.pts && drawDraft.pts.length >= 2) {
        e.preventDefault(); finishDraw();
      }
    });
    window.addEventListener('resize', function () {
      if (!el || el.style.display === 'none') return;
      paint();
    });
  }

  function clickAt(cx, cy) {
    var uv = screenToUv(cx, cy);
    var yp = uvToYawPitch(uv.u, uv.v);
    var tool = state.tool || 'camera';
    if (String(tool).indexOf('draw_') === 0) {
      if (!drawDraft) drawDraft = { type: tool.replace('draw_', ''), pts: [] };
      drawDraft.pts.push({ u: uv.u, v: uv.v, yaw: yp.yaw, pitch: yp.pitch });
      setStatus(drawDraft.type + ' · ' + drawDraft.pts.length + ' pts · drag freehand · Enter/✓ finish');
      paint();
      return;
    }
    if (tool === 'text') {
      addItem({ id: nid('t'), kind: 'text', type: 'text', label: 'Note', notes: '', u: uv.u, v: uv.v, yaw: yp.yaw, pitch: yp.pitch });
      return;
    }
    if (tool === 'zone') {
      addItem({ id: nid('z'), kind: 'zone', type: 'zone', label: 'Zone', notes: '', u: uv.u, v: uv.v, yaw: yp.yaw, pitch: yp.pitch, radius: 12 });
      return;
    }
    var item = {
      id: nid('m'), kind: 'pin', type: tool,
      label: defaultLabel(tool), notes: defaultNotes(tool),
      u: uv.u, v: uv.v, yaw: yp.yaw, pitch: yp.pitch,
      gearId: '', body: '', lens: '', mount: '', operator: ''
    };
    if (CAM_TYPES[tool]) {
      var pkg = nextUnusedPackage(tool);
      if (pkg) applyPkgToItem(item, pkg, tool);
      else item.mount = tool === 'jib' ? 'Jib 12 ft' : (tool === 'steadicam' ? 'Steadicam' : '');
    }
    addItem(item);
  }

  function finishDraw() {
    if (!drawDraft || !drawDraft.pts || drawDraft.pts.length < 2) {
      setStatus('Need at least 2 points — drag freehand then ✓ Finish');
      return;
    }
    var t = drawDraft.type;
    addItem({
      id: nid('p'), kind: 'path', type: t,
      label: defaultLabel(t) + ' run', notes: defaultNotes(t),
      pts: drawDraft.pts.slice()
    });
    drawDraft = { type: t, pts: [] };
    setStatus(t + ' run saved — drag another or pick Place tool');
  }

  /* ===================== gear (Dept Status) ===================== */
  function loadGearCatalog(key) {
    gearCatalog = { packages: [], bodies: [], lenses: [], mounts: [], empty: true, count: 0 };
    try {
      var fn = global.pulseBlockingGear || (typeof pulseBlockingGear === 'function' ? pulseBlockingGear : null);
      if (fn && key) gearCatalog = fn(key) || gearCatalog;
    } catch (e) {}
    refreshGearBanner();
    rebuildGearSelects();
  }
  function findGearPkg(id) {
    var p = gearCatalog.packages || [], i;
    for (i = 0; i < p.length; i++) if (p[i].id === id) return p[i];
    return null;
  }
  function nextUnusedPackage(tool) {
    var used = {};
    (state.items || []).forEach(function (m) { if (m.gearId) used[m.gearId] = 1; });
    var list = gearCatalog.packages || [], i, pref = tool === 'jib' ? 'jib' : (tool === 'steadicam' ? 'steadicam' : null);
    if (pref) for (i = 0; i < list.length; i++) if (!used[list[i].id] && list[i].role === pref) return list[i];
    for (i = 0; i < list.length; i++) if (!used[list[i].id]) return list[i];
    return list[0] || null;
  }
  function applyPkgToItem(item, pkg, tool) {
    item.gearId = pkg.id;
    item.body = pkg.body || '';
    item.lens = pkg.lens || '';
    item.mount = pkg.mount || '';
    item.operator = pkg.operator || '';
    item.label = pkg.shortLabel || pkg.label || item.label;
    if (pkg.role === 'jib') item.type = 'jib';
    else if (pkg.role === 'steadicam') item.type = 'steadicam';
    item.notes = gearNotes(pkg, item.type || tool);
  }
  function gearNotes(pkg, type) {
    var parts = [];
    if (pkg.body) parts.push(pkg.body);
    if (pkg.lens) parts.push(pkg.lens);
    if (pkg.mount) parts.push(pkg.mount);
    if (pkg.operator) parts.push('Op: ' + pkg.operator);
    if (pkg.source) parts.push('[' + pkg.source + ']');
    return parts.join(' · ') || defaultNotes(type || 'camera');
  }
  function setSelectValue(id, val) {
    var sel = el.querySelector('#' + id); if (!sel) return;
    ensureOption(sel, val); sel.value = val || '';
  }
  function ensureOption(sel, val) {
    if (!val) return;
    var i; for (i = 0; i < sel.options.length; i++) if (sel.options[i].value === val) return;
    var o = document.createElement('option'); o.value = val; o.textContent = val; sel.appendChild(o);
  }
  function rebuildGearSelects() {
    if (!el) return;
    function fill(sel, list, blank) {
      if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">' + blank + '</option>';
      (list || []).forEach(function (v) {
        if (v) sel.innerHTML += '<option value="' + esc(v).replace(/"/g, '&quot;') + '">' + esc(v) + '</option>';
      });
      if (cur) { ensureOption(sel, cur); sel.value = cur; }
    }
    var pkgSel = el.querySelector('#ppeGearPkg');
    if (pkgSel) {
      var curP = pkgSel.value;
      pkgSel.innerHTML = '<option value="">— Dept Status package —</option>';
      (gearCatalog.packages || []).forEach(function (p) {
        pkgSel.innerHTML += '<option value="' + esc(p.id).replace(/"/g, '&quot;') + '">' + esc(p.label) + '</option>';
      });
      if (curP) pkgSel.value = curP;
    }
    fill(el.querySelector('#ppeBody'), gearCatalog.bodies, '— body —');
    fill(el.querySelector('#ppeLens'), gearCatalog.lenses, '— lens —');
    fill(el.querySelector('#ppeMount'), gearCatalog.mounts, '— mount —');
  }
  function refreshGearBanner() {
    var b = el && el.querySelector('#ppeGearBanner'); if (!b) return;
    var n = (gearCatalog.packages || []).length;
    b.innerHTML = n
      ? '<span style="color:#3fb950">●</span> ' + n + ' cam packages from Dept Status · Cameras / Video'
      : '<span style="color:#f59e0b">⚠</span> Add cameras under Department Status → Cameras / Video for package pickers';
  }

  function defaultLabel(type) {
    var counts = {}, n;
    state.items.forEach(function (m) { counts[m.type] = (counts[m.type] || 0) + 1; });
    n = (counts[type] || 0) + 1;
    var map = {
      camera: 'CAM ' + n, jib: 'Jib ' + n, steadicam: 'Steadicam ' + n,
      fiber: 'Fiber ' + n, smpte: 'SMPTE ' + n, power: 'Power ' + n, cable: 'Cable ' + n,
      text: 'Note ' + n, zone: 'Zone ' + n
    };
    return map[type] || (type + ' ' + n);
  }
  function defaultNotes(type) {
    var map = {
      camera: 'Camera — pick Dept Status package',
      jib: 'Jib arm',
      steadicam: 'Steadicam',
      fiber: 'Fiber trunk path',
      smpte: 'SMPTE camera cable',
      power: 'Power distro path',
      cable: 'General cable run'
    };
    return map[type] || '';
  }
  function nid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36); }
  function addItem(item) {
    ensureUv(item);
    if (item.pts) item.pts.forEach(ensureUv);
    state.items.push(item);
    selectItem(item.id);
    refreshList();
    paint();
    persistAll();
    setStatus('Placed ' + (ICONS[item.type] || '') + ' ' + item.label + ' · UV-locked');
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }
  function selectItem(id) {
    state.selectedId = id;
    var m = findItem(id); if (!m) return;
    el.querySelector('#ppeProps').style.display = 'block';
    el.querySelector('#ppeLabel').value = m.label || '';
    el.querySelector('#ppeType').value = m.type || 'camera';
    el.querySelector('#ppeNotes').value = m.notes || '';
    setSelectValue('ppeGearPkg', m.gearId || '');
    setSelectValue('ppeBody', m.body || '');
    setSelectValue('ppeLens', m.lens || '');
    setSelectValue('ppeMount', m.mount || '');
    refreshList(); paint();
  }
  function applyProps() {
    var m = findItem(state.selectedId); if (!m) return;
    m.label = el.querySelector('#ppeLabel').value;
    m.notes = el.querySelector('#ppeNotes').value;
    m.type = el.querySelector('#ppeType').value;
    m.gearId = el.querySelector('#ppeGearPkg').value || '';
    m.body = el.querySelector('#ppeBody').value || '';
    m.lens = el.querySelector('#ppeLens').value || '';
    m.mount = el.querySelector('#ppeMount').value || '';
    refreshList(); paint(); persistAll();
    setStatus('Updated ' + m.label);
  }
  function deleteItem(id) {
    state.items = state.items.filter(function (m) { return m.id !== id; });
    if (state.selectedId === id) {
      state.selectedId = null;
      el.querySelector('#ppeProps').style.display = 'none';
    }
    refreshList(); paint(); persistAll();
  }
  function clearAll() {
    if (!confirm('Clear all markers and paths?')) return;
    state.items = []; state.selectedId = null; drawDraft = null;
    el.querySelector('#ppeProps').style.display = 'none';
    refreshList(); paint(); persistAll();
  }
  function refreshList() {
    var list = el.querySelector('#ppeList');
    el.querySelector('#ppeCount').textContent = String(state.items.length);
    refreshShotList();
    if (!state.items.length) {
      list.innerHTML = '<div style="color:#6e7681;padding:10px;font-size:11px">No blocking yet. Place Cam or Draw Fiber — markers stick to the map.</div>';
      return;
    }
    list.innerHTML = '';
    state.items.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'mi' + (m.id === state.selectedId ? ' sel' : '');
      var meta = m.kind === 'path' ? ((m.pts || []).length + ' pts') : (m.body || m.kind);
      div.innerHTML = '<span>' + (ICONS[m.type] || '•') + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(m.label) + ' <span style="color:#6e7681">· ' + esc(meta) + '</span></span>' +
        '<span style="color:#f85149;cursor:pointer" data-del="' + m.id + '">✕</span>';
      div.onclick = function (e) {
        if (e.target.getAttribute('data-del')) deleteItem(m.id);
        else selectItem(m.id);
      };
      list.appendChild(div);
    });
  }
  function refreshShotList() {
    var box = el.querySelector('#ppeShotList'); if (!box) return;
    var cams = state.items.filter(function (m) { return CAM_TYPES[m.type]; });
    if (!cams.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="color:#8b949e;font:700 9px Inter,sans-serif;margin-bottom:4px">SHOT LIST · ' + cams.length + '</div>' +
      cams.map(function (m) {
        return '<div style="padding:3px 0;border-bottom:1px solid #21262d;cursor:pointer" data-shot="' + m.id + '">' +
          (ICONS[m.type] || '📷') + ' <b>' + esc(m.label) + '</b> · ' + esc(m.body || 'body TBD') +
          (m.lens ? ' · ' + esc(m.lens) : '') + '</div>';
      }).join('');
    box.querySelectorAll('[data-shot]').forEach(function (row) {
      row.onclick = function () { selectItem(row.getAttribute('data-shot')); };
    });
  }
  function showTip(id, cx, cy) {
    var m = findItem(id); if (!m) return;
    var tip = el.querySelector('#ppeTip');
    var view = el.querySelector('#ppeView');
    var rect = view.getBoundingClientRect();
    tip.style.display = 'block';
    tip.innerHTML = '<b>' + esc((ICONS[m.type] || '') + ' ' + (m.label || m.type)) + '</b>' +
      (m.body || m.lens ? ('<div style="margin:3px 0;color:#c9d1d9">' + esc([m.body, m.lens, m.mount].filter(Boolean).join(' · ')) + '</div>') : '') +
      esc(m.notes || '');
    tip.style.left = Math.min(rect.width - 280, Math.max(8, cx - rect.left + 12)) + 'px';
    tip.style.top = Math.min(rect.height - 80, Math.max(8, cy - rect.top + 12)) + 'px';
  }
  function hideTip() {
    var tip = el.querySelector('#ppeTip');
    if (tip) tip.style.display = 'none';
  }
  function hoverAt(cx, cy) {
    if (!state || isDrawTool()) { hideTip(); return; }
    var view = el.querySelector('#ppeView');
    var rect = view.getBoundingClientRect();
    var mx = cx - rect.left, my = cy - rect.top;
    var W = rect.width, H = rect.height;
    var best = null, bestD = 18;
    state.items.forEach(function (m) {
      if (m.kind === 'path' && m.pts) {
        m.pts.forEach(function (pt) {
          ensureUv(pt);
          var p = uvToScreen(pt.u, pt.v, W, H);
          if (!p) return;
          var d = Math.hypot(p.x - mx, p.y - my);
          if (d < bestD) { bestD = d; best = m; }
        });
      } else {
        ensureUv(m);
        var p2 = uvToScreen(m.u, m.v, W, H);
        if (!p2) return;
        var d2 = Math.hypot(p2.x - mx, p2.y - my);
        if (d2 < bestD) { bestD = d2; best = m; }
      }
    });
    if (best) showTip(best.id, cx, cy); else hideTip();
  }

  /* ===================== image load ===================== */
  function loadFilePublic(file) {
    ensureShell();
    if (!state) {
      state = { items: [], selectedId: null, tool: 'camera', key: null, imgDataUrl: null };
    }
    loadImage(file);
  }
  function loadImage(file) {
    if (!file) return;
    setStatus('Loading ' + (file.name || 'image') + '…');
    var r = new FileReader();
    r.onload = function (ev) { applyImageUrl(ev.target.result, file.name); };
    r.readAsDataURL(file);
  }
  function applyImageUrl(url, name) {
    var img = new Image();
    img.onload = function () {
      /* downscale huge images for paint performance */
      var maxEdge = MAX_TEX;
      var w = img.naturalWidth, h = img.naturalHeight, scale = 1;
      if (w > maxEdge || h > maxEdge) scale = Math.min(maxEdge / w, maxEdge / h);
      var cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.floor(w * scale));
      cv.height = Math.max(2, Math.floor(h * scale));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      var out = new Image();
      out.onload = function () {
        imgEl = out;
        imgReady = true;
        try { state.imgDataUrl = cv.toDataURL('image/jpeg', 0.88); } catch (e) { state.imgDataUrl = url; }
        el.querySelector('#ppeHint').style.display = 'none';
        mapPanU = 0.5; mapPanV = 0.5; mapZoom = 1;
        setStatus('Loaded ' + (name || '') + ' · Map pan L/R U/D · markers stick');
        persistImage();
        paint();
      };
      try { out.src = cv.toDataURL('image/jpeg', 0.9); } catch (e2) {
        imgEl = img; imgReady = true; state.imgDataUrl = url;
        el.querySelector('#ppeHint').style.display = 'none';
        paint();
      }
    };
    img.onerror = function () { setStatus('Could not decode image'); };
    img.src = url;
  }

  /* ===================== persist ===================== */
  function ensurePanoCompat(s) {
    if (typeof ensurePano === 'function') return ensurePano(s);
    if (!s.pano) s.pano = { img: '', hotspots: [], marks: [], paths: [] };
    if (!s.pano.hotspots) s.pano.hotspots = [];
    if (!s.pano.marks) s.pano.marks = [];
    if (!s.pano.paths) s.pano.paths = [];
    return s.pano;
  }
  function persistImage() {
    if (!state.key || !state.imgDataUrl) return;
    try {
      var s = typeof getSurvey === 'function' ? getSurvey(state.key) : null;
      if (!s) return;
      ensurePanoCompat(s).img = state.imgDataUrl;
      if (typeof stampEdit === 'function') stampEdit(state.key);
    } catch (e) {}
  }
  function persistAll() {
    if (!state || !state.key) return;
    try {
      var s = typeof getSurvey === 'function' ? getSurvey(state.key) : null;
      if (!s) return;
      var P = ensurePanoCompat(s);
      if (state.imgDataUrl) P.img = state.imgDataUrl;
      P.hotspots = []; P.marks = []; P.paths = [];
      state.items.forEach(function (m) {
        ensureUv(m);
        if (m.kind === 'path') {
          P.paths.push({
            id: m.id, type: m.type, label: m.label, notes: m.notes,
            pts: (m.pts || []).map(function (pt) {
              ensureUv(pt);
              return { u: pt.u, v: pt.v, yaw: pt.yaw, pitch: pt.pitch };
            })
          });
        } else {
          var yp = uvToYawPitch(m.u, m.v);
          P.hotspots.push({
            id: m.id, type: m.type, kind: m.type, label: m.label,
            note: m.notes || '', yaw: yp.yaw, pitch: yp.pitch,
            u: m.u, v: m.v,
            gearId: m.gearId || '', body: m.body || '', lens: m.lens || '',
            mount: m.mount || '', operator: m.operator || ''
          });
        }
      });
      if (typeof stampEdit === 'function') stampEdit(state.key);
    } catch (e) {}
  }
  function loadFromSurvey(key) {
    state.key = key;
    state.items = [];
    try {
      var s = typeof getSurvey === 'function' ? getSurvey(key) : null;
      var P = s ? ensurePanoCompat(s) : { img: '', hotspots: [], paths: [] };
      if (P.img) applyImageUrl(P.img, 'Survey panorama');
      (P.hotspots || []).forEach(function (h) {
        var uv = (h.u != null && h.v != null) ? { u: +h.u, v: +h.v } : yawPitchToUv(+h.yaw || 0, +h.pitch || 0);
        state.items.push({
          id: h.id || nid('m'), kind: 'pin', type: h.type || h.kind || 'camera',
          label: h.label || 'Pin', notes: h.note || h.notes || '',
          u: uv.u, v: uv.v, yaw: +h.yaw || 0, pitch: +h.pitch || 0,
          gearId: h.gearId || '', body: h.body || '', lens: h.lens || '',
          mount: h.mount || '', operator: h.operator || ''
        });
      });
      (P.paths || []).forEach(function (p) {
        state.items.push({
          id: p.id || nid('p'), kind: 'path', type: p.type || 'fiber',
          label: p.label || 'Run', notes: p.notes || '',
          pts: (p.pts || []).map(function (pt) {
            if (pt.u != null) return { u: +pt.u, v: +pt.v, yaw: pt.yaw, pitch: pt.pitch };
            var uv = yawPitchToUv(+pt.yaw || 0, +pt.pitch || 0);
            return { u: uv.u, v: uv.v, yaw: +pt.yaw || 0, pitch: +pt.pitch || 0 };
          })
        });
      });
      refreshList();
    } catch (e) {}
  }
  function getSceneData() {
    return {
      version: 5, engine: 'pulse-pano-map',
      viewMode: viewMode, flipV: flipV, flipH: flipH,
      map: { panU: mapPanU, panV: mapPanV, zoom: mapZoom },
      look: { lon: lon, lat: lat, fov: fov },
      items: state.items
    };
  }
  function saveScene() {
    persistAll();
    try { localStorage.setItem('nbcpulse_pano360_' + (state.key || 'x'), JSON.stringify(getSceneData())); } catch (e) {}
    setStatus('Saved to survey');
    if (typeof toast === 'function') toast('360 map blocking saved');
  }
  function exportJSON() {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getSceneData(), null, 2)], { type: 'application/json' }));
    a.download = 'pulse360_map_' + (state.key || 'scene') + '.json';
    a.click();
  }
  function importJSON(e) {
    var file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (data.flipV != null) flipV = !!data.flipV;
        if (data.flipH != null) flipH = !!data.flipH;
        if (data.viewMode) setViewMode(data.viewMode);
        if (data.map) {
          mapPanU = data.map.panU != null ? data.map.panU : 0.5;
          mapPanV = data.map.panV != null ? data.map.panV : 0.5;
          mapZoom = data.map.zoom || 1;
        }
        state.items = data.items || [];
        state.items.forEach(function (m) {
          ensureUv(m);
          if (m.pts) m.pts.forEach(ensureUv);
        });
        refreshList(); paint(); persistAll();
        setStatus('Imported ' + state.items.length + ' items');
      } catch (err) { setStatus('Invalid JSON'); }
    };
    r.readAsText(file);
  }
  function snapshot() {
    try {
      var canvas = el.querySelector('#ppeCanvas');
      var drawC = el.querySelector('#ppeDraw');
      var out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      var ctx = out.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      if (drawC) ctx.drawImage(drawC, 0, 0);
      var a = document.createElement('a');
      a.href = out.toDataURL('image/jpeg', 0.92);
      a.download = 'pulse360_block.jpg'; a.click();
    } catch (e) { setStatus('Snapshot failed'); }
  }
  function setStatus(msg) {
    var s = el && el.querySelector('#ppeStatus');
    if (s) s.textContent = msg || '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function open(opts) {
    opts = opts || {};
    ensureShell();
    try { var legacy = document.getElementById('panoOverlay'); if (legacy) legacy.style.display = 'none'; } catch (e0) {}
    state = {
      items: [], selectedId: null, tool: 'camera',
      key: opts.key || null, imgDataUrl: null
    };
    drawDraft = null; imgEl = null; imgReady = false;
    mapPanU = 0.5; mapPanV = 0.5; mapZoom = 1;
    lon = 0; lat = 0; fov = 75;
    flipV = true; flipH = false;
    viewMode = 'map';
    lockLandscape(true);
    el.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (isPhoneView()) {
      try { el.classList.add('cv-force-land'); } catch (eF) {}
      if (typeof toast === 'function') toast('360 planner — landscape');
    }
    el.querySelector('#ppeHint').style.display = 'block';
    el.querySelector('#ppeProps').style.display = 'none';
    el.querySelectorAll('[data-tool]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tool') === 'camera');
    });
    setViewMode('map');
    loadGearCatalog(opts.key);
    loadFromSurvey(opts.key);
    setStatus('360° left/right · limited up/down · markers UV-locked');
    if (typeof toast === 'function') toast('360 blocking — full yaw wrap, sticky markers');
    if (raf) cancelAnimationFrame(raf);
    function loop() {
      if (!el || el.style.display === 'none') return;
      raf = requestAnimationFrame(loop);
      /* paint only when needed is fine; paint is called on interaction */
    }
    raf = requestAnimationFrame(loop);
    setTimeout(function () { paint(); }, 40);
    setTimeout(function () { paint(); }, 280);
  }
  function close(save) {
    if (!el || el.style.display === 'none') return;
    if (save !== false) persistAll();
    if (raf) cancelAnimationFrame(raf);
    el.style.display = 'none';
    document.body.style.overflow = '';
    lockLandscape(false);
    if (state && state.key && typeof renderProjectView === 'function') {
      try { renderProjectView(state.key); } catch (e) {}
    }
    state = null; drawDraft = null; imgEl = null; imgReady = false;
  }

  global.PanoEng = PanoEng;
})(typeof window !== 'undefined' ? window : this);
