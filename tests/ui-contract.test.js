const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('browser app defaults to automatic local results and geographic map APIs', () => {
  const app = read('app.js');
  assert.match(app, /\/api\/live\/results/);
  assert.match(app, /\/api\/map\/states/);
  assert.match(app, /\/api\/map\/house-districts/);
  assert.match(app, /automaticResults/);
  assert.match(app, /data-map-layer/);
  assert.match(app, /geoFeatureToPath/);
  assert.doesNotMatch(app, /class="state-tile/);
});

test('project ships a one-click Windows launcher and all-test package script', () => {
  assert.ok(fs.existsSync(path.join(root, 'START-MIDTERMS-DASHBOARD.bat')));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.start, 'node local-server.js');
  assert.match(pkg.scripts.test, /tests\/\*\.test\.js/);
});

test('readme documents automatic keyless sources and real geographic map', () => {
  const readme = read('README.md');
  assert.match(readme, /watch\.vote/i);
  assert.match(readme, /Open America/i);
  assert.match(readme, /geographic/i);
  assert.match(readme, /no API key/i);
});
