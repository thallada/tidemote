// Render an events.json list with the JS engine (same scheduling rule as scsynth NRT:
// a command runs before the block whose end time reaches its timestamp).
import { readFileSync, writeFileSync } from 'node:fs';
import { Engine } from '../../src/audio/voices.js';
import { BS } from '../../src/audio/ugens.js';
const [evPath, outPath, ...flags] = process.argv.slice(2);
const events = JSON.parse(readFileSync(evPath, 'utf8')).sort((a, b) => a.t - b.t);
const sr = 48000, bd = BS / sr, nonoise = flags.includes('--nonoise'), dry = flags.includes('--dry');
let tail = 6; try { tail = JSON.parse(readFileSync(evPath.replace('.json', '.meta.json'), 'utf8')).tail; } catch {}
const dur = events[events.length - 1].t + tail;
const eng = new Engine(sr, { seed: Number(process.env.SEED || 12345), noiseOff: nonoise, master: { gain: 1.6 } });
const nb = Math.ceil(dur / bd), L = new Float32Array(nb * BS), R = new Float32Array(nb * BS);
const bl = new Float32Array(BS), br = new Float32Array(BS);
let k = 0;
for (let b = 0; b < nb; b++) {
  const end = (b + 1) * bd;
  while (k < events.length && events[k].t <= end) {
    const e = events[k++];
    if (e.set) eng.set(e.set, e.params); else eng.spawn(e.def, e.params, e.id);
  }
  if (dry) {
    eng.B.clear(); const vs = eng.voices; let w = 0;
    for (const v of vs) { eng.S.reset(); v.tick(eng.B, eng.S); if (!v.done) vs[w++] = v; }
    vs.length = w; bl.set(eng.B.dryL); br.set(eng.B.dryR);
  } else eng.block(bl, br);
  L.set(bl, b * BS); R.set(br, b * BS);
}
// float WAV writer
const n = L.length, data = Buffer.alloc(44 + n * 8);
data.write('RIFF', 0); data.writeUInt32LE(36 + n * 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
data.writeUInt16LE(3, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(sr, 24); data.writeUInt32LE(sr * 8, 28);
data.writeUInt16LE(8, 32); data.writeUInt16LE(32, 34); data.write('data', 36); data.writeUInt32LE(n * 8, 40);
for (let i = 0; i < n; i++) { data.writeFloatLE(L[i], 44 + i * 8); data.writeFloatLE(R[i], 48 + i * 8); }
writeFileSync(outPath, data);
console.log(`JS DONE ${dur.toFixed(2)} s`);
