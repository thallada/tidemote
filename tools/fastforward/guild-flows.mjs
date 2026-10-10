// Per-capita demography and energy flows of each guild over a run's late phase (t >= from), averaged over the
// runs where the guild is present, per set: births, starved, old age, eaten, scalded per cell per minute, and
// energy in/out per cell per minute (the ledger's slots). Usage: node tools/fastforward/guild-flows.mjs [--from 1200] [--guild producer] runs/A runs/B
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
const { values: v, positionals } = parseArgs({ allowPositionals: true, options: { from: { type: 'string', default: '1200' }, guild: { type: 'string', default: 'producer,grazer' } } });
const guilds = v.guild.split(',');
for (const dir of positionals) {
  const name = path.basename(path.resolve(dir));
  for (const g of guilds) {
    const acc = {};
    let runs = 0;
    for (const f of fs.readdirSync(dir).filter((x) => /^seed\d+\.json$/.test(x))) {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const S = r.samples.filter((s) => s.t >= +v.from && s.diet?.[g] > 0.02);
      if (S.length < 5) continue;
      runs++;
      const per = {};
      for (const s of S) {
        const n = s.living * s.diet[g];
        const add = (k, x) => { per[k] = (per[k] || 0) + x / n; };
        for (const [k, x] of Object.entries(s.demography[g])) add(k, x);
        add('scalded', s.thermal?.scalded?.[g] || 0);
        for (const [k, x] of Object.entries(s.energy[g])) add('E.' + k, x);
        for (const [k, x] of Object.entries(s.meals[g] || {})) add('ate.' + k, x);
        add('share', s.diet[g] * n);
      }
      for (const [k, x] of Object.entries(per)) acc[k] = (acc[k] || 0) + x / S.length;
    }
    const keys = Object.keys(acc).filter((k) => Math.abs(acc[k] / runs) > 1e-4);
    console.log(`${name} ${g} (${runs} runs): ` + keys.map((k) => `${k} ${(acc[k] / runs).toFixed(k === 'share' ? 2 : 3)}`).join('  '));
  }
}
