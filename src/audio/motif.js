// A species' song: its motif, read from its genome.
//
// A motif is a short phrase: a rhythm, a line of scale degrees, how each note is played and,
// for colonies, a second voice. Different parts of the genome shape different parts of it, so a
// species sounds like the way it lives, and a mutant's song is a recognisable variation:
//   identity     the α cell type's surface signature (the genes that also decide who sticks to
//                and eats whom) chooses each interval of the line: the family resemblance
//   character    how the species lives (speed, diet, light, drift, schooling, size, lifespan)
//                sets the tempo, the rhythm, the intervals it moves by, its range, its cadence
//                and its articulation: a fast hunter leaps and pounces in clipped notes, a
//                drifting alga sways through long tied ones
//   development  receptor genes switch whole transformations of the theme on and off, the way a
//                composer develops one: inversion, retrograde, displacement, an answering
//                phrase, grace notes. A mutation that crosses one of them is heard as the
//                parent's tune turned upside down, or answered, or ornamented.
// Everything is a pure function of the genome. Times are in steps (the soundtrack's sixteenths).
// Degrees follow SuperCollider's degreeToKey: a tenth below a degree is that degree lowered a
// semitone (2.9 is the third degree flattened), used for chromatic approach notes.

import { roleShares } from '../genome.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const u01 = (s) => clamp((s + 1) / 2, 0, 0.99999);

// ── rhythm cells, in units (a rest is negative) ──────────────────────────────
// Each cell is a figure a species can be built on; its features are measured, not tagged, so
// the choice follows the species' character.
const CELLS = [
  [1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 2], [1, 1, 2, 1, 1, 2], [2, 1, 1, 2, 1, 1], [1, 1, 1, 1, 4],
  [3, 1, 3, 1], [1, 3, 1, 3], [3, 1, 2, 2], [1, 2, 1, 2, 2],
  [4, 1, 1, 2], [3, -1, 1, 1, 1, 1], [6, 1, 1], [5, -1, 1, 1], [2, -1, 1, 1, 1, 2],
  [3, 3, 2], [3, 3, 4, 2, 4], [3, 3, 2, 2, 2, 4],
  [1, -1, 1, 1, -2, 1], [1, -3, 1, -1, 1, -1], [2, -1, 1, -2, 1, 1], [1, 1, -2, 1, -1, 2],
  [6, 2, 8], [4, 4, 8], [8, 8, 4], [6, -2, 6, -2], [2, 2, 4], [4, 2, 2, 8], [3, 1, 4, 4, 4], [2, 2, 2, 6],
  [2 / 3, 2 / 3, 2 / 3, 2, 2], [2 / 3, 2 / 3, 2 / 3, 2 / 3, 2 / 3, 2 / 3, 4], [1, 1, 2 / 3, 2 / 3, 2 / 3, 3],
];
const featuresOf = (cell) => {
  const notes = cell.filter((d) => d > 0), tot = cell.reduce((a, d) => a + Math.abs(d), 0);
  const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
  const sd = Math.sqrt(notes.reduce((a, d) => a + (d - mean) ** 2, 0) / notes.length);
  let t = 0, off = 0, burst = 0;
  cell.forEach((d, i) => {
    if (d > 0 && Math.abs(t % 2) > 1e-6 && Math.abs(t % 2 - 2) > 1e-6 && d >= 1) off++;
    if (d >= 3 && cell[i + 1] > 0 && cell[i + 1] <= 1 && cell[i + 2] > 0 && cell[i + 2] <= 1) burst = 1;
    t += Math.abs(d);
  });
  return {
    n: notes.length, tot, mean,
    dens: notes.length / tot,                  // notes per unit
    syn: off / notes.length,                   // notes that start off the beat
    burst,                                     // a hold, then a quick run: a pounce
    rest: (tot - notes.reduce((a, b) => a + b, 0)) / tot,
    even: 1 - clamp(sd / mean, 0, 1),
    end: clamp(notes[notes.length - 1] / mean / 3, 0, 1), // a long last note: a cadence
    trip: cell.some((d) => Math.abs(d * 3 - Math.round(d * 3)) < 1e-6 && Math.abs(d - Math.round(d)) > 1e-6) ? 1 : 0,
  };
};
const CELL_F = CELLS.map(featuresOf);
// the steps one unit lasts, from quick to slow
const UNITS = [0.5, 1, 1.5, 2, 3, 4, 6];

