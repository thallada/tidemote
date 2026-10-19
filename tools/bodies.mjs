// The mix of body types in a saved world (src/bodies.js), as shares of the living per guild and as bodies.
//   node tools/bodies.mjs WORLD.tidemote [--json]
import fs from 'node:fs';
import { decodeWorld } from '../src/worlds.js';
import { bodyCensus, morphMix } from '../src/bodies.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const w = await decodeWorld(fs.readFileSync(file));
  const c = bodyCensus(w.cpu, w.gpu);
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ ...c, mix: morphMix(c) })); process.exit(0); }
  console.log(`${file}: ${c.living} living of ${w.cpu.count}`);
  const types = Object.keys(c.bodies).sort();
  console.log('share of the living by body type, per guild');
  for (const [g, G] of Object.entries(c.guilds).sort((a, b) => b[1].cells - a[1].cells)) {
    console.log(`  ${g.padEnd(10)} ${(G.cells / c.living * 100).toFixed(1).padStart(5)}%  ` + types.filter((t) => G.kinds[t]).map((t) => `${t} ${(G.kinds[t] / G.cells * 100).toFixed(1)}%`).join(', '));
  }
  console.log('bodies by type (count, cells, largest)');
  for (const t of types) { const B = c.bodies[t]; console.log(`  ${t.padEnd(14)} ${String(B.n).padStart(8)} ${String(B.cells).padStart(9)} ${String(B.max).padStart(5)}`); }
  console.log('mix', Object.entries(morphMix(c)).map(([k, v]) => `${k} ${v < 1 ? (v * 100).toFixed(1) + '%' : v}`).join(', '));
}
