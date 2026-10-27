const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');

const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('projection snapshot exposes current House, Senate, and governor forecasts', () => {
  const P = require('../projections.js');
  assert.equal(P.meta.asOf, '2026-10-23');
  assert.deepEqual(P.summary.house, {dem:220, rep:196, tossup:19, total:435, majority:218});
  assert.equal(P.summary.senate.demCaucus, 49);
  assert.equal(P.summary.senate.rep, 46);
  assert.equal(P.summary.senate.tossup, 5);
  assert.equal(P.summary.governor.dem, 23);
  assert.equal(P.summary.governor.rep, 22);
  assert.equal(P.summary.governor.tossup, 5);
});

test('projection snapshot contains complete Senate and governor race ratings and 270toWin House competitive board', () => {
  const P = require('../projections.js');
  assert.equal(Object.keys(P.senate).length, 35);
  assert.equal(Object.keys(P.governor).length, 36);
  assert.equal(Object.keys(P.houseCompetitive).length, 89);
  assert.equal(Object.values(P.houseCompetitive).filter(r=>r.rating==='Toss Up').length, 19);
  assert.equal(P.senate.TX.rating, 'Toss Up');
  assert.equal(P.governor.GA.rating, 'Toss Up');
  assert.equal(P.houseCompetitive['PA-08'].rating, 'Toss Up');
});

test('projection records identify source, favored party, and rating strength', () => {
  const P = require('../projections.js');
  assert.equal(P.houseCompetitive['AZ-06'].party, 'D');
  assert.equal(P.houseCompetitive['WI-01'].party, 'R');
  assert.equal(P.houseCompetitive['FL-14'].party, 'U');
  assert.ok(P.ratingStrength['Likely D'] > P.ratingStrength['Lean D']);
  assert.equal(P.ratingStrength['Toss Up'], 0.5);
  assert.match(P.meta.houseSource.url, /270towin\.com/);
  assert.match(P.meta.senateSource.url, /cookpolitical\.com/);
});

test('browser UI defaults to projection mode but provides a live-results map switch', () => {
  const app = read('app.js');
  const html = read('index.html');
  assert.match(html, /projections\.js/);
  assert.match(app, /mapMode:\s*'projection'/);
  assert.match(app, /data-map-mode="projection"/);
  assert.match(app, /data-map-mode="live"/);
  assert.match(app, /Projection Map/);
  assert.match(app, /Live Results/);
});

test('GitHub Pages build includes projection data and current House baseline support', () => {
  const build = read('scripts/build-pages.js');
  const workflow = read('.github/workflows/pages.yml');
  const updater = read('scripts/update-live-data.js');
  assert.match(build, /projections\.js/);
  assert.match(updater, /house-baseline\.json/);
  assert.match(updater, /legislators-current\.json/);
  assert.match(workflow, /update-live-data\.js/);
});

test('dashboard projection map respects the selected mode and layer instead of forcing House projection', () => {
  const app = read('app.js');
  assert.match(app, /mapHTML\(\{compact:true,layer:state\.settings\.mapLayer,mode:state\.settings\.mapMode\}\)/);
  assert.doesNotMatch(app, /mapHTML\(\{compact:true,layer:'house',mode:'projection'\}\)/);
});

test('House projection baseline has a direct public CORS fallback when the deployed baseline is empty', () => {
  const app = read('app.js');
  assert.match(app, /civdotiq\.org\/api\/download\/congress-members\?format=json/);
  assert.match(app, /buildBrowserHouseBaseline/);
  assert.match(app, /Current House membership fallback/);
});

test('pre-election provider health distinguishes reachability from result availability', () => {
  const app = read('app.js');
  assert.match(app, /online • waiting Nov\. 3/);
  assert.match(app, /snapshot pending • waiting Nov\. 3/);
});

test('projection map does not show the ambiguous overview layer', () => {
  const app = read('app.js');
  assert.match(app, /activeMode==='live'\?`<button class="map-layer-btn/);
});

test('geographic maps fall back to official Census TIGERweb when bundled geometry is empty', () => {
  const app = read('app.js');
  assert.match(app, /TIGERweb\/State_County\/MapServer\/0\/query/);
  assert.match(app, /TIGERweb\/Legislative\/MapServer\/0\/query/);
  assert.match(app, /hasGeoFeatures/);
  assert.match(app, /Bundled state geometry is empty/);
  assert.match(app, /Bundled district geometry is empty/);
});


test('projection snapshot exposes obvious DDHQ chamber-control forecast probabilities', () => {
  const P = require('../projections.js');
  assert.equal(P.controlForecast.house.demProbability, 79);
  assert.equal(P.controlForecast.house.repProbability, 21);
  assert.equal(P.controlForecast.house.projectedDemSeats, 238);
  assert.equal(P.controlForecast.senate.demProbability, 57);
  assert.equal(P.controlForecast.senate.repProbability, 43);
  assert.equal(P.controlForecast.senate.projectedDemSeats, 51);
  assert.match(P.controlForecast.source.url, /decisiondeskhq\.com/);
});

test('House projection browser fallback can populate safe seats from public current-legislator data', () => {
  const app = read('app.js');
  assert.match(app, /cdn\.jsdelivr\.net\/gh\/unitedstates\/congress-legislators@gh-pages\/legislators-current\.json/);
  assert.match(app, /person\.terms/);
  assert.match(app, /435\/435 districts classified/);
});

test('dashboard puts high-visibility House and Senate control indicators above the normal metrics', () => {
  const app = read('app.js');
  const css = read('styles.css');
  assert.match(app, /PROJECTED DEMOCRATIC CONTROL/);
  assert.match(app, /control-forecast-strip/);
  assert.match(app, /House Control/);
  assert.match(app, /Senate Control/);
  assert.match(css, /control-forecast-strip/);
  assert.match(css, /control-forecast-card/);
});


test('persistent top chamber-control strip stays visible across dashboard routes', () => {
  const html = read('index.html');
  const app = read('app.js');
  const css = read('styles.css');
  assert.match(html, /id="chamber-control-sticky"/);
  assert.match(app, /renderStickyChamberControl/);
  assert.match(app, /PROJECTED D CONTROL/);
  assert.match(css, /\.chamber-control-sticky/);
  assert.match(css, /position:sticky/);
});
