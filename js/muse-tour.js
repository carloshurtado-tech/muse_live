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
  var ASK = 'What happened at the Ray-Ban event, and what did we change afterwards?';
  function askMuse() { var i = $('#museaiInput'); var q = i && i.value ? i.value : ASK; call(function () { root.MuseAgent.ask(q); }); }

  // secs: how long the step stays up in auto-play (null = wait for the viewer).
  var STEPS = [
    { secs: 7, title: 'Welcome to Muse Live', body: 'An operations platform for live events that are broadcast and streamed. In the next 90 seconds: the live stream wall, one show\'s end-to-end streaming chain, incident post-mortems, the resource schedule and Muse, the AI agent on comms.',
      before: function () { closeMuse(); go('dashboard'); call(function () { scrollTo(0, 0); }); }, target: [] },
    { secs: 9, title: 'Today, at a glance', body: 'What is on air right now, live viewers, shows at risk and open incidents. Every number is a shortcut into the detail.',
      before: function () { go('dashboard'); call(function () { scrollTo(0, 0); }); }, target: ['#dashHome', '#view-dashboard section'] },
    { secs: 10, title: 'Every live stream, one wall', body: 'Each show\'s program feed with end-to-end health: concurrent viewers, rebuffering ratio, glass-to-glass latency and errors. One glance tells an engineer where to look and an executive whether to worry.',
      before: function () { go('streams'); }, target: ['#streamsHost .ms-kpis', '#streamsHost'] },
    { secs: 11, title: 'Inside a show: the streaming chain', body: 'Encoder → contribution (SRT) → cloud transcode → CDN → viewer, with health at every hop. Below it: the ABR encoding ladder, destinations, captions, loudness and the go-live checklist.',
      before: function () { openShow('museaitour', 'streaming'); }, target: ['.ms-chain', '.ms-wrap', '#view-museaitour'], wait: 900 },
    { secs: 10, title: 'Incidents that teach', body: 'Blameless post-mortems with impact, timeline, root cause and owned action items. Here: everything that went wrong at the Ray-Ban Meta Gen 3 launch, and what was changed so it can\'t happen twice.',
      before: function () { go('incidents'); setTimeout(function () { call(function () { root.MuseIncidents.query('Ray-Ban'); }); }, 150); }, target: ['#incidentsHost .mi-layout', '#incidentsHost'], wait: 500 },
    { secs: 9, title: 'No more double-booking', body: 'Muse Schedule puts rooms, circuits, encoders, trucks and crew on one timeline. Conflicts are caught as you book, with one-click fixes.',
      before: function () { go('schedule'); setTimeout(function () { call(function () { root.MuseSchedule.panel('conflicts'); }); }, 250); }, target: ['#view-schedule [class*="sc-conf"]', '#view-schedule [class*="sc-kpi"]', '#view-schedule'], wait: 600 },
    { secs: 16, title: 'Ask Muse anything', body: 'Muse is the live broadcast and streaming agent. It reads every show, stream, incident and booking through tools, cites what it found and proposes changes for a human to confirm. It is answering this one live.',
      before: function () { go('dashboard'); call(function () { if (!root.museaiOpen) root.toggleMuseAi(); }); setTimeout(function () { var i = $('#museaiInput'); if (i) i.value = ASK; }, 200); },
      target: ['#museaiDrawer'], auto: askMuse, action: { label: 'Ask Muse now', run: askMuse } },
    { secs: 8, title: 'Bookings, per show', body: 'Every production sees its own bookings, conflicts and crew labor, reconciled against timecards and posted to the cost report.',
      before: function () { closeMuse(); openShow('museailaunch', 'bookings'); }, target: ['#projPane-museailaunch', '#view-museailaunch'], wait: 700 },
    { secs: 8, title: 'The techbook, always live', body: 'One click exports the full technical book for a show (locations, departments, pack list, power, fiber, crew) straight from live data.',
      before: function () { openShow('museaitour', 'overview'); call(function () { scrollTo(0, 0); }); }, target: ['#view-museaitour button[onclick^="downloadTechbook"]', '#view-museaitour'], wait: 600,
      action: { label: 'Export techbook', run: function () { call(function () { root.downloadTechbook('museaitour'); }); } } },
    { secs: null, title: 'That\'s Muse Live', body: 'Plan, stream, schedule and learn from every show, with Muse on comms. Keep exploring: you\'re in a read-only guest session, so nothing you change affects anyone else.',
      before: function () { go('dashboard'); call(function () { scrollTo(0, 0); }); }, target: [],
      action: { label: 'How it\'s built', run: function () { location.href = '/about'; } } }
  ];

  var i = -1, ui = null, lastFocus = null;
  var auto = false, paused = false, timer = 0, startedAt = 0, remaining = 0, autoRun = 0;

  function build() {
    if (ui) return ui;
    var spot = document.createElement('div'); spot.className = 'mt-spot'; spot.setAttribute('aria-hidden', 'true');
    var card = document.createElement('div'); card.className = 'mt-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'mtTitle'); card.setAttribute('aria-describedby', 'mtBody'); card.tabIndex = -1;
    card.innerHTML = '<div class="mt-prog" id="mtProg" hidden><i></i></div><p class="mt-count" id="mtCount"></p><h2 class="mt-title" id="mtTitle"></h2><p class="mt-body" id="mtBody"></p>' +
      '<div class="mt-btns"><button type="button" class="mt-btn" id="mtClose" aria-label="End tour">Skip</button><span class="mt-gap"></span>' +
      '<button type="button" class="mt-btn" id="mtAction" hidden></button><button type="button" class="mt-btn" id="mtPause" hidden>Pause</button>' +
      '<button type="button" class="mt-btn" id="mtBack">Back</button><button type="button" class="mt-btn mt-primary" id="mtNext">Next</button></div>' +
      '<p class="mt-hint" id="mtHint" hidden>Space pauses · ← → step · Esc ends</p>';
    var live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.id = 'mtLive';
    document.body.appendChild(spot); document.body.appendChild(card); document.body.appendChild(live);
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
    root.addEventListener('resize', place); root.addEventListener('scroll', place, true);
    ui = { spot: spot, card: card, live: live, bar: card.querySelector('#mtProg i') };
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
    for (var k = 0; k < (s.target || []).length; k++) { var el = $(s.target[k]); if (el && el.getClientRects().length && el.offsetParent !== null) return el; }
    return null;
  }
  function place() {
    if (!ui || i < 0) return;
    var s = STEPS[i], el = targetEl(s), card = ui.card, spot = ui.spot, pad = 8;
    var vw = root.innerWidth, vh = root.innerHeight;
    if (!el) { spot.className = 'mt-spot is-none'; card.style.left = Math.max(16, (vw - card.offsetWidth) / 2) + 'px'; card.style.top = Math.max(16, (vh - card.offsetHeight) / 2) + 'px'; return; }
    var r = el.getBoundingClientRect();
    var top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad), w = Math.min(vw - left - 4, r.width + pad * 2), h = Math.min(vh - top - 4, r.height + pad * 2);
    spot.className = 'mt-spot'; spot.style.top = top + 'px'; spot.style.left = left + 'px'; spot.style.width = w + 'px'; spot.style.height = h + 'px';
    var cw = card.offsetWidth, ch = card.offsetHeight, ct, cl = Math.min(Math.max(16, left), vw - cw - 16);
    if (top + h + 12 + ch < vh) ct = top + h + 12;
    else if (top - 12 - ch > 0) ct = top - 12 - ch;
    else { ct = vh - ch - 16; cl = vw - cw - 16; } // tall target: park the card in the bottom-right corner
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
    build(); i = n; clearClock();
    var s = STEPS[i];
    call(s.before);
    var c = ui.card;
    c.querySelector('#mtCount').textContent = (auto ? 'Demo · ' : 'Step ') + (i + 1) + ' of ' + STEPS.length;
    c.querySelector('#mtTitle').textContent = s.title;
    c.querySelector('#mtBody').textContent = s.body;
    c.querySelector('#mtBack').disabled = i === 0;
    c.querySelector('#mtNext').textContent = i === STEPS.length - 1 ? 'Finish' : 'Next';
    var a = c.querySelector('#mtAction');
    var showAction = s.action && !(auto && s.auto); // auto-play runs it for the viewer
    if (showAction) { a.hidden = false; a.textContent = s.action.label; a.onclick = s.action.run; } else { a.hidden = true; a.onclick = null; }
    var timed = auto && !!s.secs;
    c.querySelector('#mtProg').hidden = !timed;
    c.querySelector('#mtPause').hidden = !timed;
    c.querySelector('#mtHint').hidden = !auto;
    ui.live.textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length + ': ' + s.title + '. ' + s.body;
    document.documentElement.classList.add('mt-on');
    var wait = s.wait || 300;
    setTimeout(function () {
      var el = targetEl(s);
      if (el) call(function () { el.scrollIntoView({ block: el.offsetHeight > innerHeight * 0.6 ? 'start' : 'center', behavior: 'instant' }); });
      setTimeout(function () { place(); var f = c.querySelector(timed ? '#mtPause' : '#mtNext'); call(function () { (f || c).focus({ preventScroll: true }); }); }, 60);
    }, wait);
    if (auto && s.auto) autoRun = setTimeout(function () { call(s.auto); }, wait + 900);
    if (timed) { remaining = s.secs * 1000; if (paused) bar(0); else run(); }
    place();
  }
  function start(opts) {
    auto = !!(opts && opts.auto); paused = false;
    lastFocus = document.activeElement; step(0);
  }
  function end() {
    clearClock();
    i = -1;
    if (ui) { ui.spot.remove(); ui.card.remove(); ui.live.remove(); ui = null; }
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    root.removeEventListener('resize', place); root.removeEventListener('scroll', place, true);
    document.documentElement.classList.remove('mt-on');
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
    var synced = root.MuseSync && root.MuseSync.ready ? root.MuseSync.ready : Promise.resolve();
    Promise.race([synced, new Promise(function (r) { setTimeout(r, 8000); })]).then(function () {
      setTimeout(function () {
        try { sessionStorage.removeItem('muse_tour'); } catch (e) {}
        start({ auto: want === 'auto' });
      }, 1200);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  else setTimeout(boot, 400);
})(typeof window !== 'undefined' ? window : globalThis);
