// Shared test helpers: an in-memory Workers KV and a Pages-Functions context builder.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function memoryKV() {
  const store = new Map();
  return {
    store,
    async get(k, o) { const e = store.get(k); if (!e) return null; const t = typeof o === 'string' ? o : o && o.type; return t === 'json' ? JSON.parse(e.v) : e.v; },
    async getWithMetadata(k, o) { return { value: await this.get(k, o), metadata: store.has(k) ? store.get(k).m : null }; },
    async put(k, v, o = {}) { store.set(k, { v: typeof v === 'string' ? v : JSON.stringify(v), m: o.metadata || null }); },
    async delete(k) { store.delete(k); },
    async list(o = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(o.prefix || '')).sort().slice(0, o.limit || 1000);
      return { keys: keys.map((name) => ({ name })), list_complete: true };
    },
  };
}

/** In-memory D1 stand-in: implements just the statements the asset endpoints use. */
export function memoryD1() {
  const assets = new Map(), vendors = new Map();
  const assetHistory = [], assetFts = [], vendorFts = [];
  let seq = 0;
  function matchFts(rows, match) {
    const toks = [...String(match || '').matchAll(/"([^"]+)"\*/g)].map((m) => m[1].toLowerCase());
    if (!toks.length) return [];
    return rows.filter((r) => toks.every((t) => Object.values(r).join(' ').toLowerCase().includes(t)));
  }
  return {
    tables: { assets, vendors, assetHistory, assetFts, vendorFts },
    prepare(sql) {
      const stmt = (args) => {
          const run = async () => {
            if (/^INSERT INTO assets/.test(sql)) {
              const [serial, name, category, status, condition, firmware, location, maintenance_due, checked_out_to, checked_out_at, media_keys, updated, updated_by] = args;
              assets.set(serial, { serial, name, category, status, condition, firmware, location, maintenance_due, checked_out_to, checked_out_at, media_keys, updated, updated_by });
              return { success: true };
            }
            if (/^UPDATE assets SET/.test(sql)) {
              const cols = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
              const serial = args[args.length - 1];
              const rec = assets.get(serial) || { serial };
              cols.forEach((c, i) => { rec[c] = args[i]; });
              assets.set(serial, rec);
              return { success: true };
            }
            if (/^DELETE FROM asset_fts/.test(sql)) {
              for (let i = assetFts.length - 1; i >= 0; i--) if (assetFts[i].serial === args[0]) assetFts.splice(i, 1);
              return { success: true };
            }
            if (/^INSERT INTO asset_fts/.test(sql)) {
              assetFts.push({ serial: args[0], name: args[1], category: args[2], location: args[3] });
              return { success: true };
            }
            if (/^INSERT INTO asset_history/.test(sql)) {
              assetHistory.push({ id: ++seq, serial: args[0], ts: args[1], by: args[2], action: args[3], detail: args[4] });
              return { success: true };
            }
            if (/^INSERT INTO vendors/.test(sql)) {
              const [id, name, category, contact, email, phone, rate_day, reliability, notes, updated, updated_by] = args;
              vendors.set(id, { id, name, category, contact, email, phone, rate_day, reliability, notes, updated, updated_by });
              return { success: true };
            }
            if (/^DELETE FROM vendor_fts/.test(sql)) {
              for (let i = vendorFts.length - 1; i >= 0; i--) if (vendorFts[i].vid === args[0]) vendorFts.splice(i, 1);
              return { success: true };
            }
            if (/^INSERT INTO vendor_fts/.test(sql)) {
              vendorFts.push({ vid: args[0], name: args[1], category: args[2], contact: args[3], email: args[4] });
              return { success: true };
            }
            throw new Error('memoryD1 run: unsupported SQL: ' + sql);
          };
          const first = async () => {
            if (/^SELECT \* FROM assets WHERE serial/.test(sql)) return assets.get(args[0]) || null;
            if (/^SELECT updated FROM assets WHERE serial/.test(sql)) { const r = assets.get(args[0]); return r ? { updated: r.updated } : null; }
            if (/^SELECT updated FROM vendors WHERE id/.test(sql)) { const r = vendors.get(args[0]); return r ? { updated: r.updated } : null; }
            throw new Error('memoryD1 first: unsupported SQL: ' + sql);
          };
          const all = async () => {
            if (/FROM asset_fts/.test(sql)) {
              const hits = matchFts(assetFts, args[0]);
              return { results: hits.map((f) => ({ ...assets.get(f.serial) })) };
            }
            if (/FROM vendor_fts/.test(sql)) {
              const hits = matchFts(vendorFts, args[0]);
              return { results: hits.map((f) => ({ ...vendors.get(f.vid) })) };
            }
            if (/FROM asset_history/.test(sql)) {
              return { results: assetHistory.filter((h) => h.serial === args[0]).sort((a, b) => b.ts - a.ts).slice(0, 100) };
            }
            if (/^SELECT \* FROM assets/.test(sql)) return { results: [...assets.values()] };
            if (/^SELECT \* FROM vendors/.test(sql)) return { results: [...vendors.values()] };
            throw new Error('memoryD1 all: unsupported SQL: ' + sql);
          };
          return { bind: (...more) => { throw new Error('double bind'); }, first, all, run };
        };
      return { bind: (...args) => stmt(args), first: () => stmt([]).first(), all: () => stmt([]).all(), run: () => stmt([]).run() };
    },
  };
}

/** In-memory R2 stand-in: implements just what the media endpoint uses. */
export function memoryR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, opts = {}) {
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      objects.set(key, { key, bytes, size: bytes.length, uploaded: new Date(),
        httpMetadata: (opts && opts.httpMetadata) || {}, customMetadata: (opts && opts.customMetadata) || {} });
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { key: o.key, size: o.size, httpMetadata: o.httpMetadata, body: o.bytes };
    },
    async delete(key) { objects.delete(key); },
    async list({ prefix = '', limit = 100 } = {}) {
      const all = [...objects.values()].filter((o) => o.key.startsWith(prefix));
      return { objects: all.slice(0, limit).map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })), truncated: all.length > limit };
    },
  };
}

/** Build a Pages Functions context. */
export function ctx(url, { method = 'GET', body, headers = {}, env = {}, user, params = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const request = new Request(new URL(url, 'https://muse.test').toString(), init);
  return { request, env, params, data: user === undefined ? {} : { user }, next: async () => new Response('NEXT', { status: 200 }), waitUntil() {} };
}

/** Load a browser IIFE module (js/*.js) into a sandbox window and return that window. */
export function loadBrowserModule(rel, extraGlobals = {}) {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
  const win = {
    localStorage, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    document: { readyState: 'complete', cookie: '', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) },
    addEventListener() {}, location: { origin: 'https://muse.test', reload() {} }, navigator: {}, productions: {}, order: [],
    ...extraGlobals,
  };
  win.window = win; win.globalThis = win; win.self = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), win, { filename: rel });
  return win;
}
