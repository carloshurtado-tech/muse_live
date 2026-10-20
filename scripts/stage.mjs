// @ts-check
// Stage a deployable copy for Cloudflare Pages:
//   <out>/public     — the static site (no tests, tools, docs, unminified bundles, maps or secrets)
//   <out>/functions  — Pages Functions
// then deploy from <out> with:
//   npx wrangler pages deploy public --project-name muse-live --branch main
//
//   npm run stage                      # → .stage/
//   node scripts/stage.mjs /tmp/stage  # custom output dir
//   node scripts/stage.mjs --with-maps # keep *.min.js.map (debugging a deployed build)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(ROOT, '.stage'));
const WITH_MAPS = argv.includes('--with-maps');

// Paths (relative, POSIX) never shipped as static files.
export const EXCLUDE = [
  /^\.git(\/|$)/, /^\.github(\/|$)/, /^\.stage(\/|$)/, /^node_modules(\/|$)/, /(^|\/)node_modules(\/|$)/, /^functions(\/|$)/, /^tests(\/|$)/, /^tools(\/|$)/,
  /^scripts(\/|$)/, /^docs(\/|$)/, /^dist(\/|$)/, /^test-results(\/|$)/, /^playwright-report(\/|$)/, /^glasses\/src(\/|$)/, /^glasses-src(\/|$)/, /^eval(\/|$)/, /(^|\/)README\.md$/,
  /^package(-lock)?\.json$/, /^tsconfig\.json$/, /^eslint\.config\.mjs$/, /^README\.md$/, /(^|\/)\.DS_Store$/,
  /(^|\/)\.dev[^/]*$/, /^js\/muse-app-[ab]\.js$/, /\.d\.ts$/, /^\.gitignore$/,
  / \d+\.[^/]+$/, /* iCloud conflict dupes: "index 2.html", "muse-app-b 2.js" */
];
export function excluded(rel, withMaps = false) {
  if (!withMaps && /\.map$/.test(rel)) return true;
  return EXCLUDE.some((rx) => rx.test(rel));
}
export function stripMapLink(js) { return js.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n'); }
function copyTree(src, dst, rel = '') {
  for (const name of fs.readdirSync(src)) {
    const r = rel ? rel + '/' + name : name;
    const s = path.join(src, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) { if (!excluded(r + '/', WITH_MAPS) && !excluded(r, WITH_MAPS)) copyTree(s, path.join(dst, name), r); }
    else if (!excluded(r, WITH_MAPS)) {
      fs.mkdirSync(dst, { recursive: true });
      if (!WITH_MAPS && /\.min\.js$/.test(name)) fs.writeFileSync(path.join(dst, name), stripMapLink(fs.readFileSync(s, 'utf8'))); // the .map is not shipped
      else fs.copyFileSync(s, path.join(dst, name));
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.rmSync(OUT, { recursive: true, force: true });
  copyTree(ROOT, path.join(OUT, 'public'));
  fs.cpSync(path.join(ROOT, 'functions'), path.join(OUT, 'functions'), { recursive: true, filter: (s) => !/\.DS_Store$/.test(s) });
  console.log('staged → ' + OUT + '\n  deploy: cd ' + JSON.stringify(OUT) + ' && npx wrangler pages deploy public --project-name muse-live --branch main');
}
