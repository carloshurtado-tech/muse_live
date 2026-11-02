/* Muse Live — hackathon provenance helper (progressive enhancement only).
 *
 * Static markup already carries <span class="hk-dot"> markers. This script
 * only covers headings rendered dynamically by the app bundles: any element
 * with [data-hk] gets the same inline dot prepended as its first child, so
 * the marker stays inside the text flow and follows its label on resize.
 * Safe to run zero or many times; never re-marks an element.
 */
(function () {
  'use strict';

  var LABEL = 'Built during the hackathon (since Oct 26, 2026)';
  var README_URL =
    'https://github.com/carloshurtado-tech/muse_live' +
    '#hackathon-build-new-work-since-oct-26-2026';

  function makeDot() {
    var s = document.createElement('span');
    s.className = 'hk-dot';
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', LABEL);
    s.setAttribute('title', 'Built during the hackathon — see README');
    return s;
  }

  // Dynamic panels rendered by the app bundles (verified against
  // js/muse-streaming.js, js/muse-showcaller.js, js/muse-testfeeds.js).
  // Text-prefix match on purpose: if the markup ever changes, the marker is
  // skipped gracefully instead of breaking the panel.
  var DYNAMIC = [
    { sel: '.ms-page-h h1', text: 'Live Streams' },
    { sel: '#msTestFeeds h3', text: 'Test feeds' },
    { sel: 'h3', text: 'Show Caller proposes' },
  ];

  function markOne(el) {
    if (!el || el.querySelector(':scope > .hk-dot')) return;
    el.insertBefore(makeDot(), el.firstChild);
  }

  function mark(root) {
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    var els = scope.querySelectorAll('[data-hk]');
    for (var i = 0; i < els.length; i++) markOne(els[i]);
    for (var d = 0; d < DYNAMIC.length; d++) {
      var heads = scope.querySelectorAll(DYNAMIC[d].sel);
      for (var j = 0; j < heads.length; j++) {
        var h = heads[j];
        var t = h.textContent || '';
        if (t.indexOf(DYNAMIC[d].text) === 0) markOne(h);
      }
    }
  }

  function start() {
    mark(document);
    // App views render after login; one deferred pass catches them.
    if ('MutationObserver' in window) {
      var seen = 0;
      var obs = new MutationObserver(function () {
        mark(document);
        seen += 1;
        if (seen > 40) obs.disconnect();
      });
      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      setTimeout(function () {
        obs.disconnect();
      }, 15000);
    } else {
      setTimeout(function () {
        mark(document);
      }, 2000);
    }
  }

  window.museHackathonReadme = function () {
    return README_URL;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