// ── how a species lives, 0..1 each ───────────────────────────────────────────
export function character(g) {
  const swim = g.swim * (1 - g.photo);
  return {
    kin: clamp(0.65 * clamp(swim / 1.6, 0, 1) + 0.35 * clamp((g.force - 3) / 10, 0, 1), 0, 1), // speed and thrust
    prey: clamp(g.dFlesh * (1 - g.photo), 0, 1),                                               // a hunter
    light: clamp(g.photo, 0, 1),                                                               // lives on light
    drift: clamp(g.advect * (1 - clamp(swim / 0.8, 0, 1)), 0, 1),                              // carried by the water
    school: clamp(g.align, 0, 1),                                                              // moves with its kind
    colony: (g.adhesion || 0) > 0.15 ? clamp(g.adhesion, 0, 1) : 0,                            // a bonded body
    long: clamp((g.lifespan - 40) / 400, 0, 1),
    bulk: clamp((g.size - 0.45) / 1.6, 0, 1),
    scav: clamp(g.dHusk * (1 - g.photo), 0, 1),
    graze: clamp(g.dGlint * (1 - g.photo), 0, 1),
    restless: clamp((g.mutRate - 0.004) / 0.04, 0, 1),
    pulse: clamp(g.pulse, 0, 1),
  };
}

// The rhythm a character asks for, and the closest cells. Of the four closest, the species'
// shape gene (which mutates rarely) chooses one, so neighbours in character still differ.
function chooseCell(c, g) {
  const want = {
    dens: lerp(0.25, 1.15, clamp(0.75 * c.kin + 0.35 * c.graze + 0.2 * c.prey - 0.45 * c.light - 0.35 * c.drift + 0.15, 0, 1)),
    syn: clamp(0.15 + 0.45 * c.prey + 0.35 * c.pulse - 0.2 * c.light, 0, 1),
    burst: clamp(1.6 * c.prey * (0.3 + c.kin) - 0.2, 0, 1),
    rest: clamp(0.05 + 0.35 * c.scav + 0.15 * c.restless - 0.2 * c.light - 0.15 * c.school, 0, 0.5),
    even: clamp(0.4 + 0.4 * c.school + 0.3 * c.graze - 0.3 * c.prey, 0, 1),
    end: clamp(0.15 + 0.5 * c.light + 0.3 * c.long - 0.3 * c.prey, 0, 1),
    trip: clamp(1.5 * c.kin * (1 - c.prey) * (1 - c.school) - 0.3, 0, 1),
  };
  // in coarse steps, so the rhythm holds while a lineage drifts and changes when its way of
  // life does
  for (const k in want) want[k] = k === 'dens' ? Math.round(want[k] * 3) / 3 : Math.round(want[k] * 2) / 2;
  const W = { dens: 3, syn: 1.2, burst: 1.5, rest: 2, even: 0.8, end: 0.8, trip: 0.6 };
  const scored = CELL_F.map((f, i) => {
    let d = 0;
    for (const k in W) d += W[k] * (f[k] - want[k]) ** 2;
    return [d, i];
  }).sort((a, b) => a[0] - b[0]);
  const pickI = Math.floor(g.shape) % 4;
  return scored[pickI][1];
}

