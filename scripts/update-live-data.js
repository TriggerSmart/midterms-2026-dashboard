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
  censusStates:'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query?where=1%3D1&outFields=GEOID%2CNAME&returnGeometry=true&outSR=4326&f=geojson'
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
        'user-agent':'TriggerSmart-Midterms-Command-Center/3.0 (+GitHub Pages static mirror)'
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

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

async function updateLiveData({outputDir=path.resolve(__dirname,'..','assets','data'), fetchJson=defaultFetchJson}={}) {
  fs.mkdirSync(outputDir,{recursive:true});

  const [watch, open, stateMapResult, districtMapResult] = await Promise.all([
    fetchGroup({senate:URLS.watchVote.senate,house:URLS.watchVote.house,governors:URLS.watchVote.governors},fetchJson),
    fetchGroup({house:URLS.openAmerica.house,senate:URLS.openAmerica.senate,governor:URLS.openAmerica.governor},fetchJson),
    (async()=>{try{return {ok:true,data:await fetchJson(URLS.censusStates),error:''};}catch(error){return {ok:false,data:null,error:String(error.message||error)};}})(),
    (async()=>{try{return {ok:true,data:await fetchJson(URLS.watchVote.districts),error:''};}catch(error){return {ok:false,data:null,error:String(error.message||error)};}})()
  ]);

  if (!statusFor(watch).ok && !statusFor(open).ok) throw new Error('No election result provider answered; refusing to replace the last deployed snapshot.');

  const generatedAt = new Date().toISOString();
  const payload = buildDashboardPayload({
    watchVote:{senate:watch.senate.data,house:watch.house.data,governors:watch.governors.data},
    openAmerica:{house:open.house.data,senate:open.senate.data,governor:open.governor.data},
    fetchedAt:generatedAt
  });
  payload.providerStatus={watchVote:statusFor(watch),openAmerica:statusFor(open)};
  payload.armedBeforeResults = payload.races.every(r=>!r.providerResultAvailable);
  payload.staticMirror = {generatedAt, method:'GitHub Actions', refreshTarget:'5 minutes on Nov. 3-5, 2026'};
  writeJson(path.join(outputDir,'live-results.json'),payload);

  const stateFile=path.join(outputDir,'states.geojson');
  if (stateMapResult.ok) writeJson(stateFile,stateMapResult.data);
  else if (!fs.existsSync(stateFile)) throw new Error(`State map unavailable and no existing fallback exists: ${stateMapResult.error}`);

  const districtFile=path.join(outputDir,'house-districts.geojson');
  if (districtMapResult.ok) writeJson(districtFile,districtMapResult.data);
  else if (!fs.existsSync(districtFile)) throw new Error(`House district map unavailable and no existing fallback exists: ${districtMapResult.error}`);

  const sourceStatus={
    generatedAt,
    watchVote:statusFor(watch),
    openAmerica:statusFor(open),
    maps:{
      censusStates:{ok:stateMapResult.ok,error:stateMapResult.error||''},
      watchVoteDistricts:{ok:districtMapResult.ok,error:districtMapResult.error||''}
    }
  };
  writeJson(path.join(outputDir,'source-status.json'),sourceStatus);
  return {payload,sourceStatus};
}

function argValue(name) {
  const ix=process.argv.indexOf(name);
  return ix>=0 && process.argv[ix+1] ? process.argv[ix+1] : null;
}

if (require.main === module) {
  const output = argValue('--output-dir');
  updateLiveData({outputDir:output ? path.resolve(output) : undefined})
    .then(({payload})=>console.log(`Updated static election data: ${payload.races.length} races at ${payload.updatedAt}`))
    .catch(error=>{console.error(error.stack||error);process.exitCode=1;});
}

module.exports={URLS,defaultFetchJson,fetchGroup,statusFor,updateLiveData};
