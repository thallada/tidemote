// A bench report's frame intervals (a scenario run with "gaps": true) window by window, as the page's adaptation sees
// them: each 2 s window's mean interval against the frame aimed for (whole display frames, perf.slow of them a frame
// at 60), the share of frames a display frame or more late, and the share that waited on the GPU.
//
//   node tools/perf/gaps.mjs runs/perf/x.json [--every 2]
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: { every: { type: 'string', default: '2' } } });
const report = JSON.parse(fs.readFileSync(positionals[0], 'utf8'));
for (const s of report.scenarios) {
  if (!s.gaps) continue;
  const D = s.rafMs || 1000 / 60, base = Math.max(1, Math.round(1000 / 60 / D - 0.15));
  // perf.slow at each second (bench's adapt rows: [s, slow, ...])
  const slowAt = (t) => (s.adapt.find((a) => a[0] >= t / 1000) || s.adapt.at(-1) || [0, 1])[1];
  console.log(`${s.name}: display ${D.toFixed(2)} ms (${(1000 / D).toFixed(0)} Hz), 60 fps aimed as every ${base} display frames`);
  console.log('   s  slow  fps   mean/T  late≥1vs  waited');
  const W = +v.every * 1000;
  let i = 1;
  while (i < s.gaps.length) {
    const t0 = s.gaps[i][0], rows = [];
    while (i < s.gaps.length && s.gaps[i][0] < t0 + W) { rows.push([s.gaps[i][0] - s.gaps[i - 1][0], s.gaps[i][1], s.gaps[i - 1][1]]); i++; }
    if (rows.length < 3) continue;
    const slow = slowAt(t0), T = base * slow * D;
    const mean = rows.reduce((a, r) => a + Math.min(Math.max(50, 2.5 * T), r[0]), 0) / rows.length;
    const late = rows.filter((r) => r[0] > T + D / 2).length / rows.length;
    const waited = rows.filter((r) => r[1] > r[2]).length / rows.length;
    console.log(`${(t0 / 1000).toFixed(0).padStart(4)}  ${slow}    ${(1000 * rows.length / W).toFixed(1).padStart(4)}  ${(mean / T).toFixed(3)}   ${(100 * late).toFixed(0).padStart(3)}%     ${(100 * waited).toFixed(0).padStart(3)}%`);
  }
}
