// @ts-check
// Build the legacy app bundles: js/muse-app-a.js + js/muse-app-b.js → *.min.js with linked source maps,
// then bump the cache tag (?v=YYYYMMDD-xxxx) in index.html and _headers.
//
//   npm run build                 # minify + maps + bump
//   node scripts/build.mjs --no-bump
//   node scripts/build.mjs --out /tmp/build   # write bundles elsewhere (no bump)
//   npm run bump                  # bump the cache tag only
//
// The bundles are classic scripts whose top-level function names are the app's global API
// (inline onclick handlers call them), so they are minified WITHOUT bundling or renaming globals.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, 'js');

export function newTag(now = new Date()) {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return d + '-' + Math.floor(now.getTime() / 1000).toString(36).slice(-4);
}
export function bumpText(text, tag) { return text.replace(/\?v=\d{8}-[a-z0-9]+/g, '?v=' + tag); }

async function bundles() {
  const { build } = await import('esbuild'); // lazy: the helpers above are importable without devDependencies
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of ['muse-app-a', 'muse-app-b']) {
    const t = Date.now();
    await build({
      entryPoints: [path.join(ROOT, 'js', name + '.js')],
      outfile: path.join(OUT, name + '.min.js'),
      minify: true, target: 'es2016', sourcemap: 'linked', legalComments: 'none', logLevel: 'warning',
    });
    const size = fs.statSync(path.join(OUT, name + '.min.js')).size;
    console.log(`built ${name}.min.js  ${(size / 1024).toFixed(0)} KB  (${Date.now() - t} ms)`);
  }
}
function bump() {
  const tag = newTag();
  for (const f of ['index.html', '_headers']) {
    const p = path.join(ROOT, f);
    fs.writeFileSync(p, bumpText(fs.readFileSync(p, 'utf8'), tag));
  }
  console.log('cache tag → ?v=' + tag);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!has('--bump-only')) await bundles();
  if (has('--bump-only') || (!has('--no-bump') && outIdx < 0)) bump();
}
