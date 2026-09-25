(() => {
  'use strict';

  const C = window.FANTASY_CONFIG || {
    defaultLeagueId: '760495843', season: 2027, gameCode: 'fhl',
    espnHost: 'https://lm-api-reads.fantasy.espn.com',
    espnScoreboard: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
    nhlScore: 'https://api-web.nhle.com/v1/score/now', refreshSeconds: 20, simulationIterations: 500
  };
  const DEMO = window.HOCKEY_DEMO || {teams:[],players:[]};
  const qs = new URLSearchParams(location.search);
  const state = {
    tab:'dashboard',
    league: qs.get('leagueId') || localStorage.getItem('hockey-league') || C.defaultLeagueId,
    season: Number(qs.get('seasonId') || localStorage.getItem('hockey-season') || C.season),
    api: localStorage.getItem('hockey-api') || C.apiBase || '',
    teams: (DEMO.teams || []).map(x => ({...x,id:String(x.id)})),
    players: (DEMO.players || []).map(x => ({...x,fantasy_team_id:String(x.fantasy_team_id)})),
    games:[], settings:{}, standings:[], live:false, source:'Demo', error:'',
    selectedTeam: null, tradeA:[], tradeB:[], watch: JSON.parse(localStorage.getItem('hockey-watch') || '[]'),
    strategy: localStorage.getItem('hockey-strategy') || 'floor', iterations: Number(localStorage.getItem('hockey-iterations') || C.simulationIterations || 500),
    theme: localStorage.getItem('hockey-theme') || 'dark'
  };
  state.selectedTeam = String(qs.get('teamId') || localStorage.getItem('hockey-team') || state.teams[0]?.id || '1');

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = n => window.Icon ? window.Icon(n) : '';
  const fmt = n => Number(n || 0).toFixed(1);
  const team = id => state.teams.find(t => String(t.id) === String(id)) || {id,name:'Unknown Team',owner:'Unknown'};
  const roster = id => state.players.filter(p => String(p.fantasy_team_id) === String(id));
  const projection = p => Number(p.projection ?? p.ai_value_score ?? 0);
  const avs = p => Number(p.ai_value_score ?? projection(p));
  const persist = () => {
    localStorage.setItem('hockey-league', state.league); localStorage.setItem('hockey-season', state.season);
    localStorage.setItem('hockey-api', state.api); localStorage.setItem('hockey-team', state.selectedTeam);
    localStorage.setItem('hockey-theme', state.theme); localStorage.setItem('hockey-strategy', state.strategy);
    localStorage.setItem('hockey-iterations', state.iterations);
  };
  const apiURL = path => (state.api || '').replace(/\/$/,'') + path;

  async function getJSON(url, options={}) {
    const r = await fetch(url, {...options, cache:'no-store'});
    let d = null; try { d = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(d?.detail || d?.message || `HTTP ${r.status}`);
    return d;
  }

  function setStatus(text, kind='ok') {
    const dot = $('statusDot'), label = $('statusText'), sub = $('statusSub');
    if (label) label.textContent = text;
    if (dot) dot.className = 'dot ' + (kind === 'warn' ? 'warn' : 'ok');
    if (sub) sub.textContent = state.error ? state.error : (state.source === 'Demo fallback' ? 'Demo data · connect ESPN in Settings' : state.source);
  }

  function normalizeESPN(data) {
    const members = {}; (data.members || []).forEach(m => members[m.id] = m);
    const teams = [], players = [];
    const pos = {1:'C',2:'LW',3:'RW',4:'D',5:'G',6:'FLEX',16:'FLEX',17:'FLEX'};
    (data.teams || []).forEach(t => {
      const owner = (t.owners || []).map(id => {
        const m = members[id] || {}; return m.displayName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || id;
      }).join(', ') || 'Unknown';
      const ft = {id:String(t.id), name:t.name || `Team ${t.id}`, owner, abbrev:t.abbrev || ''};
      teams.push(ft);
      ((t.roster || {}).entries || []).forEach(e => {
        const p = e.player || {}, stats = (p.stats || []).filter(x => x.scoringPeriodId === data.scoringPeriodId).pop() || (p.stats || []).pop() || {};
        players.push({
          espn_id:p.id, fantasy_team_id:String(t.id), fantasy_team_name:ft.name, fantasy_owner:owner,
          name:p.fullName || p.displayName || `Player ${p.id}`, team:p.proTeamAbbrev || '', position:pos[p.defaultPositionId] || 'UTIL',
          slot:String(e.lineupSlotId ?? ''), status:p.injuryStatus || 'Healthy', projection:Number(p.projectedTotalPoints || stats.projectedTotalPoints || 0),
          ai_value_score:Number(p.projectedTotalPoints || stats.projectedTotalPoints || 0), ai_tier:'Live', stats:p.stats || [],
          proTeamId:p.proTeamId, gameId:null
        });
      });
    });
    return {teams,players};
  }

  async function loadFantasy() {
    state.error = '';

    // GitHub Pages cannot send ESPN's private-session cookies cross-origin.
    // Never hit the private ESPN endpoint directly from the public frontend:
    // it produces a guaranteed 401 for private leagues and leaves the page noisy.
    if (!state.api) {
      state.source = 'Demo fallback';
      return true;
    }

    try {
      const d = await getJSON(apiURL('/api/league/teams') + `?league_id=${encodeURIComponent(state.league)}&season=${state.season}`);
      if (d.teams?.length) {
        applyFantasy(d.teams, flattenBackend(d));
        state.source = 'Secure ESPN backend';
        state.error = '';
        return true;
      }
      throw new Error('Backend returned no fantasy teams');
    } catch (e) {
      state.error = e.message;
      state.source = 'Demo fallback';
      return false;
    }
  }

  function flattenBackend(d) {
    const out=[]; Object.keys(d.rosters || {}).forEach(k => (d.rosters[k] || []).forEach(p => out.push(p))); return out;
  }
  function applyFantasy(teams, players) {
    state.teams = teams.map(t => ({...t,id:String(t.id)}));
    state.players = players.map(p => ({...p,fantasy_team_id:String(p.fantasy_team_id)}));
    if (!state.teams.some(t => String(t.id) === state.selectedTeam)) state.selectedTeam = String(state.teams[0]?.id || '1');
    persist();
  }

  async function loadLive() {
    try {
      if (state.api) { const d=await getJSON(apiURL('/api/live/games')); if (Array.isArray(d.games)) {state.games=d.games;state.live=true;state.source=d.source||state.source;return;} }
    } catch (_) {}
    try {
      const d=await getJSON(C.espnScoreboard); state.games=(d.events || []).map(e => {
        const c=e.competitions?.[0] || {}, a=(c.competitors||[]).find(x=>x.homeAway==='away')||{}, h=(c.competitors||[]).find(x=>x.homeAway==='home')||{}, st=e.status?.type||{};
        return {id:e.id,state:st.state==='in'?'in':st.state==='post'?'post':'scheduled',detail:st.shortDetail||st.detail||'',date:e.date,
          away:{abbr:a.team?.abbreviation||'',name:a.team?.displayName||'',score:Number(a.score||0)},home:{abbr:h.team?.abbreviation||'',name:h.team?.displayName||'',score:Number(h.score||0)}};
      }); state.live=true; state.source='ESPN NHL'; state.error=''; return;
    } catch (_) {}
    try {
      const d=await getJSON(C.nhlScore); state.games=(d.games||[]).map(g=>({id:g.id,state:['LIVE','CRIT'].includes(g.gameState)?'in':g.gameState==='FINAL'?'post':'scheduled',detail:g.gameState,date:g.startTime,
        away:{abbr:g.awayTeam?.abbrev||'',name:g.awayTeam?.name?.default||'',score:Number(g.awayTeam?.score||0)},home:{abbr:g.homeTeam?.abbrev||'',name:g.homeTeam?.name?.default||'',score:Number(g.homeTeam?.score||0)}}));
      state.live=true; state.source='Official NHL Web API'; state.error='';
    } catch (_) { state.games=[]; state.live=false; state.error=''; }
  }

  function gameFor(p) { return state.games.find(g => [g.away?.abbr,g.home?.abbr].includes(p.team)); }
  function logo(abbr) { return abbr ? `https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/${encodeURIComponent(String(abbr).toLowerCase())}.png` : ''; }
  function avatar(p) { const initials=String(p.name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); return `<div class="avatar-fallback">${esc(initials)}</div>`; }
  function teamCell(abbr) { return `<div class="player-cell"><img class="team-logo" src="${logo(abbr)}" alt="" onerror="this.remove()"><span>${esc(abbr||'—')}</span></div>`; }
  function stat(title,value,sub) { return `<div class="metric card"><div class="eyebrow">${esc(title)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`; }
  function currentRoster() { return roster(state.selectedTeam); }
  function health() { const seen=new Set(); let ok=true; state.players.forEach(p=>{const k=`${p.espn_id}|${p.fantasy_team_id}`; if(seen.has(k)) ok=false; seen.add(k);}); return ok; }

  function nav() {
    const items=[['dashboard','Dashboard','grid'],['rosters','Full Rosters','users'],['trades','Trade Lab','arrows'],['sim','Simulation','flask'],['live','Live Center','radio'],['predictions','Predictions','activity'],['league','League Hub','trophy'],['players','Player Pool','search'],['settings','Settings','settings']];
    $('brandIcon').innerHTML=icon('hockey'); $('refreshBtn').innerHTML=icon('refresh'); $('themeBtn').innerHTML=icon(state.theme==='light'?'moon':'sun'); $('mobileMenu').innerHTML=icon('grid'); $('modalClose').innerHTML=icon('x');
    $('nav').innerHTML=items.map(x=>`<button class="nav-btn ${state.tab===x[0]?'active':''}" data-tab="${x[0]}">${icon(x[2])}<span class="nav-label">${x[1]}</span></button>`).join('');
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
  }
  function selector() { const s=$('teamSelect'); s.innerHTML=state.teams.map(t=>`<option value="${esc(t.id)}" ${String(t.id)===String(state.selectedTeam)?'selected':''}>${esc(t.name)} · ${esc(t.owner)}</option>`).join(''); s.onchange=()=>{state.selectedTeam=s.value;persist();render();}; }
  function shell() { document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); const v=$('view-'+state.tab); if(v)v.classList.add('active'); $('pageTitle').textContent={dashboard:'Executive Dashboard',rosters:'Full League Rosters',trades:'Trade Analyzer',sim:'Simulation Lab',live:'Live Performance Center',league:'League Hub',players:'Player Pool & Watchlist',settings:'Settings & Integrations'}[state.tab] || 'Dashboard'; }

  function dashboard() {
    const r=currentRoster(), active=r.filter(p=>!['Bench','IR','IR+'].includes(p.slot)), live=r.filter(gameFor), alerts=r.filter(p=>p.status!=='Healthy'), benchStar=r.filter(p=>['Bench','BE','BN'].includes(String(p.slot))&&gameFor(p));
    $('view-dashboard').innerHTML=`<div class="hero"><div class="card"><div class="card-body"><div class="eyebrow">${state.source}</div><h1>${esc(team(state.selectedTeam).name)}</h1><p>${esc(team(state.selectedTeam).owner)} · league ${esc(state.league)} · season ${state.season}. Live lineup intelligence, roster integrity, trades and simulation.</p><div class="filters"><span class="pill">${r.length} rostered</span><span class="pill ${state.live?'live':'warn'}">${state.games.filter(g=>g.state==='in').length} live games</span><span class="pill ${health()?'live':'warn'}">Roster integrity ${health()?'PASS':'CHECK'}</span></div></div></div><div class="card"><div class="card-head"><span class="section-title">Connection</span><button class="btn" id="diagnose">${icon('activity')} Test APIs</button></div><div class="card-body"><div class="health-card"><div class="health-box"><div class="muted">Fantasy</div><div class="health-value ${state.source.includes('ESPN')&&!state.source.includes('authentication')?'positive':'warning'}">${esc(state.source.includes('authentication')?'401 / private':state.source.includes('ESPN')?'Connected':'Demo')}</div></div><div class="health-box"><div class="muted">NHL</div><div class="health-value ${state.live?'positive':'warning'}">${state.live?'Connected':'Unavailable'}</div></div><div class="health-box"><div class="muted">API mode</div><div class="health-value">${state.api?'Backend':'Browser'}</div></div></div></div></div></div></div><div class="stats">${stat('Team AVS',fmt(r.reduce((a,p)=>a+avs(p),0)),'Roster model value')}${stat('Active',active.length,'Current active slots')}${stat('Bench games',benchStar.length,'Bench players with a game')}${stat('Alerts',alerts.length,'Injury / DTD / status')}</div><div class="grid-2"><div class="card"><div class="card-head"><span class="section-title">Daily lineup optimizer</span><button class="btn btn-primary" id="optimize">Optimize now</button></div><div class="card-body">${recommendations(r).slice(0,6).map(recHTML).join('') || '<div class="empty">No swap detected from the currently loaded schedule.</div>'}</div></div><div class="card"><div class="card-head"><span class="section-title">Today / next games</span><button class="btn" id="liveGo">Live Center</button></div><div class="card-body">${state.games.slice(0,5).map(gameHTML).join('') || '<div class="empty">No live schedule returned yet.</div>'}</div></div></div>`;
    $('diagnose').onclick=diagnostics; $('optimize').onclick=()=>{state.tab='rosters';render();}; $('liveGo').onclick=()=>{state.tab='live';render();};
  }

  function recommendations(r) {
    const rec=[]; const bench=r.filter(p=>['Bench','BE','BN'].includes(String(p.slot))&&gameFor(p));
    const active=r.filter(p=>!['Bench','BE','BN','IR','IR+'].includes(String(p.slot)));
    bench.forEach(b=>{const same=active.filter(a=>a.position===b.position && !gameFor(a)); if(same.length) rec.push({in:b,out:same.sort((x,y)=>projection(x)-projection(y))[0],reason:'Bench player has a game while the active comparison has no game.'});});
    r.filter(p=>p.status!=='Healthy'&&gameFor(p)).forEach(p=>rec.push({in:null,out:p,reason:`Status is ${p.status}; verify lineup or IR eligibility before lock.`}));
    return rec;
  }
  function recHTML(x) { return `<div class="list-row"><div class="list-main">${x.in?avatar(x.in):icon('alert')}<div><strong>${x.in?esc(x.in.name):'Status alert'}</strong><div class="muted">${x.in?'Move from Bench → Active':'Review '+esc(x.out.name)} · ${esc(x.reason)}</div></div></div>${x.in?'<button class="btn btn-success rec-apply">Apply</button>':'<span class="pill warn">Review</span>'}</div>`; }
  function gameHTML(g) { return `<div class="list-row"><div><strong>${esc(g.away?.abbr)} @ ${esc(g.home?.abbr)}</strong><div class="muted">${esc(g.detail||g.state)}</div></div><span class="${g.state==='in'?'tag-live':'tag-final'}">${esc(g.state)}</span></div>`; }

  
  function predictionModel(g) {
    const awayPlayers=state.players.filter(p=>p.team===g.away.abbr), homePlayers=state.players.filter(p=>p.team===g.home.abbr);
    const strength=list=>list.reduce((s,p)=>s+Math.max(0,avs(p)),0);
    const a=strength(awayPlayers),h=strength(homePlayers);
    let diff=(h-a)/Math.max(20,Math.abs(a)+Math.abs(h))*100+4.5;
    if(g.state==='in') diff+=(Number(g.home.score||0)-Number(g.away.score||0))*7;
    const hp=Math.max(2,Math.min(98,50+diff));
    return {awayProb:100-hp,homeProb:hp,confidence:Math.min(99,50+Math.abs(hp-50)*1.25)};
  }
  function predictionHTML(g) {
    const m=predictionModel(g),live=g.state==='in';
    return `<div class="card prediction-card"><div class="card-head"><div><strong>${esc(g.away.abbr)} @ ${esc(g.home.abbr)}</strong><div class="muted">${esc(g.detail||g.state)} · ${live?'updates every refresh':'pre-game model'}</div></div><span class="${live?'tag-live':'pill'}">${live?'LIVE':'MODEL'}</span></div><div class="card-body"><div class="bars"><div class="bar-row"><span>${esc(g.away.abbr)}</span><div class="bar"><span style="width:${m.awayProb}%"></span></div><b>${m.awayProb.toFixed(0)}%</b></div><div class="bar-row"><span>${esc(g.home.abbr)}</span><div class="bar"><span style="width:${m.homeProb}%"></span></div><b>${m.homeProb.toFixed(0)}%</b></div></div><div class="muted" style="margin-top:12px">Confidence ${m.confidence.toFixed(0)}% · roster strength + home ice + live score state. Model estimate, not an official NHL probability.</div></div></div>`;
  }
  function rosterAI() {
    const r=currentRoster(),starts=r.filter(p=>!['Bench','BE','BN','IR','IR+'].includes(String(p.slot))),bench=r.filter(p=>['Bench','BE','BN'].includes(String(p.slot))),swaps=[];
    bench.forEach(b=>{const candidates=starts.filter(a=>a.position===b.position);if(candidates.length){const weakest=candidates.sort((x,y)=>(avs(x)+(gameFor(x)?8:0))-(avs(y)+(gameFor(y)?8:0)))[0];const gain=(avs(b)+(gameFor(b)?8:0))-(avs(weakest)+(gameFor(weakest)?8:0));if(gain>2)swaps.push({in:b,out:weakest,gain});}});
    const targets=state.players.filter(p=>String(p.fantasy_team_id)!==String(state.selectedTeam)).sort((a,b)=>(avs(b)+(gameFor(b)?6:0))-(avs(a)+(gameFor(a)?6:0))).slice(0,8);
    return {swaps,targets};
  }
  function predictions() {
    const games=state.games.slice(),ai=rosterAI();
    $('view-predictions').innerHTML=`<div class="hero"><div class="card"><div class="card-body"><div class="eyebrow">REALTIME MODEL</div><h1>Game Predictions & Roster AI</h1><p>Predictions refresh with the live NHL feed. The roster engine uses loaded fantasy players, game availability, projection value and opponent roster strength.</p><div class="filters"><span class="pill live">${state.live?'Live feed active':'Waiting for live feed'}</span><span class="pill">${games.length} games loaded</span><span class="pill">${ai.swaps.length} lineup moves</span></div></div></div><div class="card"><div class="card-head"><span class="section-title">Roster recommendation</span><button class="btn btn-primary" id="predOptimize">Open lineup optimizer</button></div><div class="card-body">${ai.swaps.length?ai.swaps.slice(0,4).map(x=>`<div class="list-row"><div><strong>Start ${esc(x.in.name)}</strong><div class="muted">Bench ${esc(x.out.name)} · estimated gain +${x.gain.toFixed(1)}</div></div><span class="pill live">START</span></div>`).join(''):'<div class="empty">No high-confidence start/sit swap detected from loaded data.</div>'}</div></div></div><div class="grid-2" style="margin-top:16px">${games.length?games.map(predictionHTML).join(''):'<div class="card"><div class="empty">No NHL games are available from the live feed.</div></div>'}</div><div class="card" style="margin-top:16px"><div class="card-head"><span class="section-title">Roster / trade targets</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Player</th><th>NHL</th><th>Pos</th><th>AVS</th><th>Game</th><th>Action</th></tr></thead><tbody>${ai.targets.map(p=>`<tr><td><div class="player-cell">${avatar(p)}<strong>${esc(p.name)}</strong></div></td><td>${teamCell(p.team)}</td><td>${esc(p.position)}</td><td class="score">${fmt(avs(p))}</td><td>${gameFor(p)?'<span class="tag-live">GAME</span>':'<span class="pill">OFF</span>'}</td><td><span class="pill">TRADE TARGET</span></td></tr>`).join('')}</tbody></table></div></div>`;
    $('predOptimize').onclick=()=>{state.tab='rosters';render();};
  }

  function rosters() {
    const r=currentRoster().slice().sort((a,b)=>projection(b)-projection(a));
    $('view-rosters').innerHTML=`<div class="card"><div class="card-head"><div><div class="section-title">${esc(team(state.selectedTeam).name)} · Full Roster</div><div class="muted">${esc(team(state.selectedTeam).owner)} · every loaded player remains attached to its ESPN fantasy team ID.</div></div><div class="filters"><div class="searchbox"><span>${icon('search')}</span><input class="input" id="rosterSearch" placeholder="Search player..."></div><button class="btn" id="exportRoster">${icon('download')} Export CSV</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Player</th><th>NHL</th><th>Pos</th><th>Slot</th><th>Status</th><th>Game</th><th>Projection</th><th>AVS</th><th>Action</th></tr></thead><tbody id="rosterBody">${r.map(p=>row(p)).join('')}</tbody></table></div></div>`;
    $('rosterSearch').oninput=e=>document.querySelectorAll('#rosterBody tr').forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(e.target.value.toLowerCase())?'':'none');
    $('exportRoster').onclick=()=>downloadCSV(r,'hockey-ai-roster.csv');
    document.querySelectorAll('.apply-player').forEach(b=>b.onclick=()=>{const p=state.players.find(x=>String(x.espn_id)===b.dataset.id); if(p){p.slot='ACTIVE';render();}});
  }
  function row(p) { const g=gameFor(p); return `<tr><td><div class="player-cell">${avatar(p)}<div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.fantasy_owner||team(p.fantasy_team_id).owner)}</div></div></div></td><td>${teamCell(p.team)}</td><td>${esc(p.position)}</td><td>${esc(p.slot||'')}</td><td class="${p.status==='Healthy'?'positive':'warning'}">${esc(p.status||'Healthy')}</td><td>${g?`<span class="${g.state==='in'?'tag-live':'pill'}">${esc(g.away.abbr)} @ ${esc(g.home.abbr)}</span>`:'—'}</td><td class="score">${fmt(projection(p))}</td><td class="score">${fmt(avs(p))}</td><td>${g&&['Bench','BE','BN'].includes(String(p.slot))?`<button class="btn btn-success apply-player" data-id="${p.espn_id}">Start</button>`:'<span class="muted">—</span>'}</td></tr>`; }

  function trades() {
    if (!state.tradeA.length && !state.tradeB.length) { state.tradeA=[]; state.tradeB=[]; }
    const others=state.teams.filter(t=>String(t.id)!==String(state.selectedTeam)); const target=others[0]?.id || state.selectedTeam;
    const left=roster(state.selectedTeam), right=roster(state.tradeTarget||target); state.tradeTarget=String(state.tradeTarget||target);
    $('view-trades').innerHTML=`<div class="card"><div class="card-head"><div><div class="section-title">Full Trade Analyzer</div><div class="muted">Select players from both real fantasy rosters. The engine compares projected value, depth and positional replacement.</div></div><button class="btn btn-primary" id="tradeAnalyze">${icon('activity')} Analyze Trade</button></div><div class="card-body"><div class="trade-board"><div><div class="filters"><span class="pill">${esc(team(state.selectedTeam).name)}</span></div><div class="pick-list">${left.map(p=>pick(p,'A')).join('')}</div></div><div class="trade-arrow">${icon('arrows')}</div><div><div class="filters"><select class="select" id="tradeTarget">${others.map(t=>`<option value="${t.id}" ${String(t.id)===state.tradeTarget?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div><div class="pick-list">${right.map(p=>pick(p,'B')).join('')}</div></div></div><div id="tradeResult" style="margin-top:16px"></div></div></div>`;
    $('tradeTarget').onchange=e=>{state.tradeTarget=e.target.value;state.tradeB=[];trades();};
    document.querySelectorAll('.pick').forEach(el=>el.onclick=()=>{const arr=el.dataset.side==='A'?state.tradeA:state.tradeB,id=Number(el.dataset.id),i=arr.indexOf(id);i>=0?arr.splice(i,1):arr.push(id);trades();});
    $('tradeAnalyze').onclick=analyzeTrade;
  }
  function pick(p,side){const selected=(side==='A'?state.tradeA:state.tradeB).includes(Number(p.espn_id));return `<div class="pick ${selected?'selected':''}" data-side="${side}" data-id="${p.espn_id}"><div class="list-main">${avatar(p)}<div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.position)} · ${fmt(projection(p))} proj</div></div></div><span class="score">${fmt(avs(p))}</span></div>`;}
  function analyzeTrade(){const A=state.tradeA.map(id=>state.players.find(p=>Number(p.espn_id)===id)).filter(Boolean),B=state.tradeB.map(id=>state.players.find(p=>Number(p.espn_id)===id)).filter(Boolean);const av=A.reduce((s,p)=>s+avs(p),0),bv=B.reduce((s,p)=>s+avs(p),0),ap=A.reduce((s,p)=>s+projection(p),0),bp=B.reduce((s,p)=>s+projection(p),0);$('tradeResult').innerHTML=`<div class="grid-3">${stat('Value sent',fmt(av),'AVS')}${stat('Value received',fmt(bv),'AVS')}${stat('Net change',fmt(bv-av),bv>=av?'Receiving side value':'Receiving side value')}</div><div class="notice ${bv>=av?'good':'error'}" style="margin-top:12px"><strong>${bv>=av?'Positive projected value':'Lower projected value'}</strong><span>${A.map(p=>esc(p.name)).join(', ')||'Nothing'} → ${B.map(p=>esc(p.name)).join(', ')||'Nothing'} · projection delta ${fmt(bp-ap)}.</span></div>`;}

  function sim() {
    const r=currentRoster(); $('view-sim').innerHTML=`<div class="sim-grid"><div class="card"><div class="card-head"><span class="section-title">Simulation Controls</span></div><div class="card-body"><label class="muted">Iterations</label><input class="input" id="iterations" type="number" min="100" max="10000" value="${state.iterations}" style="width:100%;margin:7px 0 14px"><div class="toggle"><span>Maximize Floor</span><div class="switch ${state.strategy==='floor'?'on':''}" data-strategy="floor"><span></span></div></div><div class="toggle"><span>Maximize Ceiling</span><div class="switch ${state.strategy==='ceiling'?'on':''}" data-strategy="ceiling"><span></span></div></div><div class="toggle"><span>Category Focus</span><div class="switch ${state.strategy==='category'?'on':''}" data-strategy="category"><span></span></div></div><button class="btn btn-primary" id="runSim" style="width:100%;margin-top:12px">${icon('flask')} Run Simulation</button></div></div><div class="card"><div class="card-head"><span class="section-title">Projected weekly impact</span></div><div class="card-body" id="simResult"><div class="empty">Run the simulator to generate a Monte Carlo-style distribution for this roster.</div></div></div></div>`;
    $('iterations').onchange=e=>{state.iterations=Math.max(100,Math.min(10000,Number(e.target.value)||500));persist();}; document.querySelectorAll('[data-strategy]').forEach(x=>x.onclick=()=>{state.strategy=x.dataset.strategy;persist();sim();}); $('runSim').onclick=runSimulation;
  }
  function runSimulation(){const r=currentRoster();const n=state.iterations, vals=[];for(let i=0;i<n;i++){let total=0;r.forEach(p=>{let base=projection(p);let spread=state.strategy==='ceiling'?0.35:state.strategy==='category'?0.22:0.12;total+=Math.max(0,base*(1+(Math.random()*2-1)*spread));});vals.push(total);}vals.sort((a,b)=>a-b);const avg=vals.reduce((a,b)=>a+b,0)/n,p10=vals[Math.floor(n*.1)],p50=vals[Math.floor(n*.5)],p90=vals[Math.floor(n*.9)];$('simResult').innerHTML=`<div class="stats">${stat('P10',fmt(p10),'Low outcome')}${stat('Median',fmt(p50),'50th percentile')}${stat('Mean',fmt(avg),'Expected result')}${stat('P90',fmt(p90),'High outcome')}</div><div class="notice good" style="margin-top:16px">${esc(state.strategy)} strategy · ${n.toLocaleString()} trials · simulated from loaded roster projections, not a guarantee of actual scoring.</div>`;}

  function liveView(){const r=currentRoster();const livePlayers=r.filter(gameFor);$('view-live').innerHTML=`<div class="grid-2"><div class="card"><div class="card-head"><span class="section-title">Live NHL scoreboard</span><button class="btn" id="refreshLive">${icon('refresh')} Refresh</button></div><div class="card-body"><div class="game-list">${state.games.map(gameHTML).join('')||'<div class="empty">No live games returned.</div>'}</div></div></div><div class="card"><div class="card-head"><span class="section-title">Your live roster performance</span></div><div class="card-body"><div class="list">${livePlayers.map(p=>{const g=gameFor(p);return `<div class="list-row"><div class="list-main">${avatar(p)}<div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.team)} · ${esc(g?.detail||g?.state||'Game')}</div></div></div><span class="score">${fmt(p.livePoints ?? projection(p))}</span></div>`}).join('')||'<div class="empty">No rostered players matched to current NHL games.</div>'}</div></div></div></div>`;$('refreshLive').onclick=async()=>{await loadLive();render();};}

  function league(){const totals=state.teams.map(t=>({t,v:roster(t.id).reduce((s,p)=>s+avs(p),0),n:roster(t.id).length})).sort((a,b)=>b.v-a.v);$('view-league').innerHTML=`<div class="grid-3">${stat('League ID',state.league,'ESPN Fantasy Hockey')}${stat('Season',state.season,'Season ID')}${stat('Teams',state.teams.length,'Loaded fantasy teams')}</div><div class="card" style="margin-top:16px"><div class="card-head"><span class="section-title">League Hub</span><button class="btn" id="refreshLeague">${icon('refresh')} Refresh</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Team</th><th>Owner</th><th>Players</th><th>AVS</th><th>Roster integrity</th></tr></thead><tbody>${totals.map(x=>`<tr><td><strong>${esc(x.t.name)}</strong></td><td>${esc(x.t.owner)}</td><td>${x.n}</td><td class="score">${fmt(x.v)}</td><td class="positive">${health()?'PASS':'CHECK'}</td></tr>`).join('')}</tbody></table></div></div>`;$('refreshLeague').onclick=async()=>{await loadFantasy();render();};}

  function players(){let q='',pos='ALL';const list=state.players.slice().sort((a,b)=>avs(b)-avs(a));$('view-players').innerHTML=`<div class="card"><div class="card-head"><div><div class="section-title">Player Pool & Watchlist</div><div class="muted">Search all loaded players and maintain a local watchlist.</div></div><div class="filters"><input class="input" id="playerSearch" placeholder="Search player/team..."><select class="select" id="playerPos"><option>ALL</option><option>C</option><option>LW</option><option>RW</option><option>D</option><option>G</option></select></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Player</th><th>NHL</th><th>Pos</th><th>Fantasy Team</th><th>AVS</th><th>Projection</th><th>Watch</th></tr></thead><tbody id="playerBody">${list.map(p=>`<tr data-text="${esc(`${p.name} ${p.team} ${team(p.fantasy_team_id).name}`.toLowerCase())}" data-pos="${esc(p.position)}"><td><div class="player-cell">${avatar(p)}<strong>${esc(p.name)}</strong></div></td><td>${teamCell(p.team)}</td><td>${esc(p.position)}</td><td>${esc(team(p.fantasy_team_id).name)}</td><td class="score">${fmt(avs(p))}</td><td>${fmt(projection(p))}</td><td><button class="btn watch" data-id="${p.espn_id}">${state.watch.includes(Number(p.espn_id))?'★':'☆'}</button></td></tr>`).join('')}</tbody></table></div></div>`;const filter=()=>{q=$('playerSearch').value.toLowerCase();pos=$('playerPos').value;document.querySelectorAll('#playerBody tr').forEach(tr=>tr.style.display=tr.dataset.text.includes(q)&&(pos==='ALL'||tr.dataset.pos===pos)?'':'none');};$('playerSearch').oninput=filter;$('playerPos').onchange=filter;document.querySelectorAll('.watch').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.id),i=state.watch.indexOf(id);i>=0?state.watch.splice(i,1):state.watch.push(id);persist();players();});}

  function settings(){ $('view-settings').innerHTML=`<div class="grid-2"><div class="card"><div class="card-head"><span class="section-title">ESPN Fantasy connection</span></div><div class="card-body"><div class="form-grid"><label class="full">League ID<input class="input" id="leagueId" value="${esc(state.league)}" style="width:100%;margin-top:5px"></label><label>Season<input class="input" id="seasonId" type="number" value="${state.season}" style="width:100%;margin-top:5px"></label><label>Secure backend URL<input class="input" id="apiBase" value="${esc(state.api)}" placeholder="https://your-backend.example" style="width:100%;margin-top:5px"></label></div><div class="notice" style="margin-top:14px">Browser-only GitHub Pages can read public ESPN leagues. Private ESPN leagues require a server-side proxy because SWID and espn_s2 are session credentials and cannot be safely embedded in a public static site.</div><button class="btn btn-primary" id="saveSettings" style="margin-top:12px">Save & reconnect</button></div></div><div class="card"><div class="card-head"><span class="section-title">Strategy & notifications</span></div><div class="card-body"><div class="toggle"><span>Maximize Floor</span><div class="switch ${state.strategy==='floor'?'on':''}" data-strategy="floor"><span></span></div></div><div class="toggle"><span>Maximize Ceiling</span><div class="switch ${state.strategy==='ceiling'?'on':''}" data-strategy="ceiling"><span></span></div></div><div class="toggle"><span>Category Focus</span><div class="switch ${state.strategy==='category'?'on':''}" data-strategy="category"><span></span></div></div><div class="notice good" style="margin-top:14px">Webhook-ready settings can be connected to an external automation service. GitHub Pages itself does not run scheduled Python jobs.</div></div></div></div><div class="card" style="margin-top:16px"><div class="card-head"><span class="section-title">API diagnostics</span><button class="btn" id="runDiag">Run diagnostics</button></div><div class="card-body" id="diagBody"><div class="empty">No diagnostic run yet.</div></div></div>`;$('saveSettings').onclick=async()=>{state.league=$('leagueId').value.trim()||C.defaultLeagueId;state.season=Number($('seasonId').value)||C.season;state.api=$('apiBase').value.trim();persist();await loadFantasy();await loadLive();render();};document.querySelectorAll('[data-strategy]').forEach(x=>x.onclick=()=>{state.strategy=x.dataset.strategy;persist();settings();});$('runDiag').onclick=diagnostics;}

  async function diagnostics(){const out=[];out.push(`Frontend: ${location.href}`);out.push(`League: ${state.league} / season ${state.season}`);out.push(`Demo players: ${DEMO.players?.length || 0}`);out.push(`Loaded players: ${state.players.length}`);out.push(`Roster integrity: ${health()?'PASS':'FAIL'}`);out.push(`Fantasy source: ${state.source}`);out.push(`Fantasy error: ${state.error||'none'}`);try{const d=await getJSON(C.nhlScore);out.push(`NHL API: OK (${d.games?.length||0} games)`);}catch(e){out.push(`NHL API: ${e.message}`);}if($('diagBody'))$('diagBody').innerHTML=`<pre style="white-space:pre-wrap;color:#b9c7da;line-height:1.6">${esc(out.join('\n'))}</pre>`;else openModal('Diagnostics',out.map(x=>`<div class="list-row">${esc(x)}</div>`).join(''));}

  function openModal(title,body){$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalBackdrop').classList.add('open');}
  function downloadCSV(rows,name){const cols=['name','team','position','slot','status','projection','ai_value_score','fantasy_team_name','fantasy_owner'];const csv=[cols.join(','),...rows.map(p=>cols.map(k=>`"${String(p[k]??'').replaceAll('"','""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}

  function render(){nav();selector();shell();if(state.tab==='dashboard')dashboard();if(state.tab==='rosters')rosters();if(state.tab==='trades')trades();if(state.tab==='sim')sim();if(state.tab==='live')liveView();if(state.tab==='predictions')predictions();if(state.tab==='league')league();if(state.tab==='players')players();if(state.tab==='settings')settings();setStatus(state.source, state.error ? 'warn':'ok');document.body.classList.toggle('light',state.theme==='light');}
  $('refreshBtn').onclick=async()=>{await loadFantasy();await loadLive();render();}; $('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';persist();render();}; $('mobileMenu').onclick=()=>$('sidebar').classList.toggle('open'); $('modalClose').onclick=()=>$('modalBackdrop').classList.remove('open'); $('modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')e.currentTarget.classList.remove('open');};

  (async function boot(){
    try { await loadFantasy(); await loadLive(); render(); }
    catch(e) { console.error('Hockey AI Pro boot failure',e); state.source='Demo fallback';state.error=e.message;render(); }
    setInterval(async()=>{try{await loadLive(); if(state.tab==='live'||state.tab==='dashboard')render();}catch(_){}}, Math.max(10,Number(C.refreshSeconds||20))*1000);
  })();
})();
