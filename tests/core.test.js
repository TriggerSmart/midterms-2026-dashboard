const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('../data.js');
const core = require('../app-core.js');

test('cycle metadata targets November 3 2026 and correct federal seat counts', () => {
  assert.equal(data.electionDate, '2026-11-03');
  assert.equal(data.houseSeatsUp, 435);
  assert.equal(data.senateSeatsUp, 35);
  assert.equal(data.governorRaces, 36);
});

test('state metadata includes all 50 states plus DC exactly once', () => {
  assert.equal(data.states.length, 51);
  assert.equal(new Set(data.states.map(s => s.code)).size, 51);
  assert.ok(data.states.some(s => s.code === 'DC'));
  assert.ok(data.states.some(s => s.code === 'NE'));
});

test('preloaded sources and live video presets are broad enough for election night', () => {
  assert.ok(data.sources.length >= 10);
  assert.ok(data.videoPresets.length >= 6);
  assert.ok(data.videoPresets.some(v => v.name.includes('ABC')));
  assert.ok(data.videoPresets.some(v => v.name.includes('NBC')));
  assert.ok(data.sources.some(s => s.name.includes('Decision Desk')));
});

test('youtube id parser supports watch, youtu.be, shorts, embed and raw IDs', () => {
  const id = 'dQw4w9WgXcQ';
  assert.equal(core.parseYouTubeId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(core.parseYouTubeId(`https://youtu.be/${id}?t=20`), id);
  assert.equal(core.parseYouTubeId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(core.parseYouTubeId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(core.parseYouTubeId(id), id);
  assert.equal(core.parseYouTubeId('not-a-youtube-url'), null);
});

test('normalize result record validates state and provenance while clamping percentages', () => {
  const record = core.normalizeResultRecord({ state:'ga', leader:'D', demPct: 52.4, repPct: 47.9, reporting: 103, source:'manual' }, data.states);
  assert.equal(record.state, 'GA');
  assert.equal(record.leader, 'D');
  assert.equal(record.reporting, 100);
  assert.equal(record.source, 'manual');
  assert.throws(() => core.normalizeResultRecord({state:'ZZ'}, data.states), /Unknown state/);
});

test('validate import accepts chamber summary and result array but rejects malformed payload', () => {
  const good = core.validateImportPayload({
    updatedAt: '2026-11-03T23:00:00Z',
    chamber: { house: { dem: 180, rep: 184, other: 1, called: 365 }, senate: { dem: 42, rep: 48, other: 2, called: 92 } },
    results: [{ state:'NE', leader:'R', reporting:44, source:'imported' }]
  }, data.states);
  assert.equal(good.results.length, 1);
  assert.equal(good.chamber.house.called, 365);
  assert.throws(() => core.validateImportPayload({ results: 'nope' }, data.states), /results must be an array/);
});

test('headline normalization strips markup and creates ticker-safe text', () => {
  const out = core.normalizeHeadline({ title:'<b>Race call:</b> Georgia Senate &amp; more', link:'https://example.com' });
  assert.equal(out.title, 'Race call: Georgia Senate & more');
  assert.equal(out.link, 'https://example.com');
});

test('seat summary computes majority status without inventing uncalled seats', () => {
  const h = core.computeChamberStatus({dem:218, rep:210, other:0, called:428}, 435, 218);
  assert.equal(h.control, 'D');
  assert.equal(h.uncalled, 7);
  const s = core.computeChamberStatus({dem:49, rep:49, other:2, called:100}, 100, 51);
  assert.equal(s.control, 'TOSS');
});

test('video embed builder supports fixed videos and channel live streams', () => {
  assert.match(core.makeYouTubeEmbedUrl({type:'video', id:'dQw4w9WgXcQ'}), /embed\/dQw4w9WgXcQ/);
  assert.match(core.makeYouTubeEmbedUrl({type:'channel', channelId:'UCBi2mrWuNuyYy4gbM6fU18Q'}), /live_stream\?channel=UCBi2mrWuNuyYy4gbM6fU18Q/);
});

test('merge result maps updates only supplied states', () => {
  const existing = {GA:{state:'GA',leader:'R',reporting:10}, NE:{state:'NE',leader:'R',reporting:5}};
  const merged = core.mergeResultMaps(existing, [{state:'GA',leader:'D',reporting:20}]);
  assert.equal(merged.GA.leader, 'D');
  assert.equal(merged.NE.reporting, 5);
});

test('static shell exposes required dashboard, video, map and ticker anchors', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
  for (const id of ['page-root','video-layer','ticker','add-video-panel','toast']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /app-core\.js/);
  assert.match(html, /data\.js/);
  assert.match(html, /app\.js/);
});

test('static shell declares an embed referrer policy and explains direct-file YouTube limitation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html, /<meta\s+name=["']referrer["']\s+content=["']strict-origin-when-cross-origin["']/i);
  assert.match(html, /id=["']file-video-warning["']/);
});

test('package includes a dependency-free localhost launcher for reliable YouTube embeds', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const launcher = fs.readFileSync(path.join(__dirname,'..','local-server.js'),'utf8');
  assert.match(launcher, /127\.0\.0\.1/);
  assert.match(launcher, /8765/);
  assert.match(launcher, /http\.createServer/);
});

test('Decision Desk result launcher targets the verified 2026 election results page', () => {
  const ddhq = data.sources.find(s => s.name.includes('Decision Desk HQ — Nov. 3 results'));
  assert.equal(ddhq.url, 'https://votes.decisiondeskhq.com/elections/2026-11-03');
});
