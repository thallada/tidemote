#!/usr/bin/env node
// What happened in each run of an ensemble (or single sim.mjs JSON files): the guilds over time, the matter
// they are made of and the nutrient loop's flows, the energy books, and every guild that died out
// with what it had to live on just before. Then, over the ensemble, how often each guild and the whole web
// survived (docs/ecosystem.md).
//   node tools/story.mjs runs/NAME [runs/OTHER ...] [--every 120] [--quiet] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  every: { type: 'string', default: '120' }, quiet: { type: 'boolean' }, json: { type: 'string' }, help: { type: 'boolean' } } });
if (v.help || !positionals.length) {
  console.log('Usage: node tools/story.mjs runs/NAME [more runs or .json files] [--every 120] [--quiet] [--json out.json]');
  process.exit(0);
}
const GUILDS = ['producer', 'grazer', 'predator', 'scavenger', 'omnivore'];
const CORE = ['producer', 'grazer', 'predator', 'scavenger'];
const ABBR = { producer: 'P', grazer: 'G', predator: 'H', scavenger: 'S', omnivore: 'O' };
const LIVE = 0.01, ONCE = 0.03;
const pct = (x) => String(Math.round(100 * x)).padStart(3);
const num = (x) => (x == null ? '-' : x >= 10000 ? (x / 1000).toFixed(0) + 'k' : x >= 1000 ? (x / 1000).toFixed(1) + 'k' : String(Math.round(x)));

