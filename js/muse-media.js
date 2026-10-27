/* Show media on R2: pano photos, caption files, recorded segments, survey
   captures. The bucket is show evidence, not a file dump — kinds are fixed,
   keys carry kind/show/date, and every write is audited server-side.
   Linkage: list() scopes by show prefix for the asset graph, and
   attachToAsset() pins a media key onto an asset record. */
(function (root) {
  'use strict';

  var KINDS = ['pano', 'captions', 'segments', 'survey'];
  var MAX_RAW = 8 * 1024 * 1024;

  function splitDataUrl(dataUrl) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(String(dataUrl || ''));
    if (!m || !m[2]) return null;
    return { contentType: m[1] || 'application/octet-stream', base64: m[3] };
  }

  async function upload(opts) {
    try {
      opts = opts || {};
      if (KINDS.indexOf(opts.kind) < 0) return { ok: false, error: 'Kind is ' + KINDS.join(' | ') + '.' };
      if (!/^[a-z0-9_-]{1,64}$/.test(opts.show || '')) return { ok: false, error: 'Show key is [a-z0-9_-]{1,64}.' };
      var contentType = opts.contentType, base64 = opts.base64;
      if (opts.dataUrl) {
        var parts = splitDataUrl(opts.dataUrl);
        if (!parts) return { ok: false, error: 'Only base64 data URLs can be uploaded.' };
        contentType = contentType || parts.contentType;
        base64 = parts.base64;
      }
      if (!base64 || Math.ceil(String(base64).length * 0.75) > MAX_RAW) return { ok: false, error: 'File is empty or exceeds 8 MB.' };
      var res = await root.fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: opts.kind, show: opts.show, name: opts.name, contentType: contentType, data: base64 }) });
      if (!res.ok) return { ok: false, error: 'Server refused the upload (' + res.status + ').' };
      return await res.json();
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }

  // Survey capture → R2 without touching the survey record (caller links it).
  function uploadSurveyPhoto(show, dataUrl, name) {
    return upload({ kind: 'survey', show: show, dataUrl: dataUrl, name: name });
  }

  async function list(show, kind) {
    try {
      var prefix = kind ? kind + '/' : '';
      if (show) prefix += show + '/';
      if (!prefix) return { ok: false, error: 'Scope the listing by show, kind, or both.' };
      var res = await root.fetch('/api/media?prefix=' + encodeURIComponent(prefix) + '&limit=100');
      if (!res.ok) return { ok: false, error: 'Server refused (' + res.status + ').' };
      return await res.json();
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }

  async function remove(key) {
    try {
      if (!key) return { ok: false, error: 'A key is required.' };
      var res = await root.fetch('/api/media?key=' + encodeURIComponent(key), { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: 'Server refused (' + res.status + ').' };
      return await res.json();
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }

  async function attachToAsset(serial, key) {
    try {
      if (!serial || !key) return { ok: false, error: 'Serial and media key are required.' };
      var res = await root.fetch('/api/assets/' + encodeURIComponent(serial), { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'attach', key: key }) });
      if (!res.ok) return { ok: false, error: 'Server refused (' + res.status + ').' };
      return await res.json();
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
  }

  root.MuseMedia = { version: '0.1.0', KINDS: KINDS.slice(), upload: upload,
    uploadSurveyPhoto: uploadSurveyPhoto, list: list, remove: remove, attachToAsset: attachToAsset };
})(typeof window !== 'undefined' ? window : globalThis);
