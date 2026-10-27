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

test('ensureTour resolves an already-loaded tour without touching the network', async () => {
  const w = lazy({ MuseTour: { start() {} } });
  const T = await w.MuseLazy.ensureTour();
  assert.equal(T, w.MuseTour);
});

test('tour is wanted on ?tour= or the session flag, and quiet otherwise', () => {
  assert.equal(lazy().MuseLazy._tourWanted(), false);
  assert.equal(lazy({ location: { origin: 'https://muse.test', pathname: '/', search: '?tour=auto' } }).MuseLazy._tourWanted(), true);
  assert.equal(lazy({ sessionStorage: { getItem: (k) => (k === 'muse_tour' ? '1' : null), setItem() {} } }).MuseLazy._tourWanted(), true);
});

test('lazy URLs carry the running build tag so immutable caching cannot serve a stale tour', () => {
  const w = lazy();
  assert.equal(w.MuseLazy._versioned('js/muse-tour.js'), 'js/muse-tour.js');
  const tagged = loadBrowserModule('js/muse-lazy.js', {
    location: { origin: 'https://muse.test', pathname: '/', search: '' },
    sessionStorage: { getItem: () => null, setItem() {} },
    document: { querySelectorAll: () => [{ getAttribute: () => 'js/muse-lazy.js?v=20261027-kxht' }] },
  });
  assert.equal(tagged.MuseLazy._versioned('js/muse-tour.js'), 'js/muse-tour.js?v=20261027-kxht');
});