function load(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return [{ file: p, run: JSON.parse(fs.readFileSync(p, 'utf8')) }];
  return fs.readdirSync(p).filter((f) => /^seed\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)))
    .map((f) => ({ file: path.join(p, f), run: JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')) }));
}
// energy coming in (light, and glint unless it is food from within) against energy spent, per sample
function books(s, cycle) {
  let inc = 0, out = 0;
  for (const e of Object.values(s.energy || {})) { inc += (e.light || 0) + (cycle ? 0 : e.glint || 0); out += (e.upkeep || 0) + (e.heat || 0); }
  return { inc, out };
}

// a guild's share of the living that is awake (dormant cells count among the living in diet)
const act = (s, g) => Math.max(0, s.diet[g] - (s.dormant?.[g] ?? 0) / Math.max(s.living, 1));

function story(run) {
  const S = run.samples, cycle = !!run.config?.k?.cycle, cyst = !!run.config?.k?.cyst;
  const pop = (s, g) => act(s, g) * s.living;
  const lines = [];
  const lost = [];
  for (const g of GUILDS) {
    const had = S.findIndex((s) => s.t > 30 && act(s, g) >= ONCE);
    if (had < 0) continue;
    // the last time it was alive at all; lost if it ends below LIVE
    if (act(S.at(-1), g) >= LIVE) continue;
    let k = S.length - 1;
    while (k > 0 && act(S[k], g) < LIVE) k--;
    const at = S[k], before = S[Math.max(0, k - 6)];
    const food = {
      producer: `silt ${num(before.silt)} light ${(before.ambient ?? 0).toFixed?.(2) ?? '-'} grazers ${num(pop(before, 'grazer'))}`,
      grazer: `glint ${num(before.glint)} litter ${num(before.cycle?.litter)} producers ${num(pop(before, 'producer'))} predators ${num(pop(before, 'predator'))}`,
      predator: `grazers ${num(pop(before, 'grazer'))} scavengers ${num(pop(before, 'scavenger'))} omnivores ${num(pop(before, 'omnivore'))}`,
      scavenger: `husks ${num(before.husk)} carcasses made ${num(before.cycle?.carcassMade)}/min predators ${num(pop(before, 'predator'))}`,
      omnivore: `glint ${num(before.glint)} grazers ${num(pop(before, 'grazer'))}`,
    }[g];
    const d = before.demography?.[g] || {};
    lost.push({ guild: g, t: Math.round(at.t), peak: Math.max(...S.map((s) => act(s, g))), food,
      deaths: `births ${num(d.births)} starved ${num(d.starved)} eaten ${num(d.eaten)} /min` });
  }
  const every = +v.every;
  for (const s of S.filter((s, i) => i === 0 || i === S.length - 1 || Math.floor(s.t / every) !== Math.floor(S[i - 1].t / every))) {
    const b = books(s, cycle);
    const c = s.cycle || {};
    lines.push(`  ${String(Math.round(s.t / 60)).padStart(3)}m living ${num(s.living).padStart(5)} ${GUILDS.map((g) => ABBR[g] + pct(act(s, g))).join(' ')}`
      + (cyst ? ` cysts ${GUILDS.map((g) => ABBR[g] + num(s.dormant?.[g] ?? 0)).join(' ')}` : '')
      + ` | silt ${num(s.silt).padStart(5)} glint ${num(s.glint).padStart(4)} husk ${num(s.husk).padStart(4)}`
      + (cycle ? ` litter ${num(c.litter).padStart(4)} | exuded ${num(c.exuded).padStart(4)} litter ${num(c.litterMade)}→${num(c.litterEaten)} carcass ${num(c.carcassMade)}→${num(c.carcassEaten)} /min` : '')
      + ` | spent/in ${b.inc ? (b.out / b.inc).toFixed(2) : '-'}`);
  }
  const end = S.at(-1);
  const alive = GUILDS.filter((g) => act(end, g) >= LIVE);
  // turnover within each guild: how often its leading species changed (after the first 2 minutes), and how many led
  const turn = {};
  for (const g of GUILDS) {
    let prev = null, changes = 0; const led = new Set();
    for (const s of S.filter((s) => s.t > 120 && s.guildTop?.[g]?.[0] && act(s, g) >= LIVE)) {
      const lead = s.guildTop[g][0].serial; led.add(lead);
      if (prev !== null && lead !== prev) changes++;
      prev = lead;
    }
    turn[g] = { changes, led: led.size };
  }
  // all four core guilds awake at each quarter hour the run reached
  const allAt = {};
  for (let m = 15; m * 60 <= S.at(-1).t + 30; m += 15) {
    const s = S.reduce((a, b) => (Math.abs(b.t - m * 60) < Math.abs(a.t - m * 60) ? b : a));
    allAt[m] = CORE.every((g) => act(s, g) >= LIVE);
  }
  const o = run.outcome || {};
  return { lines, lost, alive, core: CORE.every((g) => act(end, g) >= LIVE), outcome: o.outcome ?? '?',
    eff: o.lateEffSpecies, notable: o.notableSpecies, leaders: o.leaderChanges, living: o.lateLivingFrac, fp: o.fingerprint, turn, allAt,
    // how much of the world each guild (awake) and each way of moving is, at minutes 2, 5, 10 and the end
    shares: Object.fromEntries([2, 5, 10, Math.round(S.at(-1).t / 60)].map((m) => {
      const s = S.reduce((a, b) => (Math.abs(b.t - m * 60) < Math.abs(a.t - m * 60) ? b : a));
      return [m, { guild: Object.fromEntries(CORE.map((g) => [g, act(s, g)])), move: { ...s.movement } }];
    })) };
}

const all = [];
for (const p of positionals) {
  const runs = load(p);
  const res = runs.map(({ file, run }) => ({ file, seed: run.config?.seed, host: run.config?.host, ...story(run) }));
  all.push({ set: p, res });
  if (!v.quiet) {
    for (const r of res) {
      console.log(`\n${p} seed ${r.seed}${r.host ? ' @' + r.host : ''}: ${r.outcome}; alive at the end: ${r.alive.join(', ') || 'none'}`);
      for (const l of r.lines) console.log(l);
      for (const x of r.lost) console.log(`  ✕ ${x.guild} gone at ${Math.round(x.t / 60)}m${x.t % 60 ? (x.t % 60) + 's' : ''} (peak ${pct(x.peak)}%): before it, ${x.food}; ${x.deaths}`);
    }
  }
}
console.log('\nset                         runs  all four  ' + GUILDS.map((g) => g.slice(0, 8).padStart(9)).join('') + '   guild lost at (median min)       eff.sp notable leaders living variety');
for (const { set, res } of all) {
  const n = res.length;
  const surv = GUILDS.map((g) => res.filter((r) => r.alive.includes(g)).length / n);
  const lostAt = GUILDS.map((g) => { const t = res.flatMap((r) => r.lost.filter((x) => x.guild === g).map((x) => x.t / 60)).sort((a, b) => a - b); return t.length ? t[t.length >> 1].toFixed(0) : '-'; });
  const mean = (f) => { const v = res.map(f).filter((x) => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  // variety: how different the runs' late guild mixes are from each other (mean pairwise distance of fingerprints)
  const fps = res.map((r) => r.fp).filter(Boolean);
  let dsum = 0, dn = 0;
  for (let a = 0; a < fps.length; a++) for (let b = a + 1; b < fps.length; b++) { dsum += Math.sqrt(fps[a].reduce((q, x, i) => q + (x - fps[b][i]) ** 2, 0)); dn++; }
  console.log(`${set.padEnd(28)}${String(n).padStart(4)}  ${pct(res.filter((r) => r.core).length / n)}%     ${surv.map((x) => (pct(x) + '%').padStart(9)).join('')}   ${GUILDS.map((g, i) => ABBR[g] + lostAt[i]).join(' ').padEnd(28)}`
    + `${mean((r) => r.eff).toFixed(0).padStart(6)}${mean((r) => r.notable).toFixed(1).padStart(8)}${mean((r) => r.leaders).toFixed(1).padStart(8)}${mean((r) => r.living).toFixed(2).padStart(7)}${(dn ? dsum / dn : NaN).toFixed(2).padStart(8)}`);
}
// all four core guilds over time (runs longer than half an hour)
if (all.some(({ res }) => res.some((r) => Object.keys(r.allAt).length > 2))) {
  console.log('\nall four core guilds awake, by minute');
  for (const { set, res } of all) {
    const ms = [...new Set(res.flatMap((r) => Object.keys(r.allAt).map(Number)))].sort((a, b) => a - b);
    console.log(`${set.padEnd(28)}` + ms.map((m) => `${m}m ${pct(res.filter((r) => r.allAt[m]).length / res.length)}%`.padEnd(10)).join(''));
  }
}
// the shape of the world: median share of the living that is each guild (awake cells) and each way of
// moving, and how many guilds are thriving (at least THRIVE of the living, awake)
const THRIVE = 0.05, MOVES = ['drifter', 'sessile', 'swimmer', 'crawler'];
const med = (v) => { v = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : NaN; };
console.log(`\nmedian share of the living (guilds awake only; thriving = all four guilds at ${pct(THRIVE)}%+, moves = effective number of ways of moving)`);
for (const { set, res } of all) {
  const ms = [...new Set(res.flatMap((r) => Object.keys(r.shares).map(Number)))].sort((a, b) => a - b);
  for (const m of ms) {
    const at = res.map((r) => r.shares[m]).filter(Boolean);
    if (at.length < res.length / 2) continue;
    const effMoves = (mv) => { const v = MOVES.map((k) => mv[k] || 0), t = v.reduce((a, b) => a + b, 0); return t > 0 ? 1 / v.reduce((q, x) => q + (x / t) ** 2, 0) : NaN; };
    console.log(`${(m === ms.at(-1) ? set : '').padEnd(28)}${String(m).padStart(3)}m  `
      + CORE.map((g) => `${ABBR[g]} ${pct(med(at.map((x) => x.guild[g])))}%`.padEnd(7)).join('')
      + `thriving ${pct(at.filter((x) => CORE.every((g) => x.guild[g] >= THRIVE)).length / at.length)}%`.padEnd(14)
      + ' | ' + MOVES.map((k) => `${k} ${pct(med(at.map((x) => x.move[k] || 0)))}%`.padEnd(13)).join('')
      + `moves ${med(at.map((x) => effMoves(x.move))).toFixed(1)}`);
  }
}
// guild turnover (samples with guildTop only): leader changes / species that led, per run, by guild
if (all.some(({ res }) => res.some((r) => Object.values(r.turn).some((t) => t.led > 0)))) {
  console.log('\nturnover within guilds (leader changes / species that led, mean per run)');
  for (const { set, res } of all) console.log(`${set.padEnd(28)}` + GUILDS.map((g) => {
    const c = res.reduce((a, r) => a + r.turn[g].changes, 0) / res.length, l = res.reduce((a, r) => a + r.turn[g].led, 0) / res.length;
    return `${ABBR[g]} ${c.toFixed(1)}/${l.toFixed(1)}`.padEnd(13);
  }).join(''));
}
if (v.json) fs.writeFileSync(v.json, JSON.stringify(all, null, 1));
