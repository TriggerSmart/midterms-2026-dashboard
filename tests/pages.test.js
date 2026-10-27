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

test('browser geometry fallbacks use official Census TIGERweb 2026 state and 120th Congress layers', () => {
  const app = read('app.js');
  assert.match(app, /TIGERweb\/State_County\/MapServer\/0\/query/);
  assert.match(app, /TIGERweb\/Legislative\/MapServer\/0\/query/);
  assert.match(app, /seifertben\/election-map.*public\/data\/states\.json/);
  assert.match(app, /seifertben\/election-map.*public\/data\/cd120\.json/);
  assert.match(app, /CD120/);
  assert.match(app, /f=geojson/);
});

test('published assets are cache-busted so GitHub Pages updates cannot leave an old dashboard script loaded', () => {
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=20261026-mapfix/);
  assert.match(html, /projections\.js\?v=20261026-mapfix/);
  assert.match(html, /app\.js\?v=20261026-mapfix/);
  assert.match(html, /2026\.10\.26-mapfix/);
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
    [URLS.censusStates]: {type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'13',STATE:'13',NAME:'Georgia'},geometry:{type:'Polygon',coordinates:[[[-85,30],[-81,30],[-81,35],[-85,35],[-85,30]]]}}]},
    [URLS.censusDistricts]: {type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'1301',STATE:'13',CD120:'01',NAME:'Congressional District 1'},geometry:{type:'Polygon',coordinates:[[[-85,30],[-83,30],[-83,32],[-85,32],[-85,30]]]}}]}
  };
  await updateLiveData({outputDir:tmp, fetchJson:async url=>{ if(!(url in fixtures)) throw new Error(`unexpected ${url}`); return fixtures[url]; }});
  const results=JSON.parse(fs.readFileSync(path.join(tmp,'live-results.json'),'utf8'));
  const states=JSON.parse(fs.readFileSync(path.join(tmp,'states.geojson'),'utf8'));
  const districts=JSON.parse(fs.readFileSync(path.join(tmp,'house-districts.geojson'),'utf8'));
  assert.equal(results.chamber.senate.dem,1);
  assert.equal(results.races[0].key,'GA-senate');
  assert.equal(states.type,'FeatureCollection');
  assert.equal(districts.type,'FeatureCollection');
  assert.equal(districts.features[0].properties.CD120,'01');
});

test('static data updater falls back to a Census-derived GitHub mirror when Census geometry is unavailable', async () => {
  const os = require('node:os');
  const { updateLiveData, URLS } = require('../scripts/update-live-data.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'midterms-geo-fallback-'));
  const stateGeo={type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'31',STATE:'31',NAME:'Nebraska'},geometry:{type:'Polygon',coordinates:[[[-104,40],[-95,40],[-95,43],[-104,43],[-104,40]]]}}]};
  const districtGeo={type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'3102',STATE:'31',CD120:'02',NAME:'Congressional District 2'},geometry:{type:'Polygon',coordinates:[[[-97,40],[-95,40],[-95,42],[-97,42],[-97,40]]]}}]};
  const fetchJson=async url=>{
    if(url===URLS.censusStates || url===URLS.censusDistricts) throw new Error('simulated Census outage');
    if(url===URLS.geometryMirrors.states) return stateGeo;
    if(url===URLS.geometryMirrors.districts) return districtGeo;
    if(Object.values(URLS.watchVote).includes(url)) return [];
    if(Object.values(URLS.openAmerica).includes(url)) return {races:{}};
    if(url===URLS.currentLegislators) return [];
    throw new Error(`unexpected ${url}`);
  };
  await updateLiveData({outputDir:tmp,fetchJson});
  const states=JSON.parse(fs.readFileSync(path.join(tmp,'states.geojson'),'utf8'));
  const districts=JSON.parse(fs.readFileSync(path.join(tmp,'house-districts.geojson'),'utf8'));
  assert.equal(states.features.length,1);
  assert.equal(districts.features.length,1);
  assert.equal(districts.features[0].properties.CD120,'02');
});
