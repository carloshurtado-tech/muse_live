import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpText, newTag } from '../../scripts/build.mjs';
import { excluded } from '../../scripts/stage.mjs';

test('cache tags bump everywhere and keep their shape', () => {
  const tag = newTag(new Date('2026-10-17T12:00:00Z'));
  assert.match(tag, /^20261017-[a-z0-9]{1,4}$/);
  assert.equal(bumpText('a.js?v=20261017-sched1 b.css?v=20261015-meta6', 'X'), 'a.js?v=X b.css?v=X');
});
test('deploy staging never ships dev files, sources, maps or secrets', () => {
  for (const p of ['tests/unit/a.mjs', 'tools/dev-server.mjs', 'docs/SECURITY.md', 'package.json', 'js/muse-app-a.js', '.dev.vars', '.dev-kv.json', 'js/muse-app-a.min.js.map', 'functions/_middleware.js', 'glasses/src/main.tsx', 'glasses/node_modules/x.js'])
    assert.ok(excluded(p), p);
  for (const p of ['index.html', 'js/muse-app-a.min.js', 'js/muse-sync.js', 'ops/health.html', 'glasses/index.html', '_headers'])
    assert.ok(!excluded(p), p);
  assert.ok(!excluded('js/muse-app-a.min.js.map', true));
});
