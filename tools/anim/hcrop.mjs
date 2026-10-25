// Strips of the hunt's jumps: one row per jump, the view's center from the jump on.
//   node tools/anim/hcrop.mjs HUNTDIR OUT.png [MAX=5] [STEP=8] [N=10] [SIZE=260] [SKIP=0]
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const [dir, out, max = 5, step = 8, n = 10, size = 260, skip = 0] = process.argv.slice(2);
const times = JSON.parse(fs.readFileSync(path.join(dir, 'times.json')));
const jumps = JSON.parse(fs.readFileSync(path.join(dir, 'jumps.json'))).filter((j) => j.t + 0.05 + (+step * +n) / 60 < times.at(-1)).slice(+skip, +skip + +max);
const [W, H] = [1184, 649];
const rows = [];
for (const [r, j] of jumps.entries()) {
  const f0 = times.findIndex((t) => t >= j.t + 0.05);
  const frames = Array.from({ length: +n }, (_, k) => f0 + k * +step);
  const tmp = path.join(path.dirname(out), `_row${r}.png`);
  const x = Math.round(W / 2 - size / 2), y = Math.round(H / 2 - size / 2);
  const filt = frames.map((f, k) => `[${k}:v]crop=${size}:${size}:${x}:${y},drawtext=text='${(times[f] - j.t).toFixed(2)}':x=3:y=3:fontcolor=white:fontsize=12[c${k}]`).join(';') + ';' + frames.map((_, k) => `[c${k}]`).join('') + `hstack=inputs=${frames.length}`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...frames.flatMap((f) => ['-i', path.join(dir, `f${String(f + 1).padStart(4, '0')}.jpg`)]), '-filter_complex', filt, tmp]);
  rows.push(tmp);
}
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', rows.length > 1 ? `vstack=inputs=${rows.length}` : 'null', out]);
for (const f of rows) fs.rmSync(f);
console.log(`${rows.length} rows`);
