// Render a capture from tools/listen-capture.mjs through the soundtrack's audio-thread code.
// usage: node tools/listen-render.mjs capture.json out.wav [--mode field|score|both] [--phase name] [--seed 3]
// Prints per-phase loudness (needs ffmpeg) and voice statistics.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Engine } from '../src/audio/voices.js';
import { Conductor } from '../src/audio/conductor.js';
import { BS } from '../src/audio/ugens.js';
import { V_SCALE } from '../src/audio/listen.js';
import { voiceOf } from '../src/audio/mapping.js';

const [inPath, outPath] = process.argv.slice(2);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const mode = arg('mode', 'field'), only = arg('phase', null), seed = Number(arg('seed', 3));
const speed = Number(arg('speed', 1)); // play the capture as if the simulation ran this fast
const cap = JSON.parse(fs.readFileSync(inPath, 'utf8'));
let log = cap.log;
if (only) log = log.filter((e) => e.phase === only);
const sr = 48000, eng = new Engine(sr, { seed }), cond = new Conductor(eng, { seed });
cond.message({ type: 'mode', mode });
if (arg('gain', null)) cond.message({ type: 'fieldGain', gain: JSON.parse(arg('gain')) }); // e.g. '{"alive":0}'
if (arg('bed', null)) cond.world.level = Number(arg('bed'));
const t0 = log[0].t - 1.0 * speed, tEnd = log[log.length - 1].t + 3 * speed;
const nb = Math.ceil((((tEnd - t0) / speed) * sr) / BS), L = new Float32Array(nb * BS), R = new Float32Array(nb * BS);
const bl = new Float32Array(BS), br = new Float32Array(BS);
let k = 0, voices = 0, peakVoices = 0, phase = null;
const spawns = {};
const spawn0 = eng.spawn.bind(eng);
eng.spawn = (d, p, id) => { if (id == null && phase) { const S = (spawns[phase] ||= {}); S[d] = (S[d] || 0) + 1; } return spawn0(d, p, id); };
const perPhase = {};
const tStart = performance.now();
for (let b = 0; b < nb; b++) {
  const tAudio = (b * BS) / sr, tSim = t0 + tAudio * speed;
  while (k < log.length && log[k].t <= tSim) {
    const e = log[k++], m = { ...e.msg };
    phase = e.phase;
    if (m.type === 'listen') {
      m.ev = Float32Array.from(m.ev); m.speed = speed;
      if (e.stats) m.act = Math.min(1.5, e.stats.speed / V_SCALE);
      const P = (perPhase[e.phase] ||= { t0: tAudio, t1: tAudio, events: 0, inView: new Array(8).fill(0), scans: 0, living: 0, act: 0 });
      P.t1 = tAudio; P.scans++; P.agc = (P.agc || 0) + cond.field.agc; P.pow = (P.pow || 0) + Math.log10(cond.field.power + 1e-9); P.events += m.ev.length / 8; P.living += m.living; P.act += m.act; m.inView.forEach((v, i) => (P.inView[i] += v));
    }
    if (m.type === 'slots') m.slots = m.slots.map((x) => (x.genome ? { ...x, voice: voiceOf(x.genome) } : x));
    cond.message(m);
  }
  cond.render(bl, br);
  L.set(bl, b * BS); R.set(br, b * BS);
  voices += eng.voices.length; peakVoices = Math.max(peakVoices, eng.voices.length);
}
const secs = (nb * BS) / sr, cpu = (performance.now() - tStart) / 1000;
console.log(`${mode}: ${secs.toFixed(1)} s rendered in ${cpu.toFixed(1)} s (${(secs / cpu).toFixed(1)}x real time), voices avg ${(voices / nb).toFixed(1)} peak ${peakVoices}`);
// write float WAV
const wav = (path, l, r) => {
  const n = l.length, buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(l[i], 44 + i * 8); buf.writeFloatLE(r[i], 48 + i * 8); }
  fs.writeFileSync(path, buf);
};
wav(outPath, L, R);
const lufs = (path, a, b) => spawnSync('ffmpeg', ['-hide_banner', '-ss', String(a), '-to', String(b), '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
for (const [name, P] of Object.entries(perPhase)) {
  const s = lufs(outPath, P.t0 + 1.5, P.t1 + 0.5), sum = s.slice(s.lastIndexOf('Summary'));
  const I = (sum.match(/I:\s+(-?[\d.]+)/) || [])[1], pk = (sum.match(/Peak:\s+(-?[\d.]+)/) || [])[1];
  const dur = P.t1 - P.t0;
  console.log(`${name.padEnd(5)} ${dur.toFixed(0)} s  ${I} LUFS  true peak ${pk}  | events/s in view: ${P.inView.slice(0, 8).map((v) => (v / dur).toFixed(0)).join(' ')}  living in view ${(P.living / P.scans).toFixed(0)}  activity ${(P.act / P.scans).toFixed(2)}  power ${(10 ** (P.pow / P.scans)).toFixed(3)} agc ${(P.agc / P.scans).toFixed(2)}`);
  const S = spawns[name] || {};
  console.log('      notes/s: ' + Object.entries(S).sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d} ${(c / dur).toFixed(1)}`).join(', '));
}
