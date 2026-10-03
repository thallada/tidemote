// Render a SuperCollider score dump ([[time, [cmd, ...]], ...]) with the JS engine.
import { readFileSync, writeFileSync } from 'node:fs';
import { Engine } from '../../src/audio/voices.js';
import { BS } from '../../src/audio/ugens.js';
const [inPath, outPath, durArg] = process.argv.slice(2);
const score = JSON.parse(readFileSync(inPath, 'utf8')).sort((a, b) => a[0] - b[0]);
const sr = 48000, bd = BS / sr;
const eng = new Engine(sr, { seed: Number(process.env.SEED || 1) });
const pairs = (a) => { const o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o; };
const names = { 904: 'master', 910: 'sea', 911: 'drone', 903: 'fdn' };
const dur = Number(durArg || score[score.length - 1][0] + 1);
const nb = Math.ceil(dur / bd), L = new Float32Array(nb * BS), R = new Float32Array(nb * BS), bl = new Float32Array(BS), br = new Float32Array(BS);
let k = 0, maxV = 0; const t0 = performance.now();
for (let b = 0; b < nb; b++) {
  const end = (b + 1) * bd;
  while (k < score.length && score[k][0] <= end) {
    const [, m] = score[k++];
    if (m[0] === 's_new') {
      const [, def, id, , , ...rest] = m; const p = pairs(rest);
      if (def === 'master') Object.assign(eng.master.p, { gain: p.gain ?? 1 });
      else if (def === 'pingpong' || def === 'fdn') {} // created with the engine
      else eng.spawn(def, p, id >= 0 ? names[id] : undefined);
    } else if (m[0] === 'n_set') { const [, id, ...rest] = m; eng.set(names[id], pairs(rest)); }
  }
  eng.block(bl, br); L.set(bl, b * BS); R.set(br, b * BS); maxV = Math.max(maxV, eng.voices.length);
}
const secs = (performance.now() - t0) / 1000;
console.log(`rendered ${dur.toFixed(0)} s of audio in ${secs.toFixed(1)} s (${(dur / secs).toFixed(1)}x real time), max simultaneous synths ${maxV}`);
const n = L.length, data = Buffer.alloc(44 + n * 8);
data.write('RIFF', 0); data.writeUInt32LE(36 + n * 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
data.writeUInt16LE(3, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(sr, 24); data.writeUInt32LE(sr * 8, 28);
data.writeUInt16LE(8, 32); data.writeUInt16LE(32, 34); data.write('data', 36); data.writeUInt32LE(n * 8, 40);
for (let i = 0; i < n; i++) { data.writeFloatLE(L[i], 44 + i * 8); data.writeFloatLE(R[i], 48 + i * 8); }
writeFileSync(outPath, data);
