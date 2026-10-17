/* Shared helpers for the ops pages. */
(function () {
  try { var p = localStorage.getItem('museTheme'); if (p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark'); } catch (e) {}
  window.esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  window.api = function (path, opts) {
    return fetch(path, Object.assign({ credentials: 'include', cache: 'no-store' }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; });
    });
  };
  window.header = function (current) {
    var tabs = [['index.html', 'Overview'], ['health.html', 'Health'], ['audit.html', 'Audit log'], ['users.html', 'Users']];
    document.body.insertAdjacentHTML('afterbegin', '<header class="top"><a href="/" aria-label="Back to Muse Live"><img src="/assets/brand/favicon.svg" alt="Meta" width="28" height="28"></a><b>Muse Live · Ops</b>' +
      '<nav class="tabs" aria-label="Ops">' + tabs.map(function (t) { return '<a href="/ops/' + t[0] + '"' + (t[0] === current ? ' aria-current="page"' : '') + '>' + t[1] + '</a>'; }).join('') + '<a href="/">Back to app</a></nav></header>');
  };
  window.gate = function (j, el) {
    if (j.__status === 403) { el.innerHTML = '<div class="msg neg">This page is for admins. Ask an admin to change your role.</div>'; return false; }
    if (j.__status === 503) { el.innerHTML = '<div class="msg">Shared storage isn’t configured on this deployment yet (MUSE_KV binding). See docs/RUNBOOK.md.</div>'; return false; }
    if (!j.ok) { el.innerHTML = '<div class="msg neg">' + esc(j.error || 'Something went wrong.') + '</div>'; return false; }
    return true;
  };
  window.today = function () { return new Date().toISOString().slice(0, 10); };
})();
