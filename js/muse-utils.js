/* Shared string helpers: one escaping implementation, everywhere.
   Every module renders untrusted show data (names, venues, messages) into
   HTML, so escaping lives here once instead of once per file. Loaded before
   the app bundles; modules call the bare global, which also serves inline
   handlers. Identical output to the per-file versions it replaces. */
function esc(s) {
  return ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
try {
  (typeof window !== 'undefined' ? window : globalThis).MuseUtils = { version: '0.1.0', esc: esc };
} catch (e) {}
