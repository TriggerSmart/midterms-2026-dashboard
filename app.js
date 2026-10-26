(() => {
  'use strict';
  const D = window.MIDTERM_DATA;
  const C = window.MidtermsCore;
  if (!D || !C) throw new Error('Midterms data/core not loaded');

  const STORE_KEY = 'midterms2026.commandCenter.v1';
  const qs = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v='') => String(v).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const fmtTime = iso => { try { return new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); } catch (_) { return ''; } };
  const fmtDateTime = iso => { try { return new Date(iso).toLocaleString(); } catch (_) { return ''; } };
  const stateName = code => (D.states.find(s => s.code === code) || {}).name || code;
  const senateBG = new Set(D.senateBattlegrounds.map(r => r.state));
  const govBG = new Set(D.governorBattlegrounds.map(r => r.state));
  const houseBGStates = new Set(D.houseTossups.map(r => r.split('-')[0]));

  function defaultState(){
    return {
      results: {},
      chamber: {
        house: {dem:D.startingControl.house.dem, rep:D.startingControl.house.rep, other:0, called:0},
        senate:{dem:D.startingControl.senate.dem, rep:D.startingControl.senate.rep, other:D.startingControl.senate.other, called:0}
      },
      headlines: D.defaultHeadlines.map(C.normalizeHeadline),
      headlineMode: 'fallback',
      newsLastUpdated: null,
      selectedState: 'GA',
      notes: '',
      videos: [],
      settings: {
        resultsUrl:'', autoPoll:false, pollSeconds:30,
        newsQuery:'2026 midterm elections',
        rss2json:'https://api.rss2json.com/v1/api.json?rss_url=',
        allOrigins:'https://api.allorigins.win/raw?url='
      },
      resultsMeta: {mode:'reference/manual', lastUpdated:null, lastError:''}
    };
  }

  function loadState(){
    const base = defaultState();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      return {
        ...base, ...saved,
        chamber:{...base.chamber, ...(saved.chamber||{})},
        settings:{...base.settings, ...(saved.settings||{})},
        resultsMeta:{...base.resultsMeta, ...(saved.resultsMeta||{})},
        results: saved.results && typeof saved.results === 'object' ? saved.results : {},
        videos: Array.isArray(saved.videos) ? saved.videos : [],
        headlines: Array.isArray(saved.headlines) && saved.headlines.length ? saved.headlines.map(C.normalizeHeadline) : base.headlines
      };
    } catch (err) {
      console.warn('Local state could not be restored', err);
      return base;
    }
  }

  let state = loadState();
  let resultPollTimer = null;
  let toastTimer = null;
  let resizeObservers = [];
  let zTop = 900;

  function saveState(){
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (err) { console.warn('Could not save local dashboard state', err); }
  }

  function toast(message, kind=''){
    const el = qs('#toast');
    el.textContent = message;
    el.className = `toast ${kind}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3800);
  }

  function setResultsStatus(kind='reference'){
    const dot = qs('#results-status-dot');
    const text = qs('#results-status-text');
    dot.className = 'status-dot';
    if (kind === 'connected') dot.classList.add('live');
    if (kind === 'error') dot.classList.add('error');
    const meta = state.resultsMeta;
    const suffix = meta.lastUpdated ? ` • ${fmtTime(meta.lastUpdated)}` : '';
    text.textContent = kind === 'connected' ? `Results: connected${suffix}` : kind === 'error' ? 'Results: feed error — retained last good data' : `Results: ${meta.mode || 'reference/manual'}${suffix}`;
  }

  function route(){
    const raw = (location.hash || '#dashboard').slice(1).split('?')[0];
    return ['dashboard','map','races','sources','data'].includes(raw) ? raw : 'dashboard';
  }

  function setActiveNav(){
    const r = route();
    qsa('.main-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === r));
  }

  function resultFor(code){
    return state.results[code] || {state:code,leader:'U',demPct:null,repPct:null,otherPct:null,reporting:0,called:false,source:'reference',note:'',updatedAt:null};
  }

  function leaderLabel(r){
    if (r.leader === 'D') return 'Dem lead';
    if (r.leader === 'R') return 'GOP lead';
    if (r.leader === 'O') return 'Other lead';
    return 'Unreported';
  }

  function battlegroundFor(code){ return senateBG.has(code) || govBG.has(code) || houseBGStates.has(code); }

  function mapHTML({compact=false}={}){
    const tiles = D.states.map(s => {
      const r = resultFor(s.code);
      const classes = ['state-tile',`leader-${r.leader}`];
      if (r.called) classes.push('called');
      if (battlegroundFor(s.code)) classes.push('battleground');
      if (state.selectedState === s.code) classes.push('selected');
      const title = `${s.name}: ${leaderLabel(r)}${r.reporting ? `, ${r.reporting}% reporting` : ''}${r.called ? ', called' : ''} • ${r.source}`;
      return `<button type="button" class="${classes.join(' ')}" data-state="${s.code}" style="grid-column:${s.col+1};grid-row:${s.row+1}" title="${esc(title)}"><span>${s.code}</span><span class="reporting-mini"><span style="width:${r.reporting||0}%"></span></span></button>`;
    }).join('');
    return `<div class="map-wrap ${compact?'compact-map':''}"><div class="us-map">${tiles}</div></div>
      <div class="map-legend"><span class="legend-chip"><i class="legend-swatch d"></i>Dem lead/call</span><span class="legend-chip"><i class="legend-swatch r"></i>GOP lead/call</span><span class="legend-chip"><i class="legend-swatch u"></i>No result</span><span class="legend-chip"><i class="legend-swatch b"></i>Watch state</span></div>`;
  }

  function chamberCard(type){
    const isHouse = type === 'house';
    const ch = state.chamber[type];
    const starting = D.startingControl[type];
    const total = isHouse ? 435 : 100;
    const electionRaces = isHouse ? 435 : 35;
    const sum = Math.max(1, ch.dem + ch.rep + (ch.other||0));
    const dPct = ch.dem/sum*100, rPct=ch.rep/sum*100, oPct=(ch.other||0)/sum*100;
    const control = ch.dem >= starting.majority ? 'D' : ch.rep >= starting.majority ? 'R' : 'TOSS';
    return `<section class="panel">
      <div class="panel-header"><div><div class="panel-title">U.S. ${isHouse?'House':'Senate'}</div><div class="panel-subtitle">Working projected composition</div></div><span class="tag ${control==='D'?'tag-blue':control==='R'?'tag-red':'tag-orange'}">${control==='TOSS'?'No majority':control+' majority'}</span></div>
      <div class="panel-body">
        <div class="balance-labels"><span class="text-blue">D ${ch.dem}</span><span class="muted">Majority ${starting.majority}</span><span class="text-red">R ${ch.rep}</span></div>
        <div class="balance-bar"><span class="balance-dem" style="width:${dPct}%"></span><span class="balance-other" style="width:${oPct}%"></span><span class="balance-rep" style="width:${rPct}%"></span></div>
        <div class="metric-sub">Election contests called: <strong>${ch.called||0}</strong> / ${electionRaces} • Starting chamber: R ${starting.rep}, D ${starting.dem}${starting.other?`, Other ${starting.other}`:''}${starting.vacant?`, ${starting.vacant} vacancies`:''}</div>
      </div>
    </section>`;
  }

  function raceStatusChip(code){
    const r = resultFor(code);
    const cls = r.leader==='D'?'d':r.leader==='R'?'r':'u';
    return `<span class="race-status ${cls}">${r.called?'CALLED ':''}${leaderLabel(r)}${r.reporting?` • ${r.reporting}%`:''}</span>`;
  }

  function newsHTML(limit=10){
    const items = (state.headlines || []).slice(0,limit);
    return items.length ? items.map((h,i) => `<div class="news-item"><span class="news-index">${String(i+1).padStart(2,'0')}</span><div><a href="${esc(h.link)}" ${h.link.startsWith('http')?'target="_blank" rel="noopener"':''}>${esc(h.title)}</a><div class="news-meta">${esc(h.source||'News wire')}${h.pubDate?` • ${esc(fmtDateTime(h.pubDate))}`:''}</div></div><span class="news-open">↗</span></div>`).join('') : `<div class="empty-state">No headlines loaded.</div>`;
  }

  function networkFeedsHTML(limit=8){
    return D.videoPresets.slice(0,limit).map((v,i) => `<div class="feed-card"><h4>${esc(v.name)}</h4><p>YouTube channel live feed preset</p><div class="feed-actions"><button class="btn btn-small btn-blue" data-add-preset="${i}">Dock feed</button><a class="btn btn-small btn-ghost" href="${esc(v.website)}" target="_blank" rel="noopener">Open source</a></div></div>`).join('');
  }

  function dashboardPage(){
    const calledStates = Object.values(state.results).filter(r => r.called).length;
    const reportingStates = Object.values(state.results).filter(r => (r.reporting||0)>0).length;
    const last = state.resultsMeta.lastUpdated ? fmtDateTime(state.resultsMeta.lastUpdated) : 'Not connected';
    return `<div class="page-heading"><div><div class="eyebrow">NOVEMBER 3, 2026</div><h1>Election Night Dashboard</h1><p>Live OSINT workspace for national results, battleground monitoring, network streams, source verification and producer notes.</p></div><div class="heading-actions"><a class="btn btn-ghost" href="#map">Open full map</a><a class="btn btn-ghost" href="#data">Connect results</a><button class="btn btn-accent" data-open-video>+ Add video</button></div></div>
      <div class="stats-grid">
        <div class="card"><div class="metric-label">States reporting</div><div class="metric-value blue">${reportingStates}</div><div class="metric-sub">of 50 states + D.C. tracked</div></div>
        <div class="card"><div class="metric-label">State records marked called</div><div class="metric-value red">${calledStates}</div><div class="metric-sub">manual/imported summary flags</div></div>
        <div class="card"><div class="metric-label">Senate races on ballot</div><div class="metric-value orange">35</div><div class="metric-sub">33 regular + 2 special elections</div></div>
        <div class="card"><div class="metric-label">Last results update</div><div class="metric-value green" style="font-size:16px;margin-top:10px">${esc(last)}</div><div class="metric-sub">provenance is shown on every state record</div></div>
      </div>
      <div class="dashboard-grid" style="margin-top:12px">
        <div class="dashboard-main">
          <div class="section-split">${chamberCard('house')}${chamberCard('senate')}</div>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Interactive U.S. Results Map</div><div class="panel-subtitle">Click a state to inspect or manually update</div></div><a class="btn btn-small btn-ghost" href="#map">Full map</a></div><div class="panel-body">${mapHTML({compact:true})}</div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Live Network Video Feeds</div><div class="panel-subtitle">Dock any preset; players persist across pages</div></div><button class="btn btn-small btn-accent" data-open-video>Manage players</button></div><div class="panel-body"><div class="feed-cards">${networkFeedsHTML()}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Poll Close Timeline</div><div class="panel-subtitle">Eastern Time; * indicates split/variable state timing</div></div><a class="btn btn-small btn-ghost" href="https://www.270towin.com/poll-closing-times/index.php" target="_blank" rel="noopener">Source</a></div><div class="panel-body"><div class="timeline">${D.pollCloseET.map(w=>`<div class="timeline-row"><div class="timeline-time">${w.label}</div><div><div class="timeline-states">${w.states.join(' · ')}</div>${w.note?`<div class="timeline-note">${esc(w.note)}</div>`:''}</div></div>`).join('')}</div><p class="help-text">Timing is for election-night monitoring, not for deciding when or where to vote. Use your state election office for voter instructions.</p></div></section>
        </div>
        <aside class="dashboard-side">
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Live News Wire</div><div class="panel-subtitle">${state.headlineMode==='live'?'Live RSS/proxy':'Fallback/source mode'}${state.newsLastUpdated?` • ${fmtTime(state.newsLastUpdated)}`:''}</div></div><button class="btn btn-small btn-ghost" data-refresh-news>Refresh</button></div><div class="panel-body"><div class="news-list">${newsHTML(12)}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Senate Watch</div><div class="panel-subtitle">Current battleground watchlist</div></div><a class="btn btn-small btn-ghost" href="#races">All races</a></div><div class="panel-body"><div class="race-list">${D.senateBattlegrounds.slice(0,8).map(r=>`<button class="race-row" data-state="${r.state}" style="color:inherit;text-align:left;cursor:pointer"><span class="race-code">${r.state}</span><span class="race-detail">${esc(r.incumbent)} • ${esc(r.baseline)}</span>${raceStatusChip(r.state)}</button>`).join('')}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Producer Notes</div><div class="panel-subtitle">Stored only in this browser</div></div><span class="tag tag-green">LOCAL</span></div><div class="panel-body"><textarea class="textarea notes-area" id="producer-notes" placeholder="Calls to verify, guests, timecodes, storylines…">${esc(state.notes)}</textarea><div class="help-text">Auto-saves locally. No database or login.</div></div></section>
        </aside>
      </div>`;
  }

  function mapPage(){
    const code = state.selectedState || 'GA';
    const s = D.states.find(x=>x.code===code) || D.states[0];
    const r = resultFor(s.code);
    const badges = [senateBG.has(s.code)?'<span class="tag tag-orange">Senate watch</span>':'',govBG.has(s.code)?'<span class="tag tag-orange">Governor watch</span>':'',houseBGStates.has(s.code)?'<span class="tag tag-orange">House toss-up state</span>':''].filter(Boolean).join('');
    return `<div class="page-heading"><div><div class="eyebrow">INTERACTIVE RESULTS</div><h1>Live State Map</h1><p>State-level election-night status. Connect a JSON feed, import data, or update states manually. The map never labels reference data as a live result.</p></div><div class="heading-actions"><a class="btn btn-ghost" href="#data">Data Control</a><button class="btn btn-accent" data-open-video>+ Video</button></div></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.45fr) minmax(340px,.55fr)">
        <section class="panel"><div class="panel-header"><div><div class="panel-title">United States</div><div class="panel-subtitle">D/R colors reflect the currently loaded state record, not forecasts</div></div><div class="map-legend"><span class="legend-chip"><i class="legend-swatch d"></i>D</span><span class="legend-chip"><i class="legend-swatch r"></i>R</span><span class="legend-chip"><i class="legend-swatch b"></i>Watch</span></div></div><div class="panel-body">${mapHTML()}</div></section>
        <section class="panel"><div class="panel-header"><div><div class="panel-title">State Inspector</div><div class="panel-subtitle">Manual override / verification record</div></div><span class="tag ${r.source==='connected'?'tag-green':r.source==='manual'?'tag-orange':'tag-blue'}">${esc(r.source)}</span></div><div class="panel-body">
          <div class="state-title">${esc(s.name)} <span class="muted">${s.code}</span></div><div class="state-badges">${badges || '<span class="tag">Standard watch</span>'}</div>
          <div class="result-bars"><div class="candidate-bar"><strong class="text-blue">D</strong><div class="track"><div class="fill d" style="width:${r.demPct||0}%"></div></div><div class="pct">${r.demPct==null?'—':r.demPct.toFixed(1)+'%'}</div></div><div class="candidate-bar"><strong class="text-red">R</strong><div class="track"><div class="fill r" style="width:${r.repPct||0}%"></div></div><div class="pct">${r.repPct==null?'—':r.repPct.toFixed(1)+'%'}</div></div></div>
          <div class="status-box" style="margin-top:12px"><strong>${leaderLabel(r)}</strong> • ${r.reporting||0}% reporting ${r.called?'• CALLED':''}<br/>Updated: ${r.updatedAt?esc(fmtDateTime(r.updatedAt)):'not yet'}${r.note?`<br/>Note: ${esc(r.note)}`:''}</div>
          <div class="form-grid" style="margin-top:8px"><div><label class="field-label">Leader</label><select id="state-leader" class="select-input"><option value="U" ${r.leader==='U'?'selected':''}>Unreported / tied</option><option value="D" ${r.leader==='D'?'selected':''}>Democratic</option><option value="R" ${r.leader==='R'?'selected':''}>Republican</option><option value="O" ${r.leader==='O'?'selected':''}>Other</option></select></div><div><label class="field-label">Reporting %</label><input id="state-reporting" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.reporting||0}" /></div><div><label class="field-label">Dem %</label><input id="state-dem" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.demPct??''}" /></div><div><label class="field-label">GOP %</label><input id="state-rep" class="text-input" type="number" min="0" max="100" step="0.1" value="${r.repPct??''}" /></div></div>
          <label class="field-label">State note / verification</label><input id="state-note" class="text-input" value="${esc(r.note||'')}" placeholder="e.g. AP called Senate race; official state site still updating" />
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:11px"><input id="state-called" type="checkbox" ${r.called?'checked':''}/> Mark state summary as called</label>
          <div class="button-row"><button class="btn btn-accent" data-save-state="${s.code}">Save Manual Record</button><button class="btn btn-ghost" data-clear-state="${s.code}">Clear State</button></div>
          <p class="help-text">This is a state summary layer, not a substitute for individual House/Senate/governor race results. Use the Race Board and source links for race-level verification.</p>
        </div></section>
      </div>`;
  }

  function racesPage(){
    return `<div class="page-heading"><div><div class="eyebrow">RACE WATCH</div><h1>Federal & Governor Race Board</h1><p>Preloaded 2026 battleground/watch lists with election-night state status alongside each entry. Forecast labels are intentionally kept separate from actual result records.</p></div><div class="heading-actions"><a class="btn btn-ghost" href="#map">Map</a><a class="btn btn-ghost" href="#sources">Forecast sources</a></div></div>
      <div class="grid">
        <section class="panel"><div class="panel-header"><div><div class="panel-title">U.S. Senate Battlegrounds</div><div class="panel-subtitle">35 Senate elections total: 33 regular + Florida and Ohio special elections</div></div><span class="tag tag-orange">${D.senateBattlegrounds.length} watch states</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>State</th><th>Seat</th><th>Incumbent / status</th><th>Baseline</th><th>Loaded result</th><th></th></tr></thead><tbody>${D.senateBattlegrounds.map(r=>`<tr><td><strong>${r.state}</strong> — ${esc(stateName(r.state))}</td><td>${esc(r.seat)}</td><td>${esc(r.incumbent)}</td><td>${esc(r.baseline)}</td><td>${raceStatusChip(r.state)}</td><td><button class="btn btn-small btn-ghost" data-state="${r.state}">Inspect</button></td></tr>`).join('')}</tbody></table></div></section>
        <div class="section-split">
          <section class="panel"><div class="panel-header"><div><div class="panel-title">Governor Battlegrounds</div><div class="panel-subtitle">36 governor races are on the ballot</div></div><span class="tag tag-orange">${D.governorBattlegrounds.length} watch</span></div><div class="panel-body"><div class="race-list">${D.governorBattlegrounds.map(r=>`<button class="race-row" data-state="${r.state}" style="color:inherit;text-align:left;cursor:pointer"><span class="race-code">${r.state}</span><span class="race-detail">${esc(r.matchup)}</span>${raceStatusChip(r.state)}</button>`).join('')}</div></div></section>
          <section class="panel"><div class="panel-header"><div><div class="panel-title">House Toss-Up Board</div><div class="panel-subtitle">Top current toss-ups preloaded for quick access</div></div><span class="tag tag-orange">${D.houseTossups.length} races</span></div><div class="panel-body"><div class="race-list">${D.houseTossups.map(code=>{const st=code.split('-')[0];return `<button class="race-row" data-state="${st}" style="color:inherit;text-align:left;cursor:pointer"><span class="race-code">${code}</span><span class="race-detail">State summary: ${esc(stateName(st))}</span>${raceStatusChip(st)}</button>`}).join('')}</div><p class="help-text">House watch lists can move late in the cycle. Use Cook, Sabato, DDHQ and 270toWin in the Source Center for the latest rating changes.</p></div></section>
        </div>
      </div>`;
  }

  function sourcesPage(){
    const cats = [...new Set(D.sources.map(s=>s.category))];
    return `<div class="page-heading"><div><div class="eyebrow">VERIFY BEFORE YOU AMPLIFY</div><h1>Source Center</h1><p>Fast access to results providers, official election offices, rating organizations and national news coverage. External pages open separately so they cannot disrupt the dashboard or video workspace.</p></div><div class="heading-actions"><button class="btn btn-accent" data-open-video>+ Video feed</button></div></div>
      <div class="callout">AP and Decision Desk HQ offer professional election data products, but authenticated API access is not safely equivalent to a public anonymous browser feed. This local dashboard therefore keeps those sources as verified launch points and supports a user-supplied CORS-enabled JSON feed in Data Control.</div>
      <div class="source-grid" style="margin-top:12px">${D.sources.map(s=>`<article class="source-card"><div class="source-category">${esc(s.category)}</div><h3>${esc(s.name)}</h3><p>${esc(s.note)}</p><div class="source-actions"><a class="btn btn-small btn-ghost" href="${esc(s.url)}" target="_blank" rel="noopener">Open source ↗</a></div></article>`).join('')}</div>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">Official State Results Finder</div><div class="panel-subtitle">Use NASS for the official state election office, then open that state's result system</div></div><a class="btn btn-small btn-ghost" href="https://www.nass.org/can-I-vote/election-officials" target="_blank" rel="noopener">NASS directory</a></div><div class="panel-body"><div class="form-grid"><div><label class="field-label">State</label><select id="official-state-select" class="select-input">${D.states.filter(s=>s.code!=='DC').map(s=>`<option value="${s.name}">${s.name}</option>`).join('')}</select></div><div style="align-self:end"><button class="btn btn-accent" data-search-official>Search official 2026 results</button></div></div><p class="help-text">The search opens a web query focused on the selected state's official election-result pages. Confirm the domain belongs to the state election authority before relying on it.</p></div></section>`;
  }

  function dataPage(){
    const h=state.chamber.house,s=state.chamber.senate;
    const example = JSON.stringify({updatedAt:'2026-11-03T23:15:00Z',chamber:{house:{dem:220,rep:210,other:0,called:430},senate:{dem:48,rep:50,other:2,called:22}},results:[{state:'GA',leader:'D',demPct:50.7,repPct:48.9,reporting:76.2,called:false,source:'connected',note:'Example only'}]},null,2);
    return `<div class="page-heading"><div><div class="eyebrow">DATA CONTROL</div><h1>Results & Feed Connections</h1><p>Use a CORS-enabled JSON endpoint, import a file, paste a snapshot, or manually update results. No server or database is required.</p></div><div class="heading-actions"><button class="btn btn-ghost" data-export>Export snapshot</button><button class="btn btn-danger" data-reset>Reset local data</button></div></div>
      <div class="section-split">
        <section class="panel"><div class="panel-header"><div><div class="panel-title">Remote Results Feed</div><div class="panel-subtitle">Generic JSON adapter — public/CORS-enabled endpoints only</div></div><span class="tag ${state.resultsMeta.mode==='connected'?'tag-green':'tag-orange'}">${esc(state.resultsMeta.mode)}</span></div><div class="panel-body">
          <label class="field-label">JSON endpoint URL</label><input id="results-url" class="text-input" value="${esc(state.settings.resultsUrl||'')}" placeholder="https://example.com/results-2026.json" />
          <div class="form-grid"><div><label class="field-label">Polling interval (seconds)</label><input id="poll-seconds" class="text-input" type="number" min="10" max="600" value="${state.settings.pollSeconds||30}" /></div><div style="align-self:end"><label style="display:flex;gap:8px;align-items:center;font-size:11px;padding:10px 0"><input id="auto-poll" type="checkbox" ${state.settings.autoPoll?'checked':''}/> Auto-poll while dashboard is open</label></div></div>
          <div class="button-row"><button class="btn btn-accent" data-connect-results>Fetch Now</button><button class="btn btn-ghost" data-save-feed-settings>Save Feed Settings</button></div>
          <div class="status-box" style="margin-top:10px"><strong>Last update:</strong> ${state.resultsMeta.lastUpdated?esc(fmtDateTime(state.resultsMeta.lastUpdated)):'none'}<br/><strong>Last error:</strong> ${esc(state.resultsMeta.lastError||'none')}</div>
          <p class="help-text">AP requires an API key and DDHQ's results API uses authenticated access/scopes. Do not paste private API client secrets into a browser-only dashboard. Use a provider-supported public endpoint or a feed you control that is safe for browser access.</p>
        </div></section>
        <section class="panel"><div class="panel-header"><div><div class="panel-title">Import / Paste Snapshot</div><div class="panel-subtitle">Merges supplied state records into the current dashboard</div></div><span class="tag tag-blue">LOCAL</span></div><div class="panel-body"><label class="field-label">Paste JSON</label><textarea id="json-import" class="textarea" placeholder='{"results":[{"state":"GA","leader":"D"}]}'></textarea><div class="button-row"><button class="btn btn-accent" data-import-paste>Import JSON</button><label class="btn btn-ghost" style="cursor:pointer">Choose JSON file<input id="json-file" type="file" accept="application/json,.json" hidden /></label></div><p class="help-text">Existing state records not included in the import are preserved.</p></div></section>
      </div>
      <div class="section-split" style="margin-top:12px">
        <section class="panel"><div class="panel-header"><div><div class="panel-title">Working Chamber Composition</div><div class="panel-subtitle">Manual producer board; initialize from current chamber control</div></div></div><div class="panel-body">
          <h3 style="font-size:12px;margin:0">House</h3><div class="form-grid"><div><label class="field-label">Dem</label><input id="house-dem" class="text-input" type="number" value="${h.dem}" /></div><div><label class="field-label">GOP</label><input id="house-rep" class="text-input" type="number" value="${h.rep}" /></div><div><label class="field-label">Other</label><input id="house-other" class="text-input" type="number" value="${h.other||0}" /></div><div><label class="field-label">2026 races called</label><input id="house-called" class="text-input" type="number" min="0" max="435" value="${h.called||0}" /></div></div>
          <h3 style="font-size:12px;margin:14px 0 0">Senate</h3><div class="form-grid"><div><label class="field-label">Dem</label><input id="senate-dem" class="text-input" type="number" value="${s.dem}" /></div><div><label class="field-label">GOP</label><input id="senate-rep" class="text-input" type="number" value="${s.rep}" /></div><div><label class="field-label">Other</label><input id="senate-other" class="text-input" type="number" value="${s.other||0}" /></div><div><label class="field-label">2026 Senate races called</label><input id="senate-called" class="text-input" type="number" min="0" max="35" value="${s.called||0}" /></div></div><div class="button-row"><button class="btn btn-accent" data-save-chambers>Save Chamber Board</button></div>
        </div></section>
        <section class="panel"><div class="panel-header"><div><div class="panel-title">Expected JSON Shape</div><div class="panel-subtitle">Fields may be omitted; only supplied records are merged</div></div></div><div class="panel-body"><div class="code-block">${esc(example)}</div></div></section>
      </div>
      <section class="panel" style="margin-top:12px"><div class="panel-header"><div><div class="panel-title">News Wire Settings</div><div class="panel-subtitle">Uses public RSS proxy fallbacks; external availability can change</div></div></div><div class="panel-body"><div class="form-grid"><div><label class="field-label">Google News query</label><input id="news-query" class="text-input" value="${esc(state.settings.newsQuery)}" /></div><div style="align-self:end"><button class="btn btn-accent" data-save-news-settings>Save & Refresh News</button></div></div><p class="help-text">If public RSS proxy access is blocked, the dashboard falls back to its source launchers instead of showing a blank news panel.</p></div></section>`;
  }

  function renderPage(){
    setActiveNav();
    const r = route();
    const root = qs('#page-root');
    root.innerHTML = r==='dashboard'?dashboardPage():r==='map'?mapPage():r==='races'?racesPage():r==='sources'?sourcesPage():dataPage();
    bindPageEvents();
    setResultsStatus(state.resultsMeta.mode==='connected'?'connected':state.resultsMeta.lastError?'error':'reference');
    root.focus({preventScroll:true});
  }

  function bindPageEvents(){
    const root = qs('#page-root');
    qsa('[data-open-video]',root).forEach(b=>b.addEventListener('click',openVideoPanel));
    qsa('[data-refresh-news]',root).forEach(b=>b.addEventListener('click',()=>fetchNews(true)));
    qsa('[data-add-preset]',root).forEach(b=>b.addEventListener('click',()=>addPreset(Number(b.dataset.addPreset))));
    qsa('[data-state]',root).forEach(el=>el.addEventListener('click',()=>{state.selectedState=el.dataset.state;saveState(); if(route()!=='map') location.hash='#map'; else renderPage();}));
    const notes=qs('#producer-notes',root); if(notes) notes.addEventListener('input',()=>{state.notes=notes.value;saveState();});
    qsa('[data-save-state]',root).forEach(b=>b.addEventListener('click',()=>saveManualState(b.dataset.saveState)));
    qsa('[data-clear-state]',root).forEach(b=>b.addEventListener('click',()=>clearState(b.dataset.clearState)));
    const search=qs('[data-search-official]',root); if(search) search.addEventListener('click',searchOfficial);
    const saveFeed=qs('[data-save-feed-settings]',root); if(saveFeed) saveFeed.addEventListener('click',saveFeedSettings);
    const connect=qs('[data-connect-results]',root); if(connect) connect.addEventListener('click',()=>{saveFeedSettings(false);fetchResults(true);});
    const importPaste=qs('[data-import-paste]',root); if(importPaste) importPaste.addEventListener('click',importPasted);
    const file=qs('#json-file',root); if(file) file.addEventListener('change',importFile);
    const chambers=qs('[data-save-chambers]',root); if(chambers) chambers.addEventListener('click',saveChambers);
    const exportBtn=qs('[data-export]',root); if(exportBtn) exportBtn.addEventListener('click',exportSnapshot);
    const reset=qs('[data-reset]',root); if(reset) reset.addEventListener('click',resetLocal);
    const news=qs('[data-save-news-settings]',root); if(news) news.addEventListener('click',()=>{state.settings.newsQuery=qs('#news-query',root).value.trim()||'2026 midterm elections';saveState();fetchNews(true);});
  }

  function saveManualState(code){
    try {
      const rec=C.normalizeResultRecord({state:code,leader:qs('#state-leader').value,reporting:qs('#state-reporting').value,demPct:qs('#state-dem').value===''?null:qs('#state-dem').value,repPct:qs('#state-rep').value===''?null:qs('#state-rep').value,called:qs('#state-called').checked,note:qs('#state-note').value,source:'manual',updatedAt:new Date().toISOString()},D.states);
      state.results={...state.results,[code]:rec}; state.resultsMeta={mode:'manual',lastUpdated:rec.updatedAt,lastError:''}; saveState();renderPage();renderTicker();toast(`${code} manual record saved`,'success');
    } catch(err){toast(err.message,'error');}
  }
  function clearState(code){ delete state.results[code]; state.resultsMeta.mode='reference/manual'; state.resultsMeta.lastUpdated=new Date().toISOString(); saveState();renderPage();toast(`${code} record cleared`); }
  function searchOfficial(){ const name=qs('#official-state-select').value; window.open(`https://www.google.com/search?q=${encodeURIComponent(name+' official election results 2026 secretary of state')}`,'_blank','noopener'); }

  function saveFeedSettings(showToast=true){
    state.settings.resultsUrl=(qs('#results-url')?.value||'').trim();
    state.settings.pollSeconds=Math.max(10,Math.min(600,Number(qs('#poll-seconds')?.value)||30));
    state.settings.autoPoll=Boolean(qs('#auto-poll')?.checked); saveState(); configurePolling(); if(showToast) toast('Feed settings saved','success');
  }

  async function fetchWithTimeout(url, options={}, timeout=10000){
    const ctl=new AbortController(); const id=setTimeout(()=>ctl.abort(),timeout);
    try{return await fetch(url,{...options,signal:ctl.signal,cache:'no-store'});} finally{clearTimeout(id);}
  }

  async function fetchResults(showToast=false){
    const url=(state.settings.resultsUrl||'').trim(); if(!url){if(showToast)toast('Add a results JSON URL first','error');return;}
    try{
      const res=await fetchWithTimeout(url,{},12000); if(!res.ok) throw new Error(`HTTP ${res.status}`); const payload=await res.json(); const parsed=C.validateImportPayload(payload,D.states); applyImport(parsed,'connected'); if(showToast)toast(`Connected feed loaded ${parsed.results.length} state records`,'success');
    }catch(err){state.resultsMeta.lastError=String(err.message||err);saveState();setResultsStatus('error');if(showToast)toast(`Results feed failed: ${err.message}`,'error');}
  }

  function applyImport(parsed, mode='imported'){
    const normalized=parsed.results.map(r=>({...r,source:mode==='connected'?'connected':r.source==='manual'?'manual':'imported'}));
    state.results=C.mergeResultMaps(state.results,normalized);
    if(parsed.chamber){
      const h=parsed.chamber.house,s=parsed.chamber.senate;
      if(h && (h.dem||h.rep||h.other||h.called)) state.chamber.house={...state.chamber.house,...h};
      if(s && (s.dem||s.rep||s.other||s.called)) state.chamber.senate={...state.chamber.senate,...s};
    }
    state.resultsMeta={mode,lastUpdated:parsed.updatedAt||new Date().toISOString(),lastError:''}; saveState(); setResultsStatus(mode==='connected'?'connected':'reference'); renderPage(); renderTicker();
  }

  function importPasted(){
    try{const text=qs('#json-import').value; const payload=JSON.parse(text); const parsed=C.validateImportPayload(payload,D.states); applyImport(parsed,'imported'); toast(`Imported ${parsed.results.length} state records`,'success');}
    catch(err){toast(`Import failed: ${err.message}`,'error');}
  }
  async function importFile(e){
    const f=e.target.files && e.target.files[0]; if(!f)return; try{const payload=JSON.parse(await f.text());const parsed=C.validateImportPayload(payload,D.states);applyImport(parsed,'imported');toast(`Imported ${f.name}`,'success');}catch(err){toast(`File import failed: ${err.message}`,'error');} finally{e.target.value='';}
  }
  function saveChambers(){
    const n=id=>Math.max(0,Number(qs(id)?.value)||0);
    state.chamber.house={dem:n('#house-dem'),rep:n('#house-rep'),other:n('#house-other'),called:Math.min(435,n('#house-called'))};
    state.chamber.senate={dem:n('#senate-dem'),rep:n('#senate-rep'),other:n('#senate-other'),called:Math.min(35,n('#senate-called'))};
    saveState(); renderPage(); toast('Chamber board saved','success');
  }
  function exportSnapshot(){
    const payload={updatedAt:new Date().toISOString(),chamber:state.chamber,results:Object.values(state.results),notes:state.notes}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='midterms-2026-dashboard-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function resetLocal(){
    if(!confirm('Reset all local results, notes, videos and settings for this dashboard?')) return;
    localStorage.removeItem(STORE_KEY); state=defaultState(); configurePolling(); renderPage(); renderVideoWorkspace(); renderTicker(); toast('Local dashboard reset');
  }
  function configurePolling(){ clearInterval(resultPollTimer); resultPollTimer=null; if(state.settings.autoPoll && state.settings.resultsUrl){resultPollTimer=setInterval(fetchResults,Math.max(10,state.settings.pollSeconds)*1000);} }

  function parseGoogleNewsXml(text){
    const doc=new DOMParser().parseFromString(text,'application/xml');
    return [...doc.querySelectorAll('item')].slice(0,25).map(item=>C.normalizeHeadline({title:item.querySelector('title')?.textContent||'',link:item.querySelector('link')?.textContent||'#',pubDate:item.querySelector('pubDate')?.textContent||'',source:item.querySelector('source')?.textContent||'Google News'}));
  }
  async function fetchNews(showToast=false){
    const query=state.settings.newsQuery||'2026 midterm elections'; const rss=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    let items=[]; let mode='fallback';
    try{
      const r=await fetchWithTimeout(state.settings.rss2json+encodeURIComponent(rss),{},9000); if(!r.ok)throw new Error(`RSS2JSON HTTP ${r.status}`); const j=await r.json(); if(j.status!=='ok'||!Array.isArray(j.items))throw new Error(j.message||'RSS2JSON returned no items'); items=j.items.slice(0,25).map(x=>C.normalizeHeadline({...x,source:x.author||'Google News'})); mode='live';
    }catch(firstErr){
      try{const r=await fetchWithTimeout(state.settings.allOrigins+encodeURIComponent(rss),{},9000);if(!r.ok)throw new Error(`Proxy HTTP ${r.status}`);items=parseGoogleNewsXml(await r.text());if(!items.length)throw new Error('No RSS items');mode='live';}
      catch(secondErr){console.warn('News proxies unavailable',firstErr,secondErr);items=D.defaultHeadlines.map(C.normalizeHeadline);mode='fallback';if(showToast)toast('Live RSS unavailable; using source/fallback wire','error');}
    }
    state.headlines=items;state.headlineMode=mode;state.newsLastUpdated=new Date().toISOString();saveState();renderTicker();if(route()==='dashboard')renderPage();if(showToast&&mode==='live')toast(`News wire refreshed: ${items.length} headlines`,'success');
  }

  function renderTicker(){
    const track=qs('#ticker-track'); const base=(state.headlines&&state.headlines.length?state.headlines:D.defaultHeadlines).slice(0,18); const doubled=[...base,...base];
    track.innerHTML=doubled.map(h=>`<a class="ticker-item" href="${esc(h.link)}" ${h.link.startsWith('http')?'target="_blank" rel="noopener"':''}>${esc(h.title)}${h.source?`<span class="ticker-source">${esc(h.source)}</span>`:''}</a>`).join('');
  }

  function openVideoPanel(){qs('#add-video-panel').classList.remove('hidden');renderVideoManager();}
  function closeVideoPanel(){qs('#add-video-panel').classList.add('hidden');}
  function renderVideoManager(){
    qs('#video-preset-list').innerHTML=D.videoPresets.map((v,i)=>`<button class="preset-btn" data-preset="${i}"><span>${esc(v.name)}</span><small>ADD LIVE</small></button>`).join('');
    qsa('[data-preset]',qs('#video-preset-list')).forEach(b=>b.addEventListener('click',()=>addPreset(Number(b.dataset.preset))));
    const list=qs('#active-video-list'); list.innerHTML=state.videos.length?state.videos.map(v=>`<div class="active-video-row"><div><div class="name">${esc(v.title)}</div><div class="mode">${esc(v.mode)}</div></div><button class="btn btn-small btn-ghost" data-focus-video="${v.uid}">Show</button><button class="btn btn-small btn-danger" data-remove-video="${v.uid}">Remove</button></div>`).join(''):'<div class="empty-state">No active players.</div>';
    qsa('[data-remove-video]',list).forEach(b=>b.addEventListener('click',()=>removeVideo(b.dataset.removeVideo)));
    qsa('[data-focus-video]',list).forEach(b=>b.addEventListener('click',()=>{closeVideoPanel();const el=qs(`[data-video-window="${CSS.escape(b.dataset.focusVideo)}"]`);if(el){el.style.zIndex=String(++zTop);el.scrollIntoView({block:'nearest'});}}));
  }
  function addPreset(index){const p=D.videoPresets[index];if(!p)return;state.videos.push({uid:uid(),title:p.name,type:'channel',channelId:p.channelId,website:p.website,mode:'right',minimized:false,left:70,top:130,width:460,height:310});saveState();renderVideoWorkspace();renderVideoManager();toast(`${p.name} added to right dock`,'success');}
  function addUserVideo(mode){
    const input=qs('#video-url-input').value.trim();const id=C.parseYouTubeId(input);if(!id){toast('Enter a valid YouTube watch, short, live, embed URL, or 11-character video ID','error');return;} const title=qs('#video-title-input').value.trim()||`YouTube ${id}`;state.videos.push({uid:uid(),title,type:'video',id,url:input,mode,minimized:false,left:Math.max(18,window.innerWidth*.5-230),top:150,width:460,height:310});qs('#video-url-input').value='';qs('#video-title-input').value='';saveState();renderVideoWorkspace();renderVideoManager();toast(`${title} added`,'success');
  }
  function removeVideo(id){state.videos=state.videos.filter(v=>v.uid!==id);saveState();renderVideoWorkspace();renderVideoManager();}
  function updateVideo(id,patch){const v=state.videos.find(x=>x.uid===id);if(!v)return;Object.assign(v,patch);saveState();renderVideoWorkspace();renderVideoManager();}

  function videoWindowHTML(v){
    const src=C.makeYouTubeEmbedUrl(v); const floating=v.mode==='float'; const style=floating?`left:${Math.max(0,v.left||50)}px;top:${Math.max(108,v.top||130)}px;width:${Math.max(250,v.width||460)}px;height:${Math.max(175,v.height||310)}px;z-index:${++zTop}`:'';
    return `<section class="video-window ${floating?'floating':''} ${v.minimized?'minimized':''}" data-video-window="${v.uid}" style="${style}"><div class="video-titlebar" data-drag-video="${v.uid}"><div class="video-title">${esc(v.title)}</div><div class="video-controls"><button title="Dock left" data-video-action="left" data-id="${v.uid}">L</button><button title="Float / undock" data-video-action="float" data-id="${v.uid}">◇</button><button title="Dock right" data-video-action="right" data-id="${v.uid}">R</button><button title="Minimize" data-video-action="min" data-id="${v.uid}">${v.minimized?'□':'—'}</button><button title="Fullscreen" data-video-action="full" data-id="${v.uid}">⛶</button><button title="Close" data-video-action="close" data-id="${v.uid}">×</button></div></div><div class="video-frame-wrap">${src?`<iframe src="${src}" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`:`<div class="video-error">Video source unavailable.</div>`}</div></section>`;
  }

  function renderVideoWorkspace(){
    resizeObservers.forEach(o=>o.disconnect()); resizeObservers=[];
    const left=qs('#video-dock-left'),right=qs('#video-dock-right'),layer=qs('#video-layer');left.innerHTML='';right.innerHTML='';layer.innerHTML='';
    for(const v of state.videos){const tmp=document.createElement('div');tmp.innerHTML=videoWindowHTML(v);const el=tmp.firstElementChild;if(v.mode==='left')left.append(el);else if(v.mode==='right')right.append(el);else layer.append(el);}
    qsa('[data-video-action]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();videoAction(b.dataset.id,b.dataset.videoAction);}));
    qsa('.video-window.floating').forEach(el=>{
      const id=el.dataset.videoWindow; const obs=new ResizeObserver(entries=>{for(const entry of entries){const v=state.videos.find(x=>x.uid===id);if(!v||v.mode!=='float')continue;const rect=entry.target.getBoundingClientRect();v.width=Math.round(rect.width);v.height=Math.round(rect.height);saveState();}});obs.observe(el);resizeObservers.push(obs);
      el.addEventListener('pointerdown',()=>el.style.zIndex=String(++zTop));
    });
    qsa('[data-drag-video]').forEach(bar=>enableDrag(bar));
  }

  function videoAction(id,action){
    const v=state.videos.find(x=>x.uid===id);if(!v)return;const el=qs(`[data-video-window="${CSS.escape(id)}"]`);
    if(action==='close'){removeVideo(id);return;} if(action==='min'){v.minimized=!v.minimized;saveState();renderVideoWorkspace();return;} if(action==='full'){if(el?.requestFullscreen)el.requestFullscreen();return;}
    if(action==='float' && el){const r=el.getBoundingClientRect();Object.assign(v,{mode:'float',left:Math.max(0,r.left),top:Math.max(108,r.top),width:Math.max(250,r.width),height:Math.max(175,r.height)});} else if(['left','right'].includes(action))v.mode=action;saveState();renderVideoWorkspace();renderVideoManager();
  }

  function enableDrag(bar){
    const id=bar.dataset.dragVideo;bar.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const v=state.videos.find(x=>x.uid===id);if(!v||v.mode!=='float')return;const win=bar.closest('.video-window');const rect=win.getBoundingClientRect();const dx=e.clientX-rect.left,dy=e.clientY-rect.top;win.setPointerCapture(e.pointerId);win.style.zIndex=String(++zTop);
      const move=ev=>{const left=Math.max(0,Math.min(window.innerWidth-80,ev.clientX-dx));const top=Math.max(104,Math.min(window.innerHeight-70,ev.clientY-dy));win.style.left=`${left}px`;win.style.top=`${top}px`;v.left=left;v.top=top;};
      const up=()=>{win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',up);saveState();};win.addEventListener('pointermove',move);win.addEventListener('pointerup',up);});
  }

  function updateClock(){
    const now=new Date();qs('#live-clock').textContent=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const first=new Date('2026-11-03T18:00:00-05:00');const diff=first-now;const cd=qs('#countdown');
    if(diff>0){const days=Math.floor(diff/86400000),hrs=Math.floor(diff%86400000/3600000),mins=Math.floor(diff%3600000/60000);cd.textContent=`First major poll close in ${days}d ${hrs}h ${mins}m`;}
    else if(now < new Date('2026-11-04T06:00:00-05:00')) cd.textContent='ELECTION NIGHT LIVE'; else cd.textContent='Election night window complete — certification/counting may continue';
    const next=D.pollCloseET.find(w=>new Date(w.at)>now);qs('#next-poll').textContent=next?`Next close wave: ${next.label} — ${next.states.slice(0,8).join(', ')}${next.states.length>8?'…':''}`:'All listed poll-close waves have passed';
  }

  function initGlobalEvents(){
    window.addEventListener('hashchange',renderPage);
    qs('#open-video-panel-btn').addEventListener('click',openVideoPanel);qs('#close-video-panel-btn').addEventListener('click',closeVideoPanel);qs('#add-video-panel').addEventListener('click',e=>{if(e.target.id==='add-video-panel')closeVideoPanel();});
    qs('#add-video-right-btn').addEventListener('click',()=>addUserVideo('right'));qs('#add-video-float-btn').addEventListener('click',()=>addUserVideo('float'));qs('#refresh-news-btn').addEventListener('click',()=>fetchNews(true));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeVideoPanel();});
  }

  function boot(){
    if(!location.hash) history.replaceState(null,'','#dashboard');
    initGlobalEvents();
    const fileWarning=qs('#file-video-warning');
    if(fileWarning && location.protocol==='file:') fileWarning.classList.remove('hidden');
    configurePolling();renderPage();renderVideoWorkspace();renderTicker();renderVideoManager();setResultsStatus(state.resultsMeta.mode==='connected'?'connected':'reference');updateClock();setInterval(updateClock,1000);
    setTimeout(()=>fetchNews(false),600);
  }
  boot();
})();
