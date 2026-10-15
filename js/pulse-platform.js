/**
 * Pulse platform client — talks to apps/api (sync, assistant proxy, integrations).
 * Load after config; no secrets. ES5-friendly.
 */
(function (global) {
  'use strict';

  var DEFAULT_API =
    (global.NBC_PULSE_CONFIG && global.NBC_PULSE_CONFIG.API_BASE) ||
    (global.location && global.location.protocol.indexOf('http') === 0
      ? global.location.origin
      : 'http://localhost:8787');

  function apiBase() {
    try {
      var c = global.NBC_PULSE_CONFIG || {};
      if (c.API_BASE) return String(c.API_BASE).replace(/\/$/, '');
    } catch (e) {}
    return String(DEFAULT_API).replace(/\/$/, '');
  }

  function token() {
    try {
      var t = localStorage.getItem('nbcpulse_session');
      if (t) return t;
    } catch (e) {}
    // hash from OIDC redirect
    try {
      var h = global.location && global.location.hash;
      if (h && h.indexOf('pulse_token=') >= 0) {
        var m = /pulse_token=([^&]+)/.exec(h);
        if (m) {
          var tok = decodeURIComponent(m[1]);
          localStorage.setItem('nbcpulse_session', tok);
          return tok;
        }
      }
    } catch (e2) {}
    return '';
  }

  function headers(extra) {
    var h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    var t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  function req(method, path, body, extraHeaders) {
    var url = apiBase() + path;
    var opt = { method: method, headers: headers(extraHeaders), credentials: 'include' };
    if (body != null) opt.body = JSON.stringify(body);
    return fetch(url, opt).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          var err = new Error((j.error && j.error.message) || 'HTTP ' + r.status);
          err.status = r.status;
          err.body = j;
          throw err;
        }
        j.__etag = r.headers.get('ETag');
        j.__version = r.headers.get('X-Pulse-Version');
        return j;
      });
    });
  }

  var pulsePlatform = {
    apiBase: apiBase,
    token: token,
    setToken: function (t) {
      try {
        localStorage.setItem('nbcpulse_session', t || '');
      } catch (e) {}
    },
    clearToken: function () {
      try {
        localStorage.removeItem('nbcpulse_session');
      } catch (e) {}
    },
    health: function () {
      return req('GET', '/healthz');
    },
    devLogin: function () {
      return req('POST', '/api/v1/auth/dev-login', {}).then(function (s) {
        if (s.accessToken) pulsePlatform.setToken(s.accessToken);
        return s;
      });
    },
    me: function () {
      return req('GET', '/api/v1/me');
    },
    aiStatus: function () {
      return req('GET', '/api/v1/ai/status');
    },
    aiGenerate: function (opts) {
      return req('POST', '/api/v1/ai/generate', opts || {});
    },
    pullProduction: function (slug) {
      return req('GET', '/api/v1/productions/' + encodeURIComponent(slug));
    },
    pushProduction: function (slug, blob, opts) {
      opts = opts || {};
      var h = {};
      if (opts.etag) h['If-Match'] = opts.etag;
      if (opts.idempotencyKey) h['Idempotency-Key'] = opts.idempotencyKey;
      return req('PUT', '/api/v1/productions/' + encodeURIComponent(slug), {
        blob: blob,
        schemaVersion: opts.schemaVersion || 31
      }, h);
    },
    syncCalendar: function (slug, body) {
      return req(
        'POST',
        '/api/v1/integrations/graph/calendar/sync',
        Object.assign({ slug: slug }, body || {})
      );
    },
    xytechPush: function (body) {
      return req('POST', '/api/v1/integrations/xytech/push', body || {});
    },
    /** Ensure session when DEV_AUTH_BYPASS is on */
    ensureSession: function () {
      if (token()) return Promise.resolve({ ok: true });
      return pulsePlatform.devLogin().catch(function () {
        return { ok: false };
      });
    }
  };

  global.pulsePlatform = pulsePlatform;
})(typeof window !== 'undefined' ? window : global);
