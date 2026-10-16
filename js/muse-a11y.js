/* Muse Live — accessibility layer.
   The UI is rendered as HTML strings with inline onclick handlers on <div>/<span> elements;
   this keeps every one of them reachable and operable from the keyboard and labelled for
   screen readers, without touching the rendering code. Runs on load and after re-renders. */
(function () {
  'use strict';
  var NATIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION|VIDEO|AUDIO|DETAILS)$/;
  var FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';

  function humanize(s) {
    return String(s || '').replace(/^(set|render|open|toggle)/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function fix(root) {
    if (!root || !root.querySelectorAll) return;
    // 1 · clickable non-native elements become keyboard buttons (unless they wrap other controls)
    root.querySelectorAll('[role="button"]').forEach(function (el) {
      if (!NATIVE.test(el.tagName) && el.querySelector(FOCUSABLE)) el.setAttribute('role', 'group');
    });
    root.querySelectorAll('[onclick]').forEach(function (el) {
      if (NATIVE.test(el.tagName) || el.hasAttribute('role') || el.closest('#museGate')) return;
      // backdrops / scrims close overlays with the mouse; Escape handles the keyboard
      if (/scrim|backdrop|overlay/i.test((el.id || '') + ' ' + (el.className || '')) && !(el.textContent || '').trim()) return;
      if (el.querySelector(FOCUSABLE)) { if (!el.hasAttribute('tabindex')) el.tabIndex = 0; el.setAttribute('role', 'group'); return; }
      el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    });
    // 2 · icon-only buttons get their tooltip as an accessible name
    root.querySelectorAll('button:not([aria-label]),[role="button"]:not([aria-label])').forEach(function (el) {
      if (!(el.textContent || '').trim() && el.title) el.setAttribute('aria-label', el.title);
    });
    // 3 · unlabelled form controls
    root.querySelectorAll('select:not([aria-label]),input:not([type="hidden"]):not([aria-label]),textarea:not([aria-label])').forEach(function (el) {
      if (el.id && document.querySelector('label[for="' + el.id + '"]')) return;
      if (el.closest('label')) return;
      var name = el.getAttribute('placeholder') || el.title || humanize(el.id) ||
        humanize(((el.getAttribute('onchange') || el.getAttribute('oninput') || '').match(/^([A-Za-z]+)/) || [])[1]);
      if (name) el.setAttribute('aria-label', name);
    });
    // 4 · decorative images without alt text
    root.querySelectorAll('img:not([alt])').forEach(function (img) { img.setAttribute('alt', ''); });
    // 5 · scrollable regions without anything focusable inside become focusable themselves
    root.querySelectorAll('[class*="overflow-y-auto"],[class*="overflow-auto"]').forEach(function (el) {
      if (!el.hasAttribute('tabindex') && !el.querySelector(FOCUSABLE)) el.tabIndex = 0;
    });
  }

  // Enter / Space activate keyboard "buttons" built from non-native elements
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var el = ev.target;
    if (!el || NATIVE.test(el.tagName) || el.getAttribute('role') !== 'button' || !el.hasAttribute('onclick')) return;
    ev.preventDefault();
    el.click();
  }, true);

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    (window.requestIdleCallback || window.requestAnimationFrame)(function () { queued = false; fix(document.body); });
  }
  function start() {
    fix(document.body);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