// Interval weights (in scale steps, -7..7) for a character: steps for most, leaps for hunters,
// repeated notes for grazers, a downward pull for scavengers, the thirds of a broken chord for
// those that live on light, and fewer leaps for drifters.
function intervalTable(c) {
  const out = [];
  for (let i = -7; i <= 7; i++) {
    const a = Math.abs(i);
    let w = a === 0 ? 0.25 + 0.7 * c.graze + 0.3 * c.school
      : a === 1 ? 1 : a === 2 ? 0.7
        : a === 3 ? 0.2 + 0.6 * c.prey + 0.25 * c.kin
          : a === 4 ? 0.12 + 0.8 * c.prey * (0.4 + c.kin)
            : a === 5 ? 0.04 + 0.3 * c.prey
              : a === 7 ? 0.02 + 0.45 * c.prey * c.kin + 0.15 * c.bulk : 0.01;
    if (a === 2 || a === 4) w *= 1 + 1.4 * c.light; // thirds and fifths: a broken chord
    if (a === 1) w *= 1 - 0.35 * c.light;
    if (a === 3 || a >= 5) w *= 1 - 0.7 * c.light;
    if (a >= 3) w *= 1 - 0.55 * c.drift;
    if (a === 0) w *= 1 - 0.5 * c.light;
    if (i < 0) w *= 1 + 0.9 * c.scav;
    if (w > 0.005) out.push([i, w]);
  }
  const tot = out.reduce((s, x) => s + x[1], 0);
  let acc = 0;
  return out.map(([i, w]) => [i, (acc += w / tot)]);
}
const fromTable = (tab, s) => { const u = u01(s); for (const [i, c] of tab) if (u < c) return i; return tab[tab.length - 1][0]; };

const CHORDS = [[0, 2, 4], [0, 4, 7], [0, 2, 7], [0, 4, 9]];
const CHORD_TONES = [-3, 0, 2, 4, 7];
const nearest = (d, set) => set.reduce((b, x) => (Math.abs(x - d) < Math.abs(b - d) ? x : b), set[0]);

/**
 * The motif of a genome. arch: its musical archetype (mapping.js archOf).
 * Returns { notes: [{ deg, at, dur, acc, leg, grace? }], cycle, voice2: [...] | null, unit, cell,
 *   swing, rubato, sync, dev: { inv, retro, rot, answer, grace }, seq, rate, char }.
 */
