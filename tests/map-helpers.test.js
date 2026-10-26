const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data.js');
const core=require('../app-core.js');

test('state metadata exposes FIPS codes for all 50 states plus DC',()=>{
  assert.equal(data.states.length,51);
  assert.equal(new Set(data.states.map(s=>s.fips)).size,51);
  assert.equal(data.states.find(s=>s.code==='NE').fips,'31');
  assert.equal(data.states.find(s=>s.code==='DC').fips,'11');
});

test('GeoJSON state feature can be resolved from Census GEOID or name',()=>{
  assert.equal(core.stateCodeFromGeoFeature({properties:{GEOID:'31',NAME:'Nebraska'}},data.states),'NE');
  assert.equal(core.stateCodeFromGeoFeature({properties:{GEOID:'13',NAME:'Georgia'}},data.states),'GA');
  assert.equal(core.stateCodeFromGeoFeature({properties:{NAME:'District of Columbia'}},data.states),'DC');
});

test('congressional district feature resolves to the dashboard race key',()=>{
  assert.equal(core.districtKeyFromGeoFeature({properties:{GEOID:'3102',CD120:'02',STATE:'31'}},data.states),'NE-02');
  assert.equal(core.districtKeyFromGeoFeature({properties:{GEOID:'0200',CD120:'00',STATE:'02'}},data.states),'AK-00');
});

test('source catalog includes automatic keyless sources and separates credentialed AP/DDHQ',()=>{
  assert.ok(data.sources.some(s=>/watch\.vote/i.test(s.name) && s.category==='Live Data'));
  assert.ok(data.sources.some(s=>/Open America/i.test(s.name) && s.category==='Live Data'));
  assert.ok(data.sources.some(s=>/civicAPI/i.test(s.name)));
  assert.ok(data.sources.some(s=>/AP Elections API/i.test(s.name) && /credentials|key/i.test(s.note)));
});
