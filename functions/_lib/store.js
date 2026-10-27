// @ts-check
// D1 + R2 access helpers for Muse Live Functions.
// Bindings (Pages → Settings → Variables, same names in production and preview):
//   MUSE_D1    D1 database — queryable store (transcripts, media registry, audit log)
//   MUSE_MEDIA R2 bucket  — blob storage (pano photos, caption files, recorded segments)
// Both are optional at runtime: callers fall back (KV) or answer 503 with configured:false.

/** @param {any} env */
export function d1(env) { return (env && env.MUSE_D1) || null; }

/** @param {any} env */
export function mediaBucket(env) { return (env && env.MUSE_MEDIA) || null; }

/** ISO timestamp. */
export function nowIso() { return new Date().toISOString(); }

/** Sanitize one R2 path segment (show, kind). @param {string} s @param {string} fb */
export function seg(s, fb) {
  const c = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return c || fb;
}

/** Escape user text as one FTS5 phrase query (quotes are doubled, so MATCH stays safe). @param {string} q */
export function ftsPhrase(q) { return '"' + String(q == null ? '' : q).replace(/"/g, '""').slice(0, 200) + '"'; }
