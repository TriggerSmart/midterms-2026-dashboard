'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildDashboardPayload } = require('./live-sources.js');

const HOST = '127.0.0.1';
const PORT = 8765;
const ROOT = path.resolve(__dirname);
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon'
};

const URLS = Object.freeze({
  watchVote: {
    senate:'https://watch.vote/api/elections/2026/results?office=senate',
    house:'https://watch.vote/api/elections/2026/results?office=house',
    governors:'https://watch.vote/api/elections/2026/results?office=governors',
    districts:'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD120%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.01&f=geojson'
  },
  openAmerica: {
    house:'https://openamerica.io/elections/results.json?year=2026&office=House',
    senate:'https://openamerica.io/elections/results.json?year=2026&office=Senate',
    governor:'https://openamerica.io/elections/results.json?year=2026&office=Governor'
  },
  censusStates:'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.02&f=geojson'
});

function safeFilePath(requestUrl, rootDir=ROOT) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, `http://${HOST}:${PORT}`).pathname); }
  catch { return null; }
  if (pathname === '/') pathname = '/index.html';
  const candidate = path.resolve(rootDir, `.${pathname}`);
  if (candidate !== rootDir && !candidate.startsWith(rootDir + path.sep)) return null;
  return candidate;
}

async function defaultFetchJson(url, options={}) {
  const timeoutMs = options.timeoutMs || 15000;
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect:'follow',
      headers:{
        'accept':'application/json, text/plain;q=0.8, */*;q=0.5',
        'accept-encoding':'gzip, br',
        'user-agent':'TriggerSmart-Midterms-Command-Center/2.0 (+local election-night dashboard)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    return {data:await res.json(), status:res.status, etag:res.headers.get('etag')};
  } finally { clearTimeout(timer); }
}

function jsonResponse(res, status, body, extraHeaders={}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Content-Length':Buffer.byteLength(text),
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    ...extraHeaders
  });
  res.end(text);
}

