(() => {
  'use strict';
  const D = window.MIDTERM_DATA;
  const P = window.MIDTERM_PROJECTIONS;
  const C = window.MidtermsCore;
  const L = window.MidtermsLiveSources;
  if (!D || !P || !C || !L) throw new Error('Midterms data/projections/core/live-source helpers not loaded');

  const STORE_KEY = 'midterms2026.commandCenter.v3';
  const BUILD_ID = '2026.10.26-controlfix';
  const qs = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v='') => String(v).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const fmtTime = iso => { try { return new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); } catch (_) { return ''; } };
  const fmtDateTime = iso => { try { return new Date(iso).toLocaleString(); } catch (_) { return ''; } };
  const fmtNum = n => Number(n||0).toLocaleString();
  const stateName = code => (D.states.find(s => s.code === code) || {}).name || code;
  const senateBG = new Set(D.senateBattlegrounds.map(r => r.state));
  const govBG = new Set(D.governorBattlegrounds.map(r => r.state));
  const houseBGStates = new Set(D.houseTossups.map(r => r.split('-')[0]));
  const DATA_PATHS = Object.freeze({
    results:'assets/data/live-results.json',
    states:'assets/data/states.geojson',
    districts:'assets/data/house-districts.geojson',
    houseBaseline:'assets/data/house-baseline.json'
  });
  const HOUSE_BASELINE_FALLBACKS=Object.freeze([
    {url:'https://cdn.jsdelivr.net/gh/unitedstates/congress-legislators@gh-pages/legislators-current.json',kind:'legislators',label:'UnitedStates/congress-legislators via jsDelivr'},
    {url:'https://civdotiq.org/api/download/congress-members?format=json',kind:'civiq',label:'CIV.IQ public House membership'}
  ]);
  const GEO_FALLBACKS = Object.freeze({
    states:[
      'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.02&f=geojson',
      'https://cdn.jsdelivr.net/gh/seifertben/election-map@main/public/data/states.json'
    ],
    districts:[
      'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD120%2CBASENAME%2CNAME&returnGeometry=true&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.01&f=geojson',
      'https://cdn.jsdelivr.net/gh/seifertben/election-map@main/public/data/cd120.json'
    ]
  });
  const OPEN_AMERICA = Object.freeze({
    house:'https://openamerica.io/elections/results.json?year=2026&office=House',
    senate:'https://openamerica.io/elections/results.json?year=2026&office=Senate',
    governor:'https://openamerica.io/elections/results.json?year=2026&office=Governor'
  });

  function defaultState(){
    return {
      results: {},
      chamber: {house:{dem:0,rep:0,other:0,called:0}, senate:{dem:0,rep:0,other:0,called:0}},
      headlines: D.defaultHeadlines.map(C.normalizeHeadline),
      headlineMode: 'fallback',
      newsLastUpdated: null,
      selectedState: 'GA',
      selectedRaceKey: null,
      notes: '',
      videos: [],
      settings: {
        automaticResults:true,
        pollSeconds:60,
        mapLayer:'house',
        mapMode:'projection',
        resultsUrl:'',
        newsQuery:'2026 midterm elections',
        rss2json:'https://api.rss2json.com/v1/api.json?rss_url=',
        allOrigins:'https://api.allorigins.win/raw?url='
      },
      resultsMeta:{mode:'automatic/armed',lastUpdated:null,lastError:''}
    };
  }

  function loadState(){
    const base=defaultState();
    try {
      const raw=localStorage.getItem(STORE_KEY);
      if(!raw) return base;
      const saved=JSON.parse(raw);
      return {
        ...base,...saved,
        chamber:{...base.chamber,...(saved.chamber||{})},
        settings:{...base.settings,...(saved.settings||{})},
        resultsMeta:{...base.resultsMeta,...(saved.resultsMeta||{})},
        results:saved.results&&typeof saved.results==='object'?saved.results:{},
        videos:Array.isArray(saved.videos)?saved.videos:[],
        headlines:Array.isArray(saved.headlines)&&saved.headlines.length?saved.headlines.map(C.normalizeHeadline):base.headlines
      };
    } catch(err){ console.warn('Local state could not be restored',err); return base; }
  }

  let state=loadState();
  let liveRaces=[];
  let providerStatus={};
  let stateGeo=null;
  let districtGeo=null;
  let stateGeoPromise=null;
  let districtGeoPromise=null;
  let houseBaseline={districts:{}};
  let houseBaselinePromise=null;
  let resultPollTimer=null;
  let toastTimer=null;
  let resizeObservers=[];
  let zTop=900;

  function saveState(){ try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch(err){console.warn('Could not save local dashboard state',err);} }
  function toast(message,kind=''){const el=qs('#toast');el.textContent=message;el.className=`toast ${kind}`.trim();clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),3800);}

  function route(){const raw=(location.hash||'#dashboard').slice(1).split('?')[0];return ['dashboard','map','races','sources','data'].includes(raw)?raw:'dashboard';}
  function setActiveNav(){const r=route();qsa('.main-nav a').forEach(a=>a.classList.toggle('active',a.dataset.route===r));}
  function resultFor(code){return state.results[code]||{state:code,leader:'U',demPct:null,repPct:null,otherPct:null,reporting:0,called:false,source:'reference',note:'',updatedAt:null};}
  function leaderLabel(r){if(r.leader==='D')return'Dem lead';if(r.leader==='R')return'GOP lead';if(r.leader==='O')return'Other lead';return'Unreported';}
  function battlegroundFor(code){return senateBG.has(code)||govBG.has(code)||houseBGStates.has(code);}
  function resultIsActive(r){return Boolean(r&&(r.providerResultAvailable||r.totalVotes>0||r.reporting>0));}

  function setResultsStatus(){
    const dot=qs('#results-status-dot'), text=qs('#results-status-text');
    dot.className='status-dot';
    const meta=state.resultsMeta||{};
    if(meta.lastError){dot.classList.add('error');text.textContent=`Results: automatic feed issue — showing last good data${meta.lastUpdated?` • ${fmtTime(meta.lastUpdated)}`:''}`;return;}
    if(meta.mode==='automatic'){dot.classList.add('live');text.textContent=`Results: automatic live${meta.lastUpdated?` • ${fmtTime(meta.lastUpdated)}`:''}`;return;}
    if(meta.mode==='automatic/armed'){dot.classList.add('live');text.textContent=`Results: automatic sources armed${meta.lastUpdated?` • ${fmtTime(meta.lastUpdated)}`:''}`;return;}
    if(meta.mode==='connected'){dot.classList.add('live');text.textContent=`Results: custom feed${meta.lastUpdated?` • ${fmtTime(meta.lastUpdated)}`:''}`;return;}
    text.textContent=`Results: ${meta.mode||'manual/reference'}${meta.lastUpdated?` • ${fmtTime(meta.lastUpdated)}`:''}`;
  }

  function raceForKey(key){return liveRaces.find(r=>r.key===key)||null;}
  function raceForStateOffice(code,office){return liveRaces.find(r=>r.state===code&&r.office===office&&(!r.special||!liveRaces.some(x=>x.state===code&&x.office===office&&!x.special)))||null;}
  function currentLayerRace(code,layer=state.settings.mapLayer){
    if(layer==='senate') return raceForStateOffice(code,'senate');
    if(layer==='governor') return raceForStateOffice(code,'governor');
    return null;
  }
  function raceParty(r){if(!r)return'U';return r.called&&r.winnerParty?r.winnerParty:(r.leader||'U');}

  function mapHTML({compact=false,layer=null,mode=null}={}){
    const active=layer||state.settings.mapLayer||'house';
    const activeMode=mode||state.settings.mapMode||'projection';
    const modeControls=`<div class="map-mode-tabs" role="tablist" aria-label="Projection or live map">
      <button class="map-mode-btn ${activeMode==='projection'?'active':''}" data-map-mode="projection">Projection Map</button>
      <button class="map-mode-btn ${activeMode==='live'?'active':''}" data-map-mode="live">Live Results</button>
    </div>`;
    const overviewControl=activeMode==='live'?`<button class="map-layer-btn ${active==='overview'?'active':''}" data-map-layer="overview">State overview</button>`:'';
    const layerControls=`<div class="map-layer-tabs" role="tablist" aria-label="Map layer">
      <button class="map-layer-btn ${active==='house'?'active':''}" data-map-layer="house">House districts</button>
      <button class="map-layer-btn ${active==='senate'?'active':''}" data-map-layer="senate">Senate</button>
      <button class="map-layer-btn ${active==='governor'?'active':''}" data-map-layer="governor">Governors</button>
      ${overviewControl}
    </div>`;
    const source=projectionSourceFor(active);
    const legend=activeMode==='projection'
      ? `<div class="map-legend"><span class="legend-chip"><i class="legend-swatch d solid"></i>Projected D</span><span class="legend-chip"><i class="legend-swatch r solid"></i>Projected R</span><span class="legend-chip"><i class="legend-swatch toss"></i>Toss-up</span><span class="legend-chip"><i class="legend-swatch u"></i>No 2026 race / baseline pending</span></div><div class="projection-source">Forecast snapshot ${esc(P.meta.asOf)} • ${esc(source.name)} • ratings are projections, not votes or calls.</div>`
      : `<div class="map-legend"><span class="legend-chip"><i class="legend-swatch d"></i>Dem lead/call</span><span class="legend-chip"><i class="legend-swatch r"></i>GOP lead/call</span><span class="legend-chip"><i class="legend-swatch u"></i>No result</span><span class="legend-chip"><i class="legend-swatch b"></i>Battleground</span></div>`;
    return `${modeControls}${layerControls}<div class="geo-map-shell ${compact?'compact-map':''}" data-geo-map="${active}" data-map-mode-view="${activeMode}" data-map-compact="${compact?'1':'0'}"><div class="map-loading">Loading geographic map…</div></div>${legend}`;
  }

  function hasGeoFeatures(geo){return Boolean(geo&&Array.isArray(geo.features)&&geo.features.length);}
  async function fetchGeometryWithFallback(localPath,fallbackUrls,label){
    try{
      const r=await fetchWithTimeout(`${localPath}?v=${Date.now()}`,{},18000);
      if(!r.ok)throw new Error(`${label} HTTP ${r.status}`);
      const local=await r.json();
      if(hasGeoFeatures(local))return local;
      throw new Error(label==='State'?'Bundled state geometry is empty':'Bundled district geometry is empty');
    }catch(localErr){
      console.warn(`${label} local geometry unavailable; trying public geography fallbacks`,localErr);
      const errors=[];
      for(const fallbackUrl of Array.isArray(fallbackUrls)?fallbackUrls:[fallbackUrls]){
        try{
          const sep=fallbackUrl.includes('?')?'&':'?';
          const r=await fetchWithTimeout(`${fallbackUrl}${sep}v=${Date.now()}`,{credentials:'omit'},30000);
          if(!r.ok)throw new Error(`HTTP ${r.status}`);
          const remote=await r.json();
          if(!hasGeoFeatures(remote))throw new Error('returned no geographic features');
          return remote;
        }catch(err){errors.push(`${new URL(fallbackUrl).hostname}: ${err.message}`);}
      }
      throw new Error(`${label} geography failed from deployed data and all fallbacks (${errors.join(' | ')})`);
    }
  }
  async function getStateGeometry(){
    if(hasGeoFeatures(stateGeo)) return stateGeo;
    if(!stateGeoPromise) stateGeoPromise=fetchGeometryWithFallback(DATA_PATHS.states,GEO_FALLBACKS.states,'State').then(geo=>{stateGeo=geo;return geo;}).finally(()=>{stateGeoPromise=null;});
    return stateGeoPromise;
  }
  async function getDistrictGeometry(){
    if(hasGeoFeatures(districtGeo)) return districtGeo;
    if(!districtGeoPromise) districtGeoPromise=fetchGeometryWithFallback(DATA_PATHS.districts,GEO_FALLBACKS.districts,'District').then(geo=>{districtGeo=geo;return geo;}).finally(()=>{districtGeoPromise=null;});
    return districtGeoPromise;
  }

  function browserPartyCode(party=''){
    const p=String(party).toLowerCase();
    if(p.includes('democrat'))return'D';
    if(p.includes('republican'))return'R';
    if(p.includes('independent'))return'I';
    return'O';
  }
  function buildBrowserHouseBaseline(payload,sourceLabel='Public current House membership'){
    const districts={};
    const rows=Array.isArray(payload)?payload:Array.isArray(payload&&payload.data)?payload.data:[];
    const today=new Date().toISOString().slice(0,10);
    for(const person of rows){
      let stateCode='',districtRaw=null,party='',partyLabel='',incumbent='Current member';
      if(Array.isArray(person&&person.terms)){
        const term=[...person.terms].reverse().find(t=>t&&t.type==='rep'&&String(t.end||'9999')>today);
        if(!term)continue;
        stateCode=String(term.state||'').toUpperCase();
        districtRaw=term.district;
        party=browserPartyCode(term.caucus||term.party);
        partyLabel=String(term.party||term.caucus||'');
        incumbent=String(person.name&&person.name.official_full || [person.name&&person.name.first,person.name&&person.name.last].filter(Boolean).join(' ') || 'Current member');
      }else{
        if(String(person&&person.chamber||'').toLowerCase()!=='house')continue;
        stateCode=String(person.state||'').toUpperCase();
        districtRaw=person.district;
        party=browserPartyCode(person.party);
        partyLabel=String(person.party||'');
        incumbent=String(person.fullName||person.name||'Current member');
      }
      if(!/^[A-Z]{2}$/.test(stateCode)||districtRaw==null||districtRaw==='')continue;
      const n=Number(districtRaw);if(!Number.isFinite(n))continue;
      const district=String(n).padStart(2,'0'),key=`${stateCode}-${district}`;
      districts[key]={party,partyLabel,incumbent,state:stateCode,district};
    }
    // Current vacancies can be absent from member lists. TX-23 is in the competitive
    // forecast table; FL-20 is the remaining safe Democratic seat baseline.
    if(!districts['FL-20'])districts['FL-20']={party:'D',partyLabel:'Democratic baseline',incumbent:'Vacant seat',state:'FL',district:'20'};
    return {updatedAt:new Date().toISOString(),source:`Current House membership fallback — ${sourceLabel}`,districts,_loaded:true};
  }
  async function getHouseBaseline(){
    if(houseBaseline&&houseBaseline._loaded&&Object.keys(houseBaseline.districts||{}).length) return houseBaseline;
    if(!houseBaselinePromise) houseBaselinePromise=(async()=>{
      try{
        const r=await fetchWithTimeout(`${DATA_PATHS.houseBaseline}?v=${Date.now()}`,{},12000);
        if(r.ok){const j=await r.json();const local={...j,_loaded:true,districts:j&&j.districts||{}};if(Object.keys(local.districts).length){houseBaseline=local;return houseBaseline;}}
      }catch(err){console.warn('Deployed House baseline unavailable',err);}
      const errors=[];
      for(const fallback of HOUSE_BASELINE_FALLBACKS){
        try{
          const sep=fallback.url.includes('?')?'&':'?';
          const r=await fetchWithTimeout(`${fallback.url}${sep}v=${Date.now()}`,{credentials:'omit'},18000);
          if(!r.ok)throw new Error(`HTTP ${r.status}`);
          const built=buildBrowserHouseBaseline(await r.json(),fallback.label);
          if(Object.keys(built.districts||{}).length<400)throw new Error(`only ${Object.keys(built.districts||{}).length} districts returned`);
          houseBaseline=built;
          return houseBaseline;
        }catch(err){errors.push(`${fallback.label}: ${err.message}`);}
      }
      console.warn('Current House membership fallbacks unavailable',errors.join(' | '));
      houseBaseline={_loaded:true,source:'Current House membership fallback unavailable',districts:{'FL-20':{party:'D',partyLabel:'Democratic baseline',incumbent:'Vacant seat',state:'FL',district:'20'}}};
      return houseBaseline;
    })().finally(()=>{houseBaselinePromise=null;});
    return houseBaselinePromise;
  }

  function ratingSlug(rating=''){
    if(rating==='Toss Up')return'tossup';
    if(/^Solid/.test(rating))return'solid';
    if(/^Likely/.test(rating))return'likely';
    if(/^Lean/.test(rating))return'lean';
    return'unknown';
  }
  function projectionSourceFor(layer){return layer==='house'?P.meta.houseSource:layer==='governor'?P.meta.governorSource:P.meta.senateSource;}
  function projectionForHouse(key){
    if(P.houseCompetitive[key]) return P.houseCompetitive[key];
    const base=houseBaseline&&houseBaseline.districts&&houseBaseline.districts[key];
    if(!base)return null;
    const party=base.party==='D'?'D':base.party==='R'?'R':'O';
    const rating=party==='D'?'Solid D':party==='R'?'Solid R':'Safe/Other';
    return {key,displayKey:key.replace(/-00$/,'-AL').replace(/-0(\d)$/,'-$1'),rating,party,strength:.95,incumbent:base.incumbent||'Current member',baseline:true,partyLabel:base.partyLabel||''};
  }
  function projectionForState(code,layer){
    if(layer==='senate')return P.senate[code]||null;
    if(layer==='governor')return P.governor[code]||null;
    if(layer==='overview')return P.senate[code]||P.governor[code]||null;
    return null;
  }
  function projectionForKey(key){return projectionForHouse(key);}
  function pollCloseForState(code){
    const wave=D.pollCloseET.find(w=>w.states.some(x=>String(x).replace('*','')===code));
    return wave?`${wave.label}${wave.states.some(x=>x===code+'*')?' (split/variable close)':''}`:'See state election authority';
  }
  function stateNewsHTML(code,limit=4){
    const name=stateName(code).toLowerCase();
    const hits=(state.headlines||[]).filter(h=>String(h.title||'').toLowerCase().includes(name)||String(h.title||'').toLowerCase().includes(` ${code.toLowerCase()} `)).slice(0,limit);
    return hits.length?hits.map(h=>`<a class="mini-news" href="${esc(h.link)}" target="_blank" rel="noopener">${esc(h.title)} <span>↗</span></a>`).join(''):'<div class="empty-state compact">No state-specific headline in the current wire. Use the news/source links below.</div>';
  }

  function mapRegionClass(party,called,battleground,selected,rating=''){
    return ['geo-region',`leader-${['D','R','O'].includes(party)?party:'U'}`,called?'called':'',battleground?'battleground':'',selected?'selected':'',rating?`rating-${ratingSlug(rating)}`:''].filter(Boolean).join(' ');
  }

  async function renderGeoMapElement(el){
    const layer=el.dataset.geoMap||'house';
    const mode=el.dataset.mapModeView||state.settings.mapMode||'projection';
    const compact=el.dataset.mapCompact==='1';
    const width=1000,height=600;
    try {
      if(mode==='projection'&&layer==='house') await getHouseBaseline();
      const geo=layer==='house'?await getDistrictGeometry():await getStateGeometry();
      const features=Array.isArray(geo&&geo.features)?geo.features:[];
      if(!features.length) throw new Error('Map geometry has not been published yet. Run the GitHub Pages workflow once to populate the geographic files.');
      const paths=[];
      let houseDistricts=0,classifiedHouseDistricts=0;
      for(const feature of features){
        const path=C.geoFeatureToPath(feature,width,height);if(!path)continue;
        if(layer==='house'){
          const key=C.districtKeyFromGeoFeature(feature,D.states);if(!key)continue;
          const code=key.split('-')[0];
          if(code==='DC')continue;
          houseDistricts+=1;
          if(mode==='projection'){
            const pr=projectionForHouse(key),party=pr?.party||'U',rating=pr?.rating||'';
            if(pr)classifiedHouseDistricts+=1;
            const title=pr?`${pr.displayKey||key}: ${rating} • ${party==='D'?'Democratic':party==='R'?'Republican':'Toss-up/Other'}${pr.incumbent?` • current/incumbent: ${pr.incumbent}`:''}`:`${key}: projection baseline pending`;
            paths.push(`<path d="${path}" class="${mapRegionClass(party,false,rating==='Toss Up',state.selectedRaceKey===key,rating)}" data-map-race="${key}" data-map-state="${code}"><title>${esc(title)}</title></path>`);
          }else{
            const race=raceForKey(key),party=raceParty(race);
            const title=race?`${key}: ${party==='D'?'Democratic':party==='R'?'Republican':'Uncalled'}${race.reporting?` • ${race.reporting}% reporting`:''}${race.called?' • CALLED':''}`:`${key}: no live result yet`;
            paths.push(`<path d="${path}" class="${mapRegionClass(party,Boolean(race&&race.called),houseBGStates.has(code),state.selectedRaceKey===key)}" data-map-race="${key}" data-map-state="${code}"><title>${esc(title)}</title></path>`);
          }
        } else {
          const code=C.stateCodeFromGeoFeature(feature,D.states);if(!code)continue;
          if(mode==='projection'){
            const pr=projectionForState(code,layer),party=pr?.party||'U',rating=pr?.rating||'';
            const title=pr?`${stateName(code)}: ${rating}${pr.incumbent?` • ${pr.incumbent}`:''}`:`${stateName(code)}: no ${layer==='governor'?'governor':'Senate'} projection/race in this layer`;
            paths.push(`<path d="${path}" class="${mapRegionClass(party,false,rating==='Toss Up',state.selectedState===code,rating)}" data-map-state="${code}"><title>${esc(title)}</title></path>`);
          }else{
            const race=currentLayerRace(code,layer),summary=resultFor(code),useRace=layer!=='overview'&&race;
            const party=useRace?raceParty(race):(summary.leader||'U'),called=useRace?race.called:summary.called,reporting=useRace?race.reporting:summary.reporting;
            const title=`${stateName(code)}: ${party==='D'?'Democratic':party==='R'?'Republican':party==='O'?'Other':'No result'}${reporting?` • ${reporting}% reporting`:''}${called?' • CALLED':''}`;
            paths.push(`<path d="${path}" class="${mapRegionClass(party,called,battlegroundFor(code),state.selectedState===code)}" data-map-state="${code}"${race?` data-map-race="${esc(race.key)}"`:''}><title>${esc(title)}</title></path>`);
          }
        }
      }
      const coverage=mode==='projection'&&layer==='house'
        ? `<div class="map-coverage ${classifiedHouseDistricts>=435?'complete':'incomplete'}"><strong>${classifiedHouseDistricts>=435?'435/435 districts classified':`${classifiedHouseDistricts}/${houseDistricts||435} districts classified`}</strong><span>${classifiedHouseDistricts>=435?'All voting House districts have a projection/baseline color.':'Safe-seat baseline is still loading; competitive ratings are shown now and remaining districts will fill automatically.'}</span></div>`
        : '';
      el.innerHTML=`${coverage}<svg class="geo-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Interactive 2026 United States ${mode==='projection'?'projection':'live results'} map">${paths.join('')}</svg>`;
      qsa('[data-map-state]',el).forEach(region=>region.addEventListener('click',()=>{
        state.selectedState=region.dataset.mapState;
        state.selectedRaceKey=region.dataset.mapRace||null;
        state.settings.mapMode=mode;
        state.settings.mapLayer=layer;
        saveState();
        if(route()!=='map'&&compact) location.hash='#map'; else renderPage();
      }));
    } catch(err){
      el.innerHTML=`<div class="map-error"><strong>Geographic map unavailable.</strong><br/>${esc(err.message)}<br/><span>The site tried both its deployed geometry and the official U.S. Census TIGERweb 2026 geography service.</span><div class="button-row"><button class="btn btn-small btn-accent" type="button" data-retry-map>Retry map</button><a class="btn btn-small btn-ghost" href="https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_main.html" target="_blank" rel="noopener">Open Census TIGERweb ↗</a></div></div>`;
      const retry=qs('[data-retry-map]',el);
      if(retry)retry.addEventListener('click',()=>{
        if(layer==='house'){districtGeo=null;districtGeoPromise=null;}else{stateGeo=null;stateGeoPromise=null;}
        el.innerHTML='<div class="map-loading">Retrying official Census geography…</div>';
        renderGeoMapElement(el);
      });
    }
  }
  function hydrateGeoMaps(){qsa('[data-geo-map]',qs('#page-root')).forEach(renderGeoMapElement);}

  function chamberCard(type){
    const isHouse=type==='house',ch=state.chamber[type],total=isHouse?435:35;
    const called=Math.max(0,ch.called||0),uncalled=Math.max(0,total-called);
    const dPct=total?ch.dem/total*100:0,rPct=total?ch.rep/total*100:0,oPct=total?(ch.other||0)/total*100:0,uPct=total?uncalled/total*100:0;
    return `<section class="panel"><div class="panel-header"><div><div class="panel-title">${isHouse?'U.S. House':'2026 U.S. Senate races'}</div><div class="panel-subtitle">Called race board — not a projection</div></div><span class="tag ${called?'tag-green':'tag-orange'}">${called}/${total} called</span></div><div class="panel-body">
      <div class="balance-labels"><span class="text-blue">D ${ch.dem}</span><span class="muted">Uncalled ${uncalled}</span><span class="text-red">R ${ch.rep}</span></div>
      <div class="balance-bar"><span class="balance-dem" style="width:${dPct}%"></span><span class="balance-other" style="width:${oPct}%"></span><span class="balance-uncalled" style="width:${uPct}%"></span><span class="balance-rep" style="width:${rPct}%"></span></div>
      <div class="metric-sub">Calls shown only when the normalized source marks a winner/call. Starting chamber reference: R ${D.startingControl[type].rep}, D ${D.startingControl[type].dem}${D.startingControl[type].other?`, Other ${D.startingControl[type].other}`:''}.</div>
    </div></section>`;
  }

  function raceStatusChip(code,office='senate'){
    const race=raceForStateOffice(code,office);
    if(race&&resultIsActive(race)){const p=raceParty(race),cls=p==='D'?'d':p==='R'?'r':'u';return `<span class="race-status ${cls}">${race.called?'CALLED ':''}${p==='D'?'Dem':p==='R'?'GOP':'Other/uncalled'}${race.reporting?` • ${race.reporting}%`:''}</span>`;}
    const r=resultFor(code),cls=r.leader==='D'?'d':r.leader==='R'?'r':'u';return `<span class="race-status ${cls}">${r.called?'CALLED ':''}${leaderLabel(r)}${r.reporting?` • ${r.reporting}%`:''}</span>`;
  }

  function newsHTML(limit=10){const items=(state.headlines||[]).slice(0,limit);return items.length?items.map((h,i)=>`<div class="news-item"><span class="news-index">${String(i+1).padStart(2,'0')}</span><div><a href="${esc(h.link)}" ${h.link.startsWith('http')?'target="_blank" rel="noopener"':''}>${esc(h.title)}</a><div class="news-meta">${esc(h.source||'News wire')}${h.pubDate?` • ${esc(fmtDateTime(h.pubDate))}`:''}</div></div><span class="news-open">↗</span></div>`).join(''):`<div class="empty-state">No headlines loaded.</div>`;}
  function networkFeedsHTML(limit=8){return D.videoPresets.slice(0,limit).map((v,i)=>`<div class="feed-card"><h4>${esc(v.name)}</h4><p>YouTube channel live feed preset</p><div class="feed-actions"><button class="btn btn-small btn-blue" data-add-preset="${i}">Dock feed</button><a class="btn btn-small btn-ghost" href="${esc(v.website)}" target="_blank" rel="noopener">Open source</a></div></div>`).join('');}

  function providerHealthHTML(){
    const entries=[['watchVote','watch.vote','National official-state counts + licensed calls'],['openAmerica','Open America','Independent official-state count cross-check']];
    const preElection=Date.now()<new Date('2026-11-03T17:00:00-05:00').getTime();
    return entries.map(([key,label,role])=>{
      const p=providerStatus[key]||{};
      const waiting=!p.ok&&preElection;
      const cls=p.ok?(p.stale?'tag-orange':'tag-green'):waiting?'tag-orange':'tag-red';
      const status=preElection
        ? (p.ok?(p.stale?'cached • waiting Nov. 3':'online • waiting Nov. 3'):'snapshot pending • waiting Nov. 3')
        : p.ok?(p.stale?'cached / armed':'online'):'unreachable';
      return `<div class="provider-row"><div><strong>${label}</strong><span>${role}</span></div><span class="tag ${cls}">${status}</span></div>`;
    }).join('');
  }

  function controlForecastCard(type){
    const forecast=P.controlForecast&&P.controlForecast[type];
    if(!forecast)return'';
    const isD=forecast.favored==='D';
    const chamber=type==='house'?'House Control':'Senate Control';
    const threshold=type==='house'?'218 seats needed':'51 seats needed • 50-50 gives GOP the VP tiebreak';
    const updated=fmtDateTime(P.controlForecast.asOf);
    return `<section class="control-forecast-card ${isD?'dem-control':'rep-control'}">
      <div class="control-forecast-kicker">${chamber} • Model Projection</div>
      <div class="control-forecast-verdict">${isD?'PROJECTED DEMOCRATIC CONTROL':'PROJECTED REPUBLICAN CONTROL'}</div>
      <div class="control-probability-row"><div class="control-party dem"><span>DEMOCRATS</span><strong>${forecast.demProbability}%</strong></div><div class="control-party rep"><span>REPUBLICANS</span><strong>${forecast.repProbability}%</strong></div></div>
      <div class="control-probability-bar"><span class="dem" style="width:${forecast.demProbability}%"></span><span class="rep" style="width:${forecast.repProbability}%"></span></div>
      <div class="control-seat-line"><strong>${forecast.projectedDemSeats} D</strong><span>projected seats</span><strong>${forecast.projectedRepSeats} R</strong></div>
      <div class="control-forecast-source">${threshold} • DDHQ model updated ${esc(updated)} • <a href="${esc(P.controlForecast.source.url)}" target="_blank" rel="noopener">source ↗</a></div>
    </section>`;
  }

  function projectionBalanceCard(type){
    const cfg=type==='house'
      ? {title:'Projected U.S. House',d:P.summary.house.dem,r:P.summary.house.rep,t:P.summary.house.tossup,total:P.summary.house.total,source:P.meta.houseSource}
      : type==='senate'
        ? {title:'Projected 2027 Senate',d:P.summary.senate.demCaucus,r:P.summary.senate.rep,t:P.summary.senate.tossup,total:P.summary.senate.total,source:P.meta.consensusSource}
        : {title:'Projected Governorships',d:P.summary.governor.dem,r:P.summary.governor.rep,t:P.summary.governor.tossup,total:P.summary.governor.total,source:P.meta.consensusSource};
    const dPct=cfg.d/cfg.total*100,rPct=cfg.r/cfg.total*100,tPct=cfg.t/cfg.total*100;
    return `<section class="panel projection-balance"><div class="panel-header"><div><div class="panel-title">${cfg.title}</div><div class="panel-subtitle">Forecast snapshot — not actual votes</div></div><span class="tag tag-blue">AS OF ${esc(P.meta.asOf)}</span></div><div class="panel-body"><div class="balance-labels"><span class="text-blue">D${type==='senate'?' caucus':''} ${cfg.d}</span><span class="projection-toss-label">Toss-up ${cfg.t}</span><span class="text-red">R ${cfg.r}</span></div><div class="balance-bar projection-bar"><span class="balance-dem" style="width:${dPct}%"></span><span class="balance-uncalled projection-toss" style="width:${tPct}%"></span><span class="balance-rep" style="width:${rPct}%"></span></div><div class="metric-sub">Source: <a href="${esc(cfg.source.url)}" target="_blank" rel="noopener">${esc(cfg.source.name)} ↗</a>. Ratings summarize forecast direction; they are not counted ballots or race calls.</div></div></section>`;
  }

  function projectionChip(pr){
    if(!pr)return'<span class="race-status u">No 2026 rating</span>';
    const cls=pr.party==='D'?'d':pr.party==='R'?'r':'u';
    return `<span class="race-status ${cls} projection-chip rating-${ratingSlug(pr.rating)}">${esc(pr.rating)}</span>`;
  }

  function topProjectionRows(){
    const senate=Object.values(P.senate).filter(r=>r.rating==='Toss Up').map(r=>({key:r.state,label:`${r.state} Senate`,detail:r.incumbent,pr:r,layer:'senate'}));
    const gov=Object.values(P.governor).filter(r=>r.rating==='Toss Up').map(r=>({key:r.state,label:`${r.state} Governor`,detail:r.matchup||r.incumbent,pr:r,layer:'governor'}));
    const house=Object.values(P.houseCompetitive).filter(r=>r.rating==='Toss Up').slice(0,10).map(r=>({key:r.key,label:r.displayKey||r.key,detail:r.incumbent,pr:r,layer:'house'}));
    return [...senate,...gov,...house];
  }

  function dashboardPage(){
    const active=liveRaces.filter(resultIsActive).length,called=liveRaces.filter(r=>r.called).length;
    const last=state.resultsMeta.lastUpdated?fmtDateTime(state.resultsMeta.lastUpdated):'Automatic feeds armed; no counted votes expected yet';
    const projectionRows=topProjectionRows();
    return `<div class="page-heading"><div><div class="eyebrow">NOVEMBER 3, 2026 • PROJECTIONS + LIVE RESULTS</div><h1>2026 Midterms Command Center</h1><p>Pre-election forecast dashboard now; election-night live vote command center automatically when official counting data begins.</p></div><div class="heading-actions"><a class="btn btn-accent" href="#map">Open interactive map</a><a class="btn btn-ghost" href="#races">Race board</a><button class="btn btn-ghost" data-open-video>+ Add video</button></div></div>
      <div class="projection-banner"><div><strong>Projection mode is populated now.</strong><span>House consensus, Senate ratings and governor ratings are visually separated from actual results.</span></div><div class="projection-banner-actions"><button class="btn btn-small btn-blue" data-map-jump-mode="projection">Projection Map</button><button class="btn btn-small btn-ghost" data-map-jump-mode="live">Live Results Map</button></div></div>
      <div class="control-forecast-strip">${controlForecastCard('house')}${controlForecastCard('senate')}</div>
      <div class="metrics-strip"><div class="metric-card"><span>House consensus</span><strong><b class="text-blue">${P.summary.house.dem} D</b> / <b class="text-red">${P.summary.house.rep} R</b></strong><small>${P.summary.house.tossup} toss-ups • 218 majority</small></div><div class="metric-card"><span>Senate consensus</span><strong><b class="text-blue">${P.summary.senate.demCaucus} D-caucus</b></strong><small>${P.summary.senate.rep} R • ${P.summary.senate.tossup} toss-ups</small></div><div class="metric-card"><span>Live feed status</span><strong>${active}</strong><small>races reporting • ${called} called</small></div><div class="metric-card"><span>Automatic refresh</span><strong class="metric-small">${esc(last)}</strong><small>Browser checks every ${state.settings.pollSeconds}s</small></div></div>
      <div class="projection-grid">${projectionBalanceCard('house')}${projectionBalanceCard('senate')}${projectionBalanceCard('governor')}</div>
      <div class="dashboard-grid">
        <div class="dashboard-main">
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Interactive Projection Map</div><div class="panel-subtitle">Switch instantly between forecast ratings and actual live vote results</div></div><a class="btn btn-small btn-ghost" href="#map">Open full map</a></div><div class="panel-body">${mapHTML({compact:true,layer:state.settings.mapLayer,mode:state.settings.mapMode})}</div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Network Live Feeds</div><div class="panel-subtitle">Dock, float, resize, fullscreen, or add your own YouTube URL</div></div><button class="btn btn-small btn-ghost" data-open-video>Manage players</button></div><div class="panel-body"><div class="feed-cards">${networkFeedsHTML()}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Poll Close Timeline</div><div class="panel-subtitle">Eastern Time; * indicates split/variable state timing</div></div><a class="btn btn-small btn-ghost" href="https://www.270towin.com/poll-closing-times/index.php" target="_blank" rel="noopener">Source</a></div><div class="panel-body"><div class="timeline">${D.pollCloseET.map(w=>`<div class="timeline-row"><div class="timeline-time">${w.label}</div><div><div class="timeline-states">${w.states.join(' · ')}</div>${w.note?`<div class="timeline-note">${esc(w.note)}</div>`:''}</div></div>`).join('')}</div><p class="help-text">Monitoring reference only; use official state election offices for voter instructions.</p></div></section>
        </div>
        <aside class="dashboard-side">
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Automatic Data Health</div><div class="panel-subtitle">No API key or source setup required</div></div><button class="btn btn-small btn-ghost" data-refresh-auto-results>Refresh</button></div><div class="panel-body"><div class="provider-list">${providerHealthHTML()}</div><div class="live-readiness"><strong>Before Nov. 3:</strong> an armed/waiting feed is normal. Forecast data remains fully usable while actual vote totals are zero.</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Highest-Competition Races</div><div class="panel-subtitle">Current Toss-Up projection board</div></div><a class="btn btn-small btn-ghost" href="#races">Full board</a></div><div class="panel-body"><div class="race-list">${projectionRows.slice(0,14).map(r=>`<button class="race-row" data-state="${r.key.split('-')[0]}" data-projection-key="${r.key}" data-projection-layer="${r.layer}" style="color:inherit;text-align:left;cursor:pointer"><span class="race-code">${esc(r.label)}</span><span class="race-detail">${esc(r.detail||'')}</span>${projectionChip(r.pr)}</button>`).join('')}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Live News Wire</div><div class="panel-subtitle">${state.headlineMode==='live'?'Live RSS/proxy':'Fallback/source mode'}${state.newsLastUpdated?` • ${fmtTime(state.newsLastUpdated)}`:''}</div></div><button class="btn btn-small btn-ghost" data-refresh-news>Refresh</button></div><div class="panel-body"><div class="news-list">${newsHTML(10)}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Producer Notes</div><div class="panel-subtitle">Stored only in this browser</div></div><span class="tag tag-green">LOCAL</span></div><div class="panel-body"><textarea class="textarea notes-area" id="producer-notes" placeholder="Calls to verify, guests, timecodes, storylines…">${esc(state.notes)}</textarea><div class="help-text">Auto-saves locally. No database or login.</div></div></section>
        </aside>
      </div>`;
  }

  function candidateRowsHTML(race){
    if(!race||!race.candidates||!race.candidates.length)return'<div class="empty-state">No vote totals have been published for this race yet.</div>';
    return [...race.candidates].sort((a,b)=>(b.votes||0)-(a.votes||0)).map(c=>`<div class="candidate-result"><span class="party-pill ${c.party==='D'?'d':c.party==='R'?'r':'u'}">${esc(c.party)}</span><div><strong>${esc(c.name||'Candidate')}</strong><small>${esc(c.partyLabel||'')}</small></div><div class="candidate-votes"><strong>${fmtNum(c.votes)}</strong><small>${c.percent==null?'':`${Number(c.percent).toFixed(1)}%`}</small></div>${c.winner?'<span class="tag tag-green">WINNER</span>':''}</div>`).join('');
  }
  function liveRaceCardHTML(race){
    if(!race)return'<div class="empty-state">No automatic race record is selected for this layer yet. Click a mapped race or switch map layers.</div>';
    const title=race.office==='house'?`${race.state}-${race.district} U.S. House`:race.office==='senate'?`${stateName(race.state)} U.S. Senate`:`${stateName(race.state)} Governor`;
    return `<div class="live-race-card"><div class="live-race-head"><div><div class="eyebrow">AUTOMATIC RACE FEED</div><h3>${esc(title)}${race.special?' — Special':''}</h3></div><span class="tag ${race.called?'tag-green':resultIsActive(race)?'tag-orange':'tag-blue'}">${race.called?'CALLED':resultIsActive(race)?'COUNTING':'ARMED'}</span></div>
      <div class="race-metrics"><span><strong>${race.reporting||0}%</strong> reporting</span><span><strong>${fmtNum(race.totalVotes)}</strong> votes</span><span><strong>${esc(race.freshness||'unknown')}</strong> freshness</span></div>
      <div class="candidate-results">${candidateRowsHTML(race)}</div>
      <div class="status-box"><strong>Primary feed:</strong> ${esc(race.sourceProvider||'watch.vote')}<br/><strong>Underlying authority:</strong> ${esc(race.sourceAuthority||'official state election source')}<br/><strong>Updated:</strong> ${race.updatedAt?esc(fmtDateTime(race.updatedAt)):'not published yet'}${race.sourceUrl?`<br/><a href="${esc(race.sourceUrl)}" target="_blank" rel="noopener">Open underlying source ↗</a>`:''}</div>
    </div>`;
  }

  function projectionRaceCardHTML(pr,layer,code,key=null){
    const source=projectionSourceFor(layer);
    const title=layer==='house'?`${pr?.displayKey||key||code} U.S. House`:layer==='governor'?`${stateName(code)} Governor`:`${stateName(code)} U.S. Senate`;
    if(!pr)return `<div class="projection-race-card"><div class="live-race-head"><div><div class="eyebrow">PRE-ELECTION PROJECTION</div><h3>${esc(title)}</h3></div><span class="tag">NO RATING</span></div><div class="status-box">No projection record is available for this selection. For a House district this can mean the current-member baseline is still loading; the site automatically falls back to the public membership dataset when the deployed snapshot is empty.</div></div>`;
    const live=layer==='house'?(key?raceForKey(key):null):raceForStateOffice(code,layer==='governor'?'governor':'senate');
    const candidateLine=live&&live.candidates&&live.candidates.length
      ? `<div class="projection-candidates"><div class="section-label">Candidates from automatic race metadata</div>${live.candidates.map(c=>`<div class="projection-candidate"><span class="party-pill ${c.party==='D'?'d':c.party==='R'?'r':'u'}">${esc(c.party)}</span><strong>${esc(c.name||'Candidate')}</strong></div>`).join('')}</div>`
      : pr.matchup?`<div class="status-box"><strong>Known matchup:</strong> ${esc(pr.matchup)}</div>`:'';
    const partyText=pr.party==='D'?'Democratic advantage':pr.party==='R'?'Republican advantage':'No party advantage';
    return `<div class="projection-race-card"><div class="live-race-head"><div><div class="eyebrow">PRE-ELECTION PROJECTION</div><h3>${esc(title)}</h3></div>${projectionChip(pr)}</div>
      <div class="projection-rating-hero ${pr.party==='D'?'d':pr.party==='R'?'r':'u'}"><strong>${esc(pr.rating)}</strong><span>${esc(partyText)}</span></div>
      <div class="race-metrics"><span><strong>${Math.round((pr.strength||.5)*100)}%</strong> rating strength*</span><span><strong>${esc(pollCloseForState(code))}</strong> poll close</span><span><strong>${esc(P.meta.asOf)}</strong> snapshot</span></div>
      ${pr.incumbent?`<div class="status-box"><strong>Incumbent / seat status:</strong> ${esc(pr.incumbent)}${pr.special?' • Special election':''}</div>`:''}
      ${candidateLine}
      <div class="projection-disclaimer">*Visual rating strength is derived from category (Solid/Likely/Lean/Toss Up) only; it is <strong>not</strong> a modeled win probability.</div>
      <div class="status-box"><strong>Projection source:</strong> ${esc(source.name)}<br/><strong>As of:</strong> ${esc(P.meta.asOf)}<br/><a href="${esc(source.url)}" target="_blank" rel="noopener">Open forecast source ↗</a><br/><a href="https://www.nass.org/can-I-vote/election-officials" target="_blank" rel="noopener">Open official state election authority directory ↗</a></div>
      <div class="section-label projection-news-label">Recent ${esc(stateName(code))} headlines</div>${stateNewsHTML(code)}
    </div>`;
  }

  function selectedRaceForMap(){
    if(state.selectedRaceKey){const exact=raceForKey(state.selectedRaceKey);if(exact)return exact;}
    const layer=state.settings.mapLayer;
    return layer==='senate'?raceForStateOffice(state.selectedState,'senate'):layer==='governor'?raceForStateOffice(state.selectedState,'governor'):null;
  }
  function selectedProjectionForMap(){
    const layer=state.settings.mapLayer;
    if(layer==='house')return projectionForKey(state.selectedRaceKey||'');
    return projectionForState(state.selectedState,layer);
  }

  function mapPage(){
    const code=state.selectedState||'GA',s=D.states.find(x=>x.code===code)||D.states[0],r=resultFor(s.code),race=selectedRaceForMap(),pr=selectedProjectionForMap();
    const mode=state.settings.mapMode||'projection',layer=state.settings.mapLayer||'house';
    const badges=[senateBG.has(s.code)?'<span class="tag tag-orange">Senate watch</span>':'',govBG.has(s.code)?'<span class="tag tag-orange">Governor watch</span>':'',houseBGStates.has(s.code)?'<span class="tag tag-orange">House toss-up state</span>':''].filter(Boolean).join('');
    const inspector=mode==='projection'?projectionRaceCardHTML(pr,layer,s.code,state.selectedRaceKey):liveRaceCardHTML(race);
    const manual=mode==='live'?`<div class="manual-override"><div class="section-label">Manual state summary override</div><div class="state-title">${esc(s.name)} <span class="muted">${s.code}</span></div><div class="state-badges">${badges||'<span class="tag">Standard watch</span>'}</div>
        <div class="result-bars"><div class="candidate-bar"><strong class="text-blue">D</strong><div class="track"><div class="fill d" style="width:${r.demPct||0}%"></div></div><div class="pct">${r.demPct==null?'—':Number(r.demPct).toFixed(1)+'%'}</div></div><div class="candidate-bar"><strong class="text-red">R</strong><div class="track"><div class="fill r" style="width:${r.repPct||0}%"></div></div><div class="pct">${r.repPct==null?'—':Number(r.repPct).toFixed(1)+'%'}</div></div></div>
        <div class="form-grid"><div><label class="field-label">Leader</label><select id="state-leader" class="select-input"><option value="U" ${r.leader==='U'?'selected':''}>Unreported / tied</option><option value="D" ${r.leader==='D'?'selected':''}>Democratic</option><option value="R" ${r.leader==='R'?'selected':''}>Republican</option><option value="O" ${r.leader==='O'?'selected':''}>Other</option></select></div><div><label class="field-label">Reporting %</label><input id="state-reporting" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.reporting||0}" /></div><div><label class="field-label">Dem %</label><input id="state-dem" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.demPct??''}" /></div><div><label class="field-label">GOP %</label><input id="state-rep" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.repPct??''}" /></div></div>
        <label class="field-label">Verification note</label><input id="state-note" class="text-input" value="${esc(r.note||'')}" placeholder="Producer verification note"/><label class="check-row"><input id="state-called" type="checkbox" ${r.called?'checked':''}/> Mark state summary as called</label><div class="button-row"><button class="btn btn-accent" data-save-state="${s.code}">Save Manual Record</button><button class="btn btn-ghost" data-clear-state="${s.code}">Clear Manual Record</button></div><p class="help-text">Manual records remain available as an emergency producer override; automatic race records keep their own provenance.</p></div>`:'';
    return `<div class="page-heading"><div><div class="eyebrow">INTERACTIVE ELECTION MAP</div><h1>${mode==='projection'?'2026 Projection Map':'2026 Live Results Map'}</h1><p>${mode==='projection'?'Explore pre-election House, Senate and governor ratings now. Switch to Live Results on the same map when votes begin reporting.':'Actual vote totals, reporting percentages and source-confirmed calls from automatic keyless feeds.'}</p></div><div class="heading-actions"><button class="btn btn-ghost" data-refresh-auto-results>Refresh live data</button><a class="btn btn-ghost" href="#races">Race Board</a><button class="btn btn-accent" data-open-video>+ Video</button></div></div>
      <div class="map-page-grid"><section class="panel"><div class="panel-header"><div><div class="panel-title">United States — ${mode==='projection'?'Projections':'Live Results'}</div><div class="panel-subtitle">Real geographic boundaries; click a state/district for detail</div></div><span class="tag ${mode==='projection'?'tag-blue':'tag-green'}">${mode==='projection'?'FORECAST':'LIVE VOTES'}</span></div><div class="panel-body">${mapHTML({mode,layer})}</div></section>
      <section class="panel inspector-panel"><div class="panel-header"><div><div class="panel-title">Race Inspector</div><div class="panel-subtitle">${mode==='projection'?'Forecast rating, context, poll close and source':'Automatic result, vote totals and source provenance'}</div></div></div><div class="panel-body">${inspector}${manual}</div></section></div>`;
  }

  function racesPage(){
    const active=liveRaces.filter(resultIsActive).sort((a,b)=>Number(b.called)-Number(a.called)||b.reporting-a.reporting);
    const order={'Toss Up':0,'Lean D':1,'Lean R':1,'Likely D':2,'Likely R':2,'Solid D':3,'Solid R':3};
    const senate=Object.values(P.senate).sort((a,b)=>(order[a.rating]??9)-(order[b.rating]??9)||a.state.localeCompare(b.state));
    const governors=Object.values(P.governor).sort((a,b)=>(order[a.rating]??9)-(order[b.rating]??9)||a.state.localeCompare(b.state));
    const house=Object.values(P.houseCompetitive).sort((a,b)=>(order[a.rating]??9)-(order[b.rating]??9)||a.key.localeCompare(b.key));
    return `<div class="page-heading"><div><div class="eyebrow">PROJECTIONS + LIVE RACE WATCH</div><h1>Federal & Governor Race Board</h1><p>The full pre-election ratings board remains available before any ballots are counted. Live results appear alongside it automatically when reporting begins.</p></div><div class="heading-actions"><a class="btn btn-accent" href="#map">Interactive map</a><button class="btn btn-ghost" data-refresh-auto-results>Refresh live results</button></div></div>
      <div class="projection-banner"><div><strong>Forecast snapshot: ${esc(P.meta.asOf)}</strong><span>House: 270toWin seven-forecaster consensus. Senate/Governors: Cook ratings. Forecasts are not vote counts or calls.</span></div><div class="projection-banner-actions"><a class="btn btn-small btn-ghost" href="${esc(P.meta.houseSource.url)}" target="_blank" rel="noopener">House source ↗</a><a class="btn btn-small btn-ghost" href="${esc(P.meta.senateSource.url)}" target="_blank" rel="noopener">Senate source ↗</a></div></div>
      ${active.length?`<section class="panel" style="margin-bottom:12px"><div class="panel-header"><div><div class="panel-title">Races Currently Reporting / Called</div><div class="panel-subtitle">Actual votes — separate from projections below</div></div><span class="tag tag-green">${active.length} active</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Race</th><th>Leader</th><th>Reporting</th><th>Votes</th><th>Source</th><th></th></tr></thead><tbody>${active.slice(0,100).map(r=>`<tr><td><strong>${esc(r.office==='house'?r.key:`${r.state} ${r.office}`)}</strong></td><td>${r.called?'CALLED ':''}${esc(raceParty(r))}</td><td>${r.reporting||0}%</td><td>${fmtNum(r.totalVotes)}</td><td>${esc(r.sourceProvider)}</td><td><button class="btn btn-small btn-ghost" data-race-key="${esc(r.key)}" data-state="${r.state}">Inspect live</button></td></tr>`).join('')}</tbody></table></div></section>`:''}
      <div class="projection-grid">${projectionBalanceCard('house')}${projectionBalanceCard('senate')}${projectionBalanceCard('governor')}</div>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">All 35 U.S. Senate Contests</div><div class="panel-subtitle">Cook Political Report ratings • Oct. 20, 2026</div></div><span class="tag tag-orange">7 TOSS-UPS</span></div><div class="table-wrap"><table class="data-table projection-table"><thead><tr><th>State</th><th>Rating</th><th>Incumbent / status</th><th>Poll close</th><th>Live result</th><th></th></tr></thead><tbody>${senate.map(r=>`<tr><td><strong>${r.state}</strong> — ${esc(stateName(r.state))}</td><td>${projectionChip(r)}</td><td>${esc(r.incumbent||'')}</td><td>${esc(pollCloseForState(r.state))}</td><td>${raceStatusChip(r.state,'senate')}</td><td><button class="btn btn-small btn-ghost" data-state="${r.state}" data-projection-key="${r.state}" data-projection-layer="senate">Inspect</button></td></tr>`).join('')}</tbody></table></div></section>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">All 36 Governor Contests</div><div class="panel-subtitle">Cook Political Report ratings • Oct. 23, 2026</div></div><span class="tag tag-orange">3 TOSS-UPS</span></div><div class="table-wrap"><table class="data-table projection-table"><thead><tr><th>State</th><th>Rating</th><th>Incumbent / matchup</th><th>Poll close</th><th>Live result</th><th></th></tr></thead><tbody>${governors.map(r=>`<tr><td><strong>${r.state}</strong> — ${esc(stateName(r.state))}</td><td>${projectionChip(r)}</td><td>${esc(r.matchup||r.incumbent||'')}</td><td>${esc(pollCloseForState(r.state))}</td><td>${raceStatusChip(r.state,'governor')}</td><td><button class="btn btn-small btn-ghost" data-state="${r.state}" data-projection-key="${r.state}" data-projection-layer="governor">Inspect</button></td></tr>`).join('')}</tbody></table></div></section>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">House Competitive District Board</div><div class="panel-subtitle">89 non-safe districts in the 270toWin consensus • Oct. 23, 2026</div></div><span class="tag tag-orange">19 TOSS-UPS</span></div><div class="table-wrap"><table class="data-table projection-table"><thead><tr><th>District</th><th>Rating</th><th>Current member / open status</th><th>Poll close</th><th>Live result</th><th></th></tr></thead><tbody>${house.map(r=>{const st=r.key.split('-')[0];return `<tr><td><strong>${esc(r.displayKey||r.key)}</strong> — ${esc(stateName(st))}</td><td>${projectionChip(r)}</td><td>${esc(r.incumbent||'')}</td><td>${esc(pollCloseForState(st))}</td><td>${raceForKey(r.key)?raceStatusChip(st,'house'):'<span class="race-status u">Awaiting votes</span>'}</td><td><button class="btn btn-small btn-ghost" data-state="${st}" data-projection-key="${r.key}" data-projection-layer="house">Inspect</button></td></tr>`}).join('')}</tbody></table></div></section>`;
  }

  function sourcesPage(){
    return `<div class="page-heading"><div><div class="eyebrow">VERIFY BEFORE YOU AMPLIFY</div><h1>Source Center</h1><p>The dashboard's automatic feeds are shown first, followed by official directories, ratings organizations and news coverage.</p></div><div class="heading-actions"><button class="btn btn-accent" data-open-video>+ Video feed</button></div></div>
      <div class="callout"><strong>No datasource hookup is required.</strong> GitHub Pages automatically serves a mirrored watch.vote snapshot, while Open America is polled directly in the browser as an independent official-state-feed cross-check. AP and Decision Desk HQ remain useful verification sites, but their professional APIs require credentials and are not used anonymously.</div>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">Built-in Automatic Source Health</div><div class="panel-subtitle">GitHub Pages mirror + direct browser CORS feed; no API key</div></div><button class="btn btn-small btn-ghost" data-refresh-auto-results>Refresh now</button></div><div class="panel-body"><div class="provider-list">${providerHealthHTML()}</div><p class="help-text">watch.vote is the primary normalized race feed; Open America is used as a secondary state-count source where it has coverage. Neither source is treated as an AP/DDHQ substitute for proprietary race calls.</p></div></section>
      <div class="source-grid" style="margin-top:12px">${D.sources.map(s=>`<article class="source-card"><div class="source-category">${esc(s.category)}</div><h3>${esc(s.name)}</h3><p>${esc(s.note)}</p><div class="source-actions"><a class="btn btn-small btn-ghost" href="${esc(s.url)}" target="_blank" rel="noopener">Open source ↗</a></div></article>`).join('')}</div>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">Official State Results Finder</div><div class="panel-subtitle">Use NASS to locate the state election authority</div></div><a class="btn btn-small btn-ghost" href="https://www.nass.org/can-I-vote/election-officials" target="_blank" rel="noopener">NASS directory</a></div><div class="panel-body"><div class="form-grid"><div><label class="field-label">State</label><select id="official-state-select" class="select-input">${D.states.filter(s=>s.code!=='DC').map(s=>`<option value="${s.name}">${s.name}</option>`).join('')}</select></div><div style="align-self:end"><button class="btn btn-accent" data-search-official>Search official 2026 results</button></div></div></div></section>`;
  }

  function dataPage(){
    const h=state.chamber.house,s=state.chamber.senate;
    const example=JSON.stringify({updatedAt:'2026-11-03T23:15:00Z',chamber:{house:{dem:20,rep:24,other:0,called:44},senate:{dem:3,rep:4,other:0,called:7}},results:[{state:'GA',leader:'D',demPct:50.7,repPct:48.9,reporting:76.2,called:false,source:'connected',note:'Optional custom override'}]},null,2);
    return `<div class="page-heading"><div><div class="eyebrow">DATA CONTROL</div><h1>Automatic Results & Overrides</h1><p>The default data pipeline is already connected. Use this page to see source health, adjust refresh timing, or add an optional custom/manual override.</p></div><div class="heading-actions"><button class="btn btn-ghost" data-export>Export snapshot</button><button class="btn btn-danger" data-reset>Reset local data</button></div></div>
      <div class="section-split"><section class="panel"><div class="panel-header"><div><div class="panel-title">Automatic Keyless Results</div><div class="panel-subtitle">watch.vote primary + Open America cross-check</div></div><span class="tag ${state.resultsMeta.lastError?'tag-red':state.resultsMeta.mode==='automatic'?'tag-green':'tag-orange'}">${esc(state.resultsMeta.mode)}</span></div><div class="panel-body">
        <div class="provider-list">${providerHealthHTML()}</div><label class="check-row"><input id="automatic-results" type="checkbox" ${state.settings.automaticResults?'checked':''}/> Automatically refresh live election data</label><label class="field-label">Refresh interval (seconds)</label><input id="poll-seconds" class="text-input" type="number" min="30" max="600" value="${state.settings.pollSeconds||60}"/><div class="button-row"><button class="btn btn-accent" data-refresh-auto-results>Refresh Automatic Data Now</button><button class="btn btn-ghost" data-save-auto-settings>Save Automatic Settings</button></div>
        <div class="status-box"><strong>Last update:</strong> ${state.resultsMeta.lastUpdated?esc(fmtDateTime(state.resultsMeta.lastUpdated)):'none'}<br/><strong>Last error:</strong> ${esc(state.resultsMeta.lastError||'none')}<br/><strong>Loaded races:</strong> ${liveRaces.length}</div><p class="help-text">No API key, signup, datasource URL or database is required. GitHub Pages keeps the last successfully deployed watch.vote snapshot if an upstream refresh fails; Open America is also polled directly when available.</p></div></section>
      <section class="panel"><div class="panel-header"><div><div class="panel-title">Optional Custom JSON Feed</div><div class="panel-subtitle">Advanced override/fallback; not required</div></div><span class="tag tag-blue">OPTIONAL</span></div><div class="panel-body"><label class="field-label">JSON endpoint URL</label><input id="results-url" class="text-input" value="${esc(state.settings.resultsUrl||'')}" placeholder="https://example.com/results-2026.json"/><div class="button-row"><button class="btn btn-ghost" data-connect-results>Fetch Custom Feed Once</button><button class="btn btn-ghost" data-save-feed-settings>Save URL</button></div><p class="help-text">Use only a browser-accessible CORS-enabled endpoint you trust. AP/DDHQ credentials should never be pasted here.</p></div></section></div>
      <div class="section-split" style="margin-top:12px"><section class="panel"><div class="panel-header"><div><div class="panel-title">Import / Paste Snapshot</div><div class="panel-subtitle">Emergency offline/manual workflow</div></div><span class="tag tag-blue">LOCAL</span></div><div class="panel-body"><textarea id="json-import" class="textarea" placeholder='{"results":[{"state":"GA","leader":"D"}]}'></textarea><div class="button-row"><button class="btn btn-accent" data-import-paste>Import JSON</button><label class="btn btn-ghost" style="cursor:pointer">Choose JSON file<input id="json-file" type="file" accept="application/json,.json" hidden/></label></div></div></section>
      <section class="panel"><div class="panel-header"><div><div class="panel-title">Manual Called-Race Board</div><div class="panel-subtitle">Emergency override for the top chamber cards</div></div></div><div class="panel-body"><h3 style="font-size:12px;margin:0">House calls</h3><div class="form-grid"><div><label class="field-label">Dem</label><input id="house-dem" class="text-input" type="number" value="${h.dem}"/></div><div><label class="field-label">GOP</label><input id="house-rep" class="text-input" type="number" value="${h.rep}"/></div><div><label class="field-label">Other</label><input id="house-other" class="text-input" type="number" value="${h.other||0}"/></div><div><label class="field-label">Called</label><input id="house-called" class="text-input" type="number" min="0" max="435" value="${h.called||0}"/></div></div><h3 style="font-size:12px;margin:14px 0 0">Senate calls</h3><div class="form-grid"><div><label class="field-label">Dem</label><input id="senate-dem" class="text-input" type="number" value="${s.dem}"/></div><div><label class="field-label">GOP</label><input id="senate-rep" class="text-input" type="number" value="${s.rep}"/></div><div><label class="field-label">Other</label><input id="senate-other" class="text-input" type="number" value="${s.other||0}"/></div><div><label class="field-label">Called</label><input id="senate-called" class="text-input" type="number" min="0" max="35" value="${s.called||0}"/></div></div><div class="button-row"><button class="btn btn-accent" data-save-chambers>Save Manual Board</button></div></div></section></div>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">Expected Optional JSON Shape</div><div class="panel-subtitle">Only needed for your own custom feed/import</div></div></div><div class="panel-body"><div class="code-block">${esc(example)}</div></div></section>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">News Wire Settings</div><div class="panel-subtitle">Automatic Google News RSS search with fallbacks</div></div></div><div class="panel-body"><div class="form-grid"><div><label class="field-label">Google News query</label><input id="news-query" class="text-input" value="${esc(state.settings.newsQuery)}"/></div><div style="align-self:end"><button class="btn btn-accent" data-save-news-settings>Save & Refresh News</button></div></div></div></section>`;
  }

  function renderPage(){
    setActiveNav();const r=route(),root=qs('#page-root');root.innerHTML=r==='dashboard'?dashboardPage():r==='map'?mapPage():r==='races'?racesPage():r==='sources'?sourcesPage():dataPage();bindPageEvents();setResultsStatus();hydrateGeoMaps();root.focus({preventScroll:true});
  }

  function bindPageEvents(){
    const root=qs('#page-root');
    qsa('[data-open-video]',root).forEach(b=>b.addEventListener('click',openVideoPanel));
    qsa('[data-refresh-news]',root).forEach(b=>b.addEventListener('click',()=>fetchNews(true)));
    qsa('[data-refresh-auto-results]',root).forEach(b=>b.addEventListener('click',()=>fetchAutomaticResults(true)));
    qsa('[data-add-preset]',root).forEach(b=>b.addEventListener('click',()=>addPreset(Number(b.dataset.addPreset))));
    qsa('[data-map-mode]',root).forEach(b=>b.addEventListener('click',()=>{state.settings.mapMode=b.dataset.mapMode;saveState();renderPage();}));
    qsa('[data-map-jump-mode]',root).forEach(b=>b.addEventListener('click',()=>{state.settings.mapMode=b.dataset.mapJumpMode;saveState();location.hash='#map';}));
    qsa('[data-map-layer]',root).forEach(b=>b.addEventListener('click',()=>{state.settings.mapLayer=b.dataset.mapLayer;state.selectedRaceKey=null;saveState();renderPage();}));
    qsa('[data-state]',root).forEach(el=>el.addEventListener('click',()=>{
      state.selectedState=el.dataset.state;
      if(el.dataset.projectionLayer){
        state.settings.mapMode='projection';
        state.settings.mapLayer=el.dataset.projectionLayer;
        state.selectedRaceKey=el.dataset.projectionLayer==='house'?el.dataset.projectionKey:null;
      }else{
        const clickedRace=el.dataset.raceKey?raceForKey(el.dataset.raceKey):null;
        if(clickedRace) state.settings.mapLayer=clickedRace.office==='house'?'house':clickedRace.office==='governor'?'governor':'senate';
        else if(el.dataset.houseMap==='1') state.settings.mapLayer='house';
        else if(el.dataset.office) state.settings.mapLayer=el.dataset.office==='governor'?'governor':'senate';
        state.settings.mapMode='live';
        state.selectedRaceKey=el.dataset.raceKey||currentLayerRace(state.selectedState,state.settings.mapLayer)?.key||null;
      }
      saveState(); if(route()!=='map')location.hash='#map';else renderPage();
    }));
    qsa('[data-race-key]',root).forEach(el=>el.addEventListener('click',e=>{if(el.dataset.state)return;const race=raceForKey(el.dataset.raceKey);if(!race)return;state.selectedRaceKey=race.key;state.selectedState=race.state;state.settings.mapLayer=race.office==='house'?'house':race.office==='governor'?'governor':'senate';state.settings.mapMode='live';saveState();location.hash='#map';}));
    const notes=qs('#producer-notes',root);if(notes)notes.addEventListener('input',()=>{state.notes=notes.value;saveState();});
    qsa('[data-save-state]',root).forEach(b=>b.addEventListener('click',()=>saveManualState(b.dataset.saveState)));
    qsa('[data-clear-state]',root).forEach(b=>b.addEventListener('click',()=>clearState(b.dataset.clearState)));
    qs('[data-search-official]',root)?.addEventListener('click',searchOfficial);
    qs('[data-save-auto-settings]',root)?.addEventListener('click',saveAutomaticSettings);
    qs('[data-save-feed-settings]',root)?.addEventListener('click',saveFeedSettings);
    qs('[data-connect-results]',root)?.addEventListener('click',()=>{saveFeedSettings(false);fetchCustomResults(true);});
    qs('[data-import-paste]',root)?.addEventListener('click',importPasted);
    qs('#json-file',root)?.addEventListener('change',importFile);
    qs('[data-save-chambers]',root)?.addEventListener('click',saveChambers);
    qs('[data-export]',root)?.addEventListener('click',exportSnapshot);
    qs('[data-reset]',root)?.addEventListener('click',resetLocal);
    qs('[data-save-news-settings]',root)?.addEventListener('click',()=>{state.settings.newsQuery=qs('#news-query',root).value.trim()||'2026 midterm elections';saveState();fetchNews(true);});
  }

  function saveManualState(code){try{const rec=C.normalizeResultRecord({state:code,leader:qs('#state-leader').value,reporting:qs('#state-reporting').value,demPct:qs('#state-dem').value===''?null:qs('#state-dem').value,repPct:qs('#state-rep').value===''?null:qs('#state-rep').value,called:qs('#state-called').checked,note:qs('#state-note').value,source:'manual',updatedAt:new Date().toISOString()},D.states);state.results={...state.results,[code]:rec};state.resultsMeta={mode:'manual',lastUpdated:rec.updatedAt,lastError:''};saveState();renderPage();toast(`${code} manual record saved`,'success');}catch(err){toast(err.message,'error');}}
  function clearState(code){delete state.results[code];state.resultsMeta.mode=state.settings.automaticResults?'automatic/armed':'reference/manual';state.resultsMeta.lastUpdated=new Date().toISOString();saveState();renderPage();toast(`${code} manual record cleared`);}
  function searchOfficial(){const name=qs('#official-state-select').value;window.open(`https://www.google.com/search?q=${encodeURIComponent(name+' official election results 2026 secretary of state')}`,'_blank','noopener');}

  function saveAutomaticSettings(){state.settings.automaticResults=Boolean(qs('#automatic-results')?.checked);state.settings.pollSeconds=Math.max(30,Math.min(600,Number(qs('#poll-seconds')?.value)||60));saveState();configurePolling();toast('Automatic result settings saved','success');}
  function saveFeedSettings(showToast=true){state.settings.resultsUrl=(qs('#results-url')?.value||'').trim();saveState();if(showToast)toast('Custom feed URL saved','success');}

  async function fetchWithTimeout(url,options={},timeout=10000){const ctl=new AbortController(),id=setTimeout(()=>ctl.abort(),timeout);try{return await fetch(url,{...options,signal:ctl.signal,cache:'no-store'});}finally{clearTimeout(id);}}

  async function fetchOpenAmericaDirect(){
    const entries=await Promise.all(Object.entries(OPEN_AMERICA).map(async ([office,url])=>{
      const r=await fetchWithTimeout(url,{credentials:'omit'},12000);
      if(!r.ok)throw new Error(`Open America ${office} HTTP ${r.status}`);
      return [office,await r.json()];
    }));
    const openAmerica=Object.fromEntries(entries);
    const payload=L.buildDashboardPayload({openAmerica,fetchedAt:new Date().toISOString()});
    payload.providerStatus={openAmerica:{ok:true,stale:false,direct:true,label:'Direct CORS'}};
    return payload;
  }

  async function fetchAutomaticResults(showToast=false){
    try{
      const res=await fetchWithTimeout(`${DATA_PATHS.results}?v=${Date.now()}`,{},20000);
      if(!res.ok)throw new Error(`GitHub Pages data snapshot HTTP ${res.status}`);
      let payload=await res.json();
      try{
        const direct=await fetchOpenAmericaDirect();
        payload=L.overlayDashboardPayload(payload,direct);
        payload.providerStatus={...(payload.providerStatus||{}),openAmerica:{ok:true,stale:false,direct:true,label:'Direct CORS'}};
      }catch(directErr){
        console.warn('Direct Open America refresh unavailable; using deployed snapshot',directErr);
        payload.providerStatus={...(payload.providerStatus||{}),openAmerica:{...((payload.providerStatus||{}).openAmerica||{}),direct:false,directError:String(directErr.message||directErr)}};
      }
      const parsed=C.validateImportPayload(payload,D.states);liveRaces=Array.isArray(payload.races)?payload.races:[];providerStatus=payload.providerStatus||{};
      const autoResults=parsed.results.map(r=>({...r,source:'connected'}));
      const manualRecords=Object.fromEntries(Object.entries(state.results).filter(([,r])=>r&&r.source==='manual'));
      state.results={...C.mergeResultMaps(state.results,autoResults),...manualRecords};
      state.chamber={house:{...parsed.chamber.house},senate:{...parsed.chamber.senate}};
      const hasActive=liveRaces.some(resultIsActive)||autoResults.some(r=>(r.reporting||0)>0||r.called);
      state.resultsMeta={mode:payload.armedBeforeResults&&!hasActive?'automatic/armed':'automatic',lastUpdated:parsed.updatedAt||new Date().toISOString(),lastError:''};
      saveState();setResultsStatus();renderPage();if(showToast)toast(hasActive?`Automatic results refreshed: ${liveRaces.length} races loaded`:`Automatic feeds are connected and armed for election night`,'success');
    }catch(err){state.resultsMeta.lastError=String(err.message||err);saveState();setResultsStatus();if(showToast)toast(`Automatic results refresh failed: ${err.message}`,'error');if(route()==='data'||route()==='dashboard')renderPage();}
  }

  async function fetchCustomResults(showToast=false){const url=(state.settings.resultsUrl||'').trim();if(!url){if(showToast)toast('Add a custom JSON URL first','error');return;}try{const res=await fetchWithTimeout(url,{},12000);if(!res.ok)throw new Error(`HTTP ${res.status}`);const parsed=C.validateImportPayload(await res.json(),D.states);applyImport(parsed,'connected');if(showToast)toast(`Custom feed loaded ${parsed.results.length} state records`,'success');}catch(err){state.resultsMeta.lastError=String(err.message||err);saveState();setResultsStatus();if(showToast)toast(`Custom feed failed: ${err.message}`,'error');}}

  function applyImport(parsed,mode='imported'){
    const normalized=parsed.results.map(r=>({...r,source:mode==='connected'?'connected':r.source==='manual'?'manual':'imported'}));state.results=C.mergeResultMaps(state.results,normalized);
    if(parsed.chamber){if(parsed.chamber.house)state.chamber.house={...state.chamber.house,...parsed.chamber.house};if(parsed.chamber.senate)state.chamber.senate={...state.chamber.senate,...parsed.chamber.senate};}
    state.resultsMeta={mode,lastUpdated:parsed.updatedAt||new Date().toISOString(),lastError:''};saveState();setResultsStatus();renderPage();renderTicker();
  }
  function importPasted(){try{const parsed=C.validateImportPayload(JSON.parse(qs('#json-import').value),D.states);applyImport(parsed,'imported');toast(`Imported ${parsed.results.length} state records`,'success');}catch(err){toast(`Import failed: ${err.message}`,'error');}}
  async function importFile(e){const f=e.target.files&&e.target.files[0];if(!f)return;try{const parsed=C.validateImportPayload(JSON.parse(await f.text()),D.states);applyImport(parsed,'imported');toast(`Imported ${f.name}`,'success');}catch(err){toast(`File import failed: ${err.message}`,'error');}finally{e.target.value='';}}
  function saveChambers(){const n=id=>Math.max(0,Number(qs(id)?.value)||0);state.chamber.house={dem:n('#house-dem'),rep:n('#house-rep'),other:n('#house-other'),called:Math.min(435,n('#house-called'))};state.chamber.senate={dem:n('#senate-dem'),rep:n('#senate-rep'),other:n('#senate-other'),called:Math.min(35,n('#senate-called'))};state.resultsMeta.mode='manual';saveState();renderPage();toast('Manual called-race board saved','success');}
  function exportSnapshot(){const payload={updatedAt:new Date().toISOString(),chamber:state.chamber,results:Object.values(state.results),races:liveRaces,notes:state.notes};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='midterms-2026-dashboard-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function resetLocal(){if(!confirm('Reset all local results, notes, videos and settings for this dashboard?'))return;localStorage.removeItem(STORE_KEY);state=defaultState();liveRaces=[];providerStatus={};configurePolling();renderPage();renderVideoWorkspace();renderTicker();fetchAutomaticResults(false);toast('Local dashboard reset');}
  function configurePolling(){clearInterval(resultPollTimer);resultPollTimer=null;if(state.settings.automaticResults)resultPollTimer=setInterval(()=>fetchAutomaticResults(false),Math.max(30,state.settings.pollSeconds||60)*1000);}

  function parseGoogleNewsXml(text){const doc=new DOMParser().parseFromString(text,'application/xml');return [...doc.querySelectorAll('item')].slice(0,25).map(item=>C.normalizeHeadline({title:item.querySelector('title')?.textContent||'',link:item.querySelector('link')?.textContent||'#',pubDate:item.querySelector('pubDate')?.textContent||'',source:item.querySelector('source')?.textContent||'Google News'}));}
  async function fetchNews(showToast=false){const query=state.settings.newsQuery||'2026 midterm elections',rss=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;let items=[],mode='fallback';try{const r=await fetchWithTimeout(state.settings.rss2json+encodeURIComponent(rss),{},9000);if(!r.ok)throw new Error(`RSS2JSON HTTP ${r.status}`);const j=await r.json();if(j.status!=='ok'||!Array.isArray(j.items))throw new Error(j.message||'RSS2JSON returned no items');items=j.items.slice(0,25).map(x=>C.normalizeHeadline({...x,source:x.author||'Google News'}));mode='live';}catch(firstErr){try{const r=await fetchWithTimeout(state.settings.allOrigins+encodeURIComponent(rss),{},9000);if(!r.ok)throw new Error(`Proxy HTTP ${r.status}`);items=parseGoogleNewsXml(await r.text());if(!items.length)throw new Error('No RSS items');mode='live';}catch(secondErr){console.warn('News proxies unavailable',firstErr,secondErr);items=D.defaultHeadlines.map(C.normalizeHeadline);mode='fallback';if(showToast)toast('Live RSS unavailable; using source/fallback wire','error');}}state.headlines=items;state.headlineMode=mode;state.newsLastUpdated=new Date().toISOString();saveState();renderTicker();if(route()==='dashboard')renderPage();if(showToast&&mode==='live')toast(`News wire refreshed: ${items.length} headlines`,'success');}
  function renderTicker(){const track=qs('#ticker-track'),base=(state.headlines&&state.headlines.length?state.headlines:D.defaultHeadlines).slice(0,18),doubled=[...base,...base];track.innerHTML=doubled.map(h=>`<a class="ticker-item" href="${esc(h.link)}" ${h.link.startsWith('http')?'target="_blank" rel="noopener"':''}>${esc(h.title)}${h.source?`<span class="ticker-source">${esc(h.source)}</span>`:''}</a>`).join('');}

  function openVideoPanel(){qs('#add-video-panel').classList.remove('hidden');renderVideoManager();}
  function closeVideoPanel(){qs('#add-video-panel').classList.add('hidden');}
  function renderVideoManager(){qs('#video-preset-list').innerHTML=D.videoPresets.map((v,i)=>`<button class="preset-btn" data-preset="${i}"><span>${esc(v.name)}</span><small>ADD LIVE</small></button>`).join('');qsa('[data-preset]',qs('#video-preset-list')).forEach(b=>b.addEventListener('click',()=>addPreset(Number(b.dataset.preset))));const list=qs('#active-video-list');list.innerHTML=state.videos.length?state.videos.map(v=>`<div class="active-video-row"><div><div class="name">${esc(v.title)}</div><div class="mode">${esc(v.mode)}</div></div><button class="btn btn-small btn-ghost" data-focus-video="${v.uid}">Show</button><button class="btn btn-small btn-danger" data-remove-video="${v.uid}">Remove</button></div>`).join(''):'<div class="empty-state">No active players.</div>';qsa('[data-remove-video]',list).forEach(b=>b.addEventListener('click',()=>removeVideo(b.dataset.removeVideo)));qsa('[data-focus-video]',list).forEach(b=>b.addEventListener('click',()=>{closeVideoPanel();const el=qs(`[data-video-window="${CSS.escape(b.dataset.focusVideo)}"]`);if(el){el.style.zIndex=String(++zTop);el.scrollIntoView({block:'nearest'});}}));}
  function addPreset(index){const p=D.videoPresets[index];if(!p)return;state.videos.push({uid:uid(),title:p.name,type:'channel',channelId:p.channelId,website:p.website,mode:'right',minimized:false,left:70,top:130,width:460,height:310});saveState();renderVideoWorkspace();renderVideoManager();toast(`${p.name} added to right dock`,'success');}
  function addUserVideo(mode){const input=qs('#video-url-input').value.trim(),id=C.parseYouTubeId(input);if(!id){toast('Enter a valid YouTube watch, short, live, embed URL, or 11-character video ID','error');return;}const title=qs('#video-title-input').value.trim()||`YouTube ${id}`;state.videos.push({uid:uid(),title,type:'video',id,url:input,mode,minimized:false,left:Math.max(18,window.innerWidth*.5-230),top:150,width:460,height:310});qs('#video-url-input').value='';qs('#video-title-input').value='';saveState();renderVideoWorkspace();renderVideoManager();toast(`${title} added`,'success');}
  function removeVideo(id){state.videos=state.videos.filter(v=>v.uid!==id);saveState();renderVideoWorkspace();renderVideoManager();}
  function videoWindowHTML(v){const src=C.makeYouTubeEmbedUrl(v),floating=v.mode==='float',style=floating?`left:${Math.max(0,v.left||50)}px;top:${Math.max(108,v.top||130)}px;width:${Math.max(250,v.width||460)}px;height:${Math.max(175,v.height||310)}px;z-index:${++zTop}`:'';return `<section class="video-window ${floating?'floating':''} ${v.minimized?'minimized':''}" data-video-window="${v.uid}" style="${style}"><div class="video-titlebar" data-drag-video="${v.uid}"><div class="video-title">${esc(v.title)}</div><div class="video-controls"><button title="Dock left" data-video-action="left" data-id="${v.uid}">L</button><button title="Float / undock" data-video-action="float" data-id="${v.uid}">◇</button><button title="Dock right" data-video-action="right" data-id="${v.uid}">R</button><button title="Minimize" data-video-action="min" data-id="${v.uid}">${v.minimized?'□':'—'}</button><button title="Fullscreen" data-video-action="full" data-id="${v.uid}">⛶</button><button title="Close" data-video-action="close" data-id="${v.uid}">×</button></div></div><div class="video-frame-wrap">${src?`<iframe src="${src}" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`:'<div class="video-error">Video source unavailable.</div>'}</div></section>`;}
  function renderVideoWorkspace(){resizeObservers.forEach(o=>o.disconnect());resizeObservers=[];const left=qs('#video-dock-left'),right=qs('#video-dock-right'),layer=qs('#video-layer');left.innerHTML='';right.innerHTML='';layer.innerHTML='';for(const v of state.videos){const tmp=document.createElement('div');tmp.innerHTML=videoWindowHTML(v);const el=tmp.firstElementChild;if(v.mode==='left')left.append(el);else if(v.mode==='right')right.append(el);else layer.append(el);}qsa('[data-video-action]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();videoAction(b.dataset.id,b.dataset.videoAction);}));qsa('.video-window.floating').forEach(el=>{const id=el.dataset.videoWindow,obs=new ResizeObserver(entries=>{for(const entry of entries){const v=state.videos.find(x=>x.uid===id);if(!v||v.mode!=='float')continue;const rect=entry.target.getBoundingClientRect();v.width=Math.round(rect.width);v.height=Math.round(rect.height);saveState();}});obs.observe(el);resizeObservers.push(obs);el.addEventListener('pointerdown',()=>el.style.zIndex=String(++zTop));});qsa('[data-drag-video]').forEach(enableDrag);}
  function videoAction(id,action){const v=state.videos.find(x=>x.uid===id);if(!v)return;const el=qs(`[data-video-window="${CSS.escape(id)}"]`);if(action==='close'){removeVideo(id);return;}if(action==='min'){v.minimized=!v.minimized;saveState();renderVideoWorkspace();return;}if(action==='full'){if(el?.requestFullscreen)el.requestFullscreen();return;}if(action==='float'&&el){const r=el.getBoundingClientRect();Object.assign(v,{mode:'float',left:Math.max(0,r.left),top:Math.max(108,r.top),width:Math.max(250,r.width),height:Math.max(175,r.height)});}else if(['left','right'].includes(action))v.mode=action;saveState();renderVideoWorkspace();renderVideoManager();}
  function enableDrag(bar){const id=bar.dataset.dragVideo;bar.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const v=state.videos.find(x=>x.uid===id);if(!v||v.mode!=='float')return;const win=bar.closest('.video-window'),rect=win.getBoundingClientRect(),dx=e.clientX-rect.left,dy=e.clientY-rect.top;win.setPointerCapture(e.pointerId);win.style.zIndex=String(++zTop);const move=ev=>{const left=Math.max(0,Math.min(window.innerWidth-80,ev.clientX-dx)),top=Math.max(104,Math.min(window.innerHeight-70,ev.clientY-dy));win.style.left=`${left}px`;win.style.top=`${top}px`;v.left=left;v.top=top;};const up=()=>{win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',up);saveState();};win.addEventListener('pointermove',move);win.addEventListener('pointerup',up);});}

  function updateClock(){const now=new Date();qs('#live-clock').textContent=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});const first=new Date('2026-11-03T18:00:00-05:00'),diff=first-now,cd=qs('#countdown');if(diff>0){const days=Math.floor(diff/86400000),hrs=Math.floor(diff%86400000/3600000),mins=Math.floor(diff%3600000/60000);cd.textContent=`First major poll close in ${days}d ${hrs}h ${mins}m`;}else if(now<new Date('2026-11-04T06:00:00-05:00'))cd.textContent='ELECTION NIGHT LIVE';else cd.textContent='Election night window complete — counting/certification may continue';const next=D.pollCloseET.find(w=>new Date(w.at)>now);qs('#next-poll').textContent=next?`Next close wave: ${next.label} — ${next.states.slice(0,8).join(', ')}${next.states.length>8?'…':''}`:'All listed poll-close waves have passed';}
  function initGlobalEvents(){window.addEventListener('hashchange',renderPage);qs('#open-video-panel-btn').addEventListener('click',openVideoPanel);qs('#close-video-panel-btn').addEventListener('click',closeVideoPanel);qs('#add-video-panel').addEventListener('click',e=>{if(e.target.id==='add-video-panel')closeVideoPanel();});qs('#add-video-right-btn').addEventListener('click',()=>addUserVideo('right'));qs('#add-video-float-btn').addEventListener('click',()=>addUserVideo('float'));qs('#refresh-news-btn').addEventListener('click',()=>fetchNews(true));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeVideoPanel();});}

  function boot(){
        if(!location.hash)history.replaceState(null,'','#dashboard');initGlobalEvents();
        const build=qs('#build-id');if(build)build.textContent=`Build ${BUILD_ID}`;
    const warning=qs('#file-video-warning');if(warning&&location.protocol==='file:'){warning.classList.remove('hidden');warning.innerHTML='<strong>Direct-file mode:</strong> this build is designed for GitHub Pages. Publish the repository with the included Pages workflow (recommended), or use the optional local launcher while testing. GitHub Pages requires no database or API key.';}
    configurePolling();renderPage();renderVideoWorkspace();renderTicker();renderVideoManager();setResultsStatus();updateClock();setInterval(updateClock,1000);
    if(state.settings.automaticResults)setTimeout(()=>fetchAutomaticResults(false),150);
    setTimeout(()=>fetchNews(false),700);
  }
  boot();
})();
