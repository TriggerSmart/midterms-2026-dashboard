const test = require('node:test');
const assert = require('node:assert/strict');

const live = require('../live-sources.js');
const core = require('../app-core.js');

const watchRows = {
  senate: [
    {
      raceId: '2026-ga-senate',
      result: {
        callState: 'called',
        callLabel: 'Democratic win',
        candidates: [
          {name:'Jane Democrat', party:'Democratic', votes:101000, percent:51.2, winner:true},
          {name:'John Republican', party:'Republican', votes:96000, percent:48.6, winner:false}
        ],
        totalVotes: 197000,
        expectedVoteShare: 0.72,
        precinctsReporting: null,
        unofficial: true,
        source: {kind:'official', authority:'Georgia Secretary of State', url:'https://example.gov/results'},
        updatedAt: '2026-11-04T01:15:00Z',
        freshness: 'fresh'
      },
      official: {url:'https://example.gov/results'}
    }
  ],
  house: [
    {
      raceId: '2026-ne-house-02',
      result: {
        callState: 'uncalled',
        candidates: [
          {name:'R Candidate', party:'Republican', votes:80000, percent:50.1, winner:false},
          {name:'D Candidate', party:'Democratic', votes:79000, percent:49.5, winner:false}
        ],
        precinctsReporting: {counted:210, total:300},
        source: {kind:'official', authority:'Nebraska Secretary of State', url:'https://example.gov/ne'},
        updatedAt: '2026-11-04T02:00:00Z',
        freshness: 'fresh'
      }
    }
  ],
  governors: []
};

test('watch.vote normalization creates stable race records with winner, reporting, and provenance', () => {
  const races = live.normalizeWatchVoteOffice(watchRows.senate, 'senate');
  assert.equal(races.length, 1);
  assert.deepEqual(races[0].key, 'GA-senate');
  assert.equal(races[0].state, 'GA');
  assert.equal(races[0].office, 'senate');
  assert.equal(races[0].leader, 'D');
  assert.equal(races[0].called, true);
  assert.equal(races[0].winnerParty, 'D');
  assert.equal(races[0].reporting, 72);
  assert.equal(races[0].sourceAuthority, 'Georgia Secretary of State');
  assert.equal(races[0].freshness, 'fresh');
});

test('watch.vote reporting falls back to precinct counts and house district is parsed', () => {
  const races = live.normalizeWatchVoteOffice(watchRows.house, 'house');
  assert.equal(races[0].key, 'NE-02');
  assert.equal(races[0].district, '02');
  assert.equal(races[0].leader, 'R');
  assert.equal(races[0].reporting, 70);
  assert.equal(races[0].called, false);
});

test('Open America normalization reads official state-count race shape', () => {
  const payload = {
    source:'state', as_of:'2026-11-04T01:20:00Z', live:true, stale:false,
    races: {
      'TX-23': {leader:'R', called:false, winner:'', pct_in:66.4, total:120000, cands:[{n:'R Name',p:'R',v:62000,pct:51.7,w:false},{n:'D Name',p:'D',v:57000,pct:47.5,w:false}]}
    }
  };
  const races = live.normalizeOpenAmerica(payload, 'house');
  assert.equal(races.length, 1);
  assert.equal(races[0].key, 'TX-23');
  assert.equal(races[0].leader, 'R');
  assert.equal(races[0].reporting, 66.4);
  assert.equal(races[0].sourceProvider, 'Open America');
  assert.equal(races[0].sourceAuthority, 'Official state election office');
});

test('provider merge keeps watch.vote calls but fills missing races from Open America', () => {
  const primary = live.normalizeWatchVoteOffice(watchRows.senate, 'senate');
  const secondary = live.normalizeOpenAmerica({races:{NE:{leader:'R',called:false,winner:'',pct_in:10,total:100,cands:[{n:'A',p:'R',v:55,pct:55},{n:'B',p:'D',v:45,pct:45}]}}}, 'senate');
  const merged = live.mergeRaces(primary, secondary);
  assert.equal(merged.length, 2);
  assert.ok(merged.some(r => r.key === 'GA-senate'));
  assert.ok(merged.some(r => r.key === 'NE-senate'));
});

test('dashboard payload builds state summaries and called-race chamber counts', () => {
  const payload = live.buildDashboardPayload({watchVote:watchRows, openAmerica:{house:null, senate:null, governor:null}, fetchedAt:'2026-11-04T02:01:00Z'});
  assert.ok(payload.races.some(r => r.key === 'GA-senate'));
  assert.equal(payload.chamber.senate.dem, 1);
  assert.equal(payload.chamber.senate.called, 1);
  const ga = payload.results.find(r => r.state === 'GA');
  assert.equal(ga.leader, 'D');
  assert.equal(ga.called, true);
  assert.equal(ga.source, 'connected');
  assert.match(ga.note, /Senate/i);
});

test('geographic path helper renders Polygon and MultiPolygon GeoJSON into SVG path data', () => {
  const polygon = {type:'Feature', properties:{GEOID:'31',NAME:'Nebraska'}, geometry:{type:'Polygon', coordinates:[[[-104,40],[-95,40],[-95,43],[-104,43],[-104,40]]]}};
  const multi = {type:'Feature', properties:{GEOID:'02',NAME:'Alaska'}, geometry:{type:'MultiPolygon', coordinates:[[[[-170,55],[-150,55],[-150,70],[-170,70],[-170,55]]],[[[-140,55],[-135,55],[-135,60],[-140,60],[-140,55]]]]}};
  const p1 = core.geoFeatureToPath(polygon, 1000, 600);
  const p2 = core.geoFeatureToPath(multi, 1000, 600);
  assert.match(p1, /^M/);
  assert.match(p1, /Z$/);
  assert.ok((p2.match(/M/g)||[]).length >= 2);
  assert.ok(!p2.includes('NaN'));
});

test('Open America fills a same-race result when watch.vote only has pre-election metadata', () => {
  const watch = [{raceId:'2026-ga-senate', result:null, official:{authority:'Georgia SOS',url:'https://example.gov'}}];
  const open = {as_of:'2026-11-04T00:00:00Z', live:true, races:{GA:{pct_in:25,total:1000,leader:'D',cands:[{name:'Dem',party:'D',votes:520,percent:52},{name:'Rep',party:'R',votes:480,percent:48}]}}};
  const merged = live.mergeRaces(live.normalizeWatchVoteOffice(watch,'senate'), live.normalizeOpenAmerica(open,'senate'));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].providerResultAvailable, true);
  assert.equal(merged[0].leader, 'D');
  assert.equal(merged[0].totalVotes, 1000);
  assert.equal(merged[0].sourceProvider, 'Open America');
});
