// Moves an EDL's cuts onto the song's hits, keeping its shots, their order and each section's number of cuts: per section
// a dynamic programme picks for every cut a step within ±WIN of where it was, maximizing how hard the song hits there
// (edlcore hitMap: the audio's onsets, the score's kicks and stabs) less a small cost per step moved, no cut shorter than
// MIN seconds. A cut on a section's first beat stays. Writes the new EDL beside the old (never over it).
//   node tools/promo/beats/retime.mjs /mnt/d/tidemote-promo/edl/v9-auto.json /mnt/d/tidemote-promo/edl/v10-onbeat.json
import fs from 'node:fs';
import { makeWhen, stepsOf, atOf, hitMap, onHit } from '../editor/edlcore.mjs';
import { TRACK, readJson, times } from '../paths.mjs';
const [src, dst] = process.argv.slice(2);
const T = times(), E = readJson(TRACK + '/events.json'), ACC = readJson(TRACK + '/accent.json').steps, st = T.steps;
// a cut already on the beat costs STAY more to move: the edit's own rhythm is kept wherever it already lands
const WIN = 4, LAMBDA = 0.04, MIN = 0.25, STAY = 0.3;
const { hit, kick } = hitMap(T, E, ACC);
const edl = JSON.parse(fs.readFileSync(src)), when = makeWhen(T), cuts = edl.cuts;
const secStart = new Set(T.sections.map((s) => s.bar * 16));
const secOf = (n) => T.sections.findLast((s) => s.bar * 16 <= n)?.name || 'end';
const n0 = cuts.map((c) => stepsOf(c.at));
// fixed: the first cut, cuts on a section's first step, the black tail after the track; free runs between them
const fixed = n0.map((n, i) => i === 0 || secStart.has(n) || n >= st.length);
const out = [...n0];
for (let a = 0; a < cuts.length;) {
  let b = a + 1; while (b < cuts.length && !fixed[b]) b++;          // cuts a (fixed) .. b (fixed or end); free a+1..b-1
  const lo = n0[a], hi = b < cuts.length ? n0[b] : st.length, free = [];
  for (let i = a + 1; i < b; i++) free.push(i);
  if (free.length) {
    const ok = (p, q) => when(atOf(q)) - when(atOf(p)) >= MIN - 1e-6;
    // dp over the free cuts: best[j][s] = best score with cut free[j] at step s
    let prev = new Map([[lo, { v: 0, path: [] }]]);
    for (const i of free) {
      const next = new Map();
      for (let s = Math.max(lo + 1, n0[i] - WIN); s <= Math.min(hi - 1, n0[i] + WIN); s++) {
        let best = null;
        for (const [p, r] of prev) if (p < s && ok(p, s) && (!best || r.v > best.v)) best = r;
        if (best) next.set(s, { v: best.v + hit[s] - LAMBDA * Math.abs(s - n0[i]) - (s !== n0[i] && onHit(hit, n0[i]) ? STAY : 0), path: [...best.path, s] });
      }
      prev = next;
    }
    let best = null;
    for (const [p, r] of prev) if ((b >= cuts.length || ok(p, hi)) && (!best || r.v > best.v)) best = r;
    if (best) free.forEach((i, k) => (out[i] = best.path[k])); else console.warn(`cuts ${a + 2}-${b}: no placement, left`);
  }
  a = b;
}
let moved = 0; const lines = [];
cuts.forEach((c, i) => {
  if (out[i] === n0[i]) return;
  moved++; lines.push(`${String(i + 1).padStart(3)} ${secOf(n0[i]).padEnd(6)} ${String(c.at).padEnd(6)} → ${atOf(out[i]).padEnd(6)} hit ${hit[n0[i]].toFixed(2)}${onHit(hit, n0[i]) ? '' : '*'} → ${hit[out[i]].toFixed(2)}${onHit(hit, out[i]) ? '' : '*'}  ${c.clip.split('/').slice(1).join('/')}`);
  c.at = atOf(out[i]);
});
const live = (ns) => ns.filter((n, i) => i > 0 && n < st.length);
console.log(lines.join('\n'));
console.log(`${moved} of ${cuts.length} cuts moved; on the beat (no bigger hit within two steps) ${live(n0).filter((n) => onHit(hit, n)).length} → ${live(out).filter((n) => onHit(hit, n)).length} of ${live(out).length}; on a kick ${live(n0).filter((n) => kick[n]).length} → ${live(out).filter((n) => kick[n]).length}  (* beside a bigger hit)`);
edl.name = `${edl.name || ''} · cuts moved onto the song's hits (beats/retime.mjs)`.replace(/^ · /, '');
fs.writeFileSync(dst, JSON.stringify(edl, null, 1));
