'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDashboardPayload } = require('../live-sources.js');

const URLS = Object.freeze({
  watchVote: {
    senate:'https://watch.vote/api/elections/2026/results?office=senate',
    house:'https://watch.vote/api/elections/2026/results?office=house',
    governors:'https://watch.vote/api/elections/2026/results?office=governors',
    districts:'https://watch.vote/api/elections/2026/districts/national'
  },
  openAmerica: {
    house:'https://openamerica.io/elections/results.json?year=2026&office=House',
    senate:'https://openamerica.io/elections/results.json?year=2026&office=Senate',
    governor:'https://openamerica.io/elections/results.json?year=2026&office=Governor'
  },
  censusStates:'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.02&f=geojson',
  censusDistricts:'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD120%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.01&f=geojson',
  geometryMirrors:{
    states:'https://cdn.jsdelivr.net/gh/seifertben/election-map@main/public/data/states.json',
    districts:'https://cdn.jsdelivr.net/gh/seifertben/election-map@main/public/data/cd120.json'
  },
  currentLegislators:'https://unitedstates.github.io/congress-legislators/legislators-current.json'
});

async function defaultFetchJson(url, timeoutMs=25000) {
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal:ctl.signal,
      redirect:'follow',
      headers:{
        accept:'application/json, text/plain;q=0.8, */*;q=0.5',
        'user-agent':'TriggerSmart-Midterms-Command-Center/4.0 (+GitHub Pages static mirror)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function fetchGroup(defs, fetchJson) {
  const entries = await Promise.all(Object.entries(defs).map(async ([key,url])=>{
    try { return [key,{ok:true,data:await fetchJson(url),url,error:''}]; }
    catch (error) { return [key,{ok:false,data:null,url,error:String(error.message||error)}]; }
  }));
  return Object.fromEntries(entries);
}

function statusFor(group) {
  return {
    ok:Object.values(group).some(x=>x.ok),
    stale:false,
    endpoints:Object.fromEntries(Object.entries(group).map(([k,v])=>[k,{ok:v.ok,error:v.error||'',url:v.url}]))
  };
}

function hasGeoFeatures(value){return Boolean(value&&Array.isArray(value.features)&&value.features.length);}
async function fetchGeometry(primary, mirror, fetchJson) {
  const errors=[];
  for(const [source,url] of [['census',primary],['mirror',mirror]]){
    try{
      const data=await fetchJson(url);
      if(!hasGeoFeatures(data))throw new Error('returned no features');
      return {ok:true,data,error:'',source,url};
    }catch(error){errors.push(`${source}: ${String(error.message||error)}`);}
  }
  return {ok:false,data:null,error:errors.join(' | '),source:'',url:''};
}

function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function readJsonIfPresent(file) { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch (_) { return null; } }

function partyCode(party, caucus='') {
  const p=String(caucus||party||'').toLowerCase();
  if(p.includes('democrat')) return 'D';
  if(p.includes('republican')) return 'R';
  if(p.includes('independent')) return 'I';
  return 'O';
}

function buildHouseBaseline(legislators, generatedAt=new Date().toISOString()) {
  const districts={};
  for(const person of Array.isArray(legislators)?legislators:[]) {
    const terms=Array.isArray(person.terms)?person.terms:[];
    const current=[...terms].reverse().find(t=>t&&t.type==='rep'&&String(t.end||'9999')>generatedAt.slice(0,10));
    if(!current || !/^[A-Z]{2}$/.test(String(current.state||'')) || current.district==null) continue;
    const district=String(Number(current.district)).padStart(2,'0');
    const key=`${current.state}-${district}`;
    districts[key]={
      party:partyCode(current.party,current.caucus),
      partyLabel:String(current.party||''),
      incumbent:String(person.name?.official_full || [person.name?.first,person.name?.last].filter(Boolean).join(' ') || 'Current member'),
      state:current.state,
      district
    };
  }
  return {updatedAt:generatedAt,source:'UnitedStates/congress-legislators current House membership (CC0)',districts};
}

async function updateLiveData({outputDir=path.resolve(__dirname,'..','assets','data'), fetchJson=defaultFetchJson}={}) {
  fs.mkdirSync(outputDir,{recursive:true});

  const [watch, open, stateMapResult, districtMapResult, legislatorsResult] = await Promise.all([
    fetchGroup({senate:URLS.watchVote.senate,house:URLS.watchVote.house,governors:URLS.watchVote.governors},fetchJson),
    fetchGroup({house:URLS.openAmerica.house,senate:URLS.openAmerica.senate,governor:URLS.openAmerica.governor},fetchJson),
    fetchGeometry(URLS.censusStates,URLS.geometryMirrors.states,fetchJson),
    fetchGeometry(URLS.censusDistricts,URLS.geometryMirrors.districts,fetchJson),
    (async()=>{try{return {ok:true,data:await fetchJson(URLS.currentLegislators),error:''};}catch(error){return {ok:false,data:null,error:String(error.message||error)};}})()
  ]);

  const generatedAt = new Date().toISOString();
  const watchStatus=statusFor(watch), openStatus=statusFor(open);
  const resultsFile=path.join(outputDir,'live-results.json');
  const prior=readJsonIfPresent(resultsFile);
  let payload;

  if(watchStatus.ok || openStatus.ok) {
    payload = buildDashboardPayload({
      watchVote:{senate:watch.senate.data,house:watch.house.data,governors:watch.governors.data},
      openAmerica:{house:open.house.data,senate:open.senate.data,governor:open.governor.data},
      fetchedAt:generatedAt
    });
  } else if(prior && Array.isArray(prior.races) && prior.races.length) {
    payload={...prior,updatedAt:prior.updatedAt||generatedAt,mode:'automatic'};
  } else {
    payload=buildDashboardPayload({fetchedAt:generatedAt});
  }

  payload.providerStatus={watchVote:watchStatus,openAmerica:openStatus};
  payload.armedBeforeResults = !payload.races.some(r=>r&&r.providerResultAvailable);
  payload.staticMirror = {
    generatedAt,
    method:'GitHub Actions',
    refreshTarget:'daily pre-election; about every 5 minutes Nov. 3-5, 2026',
    providerReachable:Boolean(watchStatus.ok||openStatus.ok)
  };
  writeJson(resultsFile,payload);

  const stateFile=path.join(outputDir,'states.geojson');
  if (stateMapResult.ok) writeJson(stateFile,stateMapResult.data);
  else if (!fs.existsSync(stateFile)) writeJson(stateFile,{type:'FeatureCollection',features:[]});

  const districtFile=path.join(outputDir,'house-districts.geojson');
  if (districtMapResult.ok) writeJson(districtFile,districtMapResult.data);
  else if (!fs.existsSync(districtFile)) writeJson(districtFile,{type:'FeatureCollection',features:[]});

  const baselineFile=path.join(outputDir,'house-baseline.json');
  if(legislatorsResult.ok) writeJson(baselineFile,buildHouseBaseline(legislatorsResult.data,generatedAt));
  else if(!fs.existsSync(baselineFile)) writeJson(baselineFile,{updatedAt:null,source:'Current House baseline unavailable',districts:{}});

  const sourceStatus={
    generatedAt,
    watchVote:watchStatus,
    openAmerica:openStatus,
    maps:{
      states:{ok:stateMapResult.ok,error:stateMapResult.error||'',source:stateMapResult.source||'',url:stateMapResult.url||''},
      districts:{ok:districtMapResult.ok,error:districtMapResult.error||'',source:districtMapResult.source||'',url:districtMapResult.url||''}
    },
    projections:{
      currentHouseBaseline:{ok:legislatorsResult.ok,error:legislatorsResult.error||'',source:URLS.currentLegislators}
    }
  };
  writeJson(path.join(outputDir,'source-status.json'),sourceStatus);
  return {payload,sourceStatus};
}

function argValue(name) { const ix=process.argv.indexOf(name); return ix>=0&&process.argv[ix+1]?process.argv[ix+1]:null; }

if (require.main === module) {
  const output=argValue('--output-dir');
  updateLiveData({outputDir:output?path.resolve(output):undefined})
    .then(({payload,sourceStatus})=>console.log(`Updated static election data: ${payload.races.length} races; providers reachable=${sourceStatus.watchVote.ok||sourceStatus.openAmerica.ok}`))
    .catch(error=>{console.error(error.stack||error);process.exitCode=1;});
}

module.exports={URLS,defaultFetchJson,fetchGroup,statusFor,hasGeoFeatures,fetchGeometry,buildHouseBaseline,updateLiveData};
