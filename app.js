(() => {
  'use strict';
  const D = window.MIDTERM_DATA;
  const C = window.MidtermsCore;
  const L = window.MidtermsLiveSources;
  if (!D || !C || !L) throw new Error('Midterms data/core/live-source helpers not loaded');

  const STORE_KEY = 'midterms2026.commandCenter.v2';
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
    districts:'assets/data/house-districts.geojson'
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
        mapLayer:'senate',
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

  function mapHTML({compact=false,layer=null}={}){
    const active=layer||state.settings.mapLayer||'senate';
    const controls=compact?'':`<div class="map-layer-tabs" role="tablist" aria-label="Map layer">
      <button class="map-layer-btn ${active==='senate'?'active':''}" data-map-layer="senate">Senate</button>
      <button class="map-layer-btn ${active==='house'?'active':''}" data-map-layer="house">House districts</button>
      <button class="map-layer-btn ${active==='governor'?'active':''}" data-map-layer="governor">Governors</button>
      <button class="map-layer-btn ${active==='overview'?'active':''}" data-map-layer="overview">State summary</button>
    </div>`;
    return `${controls}<div class="geo-map-shell ${compact?'compact-map':''}" data-geo-map="${active}" data-map-compact="${compact?'1':'0'}"><div class="map-loading">Loading geographic map…</div></div>
      <div class="map-legend"><span class="legend-chip"><i class="legend-swatch d"></i>Dem lead/call</span><span class="legend-chip"><i class="legend-swatch r"></i>GOP lead/call</span><span class="legend-chip"><i class="legend-swatch u"></i>No result</span><span class="legend-chip"><i class="legend-swatch b"></i>Battleground</span></div>`;
  }

  async function getStateGeometry(){
    if(stateGeo) return stateGeo;
    if(!stateGeoPromise) stateGeoPromise=fetchWithTimeout(`${DATA_PATHS.states}?v=${Date.now()}`,{},18000).then(async r=>{if(!r.ok)throw new Error(`Map HTTP ${r.status}`);stateGeo=await r.json();return stateGeo;}).finally(()=>{stateGeoPromise=null;});
    return stateGeoPromise;
  }
  async function getDistrictGeometry(){
    if(districtGeo) return districtGeo;
    if(!districtGeoPromise) districtGeoPromise=fetchWithTimeout(`${DATA_PATHS.districts}?v=${Date.now()}`,{},18000).then(async r=>{if(!r.ok)throw new Error(`District map HTTP ${r.status}`);districtGeo=await r.json();return districtGeo;}).finally(()=>{districtGeoPromise=null;});
    return districtGeoPromise;
  }

  function mapRegionClass(party,called,battleground,selected){
    return ['geo-region',`leader-${['D','R','O'].includes(party)?party:'U'}`,called?'called':'',battleground?'battleground':'',selected?'selected':''].filter(Boolean).join(' ');
  }

  async function renderGeoMapElement(el){
    const layer=el.dataset.geoMap||'senate';
    const compact=el.dataset.mapCompact==='1';
    const width=1000,height=600;
    try {
      const geo=layer==='house'?await getDistrictGeometry():await getStateGeometry();
      const features=Array.isArray(geo&&geo.features)?geo.features:[];
      const paths=[];
      for(const feature of features){
        const path=C.geoFeatureToPath(feature,width,height);if(!path)continue;
        if(layer==='house'){
          const key=C.districtKeyFromGeoFeature(feature,D.states);if(!key)continue;
          const race=raceForKey(key);const party=raceParty(race);const code=key.split('-')[0];
          const title=race?`${key}: ${party==='D'?'Democratic':party==='R'?'Republican':'Uncalled'}${race.reporting?` • ${race.reporting}% reporting`:''}${race.called?' • CALLED':''}`:`${key}: no live result yet`;
          paths.push(`<path d="${path}" class="${mapRegionClass(party,Boolean(race&&race.called),houseBGStates.has(code),state.selectedRaceKey===key)}" data-map-race="${key}" data-map-state="${code}"><title>${esc(title)}</title></path>`);
        } else {
          const code=C.stateCodeFromGeoFeature(feature,D.states);if(!code)continue;
          const race=currentLayerRace(code,layer);const summary=resultFor(code);const useRace=layer!=='overview'&&race;
          const party=useRace?raceParty(race):(summary.leader||'U');const called=useRace?race.called:summary.called;const reporting=useRace?race.reporting:summary.reporting;
          const title=`${stateName(code)}: ${party==='D'?'Democratic':party==='R'?'Republican':party==='O'?'Other':'No result'}${reporting?` • ${reporting}% reporting`:''}${called?' • CALLED':''}`;
          paths.push(`<path d="${path}" class="${mapRegionClass(party,called,battlegroundFor(code),state.selectedState===code)}" data-map-state="${code}"${race?` data-map-race="${esc(race.key)}"`:''}><title>${esc(title)}</title></path>`);
        }
      }
      el.innerHTML=`<svg class="geo-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Interactive 2026 United States election results map">${paths.join('')}</svg>`;
      qsa('[data-map-state]',el).forEach(region=>region.addEventListener('click',()=>{
        state.selectedState=region.dataset.mapState;
        state.selectedRaceKey=region.dataset.mapRace||null;
        saveState();
        if(route()!=='map'&&compact) location.hash='#map'; else renderPage();
      }));
    } catch(err){
      el.innerHTML=`<div class="map-error"><strong>Geographic map unavailable.</strong><br/>${esc(err.message)}<br/><span>If this is GitHub Pages, check the latest Pages workflow run and refresh. The deployment workflow publishes the map files automatically.</span></div>`;
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
    return entries.map(([key,label,role])=>{const p=providerStatus[key]||{};const cls=p.ok?(p.stale?'tag-orange':'tag-green'):'tag-red';const status=p.ok?(p.stale?'cached/stale':'online'):'not reached yet';return `<div class="provider-row"><div><strong>${label}</strong><span>${role}</span></div><span class="tag ${cls}">${status}</span></div>`;}).join('');
  }

  function dashboardPage(){
    const active=liveRaces.filter(resultIsActive).length,called=liveRaces.filter(r=>r.called).length;
    const last=state.resultsMeta.lastUpdated?fmtDateTime(state.resultsMeta.lastUpdated):'Waiting for first automatic refresh';
    return `<div class="page-heading"><div><div class="eyebrow">NOVEMBER 3, 2026</div><h1>Election Night Dashboard</h1><p>Zero-setup live OSINT workspace for national results, real geographic maps, news, network streams and source verification.</p></div><div class="heading-actions"><a class="btn btn-ghost" href="#map">Open full map</a><a class="btn btn-ghost" href="#sources">Data sources</a><button class="btn btn-accent" data-open-video>+ Add video</button></div></div>
      <div class="metrics-strip"><div class="metric-card"><span>Automatic races loaded</span><strong>${liveRaces.length}</strong><small>${active} currently reporting</small></div><div class="metric-card"><span>Race calls loaded</span><strong>${called}</strong><small>Source-confirmed call flags</small></div><div class="metric-card"><span>Last result refresh</span><strong class="metric-small">${esc(last)}</strong><small>${esc(state.resultsMeta.mode)}</small></div><div class="metric-card"><span>Source mode</span><strong class="metric-small">KEYLESS</strong><small>watch.vote + Open America</small></div></div>
      <div class="chamber-grid">${chamberCard('house')}${chamberCard('senate')}</div>
      <div class="dashboard-grid">
        <div class="dashboard-main">
          <section class="panel"><div class="panel-header"><div><div class="panel-title">National Geographic Results Map</div><div class="panel-subtitle">Click a state to inspect; Senate layer shown on dashboard</div></div><a class="btn btn-small btn-ghost" href="#map">Open interactive map</a></div><div class="panel-body">${mapHTML({compact:true,layer:'senate'})}</div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Network Live Feeds</div><div class="panel-subtitle">Dock, float, resize, fullscreen, or add your own YouTube URL</div></div><button class="btn btn-small btn-ghost" data-open-video>Manage players</button></div><div class="panel-body"><div class="feed-cards">${networkFeedsHTML()}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Poll Close Timeline</div><div class="panel-subtitle">Eastern Time; * indicates split/variable state timing</div></div><a class="btn btn-small btn-ghost" href="https://www.270towin.com/poll-closing-times/index.php" target="_blank" rel="noopener">Source</a></div><div class="panel-body"><div class="timeline">${D.pollCloseET.map(w=>`<div class="timeline-row"><div class="timeline-time">${w.label}</div><div><div class="timeline-states">${w.states.join(' · ')}</div>${w.note?`<div class="timeline-note">${esc(w.note)}</div>`:''}</div></div>`).join('')}</div><p class="help-text">Monitoring reference only; use official state election offices for voter instructions.</p></div></section>
        </div>
        <aside class="dashboard-side">
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Automatic Data Health</div><div class="panel-subtitle">No API key or source setup required</div></div><button class="btn btn-small btn-ghost" data-refresh-auto-results>Refresh</button></div><div class="panel-body"><div class="provider-list">${providerHealthHTML()}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Live News Wire</div><div class="panel-subtitle">${state.headlineMode==='live'?'Live RSS/proxy':'Fallback/source mode'}${state.newsLastUpdated?` • ${fmtTime(state.newsLastUpdated)}`:''}</div></div><button class="btn btn-small btn-ghost" data-refresh-news>Refresh</button></div><div class="panel-body"><div class="news-list">${newsHTML(12)}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Senate Watch</div><div class="panel-subtitle">Current battleground watchlist</div></div><a class="btn btn-small btn-ghost" href="#races">All races</a></div><div class="panel-body"><div class="race-list">${D.senateBattlegrounds.slice(0,8).map(r=>`<button class="race-row" data-state="${r.state}" data-office="senate" style="color:inherit;text-align:left;cursor:pointer"><span class="race-code">${r.state}</span><span class="race-detail">${esc(r.incumbent)} • ${esc(r.baseline)}</span>${raceStatusChip(r.state,'senate')}</button>`).join('')}</div></div></section>
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

  function selectedRaceForMap(){
    if(state.selectedRaceKey){const exact=raceForKey(state.selectedRaceKey);if(exact)return exact;}
    const layer=state.settings.mapLayer;
    return layer==='senate'?raceForStateOffice(state.selectedState,'senate'):layer==='governor'?raceForStateOffice(state.selectedState,'governor'):null;
  }

  function mapPage(){
    const code=state.selectedState||'GA',s=D.states.find(x=>x.code===code)||D.states[0],r=resultFor(s.code),race=selectedRaceForMap();
    const badges=[senateBG.has(s.code)?'<span class="tag tag-orange">Senate watch</span>':'',govBG.has(s.code)?'<span class="tag tag-orange">Governor watch</span>':'',houseBGStates.has(s.code)?'<span class="tag tag-orange">House toss-up state</span>':''].filter(Boolean).join('');
    return `<div class="page-heading"><div><div class="eyebrow">INTERACTIVE RESULTS</div><h1>Live Geographic Map</h1><p>Actual U.S. state boundaries and 2026 House district boundaries, colored from the automatically loaded result feed.</p></div><div class="heading-actions"><button class="btn btn-ghost" data-refresh-auto-results>Refresh results</button><a class="btn btn-ghost" href="#data">Data Control</a><button class="btn btn-accent" data-open-video>+ Video</button></div></div>
      <div class="map-page-grid"><section class="panel"><div class="panel-header"><div><div class="panel-title">United States</div><div class="panel-subtitle">Census-based geography; click a state/district for race detail</div></div></div><div class="panel-body">${mapHTML()}</div></section>
      <section class="panel inspector-panel"><div class="panel-header"><div><div class="panel-title">Race Inspector</div><div class="panel-subtitle">Automatic result + source provenance</div></div></div><div class="panel-body">${liveRaceCardHTML(race)}
        <div class="manual-override"><div class="section-label">Manual state summary override</div><div class="state-title">${esc(s.name)} <span class="muted">${s.code}</span></div><div class="state-badges">${badges||'<span class="tag">Standard watch</span>'}</div>
        <div class="result-bars"><div class="candidate-bar"><strong class="text-blue">D</strong><div class="track"><div class="fill d" style="width:${r.demPct||0}%"></div></div><div class="pct">${r.demPct==null?'—':Number(r.demPct).toFixed(1)+'%'}</div></div><div class="candidate-bar"><strong class="text-red">R</strong><div class="track"><div class="fill r" style="width:${r.repPct||0}%"></div></div><div class="pct">${r.repPct==null?'—':Number(r.repPct).toFixed(1)+'%'}</div></div></div>
        <div class="form-grid"><div><label class="field-label">Leader</label><select id="state-leader" class="select-input"><option value="U" ${r.leader==='U'?'selected':''}>Unreported / tied</option><option value="D" ${r.leader==='D'?'selected':''}>Democratic</option><option value="R" ${r.leader==='R'?'selected':''}>Republican</option><option value="O" ${r.leader==='O'?'selected':''}>Other</option></select></div><div><label class="field-label">Reporting %</label><input id="state-reporting" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.reporting||0}" /></div><div><label class="field-label">Dem %</label><input id="state-dem" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.demPct??''}" /></div><div><label class="field-label">GOP %</label><input id="state-rep" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.repPct??''}" /></div></div>
        <label class="field-label">Verification note</label><input id="state-note" class="text-input" value="${esc(r.note||'')}" placeholder="Producer verification note"/><label class="check-row"><input id="state-called" type="checkbox" ${r.called?'checked':''}/> Mark state summary as called</label><div class="button-row"><button class="btn btn-accent" data-save-state="${s.code}">Save Manual Record</button><button class="btn btn-ghost" data-clear-state="${s.code}">Clear Manual Record</button></div><p class="help-text">Manual records remain available as an emergency producer override; automatic race records keep their own provenance.</p></div>
      </div></section></div>`;
  }

  function racesPage(){
    const active=liveRaces.filter(resultIsActive).sort((a,b)=>Number(b.called)-Number(a.called)||b.reporting-a.reporting);
    return `<div class="page-heading"><div><div class="eyebrow">RACE WATCH</div><h1>Federal & Governor Race Board</h1><p>Automatic race records sit beside the pre-election battleground watchlist. Forecast labels remain visually separate from vote counts and calls.</p></div><div class="heading-actions"><button class="btn btn-ghost" data-refresh-auto-results>Refresh results</button><a class="btn btn-ghost" href="#map">Map</a></div></div>
      ${active.length?`<section class="panel" style="margin-bottom:12px"><div class="panel-header"><div><div class="panel-title">Races Currently Reporting / Called</div><div class="panel-subtitle">Loaded from automatic keyless providers</div></div><span class="tag tag-green">${active.length} active</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Race</th><th>Leader</th><th>Reporting</th><th>Votes</th><th>Source</th><th></th></tr></thead><tbody>${active.slice(0,80).map(r=>`<tr><td><strong>${esc(r.office==='house'?r.key:`${r.state} ${r.office}`)}</strong></td><td>${r.called?'CALLED ':''}${esc(raceParty(r))}</td><td>${r.reporting||0}%</td><td>${fmtNum(r.totalVotes)}</td><td>${esc(r.sourceProvider)}</td><td><button class="btn btn-small btn-ghost" data-race-key="${esc(r.key)}" data-state="${r.state}">Inspect</button></td></tr>`).join('')}</tbody></table></div></section>`:''}
      <div class="grid"><section class="panel"><div class="panel-header"><div><div class="panel-title">U.S. Senate Battlegrounds</div><div class="panel-subtitle">Pre-election watchlist</div></div><span class="tag tag-orange">${D.senateBattlegrounds.length} watch states</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>State</th><th>Seat</th><th>Incumbent/status</th><th>Baseline</th><th>Automatic result</th><th></th></tr></thead><tbody>${D.senateBattlegrounds.map(r=>`<tr><td><strong>${r.state}</strong> — ${esc(stateName(r.state))}</td><td>${esc(r.seat)}</td><td>${esc(r.incumbent)}</td><td>${esc(r.baseline)}</td><td>${raceStatusChip(r.state,'senate')}</td><td><button class="btn btn-small btn-ghost" data-state="${r.state}" data-office="senate">Inspect</button></td></tr>`).join('')}</tbody></table></div></section>
      <div class="section-split"><section class="panel"><div class="panel-header"><div><div class="panel-title">Governor Battlegrounds</div><div class="panel-subtitle">Pre-election watchlist</div></div></div><div class="panel-body"><div class="race-list">${D.governorBattlegrounds.map(r=>`<button class="race-row" data-state="${r.state}" data-office="governor" style="color:inherit;text-align:left;cursor:pointer"><span class="race-code">${r.state}</span><span class="race-detail">${esc(r.matchup)}</span>${raceStatusChip(r.state,'governor')}</button>`).join('')}</div></div></section>
      <section class="panel"><div class="panel-header"><div><div class="panel-title">House Toss-Up Board</div><div class="panel-subtitle">Pre-election watchlist; click to inspect district map</div></div></div><div class="panel-body"><div class="race-list">${D.houseTossups.map(key=>{const st=key.split('-')[0],padded=key.replace(/-(\d)$/,'-0$1');return `<button class="race-row" data-state="${st}" data-race-key="${padded}" data-house-map="1" style="color:inherit;text-align:left;cursor:pointer"><span class="race-code">${key}</span><span class="race-detail">${esc(stateName(st))}</span>${raceForKey(padded)?raceStatusChip(st,'house'):'<span class="race-status u">Awaiting result</span>'}</button>`}).join('')}</div></div></section></div></div>`;
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
    qsa('[data-map-layer]',root).forEach(b=>b.addEventListener('click',()=>{state.settings.mapLayer=b.dataset.mapLayer;state.selectedRaceKey=null;saveState();renderPage();}));
    qsa('[data-state]',root).forEach(el=>el.addEventListener('click',()=>{
      state.selectedState=el.dataset.state;
      const clickedRace=el.dataset.raceKey?raceForKey(el.dataset.raceKey):null;
      if(clickedRace) state.settings.mapLayer=clickedRace.office==='house'?'house':clickedRace.office==='governor'?'governor':'senate';
      else if(el.dataset.houseMap==='1') state.settings.mapLayer='house';
      else if(el.dataset.office) state.settings.mapLayer=el.dataset.office==='governor'?'governor':'senate';
      state.selectedRaceKey=el.dataset.raceKey||currentLayerRace(state.selectedState,state.settings.mapLayer)?.key||null;
      saveState(); if(route()!=='map')location.hash='#map';else renderPage();
    }));
    qsa('[data-race-key]',root).forEach(el=>el.addEventListener('click',e=>{if(el.dataset.state)return;const race=raceForKey(el.dataset.raceKey);if(!race)return;state.selectedRaceKey=race.key;state.selectedState=race.state;state.settings.mapLayer=race.office==='house'?'house':race.office==='governor'?'governor':'senate';saveState();location.hash='#map';}));
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
    const warning=qs('#file-video-warning');if(warning&&location.protocol==='file:'){warning.classList.remove('hidden');warning.innerHTML='<strong>Direct-file mode:</strong> this build is designed for GitHub Pages. Publish the repository with the included Pages workflow (recommended), or use the optional local launcher while testing. GitHub Pages requires no database or API key.';}
    configurePolling();renderPage();renderVideoWorkspace();renderTicker();renderVideoManager();setResultsStatus();updateClock();setInterval(updateClock,1000);
    if(state.settings.automaticResults)setTimeout(()=>fetchAutomaticResults(false),150);
    setTimeout(()=>fetchNews(false),700);
  }
  boot();
})();
