/* On-device Charlie helper. No remote call. */
(function (global) {
  'use strict';
  function status() {
    return { status: 'idle', progress: 0, progressText: '', modelId: '', shortModel: '', models: [], lastError: '' };
  }
  function fail() { return Promise.reject(new Error('On-device model is unavailable')); }
  global.CharlieLocal = {
    status: status,
    preferredModel: function () { return ''; },
    ensureEngine: function () { return fail(); },
    warmOnIdle: function () {},
    chat: function () { return fail(); },
    search: function () { return fail(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