export function motifOf(g, arch) {
  const c = character(g);
  const A = g.roles[0], B = g.roles[1];
  const shares = roleShares(g);
  // tempo: how long a typical note lasts, in steps
  const pace = clamp(0.7 * c.kin + 0.25 * c.prey + 0.15 * (1 - c.long) + 0.1 * c.graze - 0.45 * c.light - 0.3 * c.drift - 0.15 * c.bulk + 0.3, 0, 1);
  const noteSteps = lerp(5.5, 0.9, pace);
  let ci = chooseCell(c, g);
  if (arch === 'reef') ci = [21, 22, 25, 26, 28][Math.floor(u01(A.rec[2]) * 5)]; // reefs ring slow chords
  const F = CELL_F[ci];
  let unit = UNITS.reduce((b, u) => (Math.abs(Math.log(u * F.mean / noteSteps)) < Math.abs(Math.log(b * F.mean / noteSteps)) ? u : b), UNITS[0]);
  if (F.trip && unit < 1.5) unit = 1.5; // a triplet of half-step units would be a blur
  while (unit * F.tot > 40 && unit > 0.5) unit = UNITS[UNITS.indexOf(unit) - 1];

  // development switches, from receptor genes
  const dev = {
    inv: A.rec[4] < -0.4,
    retro: A.rec[5] > 0.45,
    rot: A.rec[6] > 0.5 ? 1 : A.rec[6] < -0.6 ? -1 : 0,
    answer: A.rec[1] + 0.6 * c.long - 0.25 * c.kin > 0.35 ? ['sequence', 'mirror', 'echo', 'tail'][Math.floor(u01(A.rec[7]) * 4)] : null,
    grace: 0.6 * c.restless + 0.4 * c.pulse + 0.2 * c.prey > 0.62,
  };

  // the rhythm: the cell, displaced if the genes say so
  let cell = CELLS[ci].slice();
  if (dev.rot) {
    const k = dev.rot > 0 ? 1 : cell.length - 1;
    cell = [...cell.slice(k), ...cell.slice(0, k)];
    if (cell[0] < 0) cell.push(cell.shift()); // never open on a rest
  }

  // the line: a walk whose intervals the surface signature picks from the character's table
  const tab = intervalTable(c);
  const range = Math.round(clamp(4 + 6 * Math.max(c.prey, c.kin) + 2 * c.bulk + 2 * c.light * c.long - 1.5 * c.drift, 4, 11));
  const n = F.n;
  const start = Math.round(u01(A.rec[0]) * 4);
  const lo = start - Math.floor(range / 2), hi = lo + range;
  let line = [start];
  let prev = 0;
  for (let i = 1; i < n; i++) {
    let iv = fromTable(tab, A.surf[(i - 1) % 8]);
    if (dev.inv) iv = -iv;
    if (Math.abs(prev) >= 3 && Math.sign(iv) === Math.sign(prev) && c.prey < 0.7) iv = -Math.sign(iv) * Math.min(2, Math.abs(iv)); // recover after a leap
    let d = line[i - 1] + iv;
    if (d > hi || d < lo) d = line[i - 1] - iv;
    line.push(clamp(d, lo, hi));
    prev = iv;
  }
  if (arch === 'reef') { // a broken chord: each note one of the chord's tones
    const ch = CHORDS[Math.floor(u01(A.rec[2]) * 4)];
    line = line.map((_, i) => ch[Math.floor(u01(A.surf[i % 8]) * 3)]);
  }
  if (dev.retro) line.reverse();
  // the cadence: those who live on light come home; hunters end in the air
  const last = line.length - 1;
  if (c.light > 0.5 || arch === 'reef' || arch === 'plankton' || arch === 'filament') line[last] = nearest(line[last], CHORD_TONES);
  else if (c.prey > 0.5 && [0, 4, 7, -3].includes(line[last])) line[last] += A.surf[3] > 0 ? 1 : -1;

  // notes: rhythm and line together, with articulation and accents
  const leg = clamp(1.2 - 0.75 * c.prey - 0.35 * c.kin + 0.4 * c.light + 0.35 * c.drift, 0.25, 1.6);
  const notes = [];
  let t = 0, li = 0, longest = 0;
  for (let i = 0; i < cell.length; i++) {
    const d = cell[i];
    if (d > 0) {
      const after = i === 0 || cell[i - 1] < 0 || cell[i - 1] >= 3;
      notes.push({ deg: line[li++], at: t * unit, dur: d * unit, acc: after ? 1 : 0.72, leg });
      if (d > cell[longest]) longest = i;
    }
    t += Math.abs(d);
  }
  let cycle = t * unit;
  // a pounce: the quick notes after a hold strike hard; a chromatic approach into the longest note
  if (F.burst) notes.forEach((nt, i) => { if (i > 0 && nt.dur <= unit && notes[i - 1].dur >= 3 * unit) { nt.acc = 1; if (notes[i + 1]) notes[i + 1].acc = 0.95; } });
  if (c.prey > 0.45) {
    const L = notes.reduce((b, nt, i) => (nt.dur > notes[b].dur ? i : b), 0);
    if (L > 0) notes[L - 1].deg = notes[L].deg - 0.1;
  }
  if (dev.grace) { // a grace note a step above, just before the strongest note
    const L = notes.reduce((b, nt, i) => (nt.acc > notes[b].acc || (nt.acc === notes[b].acc && nt.dur > notes[b].dur) ? i : b), 0);
    notes[L].grace = notes[L].deg + 1;
  }

  // an answering phrase, developed from the first
  if (dev.answer) {
    const base = notes.map((nt) => ({ ...nt, at: nt.at + cycle }));
    let ans;
    if (dev.answer === 'sequence') ans = base.map((nt) => ({ ...nt, deg: nt.deg + (A.rec[2] > 0 ? 2 : -1) }));
    else if (dev.answer === 'mirror') ans = base.map((nt) => ({ ...nt, deg: 2 * notes[0].deg - nt.deg }));
    else if (dev.answer === 'echo') { const k = Math.max(2, Math.ceil(base.length / 2)); ans = base.slice(-k).map((nt, i, a) => ({ ...nt, at: cycle + (nt.at - a[0].at), deg: nt.deg + 7, acc: nt.acc * 0.7 })); }
    else ans = base.slice(0, Math.max(2, base.length - 1)).map((nt, i, a) => ({ ...nt, dur: i === a.length - 1 ? nt.dur * 2 : nt.dur }));
    const ansEnd = Math.max(...ans.map((nt) => nt.at - cycle + nt.dur));
    ans[ans.length - 1].deg = c.prey > 0.5 ? ans[ans.length - 1].deg : nearest(ans[ans.length - 1].deg, CHORD_TONES);
    for (const nt of ans) notes.push(nt);
    cycle += Math.max(ansEnd, cycle * 0.5);
  }
  // a breath before it comes round again
  const gap = Math.round(lerp(0, 6, clamp(0.5 * c.light + 0.4 * c.long + 0.3 * c.drift - 0.4 * c.kin, 0, 1)) * Math.max(1, unit) / 2) * 2 * (unit < 1 ? 0.5 : 1);
  cycle += gap;
  for (const nt of notes) {
    while (nt.deg > 12) nt.deg -= 7;
    while (nt.deg < -5) nt.deg += 7;
    nt.deg = Math.round(nt.deg * 10) / 10;
  }

  // a colony's β cells sing a second voice under it: a third, a fifth, a sixth or an octave
  // below, held across pairs of notes (reefs hold the chord's root under the whole phrase)
  let voice2 = null;
  if (c.colony > 0 && shares[1] >= 0.12) {
    if (arch === 'reef') voice2 = [{ deg: Math.min(...notes.map((nt) => Math.floor(nt.deg))) - 7, at: 0, dur: cycle, acc: 0.8, leg: 1 }];
    else {
      const below = [-2, -2, -4, -5, -7];
      voice2 = [];
      for (let i = 0; i < notes.length; i += 2) {
        const a = notes[i], b = notes[i + 1];
        const iv = below[Math.floor(u01(B.surf[(i / 2) % 8]) * below.length)];
        voice2.push({ deg: Math.round(a.deg) + iv, at: a.at, dur: b ? b.at + b.dur - a.at : a.dur, acc: 0.8, leg: clamp(leg + 0.3, 0.6, 1.6) });
      }
    }
  }
  const seq = notes.map((nt) => nt.deg);
  return {
    notes, cycle, voice2, unit, cell: ci,
    swing: c.pulse > 0.5 ? (c.pulse - 0.5) * 0.6 : 0,
    rubato: 0.4 * c.drift,
    sync: c.school,
    dev, seq, rate: notes.reduce((s, nt) => s + nt.dur, 0) / notes.length, char: c,
  };
}

