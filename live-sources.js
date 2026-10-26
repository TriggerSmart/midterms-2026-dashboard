'use strict';

const clamp = (n, min=0, max=100) => Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min));

function partyCode(value) {
  const p = String(value || '').trim().toUpperCase();
  if (!p) return 'O';
  if (p === 'D' || p === 'DEM' || p.startsWith('DEMOCRAT')) return 'D';
  if (p === 'R' || p === 'REP' || p === 'GOP' || p.startsWith('REPUBLICAN')) return 'R';
  return 'O';
}

function parseWatchRaceId(raceId, officeHint) {
  const raw = String(raceId || '').toLowerCase().replace(/^2026-/, '');
  const parts = raw.split('-').filter(Boolean);
  const state = /^[a-z]{2}$/.test(parts[0] || '') ? parts[0].toUpperCase() : '';
  const office = officeHint === 'governors' ? 'governor' : String(officeHint || parts[1] || '').toLowerCase();
  const special = parts.includes('special');
  let district = null;
  if (office === 'house') {
    const ix = parts.indexOf('house');
    const candidate = ix >= 0 ? parts[ix + 1] : null;
    district = /^\d{1,2}$/.test(candidate || '') ? candidate.padStart(2, '0') : '00';
  }
  const key = office === 'house' ? `${state}-${district}` : `${state}-${office}${special ? '-special' : ''}`;
  return {state, office, district, special, key};
}

function normalizeCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).map(c => ({
    name: String(c && (c.name ?? c.n) || ''),
    party: partyCode(c && (c.party ?? c.p)),
    partyLabel: String(c && (c.party ?? c.p) || ''),
    votes: Math.max(0, Math.floor(Number(c && (c.votes ?? c.v)) || 0)),
    percent: c && (c.percent ?? c.pct) != null ? clamp(c.percent ?? c.pct) : null,
    winner: Boolean(c && (c.winner ?? c.w))
  }));
}

function reportingFromWatch(result) {
  const share = Number(result && result.expectedVoteShare);
  if (Number.isFinite(share) && share >= 0) return clamp(share <= 1 ? share * 100 : share);
  const precincts = result && result.precinctsReporting;
  const counted = Number(precincts && precincts.counted);
  const total = Number(precincts && precincts.total);
  if (Number.isFinite(counted) && Number.isFinite(total) && total > 0) return clamp(counted / total * 100);
  const direct = Number(result && (result.reporting ?? result.percentReporting ?? result.percent_reporting));
  return Number.isFinite(direct) ? clamp(direct) : 0;
}

function isWatchCalled(result, candidates) {
  if (candidates.some(c => c.winner)) return true;
  const call = String(result && (result.callState || result.callLabel) || '').trim().toLowerCase();
  if (!call || /uncalled|not[ _-]?called|counting|pending|no call|none/.test(call)) return false;
  return /called|certified|winner|won|elected/.test(call);
}

function normalizeWatchVoteOffice(rows, officeHint) {
  const list = Array.isArray(rows) ? rows : Array.isArray(rows && rows.rows) ? rows.rows : [];
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== 'object' || !row.raceId) continue;
    const parsed = parseWatchRaceId(row.raceId, officeHint);
    if (!parsed.state) continue;
    const result = row.result && typeof row.result === 'object' ? row.result : null;
    const candidates = normalizeCandidates(result && result.candidates);
    const sorted = [...candidates].sort((a,b) => b.votes - a.votes);
    const leader = sorted.length && sorted[0].votes > 0 ? sorted[0].party : 'U';
    const winner = candidates.find(c => c.winner) || null;
    const called = Boolean(result) && isWatchCalled(result, candidates);
    const source = result && result.source || {};
    out.push({
      key: parsed.key,
      raceId: String(row.raceId),
      state: parsed.state,
      office: parsed.office,
      district: parsed.district,
      special: parsed.special,
      leader,
      called,
      winnerParty: winner ? winner.party : null,
      reporting: result ? Number(reportingFromWatch(result).toFixed(1)) : 0,
      totalVotes: Math.max(0, Math.floor(Number(result && result.totalVotes) || candidates.reduce((n,c)=>n+c.votes,0))),
      candidates,
      sourceProvider: 'watch.vote',
      sourceAuthority: String(source.authority || row.official && row.official.authority || 'Official state election source'),
      sourceUrl: String(source.url || row.official && row.official.url || ''),
      sourceKind: String(source.kind || 'official'),
      updatedAt: result && (result.updatedAt || result.fetchedAt) || null,
      freshness: String(result && result.freshness || 'unknown'),
      unofficial: result ? result.unofficial !== false : true,
      callLabel: String(result && result.callLabel || ''),
      providerResultAvailable: Boolean(result)
    });
  }
  return out;
}

