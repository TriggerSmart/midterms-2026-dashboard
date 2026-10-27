const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createDashboardServer } = require('../local-server.js');

function requestJson(port, path) {
  return new Promise((resolve,reject)=>{
    http.get({host:'127.0.0.1',port,path,headers:{accept:'application/json'}}, res=>{
      let body=''; res.setEncoding('utf8'); res.on('data',c=>body+=c); res.on('end',()=>{
        try { resolve({status:res.statusCode, headers:res.headers, body:JSON.parse(body)}); }
        catch (e) { reject(new Error(`Invalid JSON for ${path}: ${body.slice(0,200)}`)); }
      });
    }).on('error',reject);
  });
}

const fixtures = {
  'https://watch.vote/api/elections/2026/results?office=senate': [{raceId:'2026-ga-senate',result:{candidates:[{name:'D',party:'Democratic',votes:60,percent:60,winner:true},{name:'R',party:'Republican',votes:40,percent:40,winner:false}],expectedVoteShare:.5,source:{authority:'GA SOS',url:'https://ga.gov'},updatedAt:'2026-11-04T01:00:00Z',freshness:'fresh'}}],
  'https://watch.vote/api/elections/2026/results?office=house': [],
  'https://watch.vote/api/elections/2026/results?office=governors': [],
  'https://openamerica.io/elections/results.json?year=2026&office=House': {races:{}},
  'https://openamerica.io/elections/results.json?year=2026&office=Senate': {races:{}},
  'https://openamerica.io/elections/results.json?year=2026&office=Governor': {races:{}},
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.02&f=geojson': {type:'FeatureCollection',features:[{type:'Feature',properties:{GEOID:'13',NAME:'Georgia'},geometry:{type:'Polygon',coordinates:[[[-85,30],[-81,30],[-81,35],[-85,35],[-85,30]]]}}]},
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD120%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.01&f=geojson': {type:'FeatureCollection',features:[]}
};

async function withServer(fn) {
  const calls=[];
  const server = createDashboardServer({
    rootDir: require('node:path').join(__dirname,'..'),
    fetchJsonImpl: async url => { calls.push(url); if (!(url in fixtures)) throw new Error(`unexpected URL ${url}`); return {data:fixtures[url], etag:null, status:200}; },
    disableDiskCache:true
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  try { await fn(port,calls); } finally { await new Promise(resolve=>server.close(resolve)); }
}

test('automatic results endpoint returns normalized keyless data without configuration', async () => {
  await withServer(async port => {
    const r=await requestJson(port,'/api/live/results');
    assert.equal(r.status,200);
    assert.equal(r.body.mode,'automatic');
    assert.ok(r.body.races.some(x=>x.key==='GA-senate'));
    assert.equal(r.body.results.find(x=>x.state==='GA').leader,'D');
    assert.equal(r.body.chamber.senate.dem,1);
    assert.equal(r.body.providerStatus.watchVote.ok,true);
  });
});

test('state map endpoint proxies Census GeoJSON through same-origin localhost', async () => {
  await withServer(async port => {
    const r=await requestJson(port,'/api/map/states');
    assert.equal(r.status,200);
    assert.equal(r.body.type,'FeatureCollection');
    assert.equal(r.body.features[0].properties.NAME,'Georgia');
  });
});

test('house district map endpoint proxies Census 120th Congress GeoJSON', async () => {
  await withServer(async port => {
    const r=await requestJson(port,'/api/map/house-districts');
    assert.equal(r.status,200);
    assert.equal(r.body.type,'FeatureCollection');
  });
});