// ── words ────────────────────────────────────────────────────────────────────
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const MAT_WORD = { glass: 'singing glass', swell: 'swell', breath: 'reed breath', cplx: 'buzzing reed', tine: 'kalimba', bite: 'snapping drum', wood: 'woodblock', drop: 'water drops', pluck: 'plucked string' };

/** The shape of a line of degrees, in a word. */
export function contourWord(degs) {
  if (degs.length < 2) return 'single';
  const d = degs.map((x, i) => (i ? x - degs[i - 1] : 0)).slice(1);
  const ups = d.filter((x) => x > 0).length, downs = d.filter((x) => x < 0).length;
  const net = degs[degs.length - 1] - degs[0];
  const peak = degs.indexOf(Math.max(...degs)), trough = degs.indexOf(Math.min(...degs));
  const span = Math.max(...degs) - Math.min(...degs);
  const leaps = d.filter((x) => Math.abs(x) >= 3).length;
  let turns = 0;
  for (let i = 1; i < d.length; i++) if (d[i] * d[i - 1] < 0) turns++;
  if (span <= 1) return 'hovering';
  if (leaps >= Math.max(2, d.length / 2)) return 'leaping';
  if (turns >= Math.max(3, d.length - 2)) return 'zigzag';
  if (peak > 0 && peak < degs.length - 1 && degs[0] < degs[peak] - 1 && degs[degs.length - 1] < degs[peak] - 1) return 'arching';
  if (trough > 0 && trough < degs.length - 1 && degs[0] > degs[trough] + 1 && degs[degs.length - 1] > degs[trough] + 1) return 'dipping';
  if (net >= 2 && ups >= downs) return 'rising';
  if (net <= -2 && downs >= ups) return 'falling';
  return turns >= 2 ? 'wavering' : 'level';
}

