/* Muse Live — guided tour.
   A scripted spotlight walk-through: home → Live Streams wall → a show's Streaming tab → Incident Reports
   (Ray-Ban) → Muse Schedule conflicts → Ask Muse (answers live) → a show's Bookings → techbook.
   Two modes: manual (Next / Back) and auto-play (~90 s, timed steps with a progress bar; Space pauses,
   arrows step, Esc ends; pauses itself while the tab is hidden). Every step is announced to screen readers.
   A step whose target is missing still shows its card, centred.
   Start: MuseTour.start({ auto }), the "Take the tour" button on the home header, ?tour=1 (manual) or
   ?tour=auto (the landing page's "Start the 90-second demo"). */
(function (root) {
  'use strict';

  function $(s) { try { return document.querySelector(s); } catch (e) { return null; } }
  function call(fn) { try { fn(); } catch (e) {} }
  function go(view) { call(function () { root.navGo ? root.navGo(view) : root.switchView(view); }); }
  function openShow(key, tab) { call(function () { root.projSubTab[key] = tab; }); go(key); call(function () { root.setProjTab(key, tab); }); }
  function closeMuse() { call(function () { if (root.museaiOpen) root.toggleMuseAi(); }); }
  // The Ray-Ban Display preview, framed over the app for one step (a timer can't open a tab; a click can).
  function glasses(on) {
    var f = $('#mtGlasses');
    if (!on) { if (f) f.remove(); return; }
    if (f) return;
    f = document.createElement('iframe'); f.id = 'mtGlasses'; f.className = 'mt-glasses'; f.title = 'Muse on Ray-Ban Display'; f.src = 'glasses/preview.html';
    document.body.appendChild(f);
  }
  function openGlasses() { root.open('glasses/preview.html', '_blank', 'noopener'); }
  function closeOmni() { call(function () { if (root.omniDrawerOpen) root.closeOmniDrawer(); }); }
  var ASK = 'What happened at the Ray-Ban event, and what did we change afterwards?';
  /* Techbook PDF → a new tab. Browsers only allow new tabs from a recent click, so a click reserves the tab
     up front; in auto-play (no click) the card offers "Open the techbook PDF" once it's built. */
  var pdfUrl = null;
  // The rounded tile (non-transparent background, rounded corners) that holds a heading with this text.
  function cardWith(rootSel, text) {
    var hs = document.querySelectorAll(rootSel + ' h1,' + rootSel + ' h2,' + rootSel + ' h3,' + rootSel + ' h4');
    for (var k = 0; k < hs.length; k++) {
      if (hs[k].textContent.indexOf(text) !== 0) continue;
      for (var e = hs[k].parentElement; e && e !== document.body; e = e.parentElement) {
        var cs = getComputedStyle(e); if (parseFloat(cs.borderTopLeftRadius) > 0 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return e;
      }
    }
    return null;
  }
  function exportTechbook(tab) {
    if (!tab && auto && !paused && ui) { togglePause(); ui.card.querySelector('#mtBody').textContent = 'Building the techbook PDF from live data: locations, departments, pack list, power, fiber and crew…'; } // hold the step until the PDF exists
    call(function () {
      root.downloadTechbook('museaitour', { onPdf: function (doc, name, pages) {
        call(function () { doc.setProperties({ title: name.replace(/_/g, ' ').replace(/\.pdf$/, '') }); });
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        pdfUrl = URL.createObjectURL(doc.output('blob'));
        var ua = navigator.userActivation;
        if (tab && !tab.closed) { tab.location.href = pdfUrl; return; }
        if (ua && ua.isActive && root.open(pdfUrl, '_blank')) { if (auto && paused) togglePause(); return; }
        offerPdf(pages);
      } });
    });
  }
  function openPdfTab() {
    var t = root.open('', '_blank');
    if (!t) return null;
    call(function () { t.document.title = 'Building techbook…'; t.document.body.style.cssText = 'font:16px system-ui;padding:40px;color:#65676B'; t.document.body.textContent = 'Building the techbook PDF from live data…'; });
    return t;
  }
  function offerPdf(pages) {
    if (!ui || i < 0 || STEPS[i].auto !== exportTechbook) return;
    var a = ui.card.querySelector('#mtAction');
    a.hidden = false; a.textContent = 'Open the techbook PDF ↗';
    a.onclick = function () { root.open(pdfUrl, '_blank'); };
    ui.card.querySelector('#mtBody').textContent = 'Your ' + pages + '-page techbook is ready, built from live data a moment ago. Open it in a new tab, or press Next to continue.';
    ui.live.textContent = 'Techbook PDF ready.';
    if (auto && !paused) togglePause();
    call(function () { a.focus({ preventScroll: true }); });
  }
  function askMuse() { var i = $('#museaiInput'); var q = i && i.value ? i.value : ASK; call(function () { root.MuseAgent.ask(q); }); }

  // secs: how long the step stays up in auto-play (null = wait for the viewer).
  var STEPS = [
    { secs: 7, title: 'Welcome to Muse Live', body: 'An operations platform for live events that are broadcast and streamed. In the next 90 seconds: the live stream wall, Muse on Ray-Ban Display, one show\'s end-to-end streaming chain, incident post-mortems, finance, Omni and Muse, the AI agent on comms.',
      before: function () { closeMuse(); closeOmni(); go('dashboard'); call(function () { scrollTo(0, 0); }); }, target: [] },
    { secs: 9, title: 'Today, at a glance', body: 'What is on air right now, live viewers, shows at risk and open incidents. Every number is a shortcut into the detail.',
      before: function () { go('dashboard'); }, target: ['#dashHome'], top: true },
    { secs: 10, title: 'Every live stream, one wall', body: 'Each show\'s program feed with end-to-end health: concurrent viewers, rebuffering ratio, glass-to-glass latency and errors. One glance tells an engineer where to look and an executive whether to worry.',
      before: function () { go('streams'); }, target: ['#streamsHost .ms-tile:has([data-live="1"])', '#streamsHost .ms-tile'], top: true },
    { secs: 10, title: 'Muse on Ray-Ban Display', body: 'The same tally, alerts and Ask Muse on Meta Ray-Ban Display, for engineers on the floor: a glanceable 600 × 600 app built with Meta\'s UI Toolkit, fed by this desktop app every 5 seconds. Swipe with the wristband, pinch to select.',
      before: function () { go('streams'); }, frame: true, target: ['#mtGlasses'], wait: 900, action: { label: 'Open full screen ↗', run: openGlasses } },
    { secs: 11, title: 'Inside a show: the streaming chain', body: 'Encoder → contribution (SRT) → cloud transcode → CDN → viewer, with health at every hop. Below it: the ABR encoding ladder, destinations, captions, loudness and the go-live checklist.',
      before: function () { openShow('museaitour', 'streaming'); }, target: ['#view-museaitour .ms-card:has(.ms-chain)', '#view-museaitour .ms-chain'], wait: 700 },
    { secs: 10, title: 'Incidents that teach', body: 'Blameless post-mortems with impact, timeline, root cause and owned action items. Here: everything that went wrong at the Ray-Ban Meta Gen 3 launch, and what was changed so it can\'t happen twice.',
      before: function () { go('incidents'); setTimeout(function () { call(function () { root.MuseIncidents.query('Ray-Ban'); }); }, 150); }, target: ['#miDetail'], top: true, wait: 600 },
    { secs: 10, title: 'Always on budget', body: 'Finance runs on the same live data as the show: budget against actuals, purchase orders, invoices and vendor payments. Producers stay on budget, vendors get paid on time, and everyone sees the same numbers.',
      before: function () { go('finance'); }, target: [function () { return cardWith('#view-finance', 'Budget vs'); }], top: true, wait: 600 },
    { secs: 16, title: 'Ask Muse anything', body: 'Muse is the live broadcast and streaming agent. It reads every show, stream, incident and booking through tools, cites what it found and proposes changes for a human to confirm. It is answering this one live.',
      before: function () { go('dashboard'); call(function () { if (!root.museaiOpen) root.toggleMuseAi(); }); setTimeout(function () { var i = $('#museaiInput'); if (i) i.value = ASK; }, 200); },
      target: ['#museaiDrawer'], auto: askMuse, action: { label: 'Ask Muse now', run: askMuse } },
    { secs: 10, title: 'Omni: every conversation, per show', body: 'Every email, Teams chat and TOC alert about a show lands in its Omni, linked to the production, purchase order or incident it is about. Nothing gets dropped between inboxes, and everyone on the show is informed from one place.',
      before: function () { closeMuse(); call(function () { root.openOmniForProject('museaitour'); }); }, target: ['#omniDrawer'], wait: 700 },
    { secs: 11, title: 'The techbook, always live', body: 'One click builds the full technical book for a show (locations, departments, pack list, power, fiber, crew) as a PDF, straight from live data. Exporting it for you now.',
      before: function () { closeOmni(); openShow('museaitour', 'overview'); call(function () { scrollTo(0, 0); }); }, target: ['#view-museaitour button[onclick^="downloadTechbook"]', '#view-museaitour'], wait: 600,
      auto: exportTechbook, action: { label: 'Export techbook', run: function () { exportTechbook(openPdfTab()); } } },
    { secs: null, title: 'That\'s Muse Live', body: 'Plan, stream, schedule and learn from every show, with Muse on comms. Keep exploring: you\'re in a read-only guest session, so nothing you change affects anyone else.',
      before: function () { go('dashboard'); call(function () { scrollTo(0, 0); }); }, target: [],
      action: { label: 'How it\'s built', run: function () { location.href = '/about'; } } }
  ];

  var i = -1, ui = null, lastFocus = null;
  var auto = false, paused = false, timer = 0, startedAt = 0, remaining = 0, autoRun = 0;

  function build() {
    if (ui) return ui;
    var spot = document.createElement('div'); spot.className = 'mt-spot'; spot.setAttribute('aria-hidden', 'true');
    var veil = document.createElement('div'); veil.className = 'mt-veil'; veil.setAttribute('aria-hidden', 'true'); // steady dim while a step changes view
    var card = document.createElement('div'); card.className = 'mt-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'mtTitle'); card.setAttribute('aria-describedby', 'mtBody'); card.tabIndex = -1;
    card.innerHTML = '<div class="mt-prog" id="mtProg" hidden><i></i></div><p class="mt-count" id="mtCount"></p><h2 class="mt-title" id="mtTitle"></h2><p class="mt-body" id="mtBody"></p>' +
      '<div class="mt-btns"><button type="button" class="mt-btn" id="mtClose" aria-label="End tour">Skip</button><span class="mt-gap"></span>' +
      '<button type="button" class="mt-btn" id="mtAction" hidden></button><button type="button" class="mt-btn" id="mtPause" hidden>Pause</button>' +
      '<button type="button" class="mt-btn" id="mtBack">Back</button><button type="button" class="mt-btn mt-primary" id="mtNext">Next</button></div>' +
      '<p class="mt-hint" id="mtHint" hidden>Space pauses · ← → step · Esc ends</p>';
    var live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.id = 'mtLive';
    document.body.appendChild(veil); document.body.appendChild(spot); document.body.appendChild(card); document.body.appendChild(live);
    card.querySelector('#mtNext').onclick = function () { step(i + 1); };
    card.querySelector('#mtBack').onclick = function () { step(i - 1); };
    card.querySelector('#mtClose').onclick = end;
    card.querySelector('#mtPause').onclick = togglePause;
    card.addEventListener('keydown', function (e) { // keep focus inside the card
      if (e.key !== 'Tab') return;
      var f = [].slice.call(card.querySelectorAll('button:not([hidden])')); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    if (!track) track = requestAnimationFrame(tick);
    ui = { veil: veil, spot: spot, card: card, live: live, bar: card.querySelector('#mtProg i') };
    return ui;
  }
  function onKey(e) {
    if (i < 0) return;
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape') { e.preventDefault(); end(); return; }
    if (typing) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(i - 1); }
    else if (e.key === ' ' && auto && !(t && t.tagName === 'BUTTON')) { e.preventDefault(); togglePause(); } // a focused button handles Space itself
  }
  function onVisibility() { if (auto && document.hidden && !paused) togglePause(); }

  function targetEl(s) {
    // offsetParent is null for position:fixed (the Muse and Omni drawers), so test the box instead.
    for (var k = 0; k < (s.target || []).length; k++) { var t = s.target[k], el = typeof t === 'function' ? t() : $(t); if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed') && el.getBoundingClientRect().width > 0) return el; }
    return null;
  }
  /* Track the target every frame while the tour is on. One-shot placement goes stale whenever layout
     moves after the measurement (late iframes and fonts, slow machines, ultrawide re-layout) or a view
     re-render replaces the node, so re-resolve and re-place the moment anything shifts. */
  var curEl = null, posKey = '', track = 0, vpKey = '';
  function resolveEl() { if (i >= 0 && !(curEl && curEl.isConnected)) curEl = targetEl(STEPS[i]); return curEl; }
  function tick() {
    track = requestAnimationFrame(tick);
    if (!ui || i < 0) return;
    // A resize reflows the page but keeps the old scroll offset, carrying the target (and the
    // spotlight tracking it) out of view — re-run the step's own scroll whenever the window changes.
    var vp = innerWidth + ',' + innerHeight;
    if (vp !== vpKey) { vpKey = vp; jump(STEPS[i]); }
    var el = resolveEl(), r = el && el.getBoundingClientRect();
    if (r && (r.bottom < 0 || r.top > innerHeight)) jump(STEPS[i]); // left the window (a reflow moved it): scroll back to it
    var k = (r ? [r.left, r.top, r.width, r.height].join() : 'none') + '|' + innerWidth + ',' + innerHeight + ',' + ui.card.offsetWidth + ',' + ui.card.offsetHeight;
    if (k !== posKey) { posKey = k; place(); }
  }
  function place() {
    if (!ui || i < 0) return;
    var el = resolveEl(), card = ui.card, spot = ui.spot, pad = 8;
    var vw = root.innerWidth, vh = root.innerHeight;
    if (!el) { spot.removeAttribute('style'); spot.className = 'mt-spot is-none'; // inline box of the last step would beat the class
      card.style.left = Math.max(16, (vw - card.offsetWidth) / 2) + 'px'; card.style.top = Math.max(16, (vh - card.offsetHeight) / 2) + 'px'; return; }
    // The cut-out is the target's own box and corners, trimmed to the window so its ring always closes,
    // and the card always gets a place of its own beside it. Every number below comes from the window
    // being drawn in right now — nothing fixed — so a phone, a scaled-up laptop and a 4K monitor all
    // get the same arrangement, only at their own size: highlight first, card next to it, both whole.
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el), kid = el.firstElementChild ? getComputedStyle(el.firstElementChild) : null;
    var pt = r.top <= 1 ? 0 : pad, pl = r.left <= 1 ? 0 : pad, pr = r.right >= vw - 1 ? 0 : pad, pb = r.bottom >= vh - 1 ? 0 : pad;
    var cw = card.offsetWidth, ch = card.offsetHeight, edge = 16, gap = 12, min = 32;
    var head = cs.position === 'fixed' ? 0 : headBottom(); // a drawer sits over the banner, nothing to clear
    var top = Math.max(r.top - pt, head), left = Math.max(r.left - pl, 0);
    var h = Math.max(min, Math.min(r.bottom + pb, vh - edge) - top), w = Math.max(min, Math.min(r.right + pr, vw) - left);
    top = Math.min(top, Math.max(0, vh - edge - h)); left = Math.min(left, Math.max(0, vw - w)); // a target at the very edge keeps the minimum cut-out inside the window
    var ct, cl = left;
    if (top + h + gap + ch + edge <= vh) ct = top + h + gap;                              // under the cut-out
    else if (top - gap - ch - edge >= 0) ct = top - gap - ch;                             // over it
    else if (left - gap - cw - edge >= 0) { ct = top; cl = left - gap - cw; }             // tall target, room to its left
    else if (vw - (left + w) - gap - cw - edge >= 0) { ct = top; cl = left + w + gap; }   // …or to its right
    else { h = Math.max(min, vh - edge - ch - gap - top); ct = top + h + gap; }           // neither fits: trim the cut-out, card under it
    ct = Math.min(Math.max(edge, ct), Math.max(edge, vh - ch - edge));
    cl = Math.min(Math.max(edge, cl), Math.max(edge, vw - cw - edge));
    function rad(corner, a, b) { return ((parseFloat(cs[corner]) || (kid && parseFloat(kid[corner])) || 0) + Math.min(a, b)) + 'px'; } // square wrapper of rounded cards → the cards' radius
    spot.className = 'mt-spot'; spot.style.top = top + 'px'; spot.style.left = left + 'px'; spot.style.width = w + 'px'; spot.style.height = h + 'px';
    spot.style.borderRadius = [rad('borderTopLeftRadius', pt, pl), rad('borderTopRightRadius', pt, pr), rad('borderBottomRightRadius', pb, pr), rad('borderBottomLeftRadius', pb, pl)].join(' ');
    card.style.top = ct + 'px'; card.style.left = cl + 'px';
  }

  /* Auto-play clock: one timeout per step; the bar is a CSS width transition over the time left. */
  function clearClock() { clearTimeout(timer); clearTimeout(autoRun); timer = autoRun = 0; }
  function bar(pct, ms) {
    var b = ui && ui.bar; if (!b) return;
    b.style.transition = 'none'; b.style.width = pct + '%';
    if (ms) { void b.offsetWidth; b.style.transition = 'width ' + ms + 'ms linear'; b.style.width = '100%'; }
  }
  function run() {
    var s = STEPS[i]; if (!auto || paused || !s.secs) return;
    startedAt = Date.now();
    bar(100 - remaining / (s.secs * 10), remaining);
    timer = setTimeout(function () { step(i + 1); }, remaining);
  }
  function togglePause() {
    if (!auto || i < 0 || !STEPS[i].secs) return;
    paused = !paused;
    if (paused) { clearTimeout(timer); remaining = Math.max(0, remaining - (Date.now() - startedAt)); bar(100 - remaining / (STEPS[i].secs * 10)); }
    else run();
    var p = ui.card.querySelector('#mtPause'); p.textContent = paused ? 'Play' : 'Pause'; p.setAttribute('aria-pressed', paused ? 'true' : 'false');
    ui.live.textContent = paused ? 'Tour paused.' : 'Tour playing.';
  }

  function step(n) {
    if (n < 0) return;
    if (n >= STEPS.length) { end(); return; }
    build(); i = n; clearClock(); curEl = null; posKey = '';
    var s = STEPS[i], last = i === STEPS.length - 1, count = STEPS.length - 1; // the finale is a bow, not a stop
    glasses(!!s.frame); call(s.before);
    jump(s); // same task as the render: off-screen monitors never start loading
    var c = ui.card;
    c.querySelector('#mtCount').textContent = last ? '' : (auto ? 'Demo · ' : 'Step ') + (i + 1) + ' of ' + count;
    c.querySelector('#mtTitle').textContent = s.title;
    c.querySelector('#mtBody').textContent = s.body;
    c.querySelector('#mtBack').disabled = i === 0;
    c.querySelector('#mtNext').textContent = last ? 'Finish' : 'Next';
    var a = c.querySelector('#mtAction');
    var showAction = s.action && !(auto && s.auto); // auto-play runs it for the viewer
    if (showAction) { a.hidden = false; a.textContent = s.action.label; a.onclick = s.action.run; } else { a.hidden = true; a.onclick = null; }
    var timed = auto && !!s.secs;
    c.querySelector('#mtProg').hidden = !timed;
    c.querySelector('#mtPause').hidden = !timed;
    c.querySelector('#mtHint').hidden = !auto;
    ui.live.textContent = (last ? '' : 'Step ' + (i + 1) + ' of ' + count + ': ') + s.title + '. ' + s.body;
    var de = document.documentElement; de.classList.add('mt-on', 'mt-moving'); // hidden while the view changes, shown once placed
    var wait = s.wait || 300, n0 = i;
    setTimeout(function () {
      if (i !== n0) return;
      var el = jump(s);
      settled(el).then(function () {
        if (i !== n0) return;
        jump(s); place(); de.classList.remove('mt-moving');
        call(function () { de.classList.remove('muse-intro'); }); // the welcome screen hands over to the tour
        var f = c.querySelector(timed ? '#mtPause' : '#mtNext'); call(function () { (f || c).focus({ preventScroll: true }); });
      });
    }, wait);
    if (auto && s.auto) autoRun = setTimeout(function () { call(s.auto); }, wait + 900);
    if (timed) { remaining = s.secs * 1000; if (paused) bar(0); else run(); }
  }
  // Resolves when the target (and anything inside it) has finished sliding or fading in, so the
  // cut-out is measured once, at rest. Capped so a looping animation can't stall the tour.
  function settled(el) {
    var anims = []; try { anims = el ? el.getAnimations({ subtree: true }).filter(function (a) { return a.effect && a.effect.getTiming().iterations !== Infinity; }) : []; } catch (e) {}
    var done = Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); }));
    return Promise.race([done, new Promise(function (r) { setTimeout(r, 900); })]).then(function () { return still(el); });
  }
  // Resolves once the target's box has not moved for 4 frames (late images, monitors, fonts), capped at 1.2 s.
  function still(el) {
    return new Promise(function (res) {
      if (!el) { res(); return; }
      var last = '', same = 0, t0 = Date.now();
      (function check() {
        var r = el.getBoundingClientRect(), k = [r.left, r.top, r.width, r.height].map(Math.round).join();
        same = k === last ? same + 1 : 0; last = k;
        if (same >= 4 || Date.now() - t0 > 1200) res(); else requestAnimationFrame(check);
      })();
    });
  }
  // How much of the top of the window the banner is covering right now: 0 once it has scrolled away
  // (overflow-x on <body> stops it sticking), and never more than a quarter of a short window.
  function headBottom() { var h = document.querySelector('header.sticky'); return Math.max(0, Math.min(h ? h.getBoundingClientRect().bottom : 0, innerHeight / 4)); }
  // Bring the step's target into view instantly (the veil hides the jump): page top for top-anchored steps,
  // otherwise the target's top just under the banner. The target is moved up whenever it is out of view OR
  // sitting too low for the card to fit under it — on a short window that is the only way to show both, and
  // it is what keeps the arrangement the same on every screen instead of depending on how tall the window is.
  function jump(s) {
    var el = targetEl(s);
    call(function () {
      if (s.top && scrollY) scrollTo(0, 0);
      if (!el) return;
      var r = el.getBoundingClientRect(), head = headBottom() + 12, ch = ui ? ui.card.offsetHeight : 0;
      var roomUnder = innerHeight - r.bottom - 12 - ch - 16 >= 0 || r.height + head + 12 + ch + 16 > innerHeight; // no scroll can help a target taller than the window
      if (r.top >= head && r.bottom <= innerHeight && roomUnder) return;
      if (s.top && r.top < innerHeight && roomUnder) return; // the top of the page already shows it
      scrollTo(0, Math.max(0, r.top + scrollY - head)); // on narrow screens a "top" target can sit below the fold
    });
    return el;
  }
  function start(opts) {
    auto = !!(opts && opts.auto); paused = false;
    lastFocus = document.activeElement; step(0);
  }
  function end() {
    clearClock();
    i = -1;
    glasses(false);
    if (ui) { ui.veil.remove(); ui.spot.remove(); ui.card.remove(); ui.live.remove(); ui = null; }
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    cancelAnimationFrame(track); track = 0; curEl = null; posKey = '';
    document.documentElement.classList.remove('mt-on', 'mt-moving');
    if (lastFocus && lastFocus.focus) call(function () { lastFocus.focus(); });
  }

  // "Take the tour" next to the home header actions (rendered by the streaming module).
  function addHomeButton() {
    var host = $('#dashHome .mh-actions');
    if (!host || host.querySelector('.mt-launch')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ms-btn mt-launch'; b.textContent = 'Take the tour';
    b.onclick = function () { start({ auto: true }); }; host.appendChild(b);
  }

  root.MuseTour = { start: start, end: end, steps: STEPS, isPaused: function () { return paused; } };

  function boot() {
    setInterval(addHomeButton, 1500); addHomeButton();
    // The request is kept in sessionStorage because MuseSync may reload the page once on first visit.
    var want = null;
    try {
      var m = /[?&]tour=(1|auto)\b/.exec(location.search);
      if (m) {
        sessionStorage.setItem('muse_tour', m[1]);
        history.replaceState(null, '', location.pathname + location.search.replace(/([?&])tour=(1|auto)\b&?/, '$1').replace(/[?&]$/, '') + location.hash);
      }
      want = sessionStorage.getItem('muse_tour');
    } catch (e) {}
    if (!want) return;
    // Start once shared data has settled and the page has finished loading (the welcome screen covers both).
    var synced = root.MuseSync && root.MuseSync.ready ? root.MuseSync.ready : Promise.resolve();
    var loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(function (r) { root.addEventListener('load', r, { once: true }); });
    Promise.race([Promise.all([synced, loaded]), new Promise(function (r) { setTimeout(r, 10000); })]).then(function () {
      setTimeout(function () {
        try { sessionStorage.removeItem('muse_tour'); } catch (e) {}
        start({ auto: want === 'auto' });
      }, 700);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  else setTimeout(boot, 400);
})(typeof window !== 'undefined' ? window : globalThis);
