// Whole-history view of each run, beyond the late-phase summary: the share of time each guild is present (>5%
// of the living), how often a guild crashes (<1%) and later recovers (>5%), busts (the living falling 40% or
// more within 2 min), extinction pulses (species falling 30% or more within 2 min), and the share of runs whose
// producers are present in the late phase vs at any time after 10 min. Per set: means over runs (± se).
// Usage: node tools/fastforward/history.mjs runs/A runs/B ...
import fs from 'node:fs';
import path from 'node:path';
const G = ['producer', 'grazer', 'predator', 'scavenger'];
const ms = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); return `${m.toFixed(3)}±${(sd / Math.sqrt(xs.length)).toFixed(3)}`; };
for (const dir of process.argv.slice(2)) {
  const name = path.basename(path.resolve(dir));
  const per = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^seed\d+\.json$/.test(x))) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const S = r.samples.filter((s) => s.t > 60);
    if (S.length < 10) continue;
    const dt = S[1].t - S[0].t, w = Math.round(120 / dt), end = S.at(-1).t;
    const o = { busts: 0, pulses: 0 };
    for (const g of G) {
      o[`${g}.present`] = S.filter((s) => s.diet[g] > 0.05).length / S.length;
      let crashed = false, crashes = 0, recoveries = 0;
      for (const s of S) {
        if (!crashed && s.diet[g] < 0.01 && S.some((x) => x.t < s.t && x.diet[g] > 0.05)) { crashed = true; crashes++; }
        else if (crashed && s.diet[g] > 0.05) { crashed = false; recoveries++; }
      }
      o[`${g}.crashes`] = crashes; o[`${g}.recover`] = recoveries;
    }
    // busts and pulses: count each separate drop once (skip ahead past it)
    for (let i = 0; i + w < S.length; i++) {
      if (S[i + w].living < 0.6 * S[i].living) { o.busts++; i += w; }
    }
    for (let i = 0; i + w < S.length; i++) {
      if (S[i + w].species < 0.7 * S[i].species) { o.pulses++; i += w; }
    }
    o.prodLate = r.outcome.producersPersist ? 1 : 0;
    o.prodAfter10 = S.filter((s) => s.t > 600).some((s) => s.diet.producer > 0.05) ? 1 : 0;
    o.prodLast5 = S.filter((s) => s.t > end - 300).some((s) => s.diet.producer > 0.05) ? 1 : 0;
    o.livingCV = r.outcome.lateLivingCV;
    per.push(o);
  }
  const keys = Object.keys(per[0]);
  console.log(`${name} (${per.length} runs)`);
  console.log('  ' + keys.map((k) => `${k} ${ms(per.map((p) => p[k]))}`).join('\n  '));
}
