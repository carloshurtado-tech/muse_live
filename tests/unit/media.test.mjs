import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

function win(calls) {
  return loadBrowserModule('js/muse-media.js', {
    fetch: async (url, init) => {
      calls.push([String(url), init || {}]);
      if (String(url) === '/api/media' && init.method === 'POST') {
        const b = JSON.parse(init.body);
        return { ok: true, json: async () => ({ ok: true, key: b.kind + '/' + b.show + '/day/x-' + b.name, size: 4 }) };
      }
      if (String(url).startsWith('/api/media?prefix=')) return { ok: true, json: async () => ({ ok: true, keys: [{ key: 'pano/demo/x' }] }) };
      if (String(url).startsWith('/api/assets/')) return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false, status: 404 };
    },
  });
}

test('upload validates kind, show, and size before touching the network', async () => {
  const calls = [];
  const M = win(calls).MuseMedia;
  assert.deepEqual(JSON.parse(JSON.stringify(await M.upload({}))), { ok: false, error: 'Kind is pano | captions | segments | survey.' });
  assert.deepEqual(JSON.parse(JSON.stringify(await M.upload({ kind: 'pano', show: 'BAD' }))), { ok: false, error: 'Show key is [a-z0-9_-]{1,64}.' });
  assert.deepEqual(JSON.parse(JSON.stringify(await M.upload({ kind: 'pano', show: 'demo', base64: '' }))), { ok: false, error: 'File is empty or exceeds 8 MB.' });
  assert.deepEqual(JSON.parse(JSON.stringify(await M.upload({ kind: 'pano', show: 'demo', dataUrl: 'not-a-data-url' }))), { ok: false, error: 'Only base64 data URLs can be uploaded.' });
  assert.equal(calls.length, 0, 'validation sent network traffic');
});

test('upload posts the shaped body; list scopes by prefix; remove and attach route correctly', async () => {
  const calls = [];
  const M = win(calls).MuseMedia;
  const up = await M.uploadSurveyPhoto('demo', 'data:image/jpeg;base64,' + Buffer.from('bytes').toString('base64'), 'load.jpg');
  assert.equal(up.key, 'survey/demo/day/x-load.jpg');
  const posted = JSON.parse(calls[0][1].body);
  assert.equal(posted.kind, 'survey');
  assert.equal(posted.contentType, 'image/jpeg', 'content type comes from the data URL');
  const ls = await M.list('demo', 'pano');
  assert.ok(calls[1][0].includes(encodeURIComponent('pano/demo/')));
  assert.equal(ls.keys.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(await M.list())), { ok: false, error: 'Scope the listing by show, kind, or both.' });
  await M.remove('pano/demo/x');
  assert.ok(calls[2][0].includes('key=pano%2Fdemo%2Fx') && calls[2][1].method === 'DELETE');
  await M.attachToAsset('CAM-1', 'pano/demo/x');
  const at = JSON.parse(calls[3][1].body);
  assert.deepEqual(at, { action: 'attach', key: 'pano/demo/x' });
});

test('network failures resolve as errors, never throw', async () => {
  const w = loadBrowserModule('js/muse-media.js', { fetch: () => Promise.reject(new Error('offline')) });
  assert.equal((await w.MuseMedia.list('demo')).ok, false);
  assert.equal((await w.MuseMedia.remove('x')).ok, false);
  assert.equal((await w.MuseMedia.attachToAsset('S', 'k')).ok, false);
});