function parseOpenAmericaKey(rawKey, officeHint) {
  const key = String(rawKey || '').toUpperCase();
  const office = officeHint === 'governors' ? 'governor' : String(officeHint || '').toLowerCase();
  if (office === 'house') {
    const m = key.match(/^([A-Z]{2})-(\d{1,2})$/);
    if (!m) return null;
    return {state:m[1], district:m[2].padStart(2,'0'), special:false, office:'house', key:`${m[1]}-${m[2].padStart(2,'0')}`};
  }
  const m = key.match(/^([A-Z]{2})(?:-SPECIAL)?$/);
  if (!m) return null;
  const special = /-SPECIAL$/.test(key);
  return {state:m[1], district:null, special, office, key:`${m[1]}-${office}${special?'-special':''}`};
}

function normalizeOpenAmerica(payload, officeHint) {
  if (!payload || typeof payload !== 'object' || !payload.races || typeof payload.races !== 'object') return [];
  const out = [];
  for (const [rawKey, race] of Object.entries(payload.races)) {
    const parsed = parseOpenAmericaKey(rawKey, officeHint);
    if (!parsed || !race || typeof race !== 'object') continue;
    const candidates = normalizeCandidates(race.cands);
    const sorted = [...candidates].sort((a,b)=>b.votes-a.votes);
    const leader = ['D','R','I','L','G','C','W'].includes(String(race.leader||'').toUpperCase())
      ? partyCode(race.leader)
      : sorted.length && sorted[0].votes > 0 ? sorted[0].party : 'U';
    const winnerParty = race.winner ? partyCode(race.winner) : (candidates.find(c=>c.winner)?.party || null);
    out.push({
      key: parsed.key,
      raceId: `openamerica-${rawKey}`,
      state: parsed.state,
      office: parsed.office,
      district: parsed.district,
      special: parsed.special,
      leader,
      called: Boolean(race.called || winnerParty),
      winnerParty,
      reporting: race.pct_in == null ? 0 : Number(clamp(race.pct_in).toFixed(1)),
      totalVotes: Math.max(0, Math.floor(Number(race.total) || candidates.reduce((n,c)=>n+c.votes,0))),
      candidates,
      sourceProvider: 'Open America',
      sourceAuthority: 'Official state election office',
      sourceUrl: '',
      sourceKind: 'state',
      updatedAt: race.updated_at || race.last_updated || payload.as_of || null,
      freshness: payload.stale ? 'stale' : payload.live ? 'fresh' : 'unknown',
      unofficial: true,
      callLabel: '',
      providerResultAvailable: candidates.length > 0 || Number(race.total) > 0
    });
  }
  return out;
}

function mergeRaces(primary, secondary) {
  const map = new Map();
  for (const race of Array.isArray(secondary) ? secondary : []) if (race && race.key) map.set(race.key, {...race});
  for (const race of Array.isArray(primary) ? primary : []) {
    if (!race || !race.key) continue;
    const fallback = map.get(race.key);
    if (fallback && !race.providerResultAvailable && fallback.providerResultAvailable) {
      map.set(race.key, {
        ...race,
        ...fallback,
        sourceUrl: fallback.sourceUrl || race.sourceUrl,
        sourceAuthority: fallback.sourceAuthority || race.sourceAuthority,
        updatedAt: fallback.updatedAt || race.updatedAt
      });
    } else {
      map.set(race.key, fallback ? {
        ...fallback,
        ...race,
        sourceUrl: race.sourceUrl || fallback.sourceUrl,
        sourceAuthority: race.sourceAuthority || fallback.sourceAuthority,
        updatedAt: race.updatedAt || fallback.updatedAt
      } : {...race});
    }
  }
  return [...map.values()];
}

