// What the viewer plays, checked against what the ear hears: joins the editor's rendered preview segments for an EDL
// (exactly what the editor shows), finds the cuts in the picture (ffmpeg scdet), and asks of each cut whether it falls on
// the biggest hit of the low end within 200 ms either side, from the audio itself (beats/onsets.py; no grid or score).
// A cut beside a bigger hit is the one that feels off the beat.
//   node tools/promo/beats/check.mjs /mnt/d/tidemote-promo/edl/v10-onbeat.json [-v]
import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
import { spans, FPS } from '../editor/edlcore.mjs';
import { plan } from '../editor/preview.mjs';
import { LIB, TRACK, readJson, times } from '../paths.mjs';
const edlF = process.argv[2], OUT = LIB + '/_preview/check'; fs.mkdirSync(OUT, { recursive: true });
const T = times(), edl = readJson(edlF), segs = plan(edl), sp = spans(edl, T).filter((c) => c.dur > 0);
const miss = segs.filter((s) => !fs.existsSync(s.file)); if (miss.length) { console.log(`${miss.length} segments not rendered yet (open the EDL in the editor)`); process.exit(1); }
const name = edlF.split('/').pop().replace('.json', '');
fs.writeFileSync(`${OUT}/${name}.txt`, segs.map((s) => `file '${s.file}'`).join('\n'));
spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${OUT}/${name}.txt`, '-c', 'copy', `${OUT}/${name}.mp4`]);
const r = spawnSync('ffmpeg', ['-hide_banner', '-i', `${OUT}/${name}.mp4`, '-vf', 'scdet=threshold=6:sc_pass=1', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const det = [...r.stderr.matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)].map((m) => +m[1]);
const L = JSON.parse(spawnSync('python3', [new URL('onsets.py', import.meta.url).pathname, TRACK + '/track.wav'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout);
const A = L.low.map((v, i) => Math.max(v, 0.7 * L.mid[i]));      // an attack: the low end's, or a stab's at 0.7
const peak = (a, b) => { let m = 0, at = a; for (let i = Math.max(0, Math.round(a / L.hop)); i <= Math.round(b / L.hop) && i < A.length; i++) if (A[i] > m) { m = A[i]; at = i * L.hop; } return [m, at]; };
const near = (arr, t) => arr.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), Infinity);
const cuts = sp.slice(1).filter((c) => c.t0 < T.total - 0.5 && c.clip !== 'edit/clips/black');
let seen = 0, onBig = 0, missed = []; const off = [];
for (const c of cuts) {
  if (Math.abs(near(det, c.t0) - c.t0) <= 1.5 / FPS) seen++;
  // the attack at the cut (the sound may come up to 50 ms after the picture: the track's own lag is 21 ms) against the
  // biggest within 200 ms either side
  const [here] = peak(c.t0 - 0.017, c.t0 + 0.05), [big, at] = peak(c.t0 - 0.2, c.t0 + 0.2);
  if (here >= 0.8 * big) { onBig++; off.push((at - c.t0) * 1000); } else missed.push(`${c.i + 1}@${c.at} (${((at - c.t0) * 1000).toFixed(0)} ms)`);
}
const sorted = [...off].sort((a, b) => a - b);
console.log(`${name}: ${cuts.length} cuts, ${seen} seen in the picture at their frame (scdet); ${onBig} on the biggest attack within ±200 ms (sound after picture, median ${sorted[sorted.length >> 1].toFixed(0)} ms), ${missed.length} beside a bigger one`);
if (process.argv.includes('-v')) console.log('  missed:', missed.join(' '));
