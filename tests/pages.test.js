const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('GitHub Pages workflow deploys static site and refreshes election data on election days', () => {
  const workflowPath = path.join(root,'.github','workflows','pages.yml');
  assert.ok(fs.existsSync(workflowPath), 'pages workflow must exist');
  const yml = fs.readFileSync(workflowPath,'utf8');
  assert.match(yml, /actions\/deploy-pages/);
  assert.match(yml, /scripts\/update-live-data\.js/);
  assert.match(yml, /cron:/);
  assert.match(yml, /pages:\s*write/);
});

test('browser uses repository-relative static data paths instead of localhost-only API routes', () => {
  const app = read('app.js');
  assert.match(app, /assets\/data\/live-results\.json/);
  assert.match(app, /assets\/data\/states\.geojson/);
  assert.match(app, /assets\/data\/house-districts\.geojson/);
  assert.doesNotMatch(app, /\/api\/live\/results/);
  assert.doesNotMatch(app, /\/api\/map\/states/);
  assert.doesNotMatch(app, /automaticAvailable\s*=\s*location\.protocol/);
});

test('browser loads live-source normalizers for direct CORS Open America refreshes', () => {
  const html = read('index.html');
  const live = read('live-sources.js');
  assert.match(html, /live-sources\.js/);
  assert.match(live, /MidtermsLiveSources/);
  assert.match(live, /module\.exports/);
});

test('pages build script copies the static app into _site without requiring a server', () => {
  assert.ok(fs.existsSync(path.join(root,'scripts','build-pages.js')));
  assert.ok(fs.existsSync(path.join(root,'scripts','update-live-data.js')));
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['build:pages'], /build-pages/);
  assert.match(pkg.scripts['refresh:data'], /update-live-data/);
});

test('repository includes nojekyll marker for GitHub Pages static serving', () => {
  assert.ok(fs.existsSync(path.join(root,'.nojekyll')));
});

test('static data updater writes normalized results and both geographic map files', async () => {
  const os = require('node:os');
  const { updateLiveData, URLS } = require('../scripts/update-live-data.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'midterms-pages-'));
  const fixtures = {
    [URLS.watchVote.senate]: [{raceId:'2026-ga-senate',result:{candidates:[{name:'D',party:'Democratic',votes:6,percent:60,winner:true},{name:'R',party:'Republican',votes:4,percent:40}],expectedVoteShare:.5,source:{authority:'GA SOS'},updatedAt:'2026-11-04T01:00:00Z'}}],
    [URLS.watchVote.house]: [], [URLS.watchVote.governors]: [],
    [URLS.openAmerica.house]: {races:{}}, [URLS.openAmerica.senate]: {races:{}}, [URLS.openAmerica.governor]: {races:{}},
    [URLS.censusStates]: {type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'13',NAME:'Georgia'},geometry:{type:'Polygon',coordinates:[[[-85,30],[-81,30],[-81,35],[-85,35],[-85,30]]]}}]},
    [URLS.watchVote.districts]: {type:'FeatureCollection',features:[]}
  };
  await updateLiveData({outputDir:tmp, fetchJson:async url=>{ if(!(url in fixtures)) throw new Error(`unexpected ${url}`); return fixtures[url]; }});
  const results=JSON.parse(fs.readFileSync(path.join(tmp,'live-results.json'),'utf8'));
  const states=JSON.parse(fs.readFileSync(path.join(tmp,'states.geojson'),'utf8'));
  const districts=JSON.parse(fs.readFileSync(path.join(tmp,'house-districts.geojson'),'utf8'));
  assert.equal(results.chamber.senate.dem,1);
  assert.equal(results.races[0].key,'GA-senate');
  assert.equal(states.type,'FeatureCollection');
  assert.equal(districts.type,'FeatureCollection');
});