function partyPercent(race, code) {
  return (race.candidates || []).filter(c => c.party === code).reduce((n,c)=>n+(Number(c.percent)||0),0);
}

function summarizeHouseState(races, state) {
  const stateRaces = races.filter(r => r.office === 'house' && r.state === state);
  if (!stateRaces.length) return null;
  const active = stateRaces.filter(r => r.providerResultAvailable || r.totalVotes > 0 || r.reporting > 0);
  if (!active.length) return null;
  const d = active.filter(r => (r.called ? r.winnerParty : r.leader) === 'D').length;
  const rp = active.filter(r => (r.called ? r.winnerParty : r.leader) === 'R').length;
  const reporting = active.reduce((n,r)=>n+r.reporting,0)/active.length;
  return {
    state,
    leader: d === rp ? 'U' : d > rp ? 'D' : 'R',
    demPct: active.length ? d/active.length*100 : null,
    repPct: active.length ? rp/active.length*100 : null,
    otherPct: null,
    reporting: Number(reporting.toFixed(1)),
    called: active.length === stateRaces.length && stateRaces.every(r=>r.called),
    note:`House seat leads/calls: D ${d}, R ${rp} (${active.length}/${stateRaces.length} districts with results)`,
    source:'connected',
    updatedAt: active.map(r=>r.updatedAt).filter(Boolean).sort().at(-1) || null
  };
}

function stateSummaryFromRace(race) {
  if (!race || !race.providerResultAvailable) return null;
  const officeLabel = race.office === 'senate' ? 'Senate' : race.office === 'governor' ? 'Governor' : 'House';
  return {
    state: race.state,
    leader: race.called && race.winnerParty ? race.winnerParty : race.leader,
    demPct: partyPercent(race,'D') || null,
    repPct: partyPercent(race,'R') || null,
    otherPct: partyPercent(race,'O') || null,
    reporting: race.reporting,
    called: race.called,
    note:`${officeLabel}${race.special?' special':''} • ${race.sourceAuthority || race.sourceProvider}`,
    source:'connected',
    updatedAt: race.updatedAt
  };
}

function buildDashboardPayload({watchVote={}, openAmerica={}, fetchedAt=new Date().toISOString()}={}) {
  const offices = ['house','senate','governor'];
  const all = [];
  for (const office of offices) {
    const wKey = office === 'governor' ? 'governors' : office;
    const primary = normalizeWatchVoteOffice(watchVote[wKey], office);
    const secondary = normalizeOpenAmerica(openAmerica[office], office);
    all.push(...mergeRaces(primary, secondary));
  }

  const chamber = {
    house:{dem:0,rep:0,other:0,called:0},
    senate:{dem:0,rep:0,other:0,called:0}
  };
  for (const office of ['house','senate']) {
    for (const race of all.filter(r=>r.office===office && r.called)) {
      const p = race.winnerParty || race.leader;
      if (p === 'D') chamber[office].dem += 1;
      else if (p === 'R') chamber[office].rep += 1;
      else chamber[office].other += 1;
      chamber[office].called += 1;
    }
  }

  const states = [...new Set(all.map(r=>r.state).filter(Boolean))];
  const results = [];
  for (const state of states) {
    const senate = all.find(r=>r.state===state && r.office==='senate' && r.providerResultAvailable);
    const governor = all.find(r=>r.state===state && r.office==='governor' && r.providerResultAvailable);
    const summary = stateSummaryFromRace(senate) || stateSummaryFromRace(governor) || summarizeHouseState(all,state);
    if (summary) results.push(summary);
  }

  return {
    updatedAt:fetchedAt,
    mode:'automatic',
    chamber,
    results,
    races:all,
    providers:{
      watchVote:{enabled:true, label:'watch.vote', role:'National 2026 results from official state counts; licensed calls/certification only'},
      openAmerica:{enabled:true, label:'Open America', role:'Independent official-state-feed cross-check where coverage exists'}
    }
  };
}

module.exports = {
  partyCode,
  parseWatchRaceId,
  normalizeWatchVoteOffice,
  normalizeOpenAmerica,
  mergeRaces,
  buildDashboardPayload
};
