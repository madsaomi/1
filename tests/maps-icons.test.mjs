import test from 'node:test';
import assert from 'node:assert/strict';
import { readContent, renderLocations, validateContent } from '../build.mjs';

test('configured map providers render icon-only links with their accessible names and exact destinations', () => {
  const maps = [
    {provider: 'google', url: 'https://maps.app.goo.gl/BDncqNjjgFkNAMUFA'},
    {provider: 'yandex', url: 'https://yandex.uz/maps/-/CXbaBC64'}
  ];
  const html = renderLocations({verified: true, locations: [{id: 'test-branch', name: 'Филиал', address: 'Нукус', maps}]});
  const links = [...html.matchAll(/<a class="map-icon-link"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 2);
  for (const [index, match] of links.entries()) {
    assert(match[0].includes(`href="${maps[index].url}"`));
    assert.match(match[0], /aria-label="(?:Google Maps|Яндекс Карты): Филиал, Нукус"/);
    assert.match(match[0], /rel="noopener noreferrer"/);
    assert.match(match[1], /<svg\b[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.equal(match[1].replace(/<[^>]+>/g, '').trim(), '');
  }
  assert.match(links[1][1], /icon-yandex-maps/);
  const googleOnly = renderLocations({verified: true, locations: [{id: 'only', name: 'Филиал', address: 'Нукус', maps: [maps[0]]}]});
  assert(!googleOnly.includes('yandex.uz'), 'Unconfigured map destinations must not be invented');
});

test('Abdirova has both map services at its saved coordinates, and the removed branch is absent', () => {
  const data = structuredClone(readContent());
  validateContent(data);
  assert.deepEqual(data.contacts.locations.map(item => item.id), ['saraeva', 'abdirova']);
  const branch = data.contacts.locations.find(item => item.id === 'abdirova');
  assert(branch.googleEmbed);
  assert.deepEqual(branch.maps.map(item => item.provider), ['google', 'yandex']);
  const url = new URL(branch.maps.find(item => item.provider === 'google').url);
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('query'), `${branch.coordinates[1]},${branch.coordinates[0]}`);
  for (const invalid of ['https://www.google.com.evil.example/maps/search/?api=1&query=42,59',
    'https://www.google.com/maps/search/?api=1&query=42,59&redirect=https://evil.example']) {
    const changed = structuredClone(data);
    changed.contacts.locations[1].maps[0].url = invalid;
    assert.throws(() => validateContent(changed), /approved HTTPS map URL/);
  }
});