function createDashboardServer({rootDir=ROOT, fetchJsonImpl=defaultFetchJson, disableDiskCache=false}={}) {
  const memoryCache = new Map();
  const cacheDir = path.join(rootDir,'.midterms-cache');
  if (!disableDiskCache) {
    try { fs.mkdirSync(cacheDir,{recursive:true}); } catch (_) {}
  }

  function cachePath(key){ return path.join(cacheDir,`${key.replace(/[^a-z0-9_.-]/gi,'_')}.json`); }
  function readDisk(key){
    if (disableDiskCache) return null;
    try { return JSON.parse(fs.readFileSync(cachePath(key),'utf8')); } catch (_) { return null; }
  }
  function writeDisk(key, value){
    if (disableDiskCache) return;
    try { fs.writeFileSync(cachePath(key),JSON.stringify(value)); } catch (_) {}
  }

  async function cachedFetch(key, url, ttlMs) {
    const now = Date.now();
    const mem = memoryCache.get(key);
    if (mem && now - mem.savedAt < ttlMs) return {...mem, fromCache:true, stale:false};
    try {
      const fetched = await fetchJsonImpl(url);
      const item = {data:fetched.data, savedAt:now, etag:fetched.etag || null, url};
      memoryCache.set(key,item); writeDisk(key,item);
      return {...item, fromCache:false, stale:false};
    } catch (error) {
      const fallback = mem || readDisk(key);
      if (fallback && fallback.data != null) return {...fallback, fromCache:true, stale:true, error:String(error.message||error)};
      throw error;
    }
  }

  async function fetchGroup(defs, ttlMs) {
    const entries = await Promise.all(Object.entries(defs).map(async ([name,url])=>{
      try {
        const hit=await cachedFetch(`${name}-${Buffer.from(url).toString('base64url').slice(0,16)}`,url,ttlMs);
        return [name,{ok:true,data:hit.data,stale:Boolean(hit.stale),error:hit.error||'',savedAt:hit.savedAt,url}];
      } catch(error) {
        return [name,{ok:false,data:null,stale:false,error:String(error.message||error),savedAt:null,url}];
      }
    }));
    return Object.fromEntries(entries);
  }

  async function buildLiveResults() {
    const [wv,oa] = await Promise.all([
      fetchGroup({senate:URLS.watchVote.senate,house:URLS.watchVote.house,governors:URLS.watchVote.governors},55_000),
      fetchGroup({house:URLS.openAmerica.house,senate:URLS.openAmerica.senate,governor:URLS.openAmerica.governor},55_000)
    ]);
    const payload = buildDashboardPayload({
      watchVote:{senate:wv.senate.data,house:wv.house.data,governors:wv.governors.data},
      openAmerica:{house:oa.house.data,senate:oa.senate.data,governor:oa.governor.data},
      fetchedAt:new Date().toISOString()
    });
    const statusFor = group => ({
      ok:Object.values(group).some(x=>x.ok),
      stale:Object.values(group).some(x=>x.stale),
      endpoints:Object.fromEntries(Object.entries(group).map(([k,v])=>[k,{ok:v.ok,stale:v.stale,error:v.error||'',cachedAt:v.savedAt?new Date(v.savedAt).toISOString():null}]))
    });
    payload.providerStatus={watchVote:statusFor(wv),openAmerica:statusFor(oa)};
    payload.armedBeforeResults = payload.races.every(r=>!r.providerResultAvailable);
    return payload;
  }

  async function apiRoute(req,res,pathname) {
    if (pathname === '/api/live/results' || pathname === '/api/live/status') {
      const payload=await buildLiveResults();
      if (pathname === '/api/live/status') return jsonResponse(res,200,{updatedAt:payload.updatedAt,providerStatus:payload.providerStatus,armedBeforeResults:payload.armedBeforeResults,raceCount:payload.races.length});
      return jsonResponse(res,200,payload);
    }
    if (pathname === '/api/map/states') {
      const hit=await cachedFetch('census-2026-states',URLS.censusStates,24*60*60*1000);
      return jsonResponse(res,200,hit.data,{'X-Data-Source':'U.S. Census Bureau TIGERweb 2026','X-Cache-Stale':String(Boolean(hit.stale))});
    }
    if (pathname === '/api/map/house-districts') {
      const hit=await cachedFetch('census-2026-house-districts',URLS.watchVote.districts,24*60*60*1000);
      return jsonResponse(res,200,hit.data,{'X-Data-Source':'U.S. Census Bureau TIGERweb 120th Congressional Districts','X-Cache-Stale':String(Boolean(hit.stale))});
    }
    return false;
  }

  return http.createServer(async (req,res)=>{
    if (!['GET','HEAD'].includes(req.method)) {
      res.writeHead(405, {'Content-Type':'text/plain; charset=utf-8','Allow':'GET, HEAD'});
      return res.end('Method not allowed');
    }
    let parsed;
    try { parsed=new URL(req.url || '/',`http://${HOST}:${PORT}`); }
    catch { res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}); return res.end('Bad request'); }
    if (parsed.pathname.startsWith('/api/')) {
      if (req.method === 'HEAD') { res.writeHead(405,{'Content-Type':'text/plain; charset=utf-8'}); return res.end(); }
      try {
        const handled=await apiRoute(req,res,parsed.pathname);
        if (handled !== false) return;
        return jsonResponse(res,404,{error:'API route not found'});
      } catch(error) {
        return jsonResponse(res,502,{error:'Upstream data unavailable',detail:String(error.message||error)});
      }
    }

    const filePath = safeFilePath(req.url || '/',rootDir);
    if (!filePath) { res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}); return res.end('Bad request'); }
    fs.stat(filePath,(statErr,stat)=>{
      if (statErr || !stat.isFile()) { res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); return res.end('Not found'); }
      const headers={
        'Content-Type':MIME[path.extname(filePath).toLowerCase()]||'application/octet-stream',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'
      };
      res.writeHead(200,headers); if(req.method==='HEAD') return res.end(); fs.createReadStream(filePath).pipe(res);
    });
  });
}

function openBrowser(url) {
  if (process.argv.includes('--no-open')) return;
  const options={detached:true,stdio:'ignore'};
  try {
    if(process.platform==='win32') spawn('cmd',['/c','start','',url],options).unref();
    else if(process.platform==='darwin') spawn('open',[url],options).unref();
    else spawn('xdg-open',[url],options).unref();
  } catch (_) {}
}

function startServer(){
  const server=createDashboardServer();
  server.listen(PORT,HOST,()=>{
    const url=`http://${HOST}:${PORT}/`;
    console.log(`2026 Midterms Command Center: ${url}`);
    console.log('Automatic keyless results: watch.vote + Open America; map geometry: U.S. Census Bureau.');
    console.log('Press Ctrl+C to stop the local dashboard server.');
    openBrowser(url);
  });
  server.on('error',err=>{console.error(`Could not start local server on ${HOST}:${PORT}: ${err.message}`);process.exitCode=1;});
  return server;
}

if (require.main === module) startServer();

module.exports={createDashboardServer,startServer,URLS,safeFilePath,defaultFetchJson};
