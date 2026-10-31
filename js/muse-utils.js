/* Shared string helpers: one escaping implementation, everywhere.
   Every module renders untrusted show data (names, venues, messages) into
   HTML, so escaping lives here once instead of once per file. Loaded before
   the app bundles; modules call the bare global, which also serves inline
   handlers. Identical output to the per-file versions it replaces. */
function esc(s) {
  return ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* Safe text sink: assigns plain text so user/AI-controlled strings can never
   become markup. Returns the element for chaining. */
function setText(el, s) {
  if (el) el.textContent = (s == null ? '' : String(s));
  return el;
}
/* Parse a rich-editor onchange callback string into { name, args } without
   executing anything. Only the exact shape produced by museRichBox is accepted:
     function(v){NAME('lit',...,'lit',v)}
   where NAME is a bare global function name, every argument before the final
   value is a single- or double-quoted string literal, and the final argument is
   the bare callback parameter. Returns null for anything else so the caller can
   refuse it (fail closed — never eval/new Function). */
function museParseRichCb(expr) {
  var m = /^function\s*\(\s*([a-zA-Z_$][\w$]*)\s*\)\s*\{\s*([a-zA-Z_$][\w$]*)\s*\(([\s\S]*?)\)\s*;?\s*\}$/.exec(String(expr == null ? '' : expr).replace(/^\s+|\s+$/g, ''));
  if (!m) return null;
  var param = m[1], name = m[2], raw = m[3];
  var slots = [], buf = '', quoted = false, inQ = null, bs = false, afterClose = false, i, c;
  function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }
  function isSpace(x) { return x === ' ' || x === '\t' || x === '\n' || x === '\r' || x === '\f'; }
  /* A trailing sentinel comma flushes the final slot. */
  for (i = 0; i <= raw.length; i++) {
    c = i < raw.length ? raw.charAt(i) : ',';
    if (inQ) {
      if (bs) { buf += (c === 'n' ? '\n' : (c === 't' ? '\t' : (c === 'r' ? '\r' : c))); bs = false; }
      else if (c === '\\') bs = true;
      else if (c === inQ) { inQ = null; afterClose = true; }
      else buf += c;
    } else if (c === '"' || c === "'") {
      /* A quote opens the slot; nothing (even another literal) may follow a closed one. */
      if (trim(buf) !== '' || afterClose) return null;
      inQ = c; buf = ''; quoted = true; afterClose = false;
    } else if (c === ',') {
      slots.push({ v: trim(buf), quoted: quoted }); buf = ''; quoted = false; afterClose = false;
    } else {
      if (afterClose && !isSpace(c)) return null; /* code after a literal is not a literal */
      buf += c;
    }
  }
  if (inQ || !slots.length) return null;
  var last = slots[slots.length - 1];
  if (last.quoted || last.v !== param) return null; /* value must be the bare param, last */
  var lits = [];
  for (i = 0; i < slots.length - 1; i++) {
    if (!slots[i].quoted) return null; /* every fixed arg must be a string literal */
    lits.push(slots[i].v);
  }
  return { name: name, args: lits };
}
try {
  (typeof window !== 'undefined' ? window : globalThis).MuseUtils = { version: '0.2.0', esc: esc, setText: setText, museParseRichCb: museParseRichCb };
} catch (e) {}
