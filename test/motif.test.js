import test from 'node:test';
import assert from 'node:assert/strict';
import { archetypeGenome, ARCHETYPE_TYPES, finalizeGenome, mutateLike } from '../src/genome.js';
import { voiceOf } from '../src/audio/mapping.js';
import { motifOf, describe, compareMotifs, motifDistance, contourWord, noteSeconds, character } from '../src/audio/motif.js';

const rng = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const founders = (n, seed = 7) => {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) out.push(finalizeGenome(archetypeGenome(ARCHETYPE_TYPES[i % ARCHETYPE_TYPES.length], r)));
  return out;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('a motif is a well-formed phrase and a pure function of the genome', () => {
  for (const g of founders(140)) {
    const v = voiceOf(g), m = v.motif;
    assert.deepEqual(m, voiceOf(structuredClone(g)).motif);
    assert.ok(m.notes.length >= 2 && m.cycle > 0);
    let prev = -1;
    for (const nt of m.notes) {
      assert.ok(nt.at >= prev && nt.at < m.cycle, 'notes in order, inside the cycle');
      assert.ok(nt.dur > 0 && nt.acc > 0 && nt.acc <= 1 && nt.leg > 0);
      assert.ok(nt.deg >= -5 && nt.deg <= 12 && Math.abs(nt.deg * 10 - Math.round(nt.deg * 10)) < 1e-9);
      prev = nt.at;
    }
    if (m.voice2) for (const nt of m.voice2) assert.ok(nt.at < m.cycle && nt.dur > 0);
    assert.deepEqual(m.seq, m.notes.map((nt) => nt.deg));
  }
});

test('a species sounds like the way it lives', () => {
  const r = rng(11);
  const hunters = [], drifters = [];
  for (let i = 0; i < 60; i++) {
    const h = archetypeGenome('hunter', r); h.adhesion = 0; finalizeGenome(h); hunters.push(voiceOf(h).motif);
    drifters.push(voiceOf(finalizeGenome(archetypeGenome('plankton', r))).motif);
  }
  // fast hunters play quick notes, drifting algae slow ones
  assert.ok(mean(hunters.map((m) => noteSeconds(m))) * 2.5 < mean(drifters.map((m) => noteSeconds(m))));
  // hunters leap, algae move by small steps and come home to a chord tone
  const leap = (m) => mean(m.seq.slice(1).map((d, i) => Math.abs(d - m.seq[i])));
  assert.ok(mean(hunters.map(leap)) > mean(drifters.map(leap)) * 1.2);
  assert.ok(drifters.every((m) => [-3, 0, 2, 4, 7].includes(m.notes[m.notes.length - 1].deg)));
  // and clipped against legato
  assert.ok(mean(hunters.map((m) => m.notes[0].leg)) < mean(drifters.map((m) => m.notes[0].leg)));
  // schooling is heard as singing together
  const g = finalizeGenome(archetypeGenome('grazer', r));
  assert.equal(voiceOf({ ...g, align: 0.9 }).motif.sync, 0.9);
  assert.ok(character({ ...g, photo: 1 }).light === 1);
});

test('species differ from one another, and mutants are variations of their parents', () => {
  const gs = founders(70, 3), ms = gs.map((g) => voiceOf(g).motif);
  const nearest = ms.map((a, i) => Math.min(...ms.filter((_, j) => j !== i).map((b) => motifDistance(a, b))));
  assert.ok(mean(nearest) > 0.6, `species too alike: nearest ${mean(nearest).toFixed(2)}`);
  const r = rng(5), pc = [], rand = [];
  for (let i = 0; i < 300; i++) {
    const g = gs[i % gs.length], h = mutateLike(g, r);
    pc.push(motifDistance(voiceOf(g).motif, voiceOf(h).motif));
    rand.push(motifDistance(ms[i % ms.length], ms[(i * 7 + 3) % ms.length]));
  }
  assert.ok(mean(pc) < 0.55 * mean(rand), `children ${mean(pc).toFixed(2)} vs strangers ${mean(rand).toFixed(2)}`);
  assert.ok(pc.filter((d) => d < 1e-9).length / pc.length < 0.5, 'most mutants change their song');
});

test('receptor genes develop the theme: inversion and retrograde', () => {
  const g = finalizeGenome(archetypeGenome('grazer', rng(21)));
  g.roles[0].rec[4] = 0.2; g.roles[0].rec[5] = 0; g.roles[0].rec[1] = -1;
  const a = motifOf(g, 'grazer');
  const inv = structuredClone(g); inv.roles[0].rec[4] = -0.9;
  const ret = structuredClone(g); ret.roles[0].rec[5] = 0.9;
  assert.ok(compareMotifs(a, motifOf(inv, 'grazer')).includes('turned upside down'));
  assert.ok(compareMotifs(a, motifOf(ret, 'grazer')).includes('reversed'));
  assert.deepEqual(compareMotifs(a, motifOf(structuredClone(g), 'grazer')), []);
});

test('the song in words', () => {
  for (const g of founders(21, 9)) {
    const v = voiceOf(g), d = describe(v);
    assert.equal(d.tags.length, 3);
    assert.match(d.line, /^[A-Z]\w+ notes, [^.]+\..*(in step|copies overlap|own beat)\.( Its β cells add a lower second voice\.)?$/);
  }
  assert.equal(contourWord([0, 2, 4, 2, 0]), 'arching');
  assert.equal(contourWord([0, 1, 2, 3]), 'rising');
  assert.equal(contourWord([3, 3, 3]), 'hovering');
});
