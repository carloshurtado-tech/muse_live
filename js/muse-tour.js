/* Muse Live — guided tour.
   A scripted spotlight walk-through for live demos: home → Live Streams wall → a show's Streaming tab →
   Incident Reports (Ray-Ban search) → Muse Schedule conflicts → Ask Muse → a show's Bookings →
   techbook PDF. Next / Back / Esc, arrow keys, focus kept in the tour card, every step announced to
   screen readers. A step whose target is missing still shows its card, centred.
   Start: MuseTour.start(), the "Take the tour" button (dashboard home header / user menu), or ?tour=1. */
(function (root) {
  'use strict';

  function $(s) { try { return document.querySelector(s); } catch (e) { return null; } }
  function call(fn) { try { fn(); } catch (e) {} }
  function go(view) { call(function () { root.navGo ? root.navGo(view) : root.switchView(view); }); }
  function openShow(key, tab) { call(function () { root.projSubTab[key] = tab; }); go(key); call(function () { root.setProjTab(key, tab); }); }

  var STEPS = [
    { title: 'Today, at a glance', body: 'Your home view: what is on air right now, live viewers, shows at risk and open incidents. Every number is a shortcut.',
      before: function () { go('dashboard'); call(function () { scrollTo(0, 0); }); }, target: ['#dashHome', '#view-dashboard section'] },
    { title: 'Every live stream, one wall', body: 'The Live Streams wall shows each show\'s program feed with end-to-end health, viewers, rebuffering and latency. Built for executives and engineers alike.',
      before: function () { go('streams'); }, target: ['#streamsHost .ms-kpis', '#streamsHost'] },
    { title: 'Inside a show: the streaming plan', body: 'Per production: live monitors, the encoder → contribution → cloud → CDN → viewer health chain, the encoding ladder, destinations, captions, loudness and the go-live checklist.',
      before: function () { openShow('museaitour', 'streaming'); }, target: ['.ms-chain', '.ms-wrap', '#view-museaitour'], wait: 900 },
    { title: 'Incident reports that teach', body: 'Blameless post-mortems with impact, timeline, root cause and owned action items. Here: everything that happened at the Ray-Ban Meta Gen 3 launch.',
      before: function () { go('incidents'); setTimeout(function () { call(function () { root.MuseIncidents.query('Ray-Ban'); }); }, 150); }, target: ['#incidentsHost .mi-layout', '#incidentsHost'], wait: 500 },
    { title: 'Muse Schedule: no more double-booking', body: 'Rooms, circuits, encoders, trucks and crew on one timeline. Conflicts are caught as you book, with one-click fixes.',
      before: function () { go('schedule'); setTimeout(function () { call(function () { root.MuseSchedule.panel('conflicts'); }); }, 250); }, target: ['#view-schedule [class*="sc-conf"]', '#view-schedule [class*="sc-kpi"]', '#view-schedule'], wait: 600 },
    { title: 'Ask Muse anything', body: 'Muse is the live broadcast and streaming agent. It reads every show, stream, incident and booking, and proposes changes for you to confirm.',
      before: function () { go('dashboard'); call(function () { if (!root.museaiOpen) root.toggleMuseAi(); }); setTimeout(function () { var i = $('#museaiInput'); if (i) i.value = 'What happened at the Ray-Ban event?'; }, 200); },
      target: ['#museaiDrawer'], action: { label: 'Ask Muse now', run: function () { var i = $('#museaiInput'); var q = i && i.value ? i.value : 'What happened at the Ray-Ban event?'; call(function () { root.MuseAgent.ask(q); }); } } },
    { title: 'Bookings, per show', body: 'Every production sees its own bookings, conflicts and crew labor, reconciled against timecards and posted to the cost report.',
      before: function () { call(function () { if (root.museaiOpen) root.toggleMuseAi(); }); openShow('museailaunch', 'bookings'); }, target: ['#projPane-museailaunch', '#view-museailaunch'], wait: 700 },
    { title: 'The techbook, always live', body: 'One click exports the full technical book for a show (locations, departments, pack list, power, fiber, crew) straight from live data.',
      before: function () { openShow('museaitour', 'overview'); call(function () { scrollTo(0, 0); }); }, target: ['#view-museaitour button[onclick^="downloadTechbook"]', '#view-museaitour'], wait: 600,
      action: { label: 'Export techbook', run: function () { call(function () { root.downloadTechbook('museaitour'); }); } } },
    { title: 'That\'s Muse Live', body: 'Plan, stream, schedule and learn from every show, with Muse on comms. Reset the demo any time from the user menu.',
      before: function () { go('dashboard'); call(function () { scrollTo(0, 0); }); }, target: [] }
  ];

  var i = -1, ui = null, lastFocus = null;

  function build() {
    if (ui) return ui;
    var spot = document.createElement('div'); spot.className = 'mt-spot'; spot.setAttribute('aria-hidden', 'true');
    var card = document.createElement('div'); card.className = 'mt-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'mtTitle'); card.setAttribute('aria-describedby', 'mtBody'); card.tabIndex = -1;
    card.innerHTML = '<p class="mt-count" id="mtCount"></p><h2 class="mt-title" id="mtTitle"></h2><p class="mt-body" id="mtBody"></p>' +
      '<div class="mt-btns"><button type="button" class="mt-btn" id="mtClose" aria-label="End tour">Skip</button><span class="mt-gap"></span>' +
      '<button type="button" class="mt-btn" id="mtAction" hidden></button><button type="button" class="mt-btn" id="mtBack">Back</button><button type="button" class="mt-btn mt-primary" id="mtNext">Next</button></div>';
    var live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.id = 'mtLive';
    document.body.appendChild(spot); document.body.appendChild(card); document.body.appendChild(live);
    card.querySelector('#mtNext').onclick = function () { step(i + 1); };
    card.querySelector('#mtBack').onclick = function () { step(i - 1); };
    card.querySelector('#mtClose').onclick = end;
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); end(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(i - 1); }
      else if (e.key === 'Tab') { // keep focus inside the card
        var f = [].slice.call(card.querySelectorAll('button:not([hidden])')); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    root.addEventListener('resize', place); root.addEventListener('scroll', place, true);
    ui = { spot: spot, card: card, live: live };
    return ui;
  }
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
  function step(n) {
    if (n < 0) return;
    if (n >= STEPS.length) { end(); return; }
    build(); i = n;
    var s = STEPS[i];
    call(s.before);
    var c = ui.card;
    c.querySelector('#mtCount').textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
    c.querySelector('#mtTitle').textContent = s.title;
    c.querySelector('#mtBody').textContent = s.body;
    c.querySelector('#mtBack').disabled = i === 0;
    c.querySelector('#mtNext').textContent = i === STEPS.length - 1 ? 'Finish' : 'Next';
    var a = c.querySelector('#mtAction');
    if (s.action) { a.hidden = false; a.textContent = s.action.label; a.onclick = s.action.run; } else { a.hidden = true; a.onclick = null; }
    ui.live.textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length + ': ' + s.title + '. ' + s.body;
    document.documentElement.classList.add('mt-on');
    setTimeout(function () {
      var el = targetEl(s);
      if (el) call(function () { el.scrollIntoView({ block: el.offsetHeight > innerHeight * 0.6 ? 'start' : 'center', behavior: 'instant' }); });
      setTimeout(function () { place(); c.focus(); }, 60);
    }, s.wait || 300);
    place();
  }
  function start() { lastFocus = document.activeElement; step(0); }
  function end() {
    i = -1;
    if (ui) { ui.spot.remove(); ui.card.remove(); ui.live.remove(); ui = null; }
    root.removeEventListener('resize', place); root.removeEventListener('scroll', place, true);
    document.documentElement.classList.remove('mt-on');
    if (lastFocus && lastFocus.focus) call(function () { lastFocus.focus(); });
  }

  // "Take the tour" next to the home header actions (rendered by the streaming module).
  function addHomeButton() {
    var host = $('#dashHome .mh-actions');
    if (!host || host.querySelector('.mt-launch')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ms-btn mt-launch'; b.textContent = 'Take the tour';
    b.onclick = start; host.appendChild(b);
  }

  root.MuseTour = { start: start, end: end, steps: STEPS };

  function boot() {
    setInterval(addHomeButton, 1500); addHomeButton();
    try { if (/[?&]tour=1\b/.test(location.search)) setTimeout(start, 1800); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  else setTimeout(boot, 400);
})(typeof window !== 'undefined' ? window : globalThis);
