/**
 * Muse Live — CAD Viewer Engine v1.0
 * Read-only 2D / 3D model viewer + collaborative note dots (no geometry edit).
 * Supported: DXF, DWG (via museDwgToDxf), OBJ, STL, images/PDF raster.
 * Unsupported (honest skip): DWF, STEP, Parasolid (.x_t), Vectorworks (.vwx).
 */
(function (global) {
  'use strict';

  var CadViewer = {
    open: openViewer,
    close: closeViewer,
    version: '1.0.1',
    SUPPORTED: ['dxf', 'dwg', 'obj', 'stl', 'image', 'pdf', 'json']
  };

  var NOTE_COLORS = ['#ef4461', '#f56c0b', '#22c548', '#3b86f6', '#5596f7', '#ec4863', '#14a8b8', '#eaaa08'];

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
      document.documentElement.classList.toggle('muse-phone-portrait', !!portrait);
    } catch (e) {}
    return portrait;
  }
  var landBound = false;
  function onLandResize() {
    if (!el || el.style.display === 'none') return;
    syncPhonePortrait();
    try { resize(); paint(); } catch (e) {}
  }
  function lockLandscape(on) {
    try {
      document.documentElement.classList.toggle('muse-cv-land', !!on);
      document.body.classList.toggle('muse-cv-land', !!on);
    } catch (e0) {}
    if (on) {
      syncPhonePortrait();
      if (!landBound) {
        landBound = true;
        window.addEventListener('resize', onLandResize);
        window.addEventListener('orientationchange', onLandResize);
      }
    } else {
      try { document.documentElement.classList.remove('muse-phone-portrait'); } catch (e2) {}
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

  var el, canvas2d, canvas3d, gl, wrap, anim = 0;
  var W = 1, H = 1, dpr = 1;
  var viewMode = '2d'; /* 2d | 3d */
  var tool = 'orbit'; /* orbit | pan | note */
  var segs = []; /* 2D segments [{x1,y1,x2,y2,layer,color}] */
  var mesh = null; /* { pos:Float32Array, count } for 3D */
  var bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  var cam2d = { cx: 0, cy: 0, scale: 1 }; /* world units per view */
  var cam3d = { theta: 0.7, phi: 0.55, dist: 14, target: [0, 0, 0] };
  var notes = []; /* { id, x, y, z, color, author, text, ts } — x/y world 2D, z optional */
  var selectedNote = null;
  var dragging = false, lastX = 0, lastY = 0, moved = false;
  var noteDraft = null;
  var ctx = { key: null, planId: null, title: '', onSaveNotes: null, dirty: false, fmt: '' };
  var rasterImg = null;
  var prog3d = null, aPos3, uMVP3, uColor3;

  /* ---------- math ---------- */
  function uid() { return 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- shell ---------- */
  function ensureShell() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'museCadView';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;flex-direction:column;background:#0e0e0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e6ebf3';
    el.innerHTML =
      '<style>' +
      '#museCadView .cvb{padding:6px 11px;background:#252627;border:1px solid #393a3c;color:#cbcfd7;border-radius:8px;font:700 11px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;cursor:pointer;white-space:nowrap}' +
      '#museCadView .cvb:hover{background:#353639;color:#ffffff}' +
      '#museCadView .cvb.on{background:#2374ed;border-color:#2374ed;color:#ffffff}' +
      '#museCadView .cvb.note{border-color:#f56c0b}' +
      '#museCadView .cvb.note.on{background:#f56c0b;border-color:#f56c0b;color:#111213}' +
      '#museCadView .cvb.ok{background:#23863A;border-color:#2ea049;color:#ffffff}' +
      '#museCadView .cvb.bad{background:#3d1118;border-color:#5c202a;color:#ff9bac}' +
      '#museCadView .ndot{position:absolute;width:18px;height:18px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 2px 10px rgba(0,0,0,.55);transform:translate(-50%,-50%);cursor:pointer;z-index:6;transition:transform .12s}' +
      '#museCadView .ndot:hover{transform:translate(-50%,-50%) scale(1.25)}' +
      '#museCadView .ndot.sel{box-shadow:0 0 0 3px rgba(255,255,255,.85),0 2px 12px rgba(0,0,0,.6)}' +
      '#museCadView .npop{position:absolute;z-index:10;width:280px;max-width:90vw;background:rgba(27,28,29,.98);border:1px solid #353638;border-radius:12px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.55);font:600 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif}' +
      '#museCadView .npop textarea{width:100%;min-height:72px;background:#111213;border:1px solid #353638;color:#e6ebf3;border-radius:8px;padding:8px;resize:vertical;font:600 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-sizing:border-box}' +
      '#museCadView .npop input{width:100%;background:#111213;border:1px solid #353638;color:#e6ebf3;border-radius:8px;padding:6px 8px;box-sizing:border-box;font:600 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif}' +
      '#museCadView .cv-side{width:220px;background:#161617;border-right:1px solid #262728;display:flex;flex-direction:column;flex-shrink:0}' +
      'html.muse-cv-land,html.muse-cv-land body{overflow:hidden!important}' +
      '@media (max-width:900px){' +
        '#museCadView .cv-side{width:min(168px,34vw)}' +
        '#museCadView .cvb{padding:8px 10px;min-height:40px}' +
      '}' +
      'html.muse-cv-land.muse-phone-portrait #museCadView,' +
      'html.muse-cv-land #museCadView.cv-force-land{' +
        'width:100vh!important;height:100vw!important;width:100dvh!important;height:100dvw!important;' +
        'max-width:none!important;max-height:none!important;' +
        'top:0!important;left:0!important;right:auto!important;bottom:auto!important;' +
        'transform:rotate(90deg) translateY(-100%);transform-origin:top left;' +
      '}' +
      '</style>' +
      '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:linear-gradient(180deg,#1b1c1d,#141516);border-bottom:1px solid #262728;flex-wrap:wrap">' +
        '<div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#e66000,#202122);display:flex;align-items:center;justify-content:center;font:800 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">CV</div>' +
        '<div><div id="cvTitle" style="font:700 13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">CAD Viewer</div>' +
        '<div id="cvMeta" style="font:600 9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#74767b">READ-ONLY · NOTES</div></div>' +
        '<div style="width:1px;height:26px;background:#353638"></div>' +
        '<button type="button" class="cvb on" data-act="mode2d" id="cvBtn2d">2D</button>' +
        '<button type="button" class="cvb" data-act="mode3d" id="cvBtn3d">3D</button>' +
        '<div style="width:1px;height:26px;background:#353638"></div>' +
        '<button type="button" class="cvb on" data-tool="orbit" id="cvOrbit">Orbit / Pan</button>' +
        '<button type="button" class="cvb note" data-tool="note" id="cvNote">● Add note</button>' +
        '<button type="button" class="cvb" data-act="fit">Fit</button>' +
        '<div style="width:1px;height:26px;background:#353638"></div>' +
        '<label class="cvb" style="cursor:pointer">Upload<input type="file" id="cvFile" accept=".dxf,.dwg,.obj,.stl,.png,.jpg,.jpeg,.webp,.pdf,.txt,image/*" style="display:none"></label>' +
        '<button type="button" class="cvb ok" data-act="saveNotes">Save notes</button>' +
        '<span style="flex:1"></span>' +
        '<span id="cvStatus" style="font:600 10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#8890a1"></span>' +
        '<button type="button" class="cvb bad" data-act="close">✕</button>' +
      '</div>' +
      '<div style="flex:1;display:flex;min-height:0">' +
        '<div class="cv-side">' +
          '<div style="padding:10px;font:700 9px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;color:#8890a1;text-transform:uppercase">Notes (<span id="cvNoteCount">0</span>)</div>' +
          '<div id="cvNoteList" style="flex:1;overflow:auto;padding:6px"></div>' +
          '<div style="padding:8px 10px;border-top:1px solid #262728;font:600 9px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#74767b;line-height:1.4">Read-only geometry. Click ● Add note, then click the model. Others see the same notes when saved.</div>' +
        '</div>' +
        '<div id="cvWrap" style="flex:1;position:relative;min-width:0;background:#111213;overflow:hidden">' +
          '<canvas id="cv3d" style="position:absolute;inset:0;width:100%;height:100%;display:none"></canvas>' +
          '<canvas id="cv2d" style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none"></canvas>' +
          '<div id="cvDots" style="position:absolute;inset:0;pointer-events:none;z-index:5"></div>' +
          '<div id="cvPop" class="npop" style="display:none"></div>' +
          '<div id="cvHint" style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(27,28,29,.92);border:1px solid #353638;border-radius:20px;padding:6px 14px;font:600 11px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#cbcfd7;pointer-events:none;white-space:nowrap;z-index:4">Read-only viewer · drag to pan · wheel zoom</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    wrap = el.querySelector('#cvWrap');
    canvas2d = el.querySelector('#cv2d');
    canvas3d = el.querySelector('#cv3d');
    gl = canvas3d.getContext('webgl', { antialias: true, alpha: false }) ||
         canvas3d.getContext('experimental-webgl', { antialias: true });
    if (gl) initGL3();
    bindUI();
    window.addEventListener('resize', function () {
      if (el.style.display === 'none') return;
      resize(); paint();
    });
  }

  function bindUI() {
    el.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-act');
        if (a === 'close') closeViewer(true);
        else if (a === 'mode2d') setMode('2d');
        else if (a === 'mode3d') setMode('3d');
        else if (a === 'fit') { fitView(); paint(); }
        else if (a === 'saveNotes') saveNotes();
      };
    });
    el.querySelectorAll('[data-tool]').forEach(function (b) {
      b.onclick = function () {
        tool = b.getAttribute('data-tool');
        el.querySelectorAll('[data-tool]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        canvas2d.style.cursor = tool === 'note' ? 'crosshair' : 'grab';
        setStatus(tool === 'note' ? 'Click the drawing to place a note dot' : 'Drag to pan · wheel zoom · 2D/3D toggle');
      };
    });
    el.querySelector('#cvFile').onchange = onUpload;
    canvas2d.addEventListener('pointerdown', onDown);
    canvas2d.addEventListener('pointermove', onMove);
    canvas2d.addEventListener('pointerup', onUp);
    canvas2d.addEventListener('pointercancel', onUp);
    canvas2d.addEventListener('wheel', onWheel, { passive: false });
    canvas3d.addEventListener('pointerdown', onDown);
    canvas3d.addEventListener('pointermove', onMove);
    canvas3d.addEventListener('pointerup', onUp);
    canvas3d.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (!el || el.style.display === 'none') return;
      if (e.key === 'Escape') {
        if (selectedNote || noteDraft) { selectedNote = null; noteDraft = null; hidePop(); paint(); return; }
        closeViewer(true);
      }
    });
  }

  function setMode(m) {
    viewMode = m === '3d' ? '3d' : '2d';
    el.querySelector('#cvBtn2d').classList.toggle('on', viewMode === '2d');
    el.querySelector('#cvBtn3d').classList.toggle('on', viewMode === '3d');
    canvas2d.style.display = viewMode === '2d' ? 'block' : 'none';
    canvas3d.style.display = viewMode === '3d' && gl ? 'block' : 'none';
    if (viewMode === '3d' && !mesh && segs.length) {
      setStatus('Building 3D…');
      requestAnimationFrame(function () {
        try { buildMeshFromSegs(); } catch (eM) {}
        resize(); paint();
      });
      canvas2d.style.display = 'none';
      canvas3d.style.display = gl ? 'block' : 'none';
      return;
    }
    if (viewMode === '3d' && !gl) {
      setStatus('WebGL unavailable — stay in 2D');
      setMode('2d');
      return;
    }
    resize(); paint();
  }

  function setStatus(msg) {
    var s = el.querySelector('#cvStatus');
    if (s) s.textContent = msg || '';
  }

  /* ---------- WebGL 3D ---------- */
  function initGL3() {
    var vs = 'attribute vec3 aPos;uniform mat4 uMVP;void main(){gl_Position=uMVP*vec4(aPos,1.);}';
    var fs = 'precision mediump float;uniform vec3 uColor;void main(){gl_FragColor=vec4(uColor,1.);}';
    function comp(t, src) {
      var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s;
    }
    prog3d = gl.createProgram();
    gl.attachShader(prog3d, comp(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog3d, comp(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog3d);
    aPos3 = gl.getAttribLocation(prog3d, 'aPos');
    uMVP3 = gl.getUniformLocation(prog3d, 'uMVP');
    uColor3 = gl.getUniformLocation(prog3d, 'uColor');
  }
  function lookAt(eye, tar, up) {
    function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
    function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }
    var z = norm(sub(eye, tar)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
    function dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  }
  function perspective(fovy, asp, n, f) {
    var t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
    return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]);
  }
  function mul4(a, b) {
    var o = new Float32Array(16), i, j;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++)
      o[i*4+j] = a[j]*b[i*4]+a[4+j]*b[i*4+1]+a[8+j]*b[i*4+2]+a[12+j]*b[i*4+3];
    return o;
  }
  function getMVP3() {
    var eye = [
      cam3d.target[0] + cam3d.dist * Math.sin(cam3d.phi) * Math.cos(cam3d.theta),
      cam3d.target[1] + cam3d.dist * Math.cos(cam3d.phi),
      cam3d.target[2] + cam3d.dist * Math.sin(cam3d.phi) * Math.sin(cam3d.theta)
    ];
    var view = lookAt(eye, cam3d.target, [0, 1, 0]);
    var proj = perspective(Math.PI / 4, W / Math.max(H, 1), 0.05, 500);
    return mul4(proj, view);
  }
  function buildMeshFromSegs() {
    /* extrude lines as thin vertical quads for 3D presence */
    var h = Math.max(0.15, (bounds.maxX - bounds.minX + bounds.maxY - bounds.minY) * 0.02);
    var pos = [], i, s, dx, dy, len, nx, ny, t;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      dx = s.x2 - s.x1; dy = s.y2 - s.y1; len = Math.hypot(dx, dy) || 0.001;
      nx = -dy / len * 0.02; ny = dx / len * 0.02;
      var ax = s.x1 + nx, az = s.y1 + ny, bx = s.x1 - nx, bz = s.y1 - ny;
      var cx = s.x2 - nx, cz = s.y2 - ny, dx2 = s.x2 + nx, dz2 = s.y2 + ny;
      /* two triangles bottom-to-top wall */
      pos.push(ax, 0, az, bx, 0, bz, cx, 0, cz, ax, 0, az, cx, 0, cz, dx2, 0, dz2);
      pos.push(ax, h, az, cx, h, cz, bx, h, bz, bx, h, bz, cx, h, cz, dx2, h, dz2);
      pos.push(ax, 0, az, ax, h, az, dx2, 0, dz2, ax, h, az, dx2, h, dz2, dx2, 0, dz2);
    }
    mesh = { pos: new Float32Array(pos), count: pos.length / 3 };
  }
  function draw3d() {
    if (!gl || !mesh) return;
    gl.viewport(0, 0, canvas3d.width, canvas3d.height);
    gl.clearColor(0.05, 0.06, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog3d);
    gl.uniformMatrix4fv(uMVP3, false, getMVP3());
    gl.uniform3fv(uColor3, [0.55, 0.62, 0.72]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos3);
    gl.vertexAttribPointer(aPos3, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  /* ---------- 2D paint ---------- */
  function worldToScreen2d(x, y) {
    var sx = (x - cam2d.cx) * cam2d.scale + W / 2;
    var sy = -(y - cam2d.cy) * cam2d.scale + H / 2;
    return { x: sx, y: sy };
  }
  function screenToWorld2d(sx, sy) {
    var x = (sx - W / 2) / cam2d.scale + cam2d.cx;
    var y = -(sy - H / 2) / cam2d.scale + cam2d.cy;
    return { x: x, y: y };
  }
  function draw2d() {
    var c = canvas2d.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#111213';
    c.fillRect(0, 0, W, H);
    /* grid */
    c.strokeStyle = 'rgba(53,54,56,.55)';
    c.lineWidth = 1;
    var step = niceStep(80 / cam2d.scale);
    var x0 = Math.floor((cam2d.cx - W / 2 / cam2d.scale) / step) * step;
    var y0 = Math.floor((cam2d.cy - H / 2 / cam2d.scale) / step) * step;
    var x, y, p1, p2;
    for (x = x0; x < cam2d.cx + W / 2 / cam2d.scale; x += step) {
      p1 = worldToScreen2d(x, cam2d.cy - H / 2 / cam2d.scale);
      p2 = worldToScreen2d(x, cam2d.cy + H / 2 / cam2d.scale);
      c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
    }
    for (y = y0; y < cam2d.cy + H / 2 / cam2d.scale; y += step) {
      p1 = worldToScreen2d(cam2d.cx - W / 2 / cam2d.scale, y);
      p2 = worldToScreen2d(cam2d.cx + W / 2 / cam2d.scale, y);
      c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
    }
    if (rasterImg) {
      var r = worldToScreen2d(bounds.minX, bounds.maxY);
      var r2 = worldToScreen2d(bounds.maxX, bounds.minY);
      try {
        c.drawImage(rasterImg, r.x, r.y, r2.x - r.x, r2.y - r.y);
      } catch (e) {}
    }
    /* segments — AutoCAD model feel */
    c.lineCap = 'round'; c.lineJoin = 'round';
    segs.forEach(function (s) {
      var a = worldToScreen2d(s.x1, s.y1), b = worldToScreen2d(s.x2, s.y2);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
      c.strokeStyle = s.color || '#a9afbb';
      c.lineWidth = 1.4;
      c.stroke();
    });
    /* badge */
    c.fillStyle = 'rgba(17,18,19,.9)';
    c.fillRect(10, 10, 210, 36);
    c.fillStyle = '#f56c0b';
    c.font = '700 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
    c.fillText('READ-ONLY · ' + (ctx.fmt || 'MODEL').toUpperCase(), 16, 26);
    c.fillStyle = '#8890a1';
    c.fillText(segs.length + ' segs · ' + notes.length + ' notes · v' + CadViewer.version, 16, 40);
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var n = raw / p;
    if (n < 1.5) return p;
    if (n < 3.5) return 2 * p;
    if (n < 7.5) return 5 * p;
    return 10 * p;
  }

  function paint() {
    if (!el) return;
    if (viewMode === '3d') draw3d();
    else draw2d();
    projectNotes();
  }
  function resize() {
    if (!wrap) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth || 1; H = wrap.clientHeight || 1;
    canvas2d.width = Math.floor(W * dpr); canvas2d.height = Math.floor(H * dpr);
    canvas2d.style.width = W + 'px'; canvas2d.style.height = H + 'px';
    canvas3d.width = Math.floor(W * dpr); canvas3d.height = Math.floor(H * dpr);
    canvas3d.style.width = W + 'px'; canvas3d.style.height = H + 'px';
  }
  function fitView() {
    var bw = Math.max(1e-6, bounds.maxX - bounds.minX);
    var bh = Math.max(1e-6, bounds.maxY - bounds.minY);
    cam2d.cx = (bounds.minX + bounds.maxX) / 2;
    cam2d.cy = (bounds.minY + bounds.maxY) / 2;
    cam2d.scale = Math.min(W / bw, H / bh) * 0.88;
    cam3d.target = [cam2d.cx, 0, cam2d.cy];
    cam3d.dist = Math.max(4, Math.max(bw, bh) * 1.6);
  }

  /* ---------- notes ---------- */
  function projectNotes() {
    var box = el.querySelector('#cvDots');
    if (!box) return;
    box.innerHTML = '';
    box.style.pointerEvents = 'none';
    notes.forEach(function (n) {
      var p;
      if (viewMode === '2d') p = worldToScreen2d(n.x, n.y);
      else p = projectNote3d(n);
      if (!p) return;
      var d = document.createElement('div');
      d.className = 'ndot' + (selectedNote && selectedNote.id === n.id ? ' sel' : '');
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      d.style.background = n.color || '#3b86f6';
      d.style.pointerEvents = 'auto';
      d.title = (n.author || 'Note') + ': ' + (n.text || '').slice(0, 80);
      d.onclick = function (e) {
        e.stopPropagation();
        selectedNote = n;
        showNotePop(n, p.x, p.y);
        projectNotes();
      };
      box.appendChild(d);
    });
    refreshNoteList();
  }
  function projectNote3d(n) {
    /* approximate with 2d projection of XZ */
    var mvp = getMVP3();
    var x = n.x, y = n.z != null ? n.z : 0.2, z = n.y;
    var cx = mvp[0]*x + mvp[4]*y + mvp[8]*z + mvp[12];
    var cy = mvp[1]*x + mvp[5]*y + mvp[9]*z + mvp[13];
    var cw = mvp[3]*x + mvp[7]*y + mvp[11]*z + mvp[15];
    if (Math.abs(cw) < 1e-6) return null;
    var ndcX = cx / cw, ndcY = cy / cw;
    if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) return null;
    return { x: (ndcX * 0.5 + 0.5) * W, y: (0.5 - ndcY * 0.5) * H };
  }
  function showNotePop(n, sx, sy) {
    var pop = el.querySelector('#cvPop');
    pop.style.display = 'block';
    pop.style.left = Math.min(W - 300, Math.max(8, sx + 14)) + 'px';
    pop.style.top = Math.min(H - 200, Math.max(8, sy + 14)) + 'px';
    pop.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<span style="width:12px;height:12px;border-radius:50%;background:' + esc(n.color || '#3b86f6') + ';border:1px solid #ffffff"></span>' +
        '<b style="flex:1;font-size:12px">' + esc(n.author || 'Note') + '</b>' +
        '<button type="button" class="cvb bad" id="cvDelNote" style="padding:3px 8px">Delete</button>' +
        '<button type="button" class="cvb" id="cvClosePop" style="padding:3px 8px">✕</button></div>' +
      '<label style="font-size:9px;color:#8890a1;display:block;margin-bottom:3px">Author</label>' +
      '<input id="cvAuthor" value="' + esc(n.author || '') + '">' +
      '<label style="font-size:9px;color:#8890a1;display:block;margin:8px 0 3px">Message</label>' +
      '<textarea id="cvText">' + esc(n.text || '') + '</textarea>' +
      '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap" id="cvColors"></div>' +
      '<button type="button" class="cvb ok" id="cvSaveNote" style="width:100%;margin-top:10px">Update note</button>' +
      '<div style="font:600 9px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#74767b;margin-top:6px">' + esc(n.ts || '') + '</div>';
    NOTE_COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'width:18px;height:18px;border-radius:50%;border:2px solid ' + (n.color === c ? '#ffffff' : 'transparent') + ';background:' + c + ';cursor:pointer';
      b.onclick = function () { n.color = c; ctx.dirty = true; showNotePop(n, sx, sy); projectNotes(); paint(); };
      pop.querySelector('#cvColors').appendChild(b);
    });
    pop.querySelector('#cvClosePop').onclick = function () { selectedNote = null; hidePop(); projectNotes(); };
    pop.querySelector('#cvDelNote').onclick = function () {
      notes = notes.filter(function (x) { return x.id !== n.id; });
      selectedNote = null; hidePop(); ctx.dirty = true; paint();
    };
    pop.querySelector('#cvSaveNote').onclick = function () {
      n.author = pop.querySelector('#cvAuthor').value.trim() || 'Anon';
      n.text = pop.querySelector('#cvText').value;
      n.ts = new Date().toLocaleString();
      ctx.dirty = true; hidePop(); selectedNote = null; paint();
      setStatus('Note updated — click Save notes to persist');
    };
  }
  function hidePop() {
    var pop = el.querySelector('#cvPop');
    if (pop) pop.style.display = 'none';
  }
  function refreshNoteList() {
    var list = el.querySelector('#cvNoteList');
    el.querySelector('#cvNoteCount').textContent = String(notes.length);
    if (!notes.length) {
      list.innerHTML = '<div style="color:#74767b;padding:8px;font-size:11px;line-height:1.4">No notes yet. Click <b style="color:#f56c0b">● Add note</b>, then click the drawing.</div>';
      return;
    }
    list.innerHTML = notes.map(function (n, i) {
      return '<div data-i="' + i + '" style="display:flex;gap:8px;padding:8px;border-radius:8px;cursor:pointer;margin:2px 0;background:' +
        (selectedNote && selectedNote.id === n.id ? '#1f395f' : '#1b1c1d') + ';border:1px solid #262728">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + esc(n.color) + ';margin-top:3px;flex-shrink:0"></span>' +
        '<div style="min-width:0;flex:1"><div style="font:700 11px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e6ebf3">' + esc(n.author || 'Note') + '</div>' +
        '<div style="font:600 10px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8890a1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc((n.text || '').slice(0, 60)) + '</div></div></div>';
    }).join('');
    list.querySelectorAll('[data-i]').forEach(function (row) {
      row.onclick = function () {
        selectedNote = notes[+row.getAttribute('data-i')];
        var p = viewMode === '2d' ? worldToScreen2d(selectedNote.x, selectedNote.y) : projectNote3d(selectedNote);
        if (p) showNotePop(selectedNote, p.x, p.y);
        projectNotes();
      };
    });
  }

  /* ---------- input ---------- */
  function activeCanvas() { return viewMode === '3d' ? canvas3d : canvas2d; }
  function onDown(e) {
    dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    try { activeCanvas().setPointerCapture(e.pointerId); } catch (err) {}
    if (tool === 'note' && e.button === 0) {
      var rect = wrap.getBoundingClientRect();
      var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      var w = viewMode === '2d' ? screenToWorld2d(sx, sy) : { x: cam3d.target[0], y: cam3d.target[2] };
      var n = {
        id: uid(),
        x: w.x, y: w.y, z: 0.25,
        color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
        author: (typeof global.currentUserName === 'function' ? global.currentUserName() : null) ||
                (global.CURRENT_USER && global.CURRENT_USER.name) || 'Team',
        text: '',
        ts: new Date().toLocaleString()
      };
      notes.push(n);
      selectedNote = n;
      ctx.dirty = true;
      showNotePop(n, sx, sy);
      paint();
      dragging = false;
      setStatus('Note placed — write a message, then Save notes');
      return;
    }
  }
  function onMove(e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    lastX = e.clientX; lastY = e.clientY;
    if (viewMode === '2d') {
      cam2d.cx -= dx / cam2d.scale;
      cam2d.cy += dy / cam2d.scale;
    } else {
      cam3d.theta += dx * 0.01;
      cam3d.phi = clamp(cam3d.phi - dy * 0.01, 0.08, Math.PI - 0.08);
    }
    paint();
  }
  function onUp() { dragging = false; }
  function onWheel(e) {
    e.preventDefault();
    if (viewMode === '2d') {
      var f = e.deltaY > 0 ? 0.9 : 1.12;
      cam2d.scale = clamp(cam2d.scale * f, 0.5, 50000);
    } else {
      cam3d.dist = clamp(cam3d.dist * (e.deltaY > 0 ? 1.1 : 0.9), 1, 200);
    }
    paint();
  }

  /* ---------- parsers ---------- */
  function loadDxf(text) {
    segs = []; rasterImg = null; mesh = null;
    var model = null;
    if (typeof global.dxfParse === 'function') {
      try { model = global.dxfParse(text); } catch (e) { model = null; }
    }
    if (!model) model = miniDxf(text);
    var ents = (model && model.entities) || [];
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    function track(x, y) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    function add(x1, y1, x2, y2, layer) {
      track(x1, y1); track(x2, y2);
      segs.push({ x1: x1, y1: y1, x2: x2, y2: y2, layer: layer || '0', color: layerColor(layer) });
    }
    ents.forEach(function (e) {
      if (e.type === 'LINE' && e.x1 != null) add(e.x1, e.y1, e.x2, e.y2, e.layerName);
      else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.pts && e.pts.length > 1) {
        for (var i = 0; i < e.pts.length - 1; i++) add(e.pts[i][0], e.pts[i][1], e.pts[i+1][0], e.pts[i+1][1], e.layerName);
        if (e.closed && e.pts.length > 2) {
          var a = e.pts[e.pts.length-1], b = e.pts[0];
          add(a[0], a[1], b[0], b[1], e.layerName);
        }
      } else if (e.type === 'CIRCLE' && e.r) {
        var seg = 36, j;
        for (j = 0; j < seg; j++) {
          var a1 = j * 2 * Math.PI / seg, a2 = (j + 1) * 2 * Math.PI / seg;
          add(e.cx + e.r * Math.cos(a1), e.cy + e.r * Math.sin(a1), e.cx + e.r * Math.cos(a2), e.cy + e.r * Math.sin(a2), e.layerName);
        }
      }
    });
    if (!segs.length) return 0;
    bounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    buildMeshFromSegs();
    return segs.length;
  }
  function layerColor(name) {
    var n = String(name || '0'), h = 0, i;
    for (i = 0; i < n.length; i++) h = (h * 33 + n.charCodeAt(i)) % 360;
    var r = 120 + Math.floor(100 * Math.abs(Math.sin(h)));
    var g = 120 + Math.floor(100 * Math.abs(Math.sin(h + 2)));
    var b = 120 + Math.floor(100 * Math.abs(Math.sin(h + 4)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function miniDxf(text) {
    var lines = String(text).split(/\r\n|\r|\n/);
    var ents = [], i, code, val, ent = null, section = '';
    function flush() {
      if (!ent) return;
      if (ent.type === 'LINE' || ent.type === 'CIRCLE' || ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') ents.push(ent);
      ent = null;
    }
    for (i = 0; i + 1 < lines.length; i += 2) {
      code = parseInt(String(lines[i]).trim(), 10);
      val = String(lines[i + 1] != null ? lines[i + 1] : '').trim();
      if (isNaN(code)) { i--; continue; }
      if (code === 0) {
        if (val === 'SECTION') { section = 'sec'; flush(); continue; }
        if (val === 'ENDSEC') { section = ''; flush(); continue; }
        if (val === 'EOF') break;
        if (section === 'ENTS' || section === 'sec') {
          if (val === 'ENTITIES') { section = 'ENTS'; continue; }
          flush();
          if (val === 'LINE' || val === 'CIRCLE' || val === 'LWPOLYLINE' || val === 'POLYLINE' || val === 'VERTEX' || val === 'SEQEND') {
            ent = { type: val, pts: [] };
            if (val === 'SEQEND') flush();
          }
        }
        continue;
      }
      if (!ent) {
        if (code === 2 && val === 'ENTITIES') section = 'ENTS';
        continue;
      }
      var n = parseFloat(val);
      if (code === 8) ent.layerName = val;
      else if (ent.type === 'LINE') {
        if (code === 10) ent.x1 = n; else if (code === 20) ent.y1 = n;
        else if (code === 11) ent.x2 = n; else if (code === 21) ent.y2 = n;
      } else if (ent.type === 'CIRCLE') {
        if (code === 10) ent.cx = n; else if (code === 20) ent.cy = n; else if (code === 40) ent.r = n;
      } else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        if (code === 10) ent.pts.push([n, 0]);
        else if (code === 20 && ent.pts.length) ent.pts[ent.pts.length - 1][1] = n;
        else if (code === 70) ent.closed = ((parseInt(val, 10) || 0) & 1) === 1;
      } else if (ent.type === 'VERTEX') {
        if (code === 10) ent.x = n; else if (code === 20) ent.y = n;
      }
    }
    flush();
    var out = [], lastPoly = null;
    ents.forEach(function (e) {
      if (e.type === 'VERTEX') { if (lastPoly) lastPoly.pts.push([e.x || 0, e.y || 0]); }
      else if (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE') { lastPoly = e; out.push(e); }
      else { lastPoly = null; out.push(e); }
    });
    return { entities: out };
  }
  function loadObj(text) {
    segs = []; rasterImg = null;
    var verts = [], faces = [];
    String(text).split(/\r\n|\r|\n/).forEach(function (line) {
      var p = line.trim().split(/\s+/);
      if (p[0] === 'v' && p.length >= 4) verts.push([+p[1], +p[2], +p[3]]);
      if (p[0] === 'f') {
        var idx = [];
        for (var i = 1; i < p.length; i++) idx.push(parseInt(p[i].split('/')[0], 10) - 1);
        if (idx.length >= 3) faces.push(idx);
      }
    });
    if (!verts.length) return 0;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, i, v;
    for (i = 0; i < verts.length; i++) {
      v = verts[i];
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[2] < minY) minY = v[2]; if (v[2] > maxY) maxY = v[2];
      /* also wireframe edges in 2D (XZ) */
    }
    faces.forEach(function (f) {
      for (var j = 0; j < f.length; j++) {
        var a = verts[f[j]], b = verts[f[(j + 1) % f.length]];
        if (!a || !b) continue;
        segs.push({ x1: a[0], y1: a[2], x2: b[0], y2: b[2], layer: 'OBJ', color: '#7db0fc' });
      }
    });
    var pos = [];
    faces.forEach(function (f) {
      for (var t = 1; t + 1 < f.length; t++) {
        var a = verts[f[0]], b = verts[f[t]], c = verts[f[t + 1]];
        if (!a || !b || !c) continue;
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      }
    });
    mesh = pos.length ? { pos: new Float32Array(pos), count: pos.length / 3 } : null;
    bounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    if (!segs.length && verts.length) {
      /* point cloud fallback as tiny crosses */
      verts.forEach(function (v) {
        segs.push({ x1: v[0] - 0.01, y1: v[2], x2: v[0] + 0.01, y2: v[2], layer: 'OBJ', color: '#7db0fc' });
      });
    }
    return faces.length || verts.length;
  }
  function loadStl(buf) {
    segs = []; rasterImg = null;
    var u8 = new Uint8Array(buf);
    var pos = [], minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    function track(x, z) {
      if (x < minX) minX = x; if (z < minY) minY = z;
      if (x > maxX) maxX = x; if (z > maxY) maxY = z;
    }
    /* binary STL: 80 header + uint32 count */
    var isAscii = false;
    try {
      var head = String.fromCharCode.apply(null, u8.subarray(0, Math.min(80, u8.length)));
      if (/^solid\s/i.test(head) && buf.byteLength < 1000000) isAscii = /facet/i.test(String.fromCharCode.apply(null, u8.subarray(0, Math.min(200, u8.length))));
    } catch (e) {}
    if (isAscii) {
      var text = '';
      for (var i = 0; i < u8.length; i++) text += String.fromCharCode(u8[i]);
      var verts = text.match(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g) || [];
      var trip = [];
      verts.forEach(function (line) {
        var m = line.match(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/);
        if (m) trip.push([+m[1], +m[2], +m[3]]);
      });
      for (var t = 0; t + 2 < trip.length; t += 3) {
        var a = trip[t], b = trip[t+1], c = trip[t+2];
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        track(a[0], a[2]); track(b[0], b[2]); track(c[0], c[2]);
        segs.push({ x1: a[0], y1: a[2], x2: b[0], y2: b[2], layer: 'STL', color: '#86ef9f' });
        segs.push({ x1: b[0], y1: b[2], x2: c[0], y2: c[2], layer: 'STL', color: '#86ef9f' });
        segs.push({ x1: c[0], y1: c[2], x2: a[0], y2: a[2], layer: 'STL', color: '#86ef9f' });
      }
    } else {
      var dv = new DataView(buf);
      if (buf.byteLength < 84) return 0;
      var nTri = dv.getUint32(80, true);
      var off = 84, ti;
      for (ti = 0; ti < nTri && off + 50 <= buf.byteLength; ti++) {
        off += 12; /* normal */
        var ax = dv.getFloat32(off, true), ay = dv.getFloat32(off+4, true), az = dv.getFloat32(off+8, true); off += 12;
        var bx = dv.getFloat32(off, true), by = dv.getFloat32(off+4, true), bz = dv.getFloat32(off+8, true); off += 12;
        var cx = dv.getFloat32(off, true), cy = dv.getFloat32(off+4, true), cz = dv.getFloat32(off+8, true); off += 12;
        off += 2; /* attr */
        pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        track(ax, az); track(bx, bz); track(cx, cz);
        segs.push({ x1: ax, y1: az, x2: bx, y2: bz, layer: 'STL', color: '#86ef9f' });
        segs.push({ x1: bx, y1: bz, x2: cx, y2: cz, layer: 'STL', color: '#86ef9f' });
        segs.push({ x1: cx, y1: cz, x2: ax, y2: az, layer: 'STL', color: '#86ef9f' });
      }
    }
    mesh = pos.length ? { pos: new Float32Array(pos), count: pos.length / 3 } : null;
    bounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    return mesh ? mesh.count / 3 : 0;
  }
  function loadRaster(dataUrl, name) {
    segs = []; mesh = null;
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        rasterImg = img;
        var w = img.naturalWidth || 10, h = img.naturalHeight || 10;
        bounds = { minX: 0, maxX: w, minY: 0, maxY: h };
        /* border segs for 3D frame */
        segs = [
          { x1: 0, y1: 0, x2: w, y2: 0, layer: 'IMG', color: '#74767b' },
          { x1: w, y1: 0, x2: w, y2: h, layer: 'IMG', color: '#74767b' },
          { x1: w, y1: h, x2: 0, y2: h, layer: 'IMG', color: '#74767b' },
          { x1: 0, y1: h, x2: 0, y2: 0, layer: 'IMG', color: '#74767b' }
        ];
        buildMeshFromSegs();
        resolve(1);
      };
      img.onerror = function () { resolve(0); };
      img.src = dataUrl;
    });
  }

  /* ---------- upload / open ---------- */
  function onUpload(e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    loadFile(f);
  }
  function loadFile(f) {
    var name = f.name || 'file';
    var base = name.replace(/\.[^.]+$/, '');
    setStatus('Loading ' + name + '…');
    if (/\.dxf$/i.test(name) || /\.txt$/i.test(name)) {
      var r = new FileReader();
      r.onload = function () {
        ctx.fmt = 'dxf';
        var n = loadDxf(String(r.result));
        fitView(); paint();
        setStatus(n ? ('DXF · ' + n + ' segments · read-only') : 'No LINE geometry in DXF');
        el.querySelector('#cvTitle').textContent = base;
      };
      r.readAsText(f); return;
    }
    if (/\.dwg$/i.test(name)) {
      var rd = new FileReader();
      rd.onload = function () {
        ctx.fmt = 'dwg';
        if (location.protocol === 'file:' || global.__MUSE_FILE_ORIGIN) {
          setStatus('DWG needs http://localhost — run ./start-muse.sh');
          toast('Open Muse Live via ./start-muse.sh for DWG');
          return;
        }
        var convert = global.museDwgToDxf;
        if (typeof convert !== 'function') {
          setStatus('LibreDWG not available');
          return;
        }
        setStatus('Parsing DWG…');
        convert(rd.result).then(function (dxf) {
          if (dxf && dxf.length > 40) {
            var n = loadDxf(dxf);
            fitView(); paint();
            setStatus(n ? ('DWG → ' + n + ' segments · read-only') : 'DWG converted but empty');
            el.querySelector('#cvTitle').textContent = base;
          } else {
            setStatus('Could not parse DWG');
            toast('DWG parse failed — try DXF export from AutoCAD');
          }
        });
      };
      rd.readAsArrayBuffer(f); return;
    }
    if (/\.obj$/i.test(name)) {
      var ro = new FileReader();
      ro.onload = function () {
        ctx.fmt = 'obj';
        var n = loadObj(String(ro.result));
        fitView(); setMode('3d'); paint();
        setStatus(n ? ('OBJ · ' + n + ' faces · read-only') : 'Empty OBJ');
        el.querySelector('#cvTitle').textContent = base;
      };
      ro.readAsText(f); return;
    }
    if (/\.stl$/i.test(name)) {
      var rs = new FileReader();
      rs.onload = function () {
        ctx.fmt = 'stl';
        var n = loadStl(rs.result);
        fitView(); setMode('3d'); paint();
        setStatus(n ? ('STL · ' + n + ' tris · read-only') : 'Empty STL');
        el.querySelector('#cvTitle').textContent = base;
      };
      rs.readAsArrayBuffer(f); return;
    }
    if (/\.(png|jpe?g|webp|gif)$/i.test(name) || (f.type && f.type.indexOf('image/') === 0)) {
      var ri = new FileReader();
      ri.onload = function () {
        ctx.fmt = 'image';
        loadRaster(ri.result, name).then(function (ok) {
          fitView(); setMode('2d'); paint();
          setStatus(ok ? 'Image plan · read-only notes' : 'Image failed');
          el.querySelector('#cvTitle').textContent = base;
        });
      };
      ri.readAsDataURL(f); return;
    }
    if (/\.(dwf|dwfx|x_t|x_b|stp|step|vwx)$/i.test(name)) {
      toast(name.split('.').pop().toUpperCase() + ' is not supported in-browser — export DXF/OBJ/STL from your CAD app');
      setStatus('Unsupported format · use DXF, DWG, OBJ, or STL');
      return;
    }
    if (/\.pdf$/i.test(name)) {
      toast('PDF: use the Site Survey CAD upload path for sheet render, or export a PNG/DXF');
      setStatus('PDF not opened in lightweight viewer — prefer PNG/DXF');
      return;
    }
    toast('Supported: DXF, DWG, OBJ, STL, images');
  }
  function toast(msg) {
    if (typeof global.toast === 'function') global.toast(msg);
    else setStatus(msg);
  }

  function saveNotes() {
    if (typeof ctx.onSaveNotes === 'function') {
      ctx.onSaveNotes({ notes: notes.slice() });
      ctx.dirty = false;
      setStatus('Notes saved');
      toast('CAD notes saved');
    } else {
      try {
        localStorage.setItem('muselive_cadnotes_' + (ctx.key || 'x') + '_' + (ctx.planId || 'p'), JSON.stringify(notes));
        ctx.dirty = false;
        setStatus('Notes saved locally');
      } catch (e) { toast('Could not save notes'); }
    }
  }

  function openViewer(opts) {
    opts = opts || {};
    ensureShell();
    ctx.key = opts.key || null;
    ctx.planId = opts.planId || null;
    ctx.title = opts.title || 'CAD Viewer';
    ctx.onSaveNotes = opts.onSaveNotes || null;
    ctx.dirty = false;
    ctx.fmt = opts.fmt || '';
    notes = (opts.notes && opts.notes.slice) ? opts.notes.slice() : [];
    selectedNote = null; hidePop();
    segs = []; mesh = null; rasterImg = null;
    lockLandscape(true);
    el.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (isPhoneView()) {
      try { el.classList.add('cv-force-land'); } catch (eF) {}
      toast('CAD viewer — landscape');
    }
    el.querySelector('#cvTitle').textContent = ctx.title;
    el.querySelector('#cvMeta').textContent = 'READ-ONLY · NOTES · v' + CadViewer.version;
    tool = 'orbit';
    el.querySelectorAll('[data-tool]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tool') === 'orbit');
    });
    setMode(opts.viewMode === '3d' ? '3d' : '2d');
    setTimeout(function () { try { resize(); fitView(); paint(); } catch (eR) {} }, 80);
    setTimeout(function () { try { resize(); paint(); } catch (eR2) {} }, 320);

    function done(msg) {
      resize(); fitView(); paint();
      setStatus(msg || 'Ready · read-only');
    }

    if (opts.dxfText) {
      ctx.fmt = 'dxf';
      var n = loadDxf(opts.dxfText);
      done(n ? ('DXF · ' + n + ' segments') : 'Empty DXF');
    } else if (opts.dwgB64 && typeof global.museDwgB64ToDxf === 'function') {
      ctx.fmt = 'dwg';
      setStatus('Parsing DWG…');
      global.museDwgB64ToDxf(opts.dwgB64).then(function (dxf) {
        if (dxf) {
          var n2 = loadDxf(dxf);
          done(n2 ? ('DWG · ' + n2 + ' segments') : 'DWG empty');
        } else done('DWG parse failed — use ./start-muse.sh + DXF');
      });
    } else if (opts.objText) {
      ctx.fmt = 'obj';
      loadObj(opts.objText);
      setMode('3d');
      done('OBJ loaded');
    } else if (opts.stlBuffer) {
      ctx.fmt = 'stl';
      loadStl(opts.stlBuffer);
      setMode('3d');
      done('STL loaded');
    } else if (opts.img) {
      ctx.fmt = 'image';
      loadRaster(opts.img).then(function () { done('Image plan'); });
    } else if (opts.seedDxfText) {
      ctx.fmt = 'dxf';
      loadDxf(opts.seedDxfText);
      done('Seed drawing');
    } else {
      /* empty board for notes only */
      bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
      segs = [
        { x1: -5, y1: 0, x2: 5, y2: 0, color: '#424346' },
        { x1: 0, y1: -5, x2: 0, y2: 5, color: '#424346' }
      ];
      done('Empty board — upload DXF / DWG / OBJ / STL');
    }
  }
  function closeViewer(ask) {
    if (!el || el.style.display === 'none') return;
    if (ask && ctx.dirty) {
      if (!confirm('Close viewer? Unsaved notes will be lost unless you click Save notes.')) return;
    }
    el.style.display = 'none';
    document.body.style.overflow = '';
    lockLandscape(false);
  }

  global.CadViewer = CadViewer;
  /* back-compat alias so old CAD3D.open call sites open the read-only viewer */
  global.CAD3D = {
    open: function (opts) {
      opts = opts || {};
      var notes = opts.notes || (opts.scene && opts.scene.notes) ||
        (opts.cad3d && opts.cad3d.notes) || [];
      openViewer({
        key: opts.key,
        planId: opts.planId,
        title: opts.title,
        dxfText: opts.dxfText || opts.seedDxfText,
        dwgB64: opts.dwgB64,
        objText: opts.objText,
        stlBuffer: opts.stlBuffer || null,
        img: opts.img || null,
        viewMode: opts.viewMode || (opts.objText || opts.stlBuffer ? '3d' : '2d'),
        notes: notes,
        onSaveNotes: opts.onSaveNotes || (opts.onSave ? function (payload) {
          opts.onSave({
            cad3d: { v: 1, readOnly: true, notes: payload.notes },
            notes: payload.notes
          });
        } : null)
      });
    },
    close: closeViewer,
    version: CadViewer.version + '-compat'
  };
})(typeof window !== 'undefined' ? window : this);
