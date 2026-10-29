'use strict';
// 1. Simulated strategy assumptions and input controls
const STRATEGIES = {
  inhouse: {
    name: 'In-house development',
    color: '#2e749e',
    cost: 3.70,
    progress: .151,
    init: 0,
    share: .161,
    margin: .0168,
    overhead: .19,
    eis: 2033,
  },
  acquisition: {
    name: 'Acquisition',
    color: '#b68b4d',
    cost: 2.75,
    progress: .199,
    init: .23,
    share: .132,
    margin: .0161,
    overhead: .18,
    eis: 2031,
  },
  partnership: {
    name: 'Partnership',
    color: '#318d83',
    cost: 2.15,
    progress: .173,
    init: .12,
    share: .125,
    margin: .0164,
    overhead: .12,
    eis: 2032,
  },
  stake: {
    name: 'Minority stake',
    color: '#806da3',
    cost: 1.05,
    progress: .183,
    init: .42,
    share: .057,
    margin: .0162,
    overhead: .055,
    eis: 2030,
  },
};
const YEARS = Array.from({ length: 16 }, (_, i) => 2027 + i), IDS = ['growth', 'demandProb', 'demandSeverity', 'compProb', 'costRisk', 'runs', 'gateInterval', 'responseLag', 'funding', 'budget', 'signal', 'npvMin', 'shareMin', 'policy'];
const $ = x => document.getElementById(x), cap = (x, a, b) => Math.max(a, Math.min(b, x)), pct = x => (x * 100).toFixed(0) + '%', eu = x => (x < 0 ? '−' : '') + '€' + Math.abs(x).toFixed(2) + 'bn', qnt = (a, p) => {
  if (!a.length)
    return 0;
  const b = [...a].sort((x, y) => x - y), k = (b.length - 1) * p, i = Math.floor(k);
  return b[i] + (b[Math.min(i + 1, b.length - 1)] - b[i]) * (k - i);
}, mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const rng = seed => {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(1664525, x) + 1013904223) >>> 0) / 4294967296);
};
let S = {}, all = {}, selected = 'partnership', stressStrategy = 'partnership', stressPolicy = 'adaptive', showCounter = true, selectedPage = 'setup', AGG = null, activeFuture = 1, specificMetric = 'npv', specificSelected = 'partnership', specificCounter = true;
function read() {
  const o = {};
  for (const k of IDS)
    o[k] = k === 'policy' ? $(k).value : Number($(k).value);
  return o;
}
function formatControls() {
  const z = { growth: (S.growth * 100).toFixed(1) + '%', demandProb: pct(S.demandProb), demandSeverity: pct(S.demandSeverity), compProb: (S.compProb * 100).toFixed(1) + '%', costRisk: pct(S.costRisk), runs: S.runs, funding: eu(S.funding), budget: eu(S.budget), signal: pct(S.signal), npvMin: eu(S.npvMin), shareMin: S.shareMin.toFixed(1) + '%' };
  for (let [k, v] of Object.entries(z)) {
    let id = 'o' + k[0].toUpperCase() + k.slice(1);
    if ($(id))
      $(id).textContent = v;
  }
  $('inputPolicy').textContent = S.policy[0].toUpperCase() + S.policy.slice(1);
  $('inputGate').textContent = S.gateInterval + (S.gateInterval === 1 ? ' year' : ' years');
  $('inputN').textContent = S.runs;
}
function gateYears(s) { return YEARS.filter(y => y >= 2029 && (y - 2029) % s.gateInterval === 0); }
// 2. Generate stochastic futures and external shocks
function futureWorld(s, n, extra = {}) {
  const r = rng(539703 + n * 27313), events = [], annual = [];
  let entered = false, comp = 1, costDraw = (.2 + .8 * r()) * s.costRisk;
  const costYear = 2030 + Math.floor(2 * r());
  for (const year of YEARS) {
    let drop = 0, tech = false, labor = false, competitor = false;
    if (extra.marketDrop !== undefined && year === (extra.forceYear || 2032)) {
      drop = Math.max(drop, extra.marketDrop);
    }
    if (r() < s.demandProb) {
      drop = Math.max(drop, (.35 + .65 * r()) * s.demandSeverity);
    }
    if (drop > 0)
      events.push({ year, type: 'market', title: 'Market demand shock', desc: `Demand −${pct(drop)} at onset` });
    if (!entered && r() < s.compProb) {
      entered = true;
      competitor = true;
      let hit = .08 + .17 * r();
      comp *= 1 - hit;
      events.push({ year, type: 'market', title: 'Competitor enters segment', desc: `Potential capture reduced ${pct(hit)}` });
    }
    if (year >= 2029 && year <= 2038 && r() < .075) {
      tech = true;
      events.push({ year, type: 'execution', title: 'Technology maturation setback', desc: 'Engineering progress disrupted' });
    }
    if (year >= 2028 && year <= 2038 && r() < .085) {
      labor = true;
      events.push({ year, type: 'execution', title: 'Engineering staff diversion', desc: 'Temporary reduction in available capacity' });
    }
    annual.push({ year, drop, tech, labor, comp, competitor });
  }
  if (extra.costPct !== undefined)
    costDraw = extra.costPct;
  if (costDraw > .025) {
    events.push({ year: costYear, type: 'execution', title: 'Development cost revision', desc: `Estimate revised +${pct(costDraw)}` });
  }
  events.sort((a, b) => a.year - b.year);
  let residual = 1, market = [];
  for (const a of annual) {
    residual = Math.min(1, residual + .12);
    if (a.drop)
      residual *= 1 - a.drop;
    const base = 520 * Math.pow(1 + s.growth, a.year - 2027);
    market.push({ ...a, base, demand: base * residual });
  }
  return { annual: market, events, costDraw, costYear, seed: n };
}
// 3. Decision rules at review gates
function actionFor(key, state, env, s, year) {
  if (s.policy === 'fixed')
    return null;
  const cfg = STRATEGIES[key], headroom = s.budget - state.totalCost - state.pendingTotal - Math.max(0, state.capexLeft), delay = year < state.actualEis ? Math.max(0, (year - 2027) * cfg.progress + cfg.init - state.progress) : 0;
  const visibility = rng(5093 + env.seed * 1297 + year * 879 + Object.keys(STRATEGIES).indexOf(key) * 157)() < s.signal;
  const observedCost = (visibility && year >= env.costYear) ? env.costDraw : 0;
  const shockRecent = visibility && env.events.some(e => e.year >= year - 1 && e.year <= year && e.type === 'execution');
  const marketWeak = visibility && env.annual.find(x => x.year === year).demand < env.annual.find(x => x.year === year).base * .82;
  const opponent = visibility && env.annual.find(x => x.year === year).comp < .86;
  const critical = shockRecent || observedCost >= .21 || delay > .12 || marketWeak;
  if (s.policy === 'selective' && !critical)
    return null;
  const affordable = (cost) => cost <= s.funding + 1e-6 && cost <= headroom + 1e-6;
  const make = (name, cost, effect, desc) => affordable(cost) ? { name, cost, effect, desc, approved: year, effective: year + s.responseLag } : null;
  if (key === 'inhouse') {
    if ((visibility && delay > .065 || shockRecent) && state.progress < .98)
      return make('Increase engineering funding', .34, { progress: .18 }, 'Accelerate recovery of technical milestones');
    if (observedCost > .20 && !state.scoped)
      return make('Reduce program scope', .05, { scope: true, progress: .08, share: -.018, annualCost: -.025 }, 'Lower remaining cost exposure and target market');
    if (marketWeak && !state.paused && state.actualEis === 9999)
      return make('Defer next investment tranche', 0, { pause: 1 }, 'Hold one development tranche for reassessment');
    if (marketWeak && state.actualEis !== 9999 && !state.restructured)
      return make('Adjust production footprint', .06, { annualCost: -.038, share: -.006, restructure: true }, 'Reduce post-launch fixed operating exposure');
  }
  else if (key === 'acquisition') {
    if ((shockRecent || visibility && delay > .08) && state.progress < .98)
      return make('Fund integration work', .22, { progress: .15, share: .008 }, 'Recover integration and certification readiness');
    if ((observedCost > .20 || opponent) && !state.restructured)
      return make('Restructure acquired operations', .16, { annualCost: -.045, progress: -.03 }, 'Lower operating exposure after integration');
  }
  else if (key === 'partnership') {
    if ((shockRecent || visibility && delay > .06) && state.progress < .98)
      return make('Increase partner workshare', .24, { progress: .20, share: .008 }, 'Accelerate technical integration through partner capacity');
    if (opponent && !state.expanded)
      return make('Co-invest in market access', .17, { share: .015 }, 'Support distribution and fleet adoption');
    if (marketWeak && !state.paused && state.actualEis === 9999)
      return make('Defer partner milestone', 0, { pause: 1 }, 'Delay noncritical development spending');
    if (marketWeak && state.actualEis !== 9999 && !state.restructured)
      return make('Rebalance partner commitments', .04, { annualCost: -.03, share: -.005, restructure: true }, 'Reduce contracted operating exposure');
  }
  else if (key === 'stake') {
    if ((shockRecent || visibility && delay > .06) && state.progress < .98)
      return make('Co-fund technology demonstration', .18, { progress: .17 }, 'Advance maturity before further commitment');
    if (!marketWeak && !state.increased && year >= 2033)
      return make('Increase minority stake', .28, { share: .020, annualCost: .008 }, 'Increase economic exposure after favorable signal');
    if (marketWeak && !state.paused && state.actualEis === 9999)
      return make('Freeze follow-on capital', 0, { pause: 1 }, 'Preserve option while demand is weak');
    if (marketWeak && state.actualEis !== 9999 && !state.restructured)
      return make('Reduce follow-on exposure', 0, { annualCost: -.02, share: -.008, restructure: true }, 'Lower financial exposure after market weakness');
  }
  return null;
}
// 4. Simulate one strategy along one sampled future
function runPath(key, s, w, policy = s.policy, skipYear = null) {
  const cfg = STRATEGIES[key], state = { progress: cfg.init, shareBoost: 0, annualCost: cfg.overhead, scoped: false, paused: false, increased: false, expanded: false, restructured: false, pause: 0, totalCost: 0, pendingTotal: 0, actualEis: 9999, capexLeft: cfg.cost * (1 + w.costDraw), npv: 0 }, pending = [], decisions = [], series = [], discount = 0.085, gateSet = new Set(gateYears(s)), viewS = { ...s, policy };
  for (let i = 0; i < YEARS.length; i++) {
    const year = YEARS[i], e = w.annual[i];
    if (gateSet.has(year)) {
      const chosen = actionFor(key, state, w, viewS, year);
      if (chosen && year !== skipYear) {
        chosen.strategy = key;
        decisions.push(chosen);
        pending.push(chosen);
        state.pendingTotal += chosen.cost;
      }
    }
    for (const a of pending.filter(x => x.effective === year)) {
      state.totalCost += a.cost;
      state.pendingTotal -= a.cost;
      state.progress += a.effect.progress || 0;
      state.shareBoost += a.effect.share || 0;
      state.annualCost += a.effect.annualCost || 0;
      if (a.effect.scope)
        state.scoped = true;
      if (a.name.includes('Restructure') || a.effect.restructure)
        state.restructured = true;
      if (a.name.includes('market access'))
        state.expanded = true;
      if (a.name.includes('minority stake'))
        state.increased = true;
      if (a.effect.pause) {
        state.pause = 1;
        state.paused = true;
      }
    }
    let annualSpend = 0;
    if (year <= 2032) {
      annualSpend = cfg.cost * (1 + w.costDraw) / 6;
      if (state.pause > 0)
        annualSpend *= .30;
      state.totalCost += annualSpend;
      state.capexLeft -= annualSpend;
    }
    if (year <= 2037 && state.actualEis === 9999) {
      let speed = cfg.progress * (e.tech ? .48 : 1) * (e.labor ? .66 : 1);
      if (state.pause > 0)
        speed *= .28;
      state.progress = cap(state.progress + speed, 0, 1.20);
      if (state.progress >= 1 && year >= cfg.eis)
        state.actualEis = year;
    }
    if (state.pause > 0)
      state.pause--;
    let flow = -annualSpend - pending.filter(x => x.effective === year).reduce((a, x) => a + x.cost, 0);
    let marketShare = 0;
    if (year >= state.actualEis && state.actualEis !== 9999) {
      let ramp = cap((year - state.actualEis + 1) / 3, 0, 1);
      marketShare = Math.max(0, cfg.share + state.shareBoost) * e.comp * ramp;
      flow += e.demand * marketShare * cfg.margin - state.annualCost;
    }
    state.npv += flow / Math.pow(1 + discount, year - 2027);
    series.push({ year, npv: state.npv, share: marketShare * 100, flow, totalInvest: state.totalCost });
  }
  const final = series[series.length - 1], pass = final.npv >= s.npvMin && final.share >= s.shareMin;
  return { key, series, decisions, finalNpv: final.npv, finalShare: final.share, eis: state.actualEis, totalInvest: state.totalCost, pass, events: w.events };
}
// 5. Aggregate Monte Carlo outcomes across futures
function buildAgg() {
  const agg = { adaptive: {}, fixed: {}, eventsByYear: {} };
  for (const yr of YEARS)
    agg.eventsByYear[yr] = {};
  for (const pol of ['adaptive', 'fixed'])
    for (const k of Object.keys(STRATEGIES))
      agg[pol][k] = { npv: Array.from({ length: YEARS.length }, () => []), share: Array.from({ length: YEARS.length }, () => []), finalNpv: [], finalShare: [], pass: [], decisions: [], delta: [], gate: {} };
  for (const rec of Object.values(all)) {
    for (const e of rec.w.events) {
      if (!agg.eventsByYear[e.year][e.title])
        agg.eventsByYear[e.year][e.title] = 0;
      agg.eventsByYear[e.year][e.title]++;
    }
    for (const k of Object.keys(STRATEGIES)) {
      const p = rec.routes[k], f = rec.fixed[k], a = agg.adaptive[k], g = agg.fixed[k];
      p.series.forEach((d, i) => {
        a.npv[i].push(d.npv);
        a.share[i].push(d.share);
      });
      f.series.forEach((d, i) => {
        g.npv[i].push(d.npv);
        g.share[i].push(d.share);
      });
      a.finalNpv.push(p.finalNpv);
      a.finalShare.push(p.finalShare);
      a.pass.push(p.pass ? 1 : 0);
      a.decisions.push(p.decisions.length);
      a.delta.push(p.finalNpv - f.finalNpv);
      g.finalNpv.push(f.finalNpv);
      g.finalShare.push(f.finalShare);
      g.pass.push(f.pass ? 1 : 0);
      g.decisions.push(f.decisions.length);
      g.delta.push(0);
      for (const yr of gateYears(S)) {
        if (!a.gate[yr])
          a.gate[yr] = { actions: {} };
      }
      for (const d of p.decisions) {
        const bucket = a.gate[d.approved] || (a.gate[d.approved] = { actions: {} });
        if (!bucket.actions[d.name])
          bucket.actions[d.name] = { count: 0, deltas: [], desc: d.desc };
        bucket.actions[d.name].count++;
        const omit = runPath(k, S, rec.w, S.policy, d.approved);
        bucket.actions[d.name].deltas.push(p.finalNpv - omit.finalNpv);
      }
    }
  }
  for (const pol of ['adaptive', 'fixed']) {
    for (const k of Object.keys(STRATEGIES)) {
      const a = agg[pol][k];
      a.meanDecisions = mean(a.decisions);
      a.deltaMedian = qnt(a.delta, .5);
      a.npvMean = a.npv.map(x => mean(x));
      a.shareMean = a.share.map(x => mean(x));
      a.p10 = qnt(a.finalNpv, .1);
      a.median = qnt(a.finalNpv, .5);
      a.tail = mean([...a.finalNpv].sort((x, y) => x - y).slice(0, Math.ceil(a.finalNpv.length * .1)));
      a.shareTerminalMean = mean(a.finalShare);
      a.passFrac = mean(a.pass);
      if (pol === 'adaptive') {
        a.gateSummary = {};
        for (const yr of gateYears(S)) {
          const g = a.gate[yr] || { actions: {} };
          const actions = Object.entries(g.actions).sort((x, y) => y[1].count - x[1].count).map(([name, v]) => ({ name, count: v.count, freq: v.count / Math.max(1, S.runs), meanDelta: mean(v.deltas), desc: v.desc }));
          a.gateSummary[yr] = actions;
        }
        a.recurring = Object.entries(a.gateSummary).flatMap(([yr, arr]) => arr.length ? [{ year: Number(yr), ...arr[0] }] : []).sort((x, y) => y.freq - x.freq).slice(0, 2);
      }
    }
  }
  agg.eventSummary = {};
  for (const yr of YEARS) {
    agg.eventSummary[yr] = Object.entries(agg.eventsByYear[yr]).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, freq: count / Math.max(1, S.runs) })).slice(0, 2);
  }
  return agg;
}
function calculate() {
  S = read();
  formatControls();
  all = {};
  for (let n = 1; n <= S.runs; n++) {
    const w = futureWorld(S, n), routes = {}, fixed = {};
    for (const k of Object.keys(STRATEGIES)) {
      routes[k] = runPath(k, S, w, S.policy);
      fixed[k] = runPath(k, S, w, 'fixed');
    }
    all[n] = { w, routes, fixed };
  }
  AGG = buildAgg();
  activeFuture = cap(activeFuture, 1, S.runs);
  $('future').max = S.runs;
  $('future').value = activeFuture;
  render();
}
function changePage(p) {
  selectedPage = p;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.page === p));
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === p));
  $('pageTitle').textContent = { setup: 'Inputs & decision gates', paths: 'Average pathways & adaptive decisions', specific: 'Specific sampled pathway', stress: 'Variability & vulnerability' }[p];
  if (p !== 'setup')
    render();
}
function drawLine(vals, x, y) { return vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' '); }
function current() { return all[activeFuture]; }
// 6. Average-trajectory charts and comparison widgets
function renderAvgChart(id, metric) {
  const K = Object.keys(STRATEGIES);
  let vals = [];
  K.forEach(k => vals.push(...AGG.adaptive[k][metric + 'Mean']));
  if (showCounter)
    vals.push(...AGG.fixed[selected][metric + 'Mean']);
  let mn = Math.min(metric === 'share' ? 0 : Math.min(0, ...vals), ...vals), mx = Math.max(...vals), pad = Math.max(metric === 'share' ? 1.2 : .5, (mx - mn) * .16);
  mn -= pad;
  mx += pad;
  const W = 980, H = 420, L = 70, R = 24, T = 34, B = 48, x = i => L + i * (W - L - R) / (YEARS.length - 1), y = v => T + (mx - v) * (H - T - B) / (mx - mn);
  let h = '';
  for (let a = 0; a <= 5; a++) {
    let v = mn + (mx - mn) * a / 5, Y = y(v);
    h += `<line class="chartGrid" x1="${L}" y1="${Y}" x2="${W - R}" y2="${Y}"/><text class="axisText" x="${L - 10}" y="${Y + 3}" text-anchor="end">${metric === 'npv' ? v.toFixed(1) : v.toFixed(0) + '%'}</text>`;
  }
  YEARS.forEach((yr, i) => {
    if (i % 2 === 0)
      h += `<text class="axisText" x="${x(i)}" y="${H - 13}" text-anchor="middle">${yr}</text>`;
  });
  for (const gate of gateYears(S)) {
    const j = YEARS.indexOf(gate);
    h += `<line x1="${x(j)}" x2="${x(j)}" y1="${T}" y2="${H - B}" stroke="#aebdca" stroke-width="1" stroke-dasharray="3 5"/>`;
  }
  if (showCounter)
    h += `<path d="${drawLine(AGG.fixed[selected][metric + 'Mean'], x, y)}" fill="none" stroke="${STRATEGIES[selected].color}" opacity=".58" stroke-dasharray="7 5" stroke-width="2.2"/>`;
  for (const k of K) {
    const series = AGG.adaptive[k][metric + 'Mean'], c = STRATEGIES[k].color;
    h += `<path d="${drawLine(series, x, y)}" fill="none" stroke="${c}" stroke-width="${k === selected ? 3.8 : 2.6}" opacity="${k === selected ? 1 : .75}"/>`;
    const last = series.at(-1);
    h += `<circle cx="${x(YEARS.length - 1)}" cy="${y(last)}" r="4" fill="${c}" stroke="white" stroke-width="1.4"><title>${STRATEGIES[k].name} · ${metric === 'npv' ? eu(last) : last.toFixed(1) + '%'}</title></circle>`;
  }
  const summary = AGG.adaptive[selected].gateSummary;
  for (const yr of gateYears(S)) {
    const top = summary[yr] && summary[yr][0];
    if (!top)
      continue;
    const j = YEARS.indexOf(yr), val = AGG.adaptive[selected][metric + 'Mean'][j];
    h += `<circle cx="${x(j)}" cy="${y(val)}" r="5.5" fill="${STRATEGIES[selected].color}" stroke="white" stroke-width="2"><title>${yr}: ${top.name} · ${pct(top.freq)} of futures · mean ΔNPV ${eu(top.meanDelta)}</title></circle>`;
  }
  if (metric === 'npv' && S.npvMin >= mn && S.npvMin <= mx)
    h += `<line x1="${L}" x2="${W - R}" y1="${y(S.npvMin)}" y2="${y(S.npvMin)}" stroke="#b75f53" stroke-width="1.3" stroke-dasharray="6 4"/>`;
  if (metric === 'share' && S.shareMin >= mn && S.shareMin <= mx)
    h += `<line x1="${L}" x2="${W - R}" y1="${y(S.shareMin)}" y2="${y(S.shareMin)}" stroke="#b75f53" stroke-width="1.3" stroke-dasharray="6 4"/>`;
  $(id).innerHTML = h;
}
function renderPaths() {
  if (!AGG)
    return;
  const K = Object.keys(STRATEGIES), aSel = AGG.adaptive[selected];
  $('pRuns').textContent = S.runs;
  $('pSelected').textContent = STRATEGIES[selected].name;
  $('pActions').textContent = aSel.meanDecisions.toFixed(1);
  $('pUplift').textContent = eu(aSel.deltaMedian);
  renderAvgChart('npvChart', 'npv');
  renderAvgChart('shareChart', 'share');
  const legendHtml = K.map(k => `<button class="legendBtn ${k === selected ? 'on' : ''}" data-strategy="${k}"><i class="swatch" style="background:${STRATEGIES[k].color}"></i>${STRATEGIES[k].name}</button>`).join('');
  $('plotLegend').innerHTML = legendHtml;
  $('shareLegend').innerHTML = legendHtml;
  document.querySelectorAll('.legendBtn').forEach(el => el.addEventListener('click', () => {
    selected = el.dataset.strategy;
    $('selected').value = selected;
    renderPaths();
  }));
  $('gateSummary').textContent = `Gate years: ${gateYears(S).join(' · ')}`;
  const ledger = [];
  for (const yr of YEARS) {
    const ev = AGG.eventSummary[yr] || [];
    if (ev.length) {
      ledger.push({ year: yr, title: 'Most common external events', desc: ev.map(x => `${x.name} (${pct(x.freq)})`).join(' · '), kind: 'external' });
    }
    const acts = aSel.gateSummary[yr] || [];
    if (acts.length) {
      const top = acts[0], extra = acts.slice(1, 3).map(x => `${x.name} (${pct(x.freq)})`).join(' · ');
      ledger.push({ year: yr, title: top.name, desc: `Approved in ${pct(top.freq)} of futures · mean ΔNPV ${eu(top.meanDelta)}${extra ? ` · alt: ${extra}` : ''}`, kind: 'action' });
    }
  }
  $('eventLedger').innerHTML = ledger.map(e => `<div class="event"><div class="eventyear">${e.year}</div><div><div class="kind ${e.kind === 'action' ? 'action' : ''}">${e.kind === 'action' ? 'Decision' : 'Event'}</div><b>${e.title}</b><small>${e.desc}</small></div></div>`).join('');
  $('pathwayRows').innerHTML = K.map(k => {
    const a = AGG.adaptive[k], rec = (a.recurring || []).map(r => `<span class="chip">${r.year} · ${r.name} (${pct(r.freq)})</span>`).join('');
    return `<tr class="${selected === k ? 'marked' : ''}"><td><span class="strategyName"><i class="tinyDot" style="background:${STRATEGIES[k].color}"></i>${STRATEGIES[k].name}</span></td><td class="num">${eu(mean(a.finalNpv))}</td><td class="num">${a.shareTerminalMean.toFixed(1)}%</td><td class="num">${a.meanDecisions.toFixed(1)}</td><td>${rec || '<span class="placeholder">No recurring intervention</span>'}</td></tr>`;
  }).join('');
}
// 7. Single-future exploration and event ledger
function renderSpecific() {
  const rec = current(), K = Object.keys(STRATEGIES), gates = gateYears(S), vals = K.flatMap(k => rec.routes[k].series.map(d => d[specificMetric]));
  if (specificCounter)
    vals.push(...rec.fixed[specificSelected].series.map(d => d[specificMetric]));
  let mn = Math.min(0, ...vals), mx = Math.max(...vals), pad = Math.max(specificMetric === 'share' ? 1.2 : .6, (mx - mn) * .14);
  mn -= pad;
  mx += pad;
  const W = 980, H = 450, L = 70, R = 27, T = 49, B = 50, x = i => L + i * (W - L - R) / (YEARS.length - 1), y = v => T + (mx - v) * (H - T - B) / (mx - mn);
  let h = '';
  for (let a = 0; a <= 5; a++) {
    let v = mn + (mx - mn) * a / 5, Y = y(v);
    h += `<line class="chartGrid" x1="${L}" y1="${Y}" x2="${W - R}" y2="${Y}"/><text class="axisText" x="${L - 10}" y="${Y + 3}" text-anchor="end">${specificMetric === 'npv' ? v.toFixed(1) : v.toFixed(0) + '%'}</text>`;
  }
  YEARS.forEach((yr, i) => {
    if (i % 2 === 0)
      h += `<text class="axisText" x="${x(i)}" y="${H - 13}" text-anchor="middle">${yr}</text>`;
  });
  for (const gate of gates) {
    let j = YEARS.indexOf(gate);
    h += `<line x1="${x(j)}" x2="${x(j)}" y1="${T}" y2="${H - B}" stroke="#aebdca" stroke-width="1" stroke-dasharray="3 5"/>`;
  }
  for (const e of rec.w.events) {
    const j = YEARS.indexOf(e.year);
    if (j < 0)
      continue;
    let X = x(j), Y = 19;
    h += `<path d="M${X},${Y - 6} l6,6 -6,6 -6,-6 Z" fill="${e.type === 'market' ? '#bb8544' : '#b16962'}"><title>${e.year} · ${e.title}: ${e.desc}</title></path>`;
  }
  if (specificCounter) {
    h += `<path d="${drawLine(rec.fixed[specificSelected].series.map(d => d[specificMetric]), x, y)}" fill="none" stroke="${STRATEGIES[specificSelected].color}" opacity=".58" stroke-dasharray="7 5" stroke-width="2"/>`;
  }
  for (const k of K) {
    const path = rec.routes[k], c = STRATEGIES[k].color;
    h += `<path d="${drawLine(path.series.map(d => d[specificMetric]), x, y)}" fill="none" stroke="${c}" stroke-width="${k === specificSelected ? 3.8 : 2.6}" opacity="${k === specificSelected ? 1 : .70}"/>`;
    const last = path.series.at(-1);
    h += `<circle cx="${x(YEARS.length - 1)}" cy="${y(last[specificMetric])}" r="4" fill="${c}" stroke="white" stroke-width="1.5"><title>${STRATEGIES[k].name} · ${specificMetric === 'npv' ? eu(last[specificMetric]) : last[specificMetric].toFixed(1) + '%'}</title></circle>`;
  }
  for (const act of rec.routes[specificSelected].decisions) {
    const j = YEARS.indexOf(act.approved), v = rec.routes[specificSelected].series[j][specificMetric];
    h += `<circle cx="${x(j)}" cy="${y(v)}" r="6" fill="${STRATEGIES[specificSelected].color}" stroke="white" stroke-width="2"><title>${act.approved}: ${act.name}; effective ${act.effective}</title></circle>`;
  }
  if (specificMetric === 'npv' && S.npvMin >= mn && S.npvMin <= mx)
    h += `<line x1="${L}" x2="${W - R}" y1="${y(S.npvMin)}" y2="${y(S.npvMin)}" stroke="#b75f53" stroke-width="1.3" stroke-dasharray="6 4"/>`;
  if (specificMetric === 'share' && S.shareMin >= mn && S.shareMin <= mx)
    h += `<line x1="${L}" x2="${W - R}" y1="${y(S.shareMin)}" y2="${y(S.shareMin)}" stroke="#b75f53" stroke-width="1.3" stroke-dasharray="6 4"/>`;
  $('specificChart').innerHTML = h;
  const legendHtml = K.map(k => `<button class="legendBtn ${k === specificSelected ? 'on' : ''}" data-specific-strategy="${k}"><i class="swatch" style="background:${STRATEGIES[k].color}"></i>${STRATEGIES[k].name}</button>`).join('');
  $('specificLegend').innerHTML = legendHtml;
  document.querySelectorAll('[data-specific-strategy]').forEach(el => el.addEventListener('click', () => {
    specificSelected = el.dataset.specificStrategy;
    $('specificSelected').value = specificSelected;
    renderSpecific();
  }));
  $('spFuture').textContent = '#' + String(activeFuture).padStart(2, '0');
  $('spShocks').textContent = rec.w.events.length;
  $('spGates').textContent = gates.length;
  $('spActions').textContent = K.reduce((a, k) => a + rec.routes[k].decisions.length, 0);
  $('specificName').textContent = STRATEGIES[specificSelected].name;
  const combined = [...rec.w.events.map(e => ({ ...e, kind: 'external' })), ...rec.routes[specificSelected].decisions.map(a => {
    const omit = runPath(specificSelected, S, rec.w, S.policy, a.approved), contribution = rec.routes[specificSelected].finalNpv - omit.finalNpv;
    return { year: a.approved, title: a.name, desc: `${a.cost ? '+ ' + eu(a.cost) + ' funding · ' : ''}Effective ${a.effective} · ΔNPV ${eu(contribution)} vs omission`, kind: 'action' };
  })].sort((a, b) => a.year - b.year || (a.kind === 'external' ? -1 : 1));
  $('specificLedger').innerHTML = combined.map(e => `<div class="event"><div class="eventyear">${e.year}</div><div><div class="kind ${e.kind === 'action' ? 'action' : ''}">${e.kind === 'action' ? 'Decision' : 'Event'}</div><b>${e.title}</b><small>${e.desc}</small></div></div>`).join('');
  $('specificGateSummary').textContent = gates.join(' · ');
  $('specificRows').innerHTML = K.map(k => {
    let p = rec.routes[k], f = rec.fixed[k], chips = p.decisions.map(d => `<span class="chip">${d.approved} · ${d.name}</span>`).join('');
    return `<tr class="${specificSelected === k ? 'marked' : ''}"><td><span class="strategyName"><i class="tinyDot" style="background:${STRATEGIES[k].color}"></i>${STRATEGIES[k].name}</span></td><td>${chips || '<span class="placeholder">No intervention</span>'}</td><td class="num">${eu(p.finalNpv)}</td><td class="num">${p.finalShare.toFixed(1)}%</td><td class="num">${eu(p.finalNpv - f.finalNpv)}</td></tr>`;
  }).join('');
}
function summary(key, policy) {
  const a = AGG[policy][key], d = AGG.adaptive[key];
  return { median: a.median, p10: a.p10, pass: a.passFrac, decisions: a.meanDecisions, delta: d.deltaMedian, tail: a.tail, share: a.shareTerminalMean };
}
// 8. Variability and vulnerability analyses
function svgSens() {
  const k = stressStrategy, policy = stressPolicy;
  const rules = [{ name: 'Market growth', key: 'growth', v: .015, min: -.02, max: .06 }, { name: 'Shock probability', key: 'demandProb', v: .08, min: 0, max: .45 }, { name: 'Shock severity', key: 'demandSeverity', v: .12, min: 0, max: .6 }, { name: 'Competitor probability', key: 'compProb', v: .04, min: 0, max: .2 }, { name: 'Cost uncertainty', key: 'costRisk', v: .12, min: 0, max: .7 }, { name: 'Monitoring quality', key: 'signal', v: .20, min: .2, max: 1 }];
  const sampleN = Math.min(60, S.runs), value = ss => mean(Array.from({ length: sampleN }, (_, i) => {
    let w = futureWorld(ss, i + 1);
    return runPath(k, ss, w, policy).finalNpv;
  }));
  let base = value(S), rows = rules.map(r => {
    let low = value({ ...S, [r.key]: cap(S[r.key] - r.v, r.min, r.max) }) - base, high = value({ ...S, [r.key]: cap(S[r.key] + r.v, r.min, r.max) }) - base;
    return { name: r.name, low, high, delta: Math.abs(high - low) };
  }).sort((a, b) => b.delta - a.delta);
  let bound = Math.max(.25, ...rows.flatMap(x => [Math.abs(x.low), Math.abs(x.high)])), cx = 350, scale = 220 / bound, h = '<line x1="350" y1="17" x2="350" y2="277" stroke="#afbfcb"/>';
  rows.forEach((r, i) => {
    let Y = 22 + i * 43;
    h += `<text class="axisText" x="14" y="${Y + 14}">${r.name}</text>`;
    for (let v of [r.low, r.high]) {
      let X = cx + Math.min(0, v) * scale;
      h += `<rect x="${X}" y="${Y + 2}" width="${Math.max(1, Math.abs(v) * scale)}" height="13" rx="1" fill="${v < 0 ? '#c58f50' : '#417f9f'}"/><text class="svgTick" x="${cx + v * scale}" y="${Y + 28}" text-anchor="middle">${v > 0 ? '+' : ''}${v.toFixed(2)}</text>`;
    }
  });
  $('sensitivityChart').innerHTML = h;
}
function svgHeat() {
  const k = stressStrategy, policy = stressPolicy, rows = 7, cols = 9, L = 78, T = 14, cw = 52, ch = 32;
  let h = '';
  for (let i = 0; i < rows; i++) {
    let cost = i * .1;
    for (let j = 0; j < cols; j++) {
      let drop = j * .075, fail = 0, N = 22;
      for (let n = 0; n < N; n++) {
        let w = futureWorld(S, n + 503, { costPct: cost, marketDrop: drop, forceYear: 2032 });
        let p = runPath(k, S, w, policy);
        if (!p.pass)
          fail++;
      }
      let f = fail / N, col = f >= .8 ? '#c87970' : f >= .5 ? '#ddb08b' : f >= .25 ? '#e4d1b1' : '#dbeae4';
      h += `<rect x="${L + j * cw}" y="${T + i * ch}" width="${cw - 2}" height="${ch - 2}" fill="${col}" rx="1"><title>Cost revision ${Math.round(cost * 100)}%, demand drop ${Math.round(drop * 100)}%: ${Math.round(f * 100)}% threshold failures in sampled runs</title></rect>`;
    }
  }
  for (let i = 0; i < rows; i += 2)
    h += `<text class="svgTick" x="${L - 9}" y="${T + i * ch + 18}" text-anchor="end">+${i * 10}%</text>`;
  for (let j = 0; j < cols; j += 2)
    h += `<text class="svgTick" x="${L + j * cw + cw / 2}" y="${T + rows * ch + 17}" text-anchor="middle">${Math.round(j * 7.5)}%</text>`;
  h += `<text class="axisText" x="${L + cols * cw / 2}" y="${T + rows * ch + 39}" text-anchor="middle">Demand drop severity</text><text class="axisText" x="16" y="${T + rows * ch / 2}" text-anchor="middle" transform="rotate(-90 16 ${T + rows * ch / 2})">Cost revision</text>`;
  h += `<rect x="268" y="295" width="11" height="10" fill="#dbeae4"/><text class="svgTick" x="284" y="304">Low</text><rect x="336" y="295" width="11" height="10" fill="#ddb08b"/><text class="svgTick" x="352" y="304">Medium</text><rect x="420" y="295" width="11" height="10" fill="#c87970"/><text class="svgTick" x="436" y="304">High failure</text>`;
  $('heatChart').innerHTML = h;
}
function renderStress() {
  if (!AGG)
    return;
  const r = summary(stressStrategy, stressPolicy), ad = summary(stressStrategy, 'adaptive');
  $('rNpv').textContent = eu(r.median);
  $('rPass').textContent = pct(r.pass);
  $('rTail').textContent = eu(r.tail);
  $('rAdapt').textContent = eu(ad.delta);
  $('robustRows').innerHTML = Object.keys(STRATEGIES).map(k => {
    let a = summary(k, stressPolicy), d = summary(k, 'adaptive');
    return `<tr class="${k === stressStrategy ? 'marked' : ''}"><td><span class="strategyName"><i class="tinyDot" style="background:${STRATEGIES[k].color}"></i>${STRATEGIES[k].name}</span></td><td class="num">${eu(a.median)}</td><td class="num">${eu(a.p10)}</td><td class="num">${a.share.toFixed(1)}%</td><td class="num">${pct(a.pass)}</td><td class="num">${a.decisions.toFixed(1)}</td><td class="num">${eu(d.delta)}</td></tr>`;
  }).join('');
  svgSens();
  svgHeat();
}
function render() {
  if (selectedPage === 'paths')
    renderPaths();
  if (selectedPage === 'specific')
    renderSpecific();
  if (selectedPage === 'stress')
    renderStress();
}
// 9. UI controls and initial simulation
for (const t of document.querySelectorAll('[data-page]'))
  t.addEventListener('click', () => changePage(t.dataset.page));
