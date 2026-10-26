(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MidtermsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const allowedSources = new Set(['manual','imported','connected','reference','demo']);
  const clamp = (n,min,max) => Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min));
  const decodeEntities = (s='') => String(s)
    .replace(/<[^>]*>/g,' ')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\s+/g,' ').trim();

  function parseYouTubeId(input){
    if (!input) return null;
    const raw = String(input).trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    try {
      const url = new URL(raw);
      if (url.hostname === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0];
        return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
      }
      if (url.hostname.includes('youtube.com')) {
        const v = url.searchParams.get('v');
        if (/^[A-Za-z0-9_-]{11}$/.test(v || '')) return v;
        const parts = url.pathname.split('/').filter(Boolean);
        const ix = parts.findIndex(p => ['embed','shorts','live'].includes(p));
        if (ix >= 0 && /^[A-Za-z0-9_-]{11}$/.test(parts[ix+1] || '')) return parts[ix+1];
      }
    } catch (_) {}
    return null;
  }

  function normalizeResultRecord(record, states){
    if (!record || typeof record !== 'object') throw new Error('Result record must be an object');
    const state = String(record.state || record.code || '').toUpperCase();
    if (!states.some(s => s.code === state)) throw new Error(`Unknown state: ${state || '(blank)'}`);
    const leaderRaw = String(record.leader || 'U').toUpperCase();
    const leader = ['D','R','O','U'].includes(leaderRaw) ? leaderRaw : 'U';
    const source = allowedSources.has(record.source) ? record.source : 'imported';
    return {
      state,
      leader,
      demPct: record.demPct == null ? null : clamp(record.demPct,0,100),
      repPct: record.repPct == null ? null : clamp(record.repPct,0,100),
      otherPct: record.otherPct == null ? null : clamp(record.otherPct,0,100),
      reporting: record.reporting == null ? 0 : clamp(record.reporting,0,100),
      called: Boolean(record.called),
      note: String(record.note || '').slice(0,500),
      source,
      updatedAt: record.updatedAt || new Date().toISOString()
    };
  }

  function normalizeChamber(ch, total){
    const out = {dem:0,rep:0,other:0,called:0};
    if (!ch || typeof ch !== 'object') return out;
    out.dem = Math.max(0, Math.floor(Number(ch.dem)||0));
    out.rep = Math.max(0, Math.floor(Number(ch.rep)||0));
    out.other = Math.max(0, Math.floor(Number(ch.other)||0));
    out.called = Math.max(0, Math.min(total, Math.floor(Number(ch.called)||0)));
    return out;
  }

  function validateImportPayload(payload, states){
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Import payload must be an object');
    if (payload.results != null && !Array.isArray(payload.results)) throw new Error('results must be an array');
    const results = (payload.results || []).map(r => normalizeResultRecord(r, states));
    const chamber = {
      house: normalizeChamber(payload.chamber && payload.chamber.house, 435),
      senate: normalizeChamber(payload.chamber && payload.chamber.senate, 100)
    };
    return {updatedAt: payload.updatedAt || new Date().toISOString(), results, chamber};
  }

  function normalizeHeadline(item){
    const title = decodeEntities(item && item.title || '').slice(0,280) || 'Untitled update';
    let link = String(item && item.link || '#').trim();
    if (!/^(https?:|#)/i.test(link)) link = '#';
    return {title, link, pubDate: item && item.pubDate || null, source: item && item.source || ''};
  }

  function computeChamberStatus(chamber, total, majority){
    const dem = Math.max(0, Number(chamber && chamber.dem)||0);
    const rep = Math.max(0, Number(chamber && chamber.rep)||0);
    const other = Math.max(0, Number(chamber && chamber.other)||0);
    const called = Math.max(0, Math.min(total, Number(chamber && chamber.called)||0));
    let control = 'TOSS';
    if (dem >= majority) control = 'D';
    else if (rep >= majority) control = 'R';
    return {dem,rep,other,called,uncalled:Math.max(0,total-called),majority,control};
  }

  function safeJsonParse(text, fallback=null){
    try { return JSON.parse(text); } catch (_) { return fallback; }
  }

  function makeYouTubeEmbedUrl(video){
    if (!video || typeof video !== 'object') return '';
    if (video.type === 'channel' && /^[A-Za-z0-9_-]+$/.test(video.channelId || '')) {
      return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(video.channelId)}&autoplay=1&rel=0`;
    }
    const id = video.id || parseYouTubeId(video.url || '');
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : '';
  }

  function mergeResultMaps(existing, incoming){
    const out = Object.assign({}, existing || {});
    for (const item of incoming || []) {
      if (item && item.state) out[item.state] = Object.assign({}, out[item.state] || {}, item);
    }
    return out;
  }

  return {parseYouTubeId, normalizeResultRecord, validateImportPayload, normalizeHeadline, computeChamberStatus, safeJsonParse, makeYouTubeEmbedUrl, mergeResultMaps};
});
