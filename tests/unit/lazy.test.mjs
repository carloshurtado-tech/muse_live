import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers.mjs';

function lazy(extra = {}) {
  return loadBrowserModule('js/muse-lazy.js', {
    location: { origin: 'https://muse.test', pathname: '/', search: '' },
    sessionStorage: { getItem: () => null, setItem() {} },
    ...extra,
  });
}

test('the guided tour is gone: MuseLazy exposes no tour loader', () => {
  const w = lazy();
  assert.equal(w.MuseLazy.ensureTour, undefined, 'no Take-the-tour entry point may survive');
  assert.equal(w.MuseLazy._tourWanted, undefined, '?tour hooks removed');
});

test('lazy URLs carry the running build tag so immutable caching cannot serve stale modules', () => {
  const w = lazy();
  assert.equal(w.MuseLazy._versioned('js/muse-cad.js'), 'js/muse-cad.js');
  const tagged = loadBrowserModule('js/muse-lazy.js', {
    location: { origin: 'https://muse.test', pathname: '/', search: '' },
    sessionStorage: { getItem: () => null, setItem() {} },
    document: { querySelectorAll: () => [{ getAttribute: () => 'js/muse-lazy.js?v=20261027-kxht' }] },
  });
  assert.equal(tagged.MuseLazy._versioned('js/muse-cad.js'), 'js/muse-cad.js?v=20261027-kxht');
});
