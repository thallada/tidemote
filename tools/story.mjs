#!/usr/bin/env node
// What happened in each run of an ensemble (or single sim.mjs JSON files): the guilds over time, the matter
// they are made of and the nutrient loop's flows (K.cycle), the energy books, and every guild that died out
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

// a guild's share of the living that is awake (K.cyst's dormant cells count among the living in diet)
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
  const o = run.outcome || {};
  return { lines, lost, alive, core: CORE.every((g) => act(end, g) >= LIVE), outcome: o.outcome ?? '?',
    eff: o.lateEffSpecies, notable: o.notableSpecies, leaders: o.leaderChanges, living: o.lateLivingFrac, fp: o.fingerprint };
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
if (v.json) fs.writeFileSync(v.json, JSON.stringify(all, null, 1));
