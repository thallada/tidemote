// Frame strips around the events film.mjs logged: one row per event, frames from a little before it.
//   node tools/anim/crop.mjs SPOTDIR OUT.png [FILTER: live|husk|cyst|silt|kill|all] [MAX=6] [STEP=4] [N=10] [SIZE=200] [BEFORE=0.15]
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const [dir, out, filter = 'all', max = 6, step = 4, n = 10, size = 200, before = 0.15] = process.argv.slice(2);
const times = JSON.parse(fs.readFileSync(path.join(dir, 'times.json')));
const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json')));
const W = 1200, H = 750;
const pick = events.filter((e) => (!process.env.ID || e.id === +process.env.ID) && (filter === 'all' || (filter === 'kill' ? e.state === 'husk' && e.cause === 3 && !e.litter : filter === 'wither' ? e.state === 'husk' && e.was === 'live' && e.cause !== 3 : filter === 'dung' ? e.state === 'husk' && e.cause === 11 : filter === 'wake' ? e.state === 'live' && e.was === 'cyst' : filter === 'grazed' ? e.state === 'husk' && e.cause === 3 && e.litter && e.was === 'live' : e.state === filter))
  && e.t - before > times[0] && e.t + (+step * +n) / 60 < times.at(-1) && e.sx > size / 2 && e.sy > size / 2 && e.sx < W - size / 2 && e.sy < H - size / 2).slice(0, +max);
if (!pick.length) { console.log('no events'); process.exit(); }
const rows = [];
for (const [r, e] of pick.entries()) {
  const f0 = times.findIndex((t) => t >= e.t - +before);
  const frames = Array.from({ length: +n }, (_, k) => f0 + k * +step).filter((f) => f < times.length);
  const x = Math.round(e.sx - size / 2), y = Math.round(e.sy - size / 2);
  const tmp = path.join(path.dirname(out), `_row${r}.png`);
  const inputs = frames.flatMap((f) => ['-i', path.join(dir, `f${String(f + 1).padStart(4, '0')}.jpg`)]);
  const filt = frames.map((_, k) => `[${k}:v]crop=${size}:${size}:${x}:${y},drawtext=text='${((times[frames[k]] - e.t)).toFixed(2)}':x=3:y=3:fontcolor=white:fontsize=12[c${k}]`).join(';')
    + ';' + frames.map((_, k) => `[c${k}]`).join('') + `hstack=inputs=${frames.length}`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filt, tmp]);
  rows.push(tmp);
  console.log(r, JSON.stringify(e));
}
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', rows.length > 1 ? `vstack=inputs=${rows.length}` : 'null', out]);
for (const f of rows) fs.rmSync(f);