for (const id of IDS) {
  $(id).addEventListener('change', calculate);
  if ($(id).type === 'range')
    $(id).addEventListener('input', () => {
      S = read();
      formatControls();
    });
}
$('goPaths').addEventListener('click', () => changePage('paths'));
$('selected').addEventListener('change', () => {
  selected = $('selected').value;
  renderPaths();
});
$('showCounter').addEventListener('change', () => {
  showCounter = $('showCounter').checked;
  renderPaths();
});
$('future').addEventListener('change', () => {
  activeFuture = cap(parseInt($('future').value) || 1, 1, S.runs);
  $('future').value = activeFuture;
  renderSpecific();
});
$('nextFuture').addEventListener('click', () => {
  activeFuture = activeFuture % S.runs + 1;
  $('future').value = activeFuture;
  renderSpecific();
});
$('specificMetric').addEventListener('change', () => {
  specificMetric = $('specificMetric').value;
  renderSpecific();
});
$('specificSelected').addEventListener('change', () => {
  specificSelected = $('specificSelected').value;
  renderSpecific();
});
$('specificCounter').addEventListener('change', () => {
  specificCounter = $('specificCounter').checked;
  renderSpecific();
});
$('stressStrategy').addEventListener('change', () => {
  stressStrategy = $('stressStrategy').value;
  renderStress();
});
$('stressPolicy').addEventListener('change', () => {
  stressPolicy = $('stressPolicy').value;
  renderStress();
});
calculate();
