// @ts-check
/* Muse Live — shared storage client (window.MuseSync).
   Talks to /api/kv/:key (Cloudflare KV binding MUSE_KV) so data survives across browsers,
   devices and people.

   API
     MuseSync.get(key)          → Promise<value|null>          read a shared key
     MuseSync.put(key, value)   → void                         debounced write, offline queue, last-write-wins
     MuseSync.on(key, cb)       → unsubscribe()                cb(value, {updated, by}) when another writer changes it (~10 s poll)
     MuseSync.me()              → Promise<{email,name,role,shared}|null>   the signed-in user (for the user chip)
     MuseSync.status()          → {state, enabled, lastSync, pending}
     MuseSync.flush()           → Promise                      push queued writes now

   It also mirrors an allow-list of localStorage keys (incidents, streams, schedule, production
   edits, custom productions) to KV as envelopes {updated, by, data}. On page load the newest copy
   wins: if another device saved something newer, it is applied and the page reloads once so every
   module starts from it. Later remote changes show "Updated by … · Reload" instead of reloading
   under the user's hands. When MUSE_KV isn't configured (503) everything stays local, silently. */
(function (root) {
  'use strict';
  /** @type {any} */ var w = root;
  var MIRROR = ['muselive_incidents_v1', 'muselive_streams_v1', 'muselive_schedule_v1', 'muselive_edits', 'muselive_custom'];
  var META = 'muselive_sync_meta', QUEUE = 'muselive_sync_queue', RELOADED = 'muse_sync_reloaded';
  var POLL_MS = 10000, RETRY_MS = 15000, DEBOUNCE_MS = 1500, MAX_BYTES = 256 * 1024;

  var ls = null; try { ls = root.localStorage; } catch (e) { /* storage blocked */ }
  var nativeSet = ls ? Storage.prototype.setItem : null;
  var enabled = null;            // null = unknown, false = no shared storage / signed out, true = on
  var state = 'idle';            // idle | saving | synced | offline | stale | local
  var staleBy = '', lastSync = 0;
  var timers = {}, watchers = {}, seen = {}, saving = {};
  var mePromise = null;

  function readJSON(k, d) { try { var v = ls && ls.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function writeJSON(k, v) { try { if (ls && nativeSet) nativeSet.call(ls, k, JSON.stringify(v)); } catch (e) { /* quota */ } }
  function kvKey(k) { return ('ls-' + k).toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 64); }
  function signedIn() { try { return document.cookie.indexOf('muse_authed=1') >= 0; } catch (e) { return false; } }

  /* ---------------- low-level HTTP ---------------- */
  function req(method, key, body) {
    return fetch('/api/kv/' + encodeURIComponent(key) + (method === 'PUT' ? '' : '?optional=1'), {
      method: method, credentials: 'include', cache: 'no-store',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? body : undefined
    }).then(function (r) {
      if (r.status === 503 || r.status === 401) { enabled = false; setState('local'); }
      return r;
    });
  }
  function get(key) {
    if (enabled === false) return Promise.resolve(null);
    return req('GET', key).then(function (r) {
      if (!r.ok || r.headers.get('X-Muse-Missing')) return null;
      seen[key] = +(r.headers.get('X-Muse-Updated') || 0);
      return r.json();
    }).catch(function () { setState('offline'); return null; });
  }
  function getWithMeta(key) {
    return req('GET', key).then(function (r) {
      if (!r.ok || r.headers.get('X-Muse-Missing')) return { value: null, updated: 0, by: '', status: r.ok ? 404 : r.status };
      return r.json().then(function (v) { return { value: v, updated: +(r.headers.get('X-Muse-Updated') || 0), by: r.headers.get('X-Muse-By') || '', status: 200 }; });
    });
  }

  /* ---------------- writes: debounce + offline queue ---------------- */
  function queue() { return readJSON(QUEUE, {}); }
  function enqueue(key, text) { var q = queue(); q[key] = text; writeJSON(QUEUE, q); }
  function dequeue(key) { var q = queue(); delete q[key]; writeJSON(QUEUE, q); }
  function send(key, text) {
    if (enabled === false) return Promise.resolve(false);
    return me().then(function (u) {
    if (u && u.role === 'viewer') { dequeue(key); return false; } // read-only session (guest demo): changes stay on this device
    if (text.length > MAX_BYTES) { try { console.warn('[MuseSync] ' + key + ' is larger than 256 KB; kept on this device only.'); } catch (e) { /* noop */ } dequeue(key); return false; }
    setState('saving');
    saving[key] = true; // the poll ignores this key until the PUT answers (own write, not "elsewhere")
    return req('PUT', key, text).then(function (r) {
      if (r.ok) { dequeue(key); lastSync = Date.now(); return r.json().then(function (j) { seen[key] = j.updated || Date.now(); setState(Object.keys(queue()).length ? 'saving' : 'synced'); return true; }); }
      if (r.status === 403) { dequeue(key); setState('synced'); return false; } // read-only role
      enqueue(key, text); setState('offline'); return false;
    }).catch(function () { enqueue(key, text); setState('offline'); return false; })
      .finally(function () { delete saving[key]; }); // after seen[key] is recorded
    });
  }
  function put(key, value) {
    if (enabled === false) return; // signed out or guest demo: nothing will ever be sent
    var text; try { text = JSON.stringify(value); } catch (e) { return; }
    enqueue(key, text);
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () { if (enabled) send(key, text); }, DEBOUNCE_MS);
  }
  function flush() {
    if (!enabled) return Promise.resolve();
    var q = queue();
    return Promise.all(Object.keys(q).map(function (k) { return send(k, q[k]); }));
  }

  /* ---------------- change notification (poll) ---------------- */
  function on(key, cb) {
    (watchers[key] = watchers[key] || []).push(cb);
    return function () { watchers[key] = (watchers[key] || []).filter(function (f) { return f !== cb; }); };
  }
  function poll() {
    if (!enabled || document.hidden) return;
    Object.keys(watchers).concat(MIRROR.map(kvKey)).forEach(function (key) {
      req('HEAD', key).then(function (r) {
        if (!r.ok) return;
        var up = +(r.headers.get('X-Muse-Updated') || 0), by = r.headers.get('X-Muse-By') || '';
        if (saving[key] || !up || up <= (seen[key] || 0)) return;
        seen[key] = up;
        var mirrored = MIRROR.filter(function (k) { return kvKey(k) === key; })[0];
        if (mirrored) remoteMirror(mirrored, by);
        if (watchers[key] && watchers[key].length) get(key).then(function (v) { (watchers[key] || []).forEach(function (f) { try { f(v, { updated: up, by: by }); } catch (e) { /* noop */ } }); });
      }).catch(function () { /* offline: next tick */ });
    });
  }

  /* ---------------- localStorage mirroring ---------------- */
  function localMeta() { return readJSON(META, {}); }
  function markLocal(k, t) { var m = localMeta(); m[k] = t; writeJSON(META, m); }
  function pushMirror(k) {
    clearTimeout(timers['m:' + k]);
    timers['m:' + k] = setTimeout(function () {
      var now = Date.now();
      markLocal(k, now);
      me().then(function (u) {
        var data = ls.getItem(k);
        put(kvKey(k), { updated: now, by: (u && (u.email || u.name)) || 'team', data: data });
      });
    }, DEBOUNCE_MS);
  }
  function remoteMirror(k, by) {
    staleBy = by || 'someone';
    setState('stale');
  }
  function initialPull() {
    var meta = localMeta(), changed = [];
    return Promise.all(MIRROR.map(function (k) {
      return getWithMeta(kvKey(k)).then(function (r) {
        if (r.status === 503 || r.status === 401) return;
        var env = r.value, localData = ls.getItem(k), localT = meta[k] || 0;
        seen[kvKey(k)] = r.updated || 0;
        if (env && typeof env === 'object' && 'data' in env && (env.updated || 0) > localT) {
          if (env.data !== localData) {
            if (env.data == null) ls.removeItem(k); else nativeSet.call(ls, k, env.data);
            changed.push(k);
          }
          markLocal(k, env.updated || r.updated);
        } else if (localData != null && (!env || localT > (env.updated || 0))) {
          pushMirror(k); // this device has newer (or the only) copy
        }
      }).catch(function () { setState('offline'); });
    })).then(function () { return changed; });
  }

  /* ---------------- identity ---------------- */
  function me() {
    if (!mePromise) {
      mePromise = signedIn() ? fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { w.__museSyncMe = j && j.user; return (j && j.user) || null; })
        .catch(function () { return null; }) : Promise.resolve(null);
    }
    return mePromise;
  }

  /* ---------------- indicator ---------------- */
  var LABEL = { saving: 'Saving…', synced: 'Synced', offline: 'Offline · saved on this device', stale: 'Updated elsewhere · Reload', local: '' };
  var fadeTimer = null;
  function setState(s) {
    state = s;
    var pill = document.getElementById('museSyncPill');
    if (!pill) return;
    clearTimeout(fadeTimer);
    pill.classList.remove('is-fading');
    // "Synced" is a moment of reassurance, not a permanent badge; problems stay visible.
    if (s === 'synced') fadeTimer = setTimeout(function () { pill.classList.add('is-fading'); setTimeout(function () { if (state === 'synced') pill.hidden = true; }, 450); }, 2500);
    var text = s === 'stale' ? 'Updated by ' + staleBy + ' · Reload' : (LABEL[s] || '');
    pill.hidden = !text || enabled === false;
    pill.className = 'muse-sync-pill is-' + s;
    if (s === 'synced') pill.classList.remove('is-fading');
    pill.querySelector('.muse-sync-text').textContent = text;
    pill.title = s === 'synced' && lastSync ? 'Saved to shared storage at ' + new Date(lastSync).toLocaleTimeString() : text;
  }
  function mountPill() {
    if (document.getElementById('museSyncPill') || !document.body) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'museSyncPill'; b.hidden = true; b.className = 'muse-sync-pill';
    b.setAttribute('aria-live', 'polite');
    b.innerHTML = '<span class="muse-sync-dot" aria-hidden="true"></span><span class="muse-sync-text"></span>';
    b.onclick = function () { if (state === 'stale') location.reload(); else if (state === 'offline') flush(); };
    document.body.appendChild(b);
    setState(state);
  }

  /* ---------------- boot ---------------- */
  var settle; var ready = new Promise(function (r) { settle = r; }); // first pull done and no reload pending
  function boot() {
    if (!ls || !signedIn()) { enabled = false; settle(); return; }
    // Mirror writes from every module (no changes needed in the modules themselves).
    Storage.prototype.setItem = function (k, v) {
      nativeSet.call(this, k, v);
      if (this === ls && enabled !== false && MIRROR.indexOf(k) >= 0) pushMirror(k);
    };
    var nativeRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k) {
      nativeRemove.call(this, k);
      if (this === ls && enabled && MIRROR.indexOf(k) >= 0) pushMirror(k);
    };
    me().then(function (u) {
      // Guest demo: the curated seed, no pull of team data and no first-visit reload (halves first load).
      if (!u || u.email === 'guest') { enabled = false; settle(); return; }
      enabled = true;
      return initialPull().then(function (changed) {
        if (enabled === false) return;
        var fresh = performance.now() < 20000;
        var reloaded = false; try { reloaded = sessionStorage.getItem(RELOADED) === '1'; } catch (e) { /* noop */ }
        if (changed.length && fresh && !reloaded) {
          try { sessionStorage.setItem(RELOADED, '1'); } catch (e) { /* noop */ }
          location.reload();
          return;
        }
        if (changed.length) { staleBy = 'another device'; setState('stale'); } else setState('synced');
        settle();
        flush();
        setInterval(poll, POLL_MS);
        setInterval(function () { if (Object.keys(queue()).length) flush(); }, RETRY_MS);
        root.addEventListener('online', function () { flush(); });
      });
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPill); else mountPill();
  }

  w.MuseSync = {
    get: get, put: put, on: on, me: me, flush: flush,
    ready: ready,
    readOnly: function () { return !!(w.__museSyncMe && w.__museSyncMe.role === 'viewer'); },
    status: function () { return { state: state, enabled: !!enabled, lastSync: lastSync, pending: Object.keys(queue()).length }; },
    _kvKey: kvKey
  };
  boot();
})(typeof window !== 'undefined' ? window : globalThis);
