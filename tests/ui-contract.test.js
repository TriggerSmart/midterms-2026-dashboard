const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('browser app defaults to automatic static results and geographic map data', () => {
  const app = read('app.js');
  assert.match(app, /assets\/data\/live-results\.json/);
  assert.match(app, /assets\/data\/states\.geojson/);
  assert.match(app, /assets\/data\/house-districts\.geojson/);
  assert.match(app, /automaticResults/);
  assert.match(app, /data-map-layer/);
  assert.match(app, /geoFeatureToPath/);
  assert.doesNotMatch(app, /class="state-tile/);
});

test('map failures are visible and offer an in-page retry instead of a blank panel', () => {
  const app = read('app.js');
  assert.match(app, /Geographic map unavailable/);
  assert.match(app, /data-retry-map/);
  assert.match(app, /Retry map/);
});

test('project ships GitHub Pages build scripts and all-test package script', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['build:pages']);
  assert.ok(pkg.scripts['refresh:data']);
  assert.match(pkg.scripts.test, /tests\/\*\.test\.js/);
});

test('readme documents automatic keyless sources and real geographic map', () => {
  const readme = read('README.md');
  assert.match(readme, /watch\.vote/i);
  assert.match(readme, /Open America/i);
  assert.match(readme, /geographic/i);
  assert.match(readme, /no API key/i);
  assert.match(readme, /GitHub Pages/i);
});