// The rhythm in plain terms: its figure, named by what you hear.
const RHYTHM = (m) => {
  const f = CELL_F[m.cell], cell = CELLS[m.cell];
  const has = (...p) => cell.some((_, i) => p.every((d, j) => cell[i + j] === d));
  if (f.burst) return 'a held note, then a quick burst';
  if (f.trip) return 'in triplets';
  if (f.rest > 0.2) return 'broken up by rests';
  if (f.syn > 0.4) return 'off the beat';
  if (f.dens < 0.4) return 'each note held long';
  if (f.even > 0.85) return f.dens >= 0.9 ? 'in even quick notes' : 'in even notes';
  if (has(3, 1)) return 'long-short, long-short';
  if (has(2, 1, 1)) return 'long-short-short';
  if (has(1, 1, 2)) return 'short-short-long';
  if (f.end > 0.5) return 'slowing into a long last note';
  return 'in uneven notes';
};
const CONTOUR = { rising: 'rising', falling: 'falling', arching: 'rising then falling', dipping: 'falling then rising', zigzag: 'zigzagging up and down', leaping: 'leaping widely', hovering: 'staying around one pitch', wavering: 'wavering', level: 'mostly level', single: 'one pitch' };

/** Seconds per note at the soundtrack's resting pulse. */
export const noteSeconds = (m, step = 0.18) => (m.cycle / m.notes.length) * step;

/**
 * The motif in words: { tags: [instrument, register, tempo], line }. Each clause says what you
 * hear and, where a gene causes it, which: "Five notes, rising then falling, long-short-short.
 * Ends on the home note. Its cells school, so they sing it in step."
 * v: the voice (mapping.js voiceOf), which carries the motif and the instrument.
 */
export function describe(v) {
  const m = v.motif;
  const sec = noteSeconds(m);
  const tempo = sec < 0.22 ? 'quick' : sec < 0.4 ? 'brisk' : sec < 0.75 ? 'moderate' : sec < 1.3 ? 'slow' : 'very slow';
  const reg = v.oct >= 2 ? 'high' : v.oct <= 0 ? 'low' : 'middle';
  const first = m.dev.answer ? m.notes.slice(0, m.notes.length - (m.dev.answer === 'echo' ? Math.max(2, Math.ceil(CELL_F[m.cell].n / 2)) : m.dev.answer === 'tail' ? Math.max(2, CELL_F[m.cell].n - 1) : CELL_F[m.cell].n)) : m.notes;
  const k = first.length, num = NUM[k] || String(k);
  let s = `${num[0].toUpperCase() + num.slice(1)} notes, ${CONTOUR[contourWord(first.map((nt) => nt.deg))]}, ${RHYTHM(m)}.`;
  const ANSWER = { sequence: 'Then played again a step higher or lower', mirror: 'Then played again upside down', echo: 'Its end repeats an octave higher', tail: 'Then played again with the last note held' };
  const bits = [];
  if (m.dev.answer) bits.push(ANSWER[m.dev.answer]);
  if (m.swing > 0.05) bits.push('swung (every second note a little late)');
  if (m.notes.some((nt) => nt.grace != null)) bits.push('one quick grace note');
  if (m.notes.some((nt) => Math.round(nt.deg) !== nt.deg)) bits.push('one note outside the key');
  const lastDeg = m.notes[m.notes.length - 1].deg;
  if ([0, 7, -7].includes(lastDeg)) bits.push('ends on the home note');
  else if (![4, -3].includes(lastDeg) && m.char.prey > 0.5) bits.push('ends unresolved');
  if (bits.length) s += ` ${bits[0][0].toUpperCase()}${bits.join(', ').slice(1)}.`;
  s += m.sync > 0.65 ? ' Its cells school, so they sing it in step.'
    : m.sync < 0.3 ? ' Its cells don’t school, so each starts the phrase on its own beat and the copies overlap.'
      : ' Its cells school loosely: some sing it in step, others on their own beat.';
  if (m.voice2) s += ' Its β cells add a lower second voice.';
  return { tags: [MAT_WORD[v.mat] || v.mat, reg, tempo], line: s };
}

