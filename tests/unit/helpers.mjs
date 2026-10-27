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