/** How a motif differs from an ancestor's, in words (empty when they sound alike). */
export function compareMotifs(a, b) {
  const out = [];
  if (a.dev.inv !== b.dev.inv) out.push('turned upside down');
  if (a.dev.retro !== b.dev.retro) out.push('reversed');
  if (a.cell !== b.cell) out.push('a new rhythm');
  else if (a.dev.rot !== b.dev.rot) out.push('the rhythm shifted');
  const r = noteSeconds(b) / noteSeconds(a);
  if (r < 0.8) out.push('quicker'); else if (r > 1.25) out.push('slower');
  if (!a.dev.answer && b.dev.answer) out.push('a new answering phrase');
  else if (a.dev.answer && !b.dev.answer) out.push('its answer dropped');
  else if (a.dev.answer !== b.dev.answer) out.push('a new answer');
  if (!a.voice2 && b.voice2) out.push('a second voice');
  else if (a.voice2 && !b.voice2) out.push('down to one voice');
  if (!a.dev.grace && b.dev.grace) out.push('a grace note');
  if (!out.length) {
    const k = Math.min(a.seq.length, b.seq.length);
    let changed = Math.abs(a.seq.length - b.seq.length);
    for (let i = 0; i < k; i++) if (a.seq[i] !== b.seq[i]) changed++;
    if (changed) out.push(`${NUM[changed] || changed} note${changed === 1 ? '' : 's'} changed`);
  }
  return out;
}

/**
 * A rough distance between two motifs (0 same): rhythm, tempo, contour and intervals, so tests
 * and the gallery can measure how alike species sound.
 */
export function motifDistance(a, b) {
  const grid = (m) => { const g = new Float32Array(32); for (const nt of m.notes) g[Math.min(31, Math.floor((nt.at / m.cycle) * 32))] = 1; return g; };
  const ga = grid(a), gb = grid(b);
  let rh = 0;
  for (let i = 0; i < 32; i++) rh += Math.abs(ga[i] - gb[i]);
  rh /= Math.max(1, ga.reduce((s, x) => s + x, 0) + gb.reduce((s, x) => s + x, 0));
  const tempo = Math.abs(Math.log2(noteSeconds(a) / noteSeconds(b))) / 2;
  const iv = (m) => m.seq.slice(1).map((d, i) => d - m.seq[i]);
  const ia = iv(a), ib = iv(b), k = Math.max(ia.length, ib.length);
  let mel = 0;
  for (let i = 0; i < k; i++) mel += Math.min(4, Math.abs((ia[i] ?? 0) - (ib[i] ?? 0)));
  mel /= 4 * Math.max(1, k);
  const len = Math.abs(a.notes.length - b.notes.length) / Math.max(a.notes.length, b.notes.length);
  return rh + tempo + mel + 0.5 * len;
}
