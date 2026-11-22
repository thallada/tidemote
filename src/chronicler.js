// The chronicler: natural history written from what the simulation already keeps (docs/chronicler.md).
//
// It watches the census, the species ledger (SPL_* in shaders.js: each species' births and deaths by
// cause, who tried to eat whom among the watched species and how often they ate, and where each
// species' cells gather) and the climate's announcements, and now and then writes a sentence or two
// about something that truly happened: a post-mortem, an arms race, a boom and bust, a cycle between
// hunter and hunted, a lineage following the water's warmth, a reign's end, the last of a guild, what
// an event or an era did. It only reads; nothing it does touches the simulation.
//
// It speaks rarely. Every candidate story carries a score (how notable it is), and a budget refilled
// in simulated time (TUNE.storyEvery seconds a story, at most TUNE.storyCap in hand), a gap in real time (so a
// fast world does not flood the log) and cooldowns per kind and per species decide which, if any, is
// told. A story that loses its turn may wait a few minutes for the next.
//
// Pure: no DOM, no GPU. The page calls observe() on every census and note() on the climate's news,
// and pushes what they return into the log. Tested in test/chronicler.test.js.

import { dietGuild, mobilityGuild, growPlan, roleShares, affinity } from './genome.js';
import { fmtClock, esc, UM_PER_UNIT } from './fmt.js';
import { tr } from './i18n.js';
import { eraName } from './eraname.js';
import { MAXK, FIRST_LIFE, SPL_WATCH, SPL_CAUSE, SPL_CAUSES, SPL_PAIR, SPL_RANGE, DEFAULT_K } from './shaders.js';

const NC = SPL_CAUSES.length;
const C = Object.fromEntries(SPL_CAUSES.map((k, i) => [k, i])); // born, starved, old, eaten, scalded, stranded, cyst, woke
const MIN = 60;
// drop the entries of a time series ([t, ...] in order) from before t0, in one splice
const trim = (arr, t0) => { let k = 0; while (k < arr.length && arr[k][0] < t0) k++; if (k) arr.splice(0, k); };
const wrap01 = (d) => d - Math.round(d);

// How often the chronicler may speak, and when it may not.
export const TUNE = {
  storyEvery: 10 * MIN, // simulated seconds per story in the budget
  storyCap: 2, // stories it may hold in hand
  gapReal: 30000, // ms of real time between stories, however fast the world runs
  gapSim: 90, // simulated seconds between stories, however slow
  warm: 8 * MIN, // a new world's first minutes settle without comment (a collapse aside)
  need: 0.6, // the score a story needs while the budget holds one
  borrow: 0.85, // the score that may borrow against the next story
  wait: 5 * MIN, // how long a story that lost its turn may wait for the next
  kindGap: 8 * MIN, // the same kind of story at most this often
  subjectGap: 15 * MIN, // the same species at most this often
  sample: 10, // simulated seconds between samples of a species
  short: 20 * MIN, // how far back the fine samples reach
  long: 4 * 3600, // and the coarse ones (one a minute)
  voiceGap: 20 * MIN, // the world's voices (ears, bands) at most this often, all of them together
};

// The world's voices (detectVoices, detectEars): when enough of the living sing for a chorus, and how far it must fall
// for a quiet (founders sing at a third: a chorus is half, and the quiet a tenth, each held a while)
export const VOICE = {
  chorus: 0.5, // the share of the living that carry a song for a chorus
  arm: 0.4, // and under which it must have been before (a world that starts in chorus has not found its voice)
  hold: 3 * MIN, // how long a chorus or a quiet must hold before it is so
  quiet: 0.1, // the share of the living that sing, after a chorus, for a great quiet
  choir: 4, // the established species that must sing for a chorus, or for one voice to be told
  many: 0.15, // a band holding this share of the singers is one of the voices
  one: 0.92, // and one band holding this share of them, after two or more voices, is one voice
  band: 0.03, // a band's singers, of the living, for a band that is used (first used, or that falls silent after)
  offer: 20 * MIN, // how long a moment of the voices stays on offer while it holds
  ear: 0.3, // an ear's pull (or push, negative) for an ear drawn to (or shunning) a band
  meals: 40, // the meals between eater and eaten (the last 20 minutes, the watched pairs) to know who eats whom
};
const bandOf = (x) => Math.min(3, Math.max(0, Math.floor((x || 0) * 4)));
const BANDS = ['rumble', 'song', 'click', 'flash'];
// i18n: a signal band, inside a sentence ("sings in the Click band"); the four bands, low to high: rumble, song, click, flash
const bandWords = (b) => tr('chron.word.band', '{band, select, rumble {the Rumble band} song {the Song band} click {the Click band} other {the Flash band}}', { band: BANDS[b] });
// i18n: the same, beginning a sentence ("The Click band has fallen silent")
const bandWordsStart = (b) => tr('chron.word.band-start', '{band, select, rumble {The Rumble band} song {The Song band} click {The Click band} other {The Flash band}}', { band: BANDS[b] });
// a genome's song: [loudness, band] (loudness 0 when it does not sing); its alarm; its ear on a band
const songOf = (g) => [g.call?.[0] > 0 ? g.call[0] : 0, bandOf(g.call?.[1])];
const alarmOf = (g) => [g.call?.[2] > 0 ? g.call[2] : 0, bandOf(g.call?.[3])];
const earOf = (g, b) => g.ear?.[b] || 0;
const freshVoices = () => ({
  state: 'new', // new (not yet sampled), unarmed (in chorus from the start), armed, chorus, quiet
  hi: null, lo: null, // since when the singing share has been at a chorus's height, or down to a quiet's (null: it is not)
  again: false, // a chorus after a great quiet
  peak: null, // the chorus at its height: [t, share, living]
  singers: [], // the chorus's greatest singers (serials, at most 16)
  offers: [], // moments on offer: { what, t, ... } (at most one of each what and band)
  // per band: when its first established singer arose (-1: in the world's first minutes; null: none yet), whether its
  // first use is past (told, or there from the start), its singers' greatest share of the living since it was last
  // silent, and the most numerous singer then
  bandFirst: [null, null, null, null], bandDone: [false, false, false, false], bandPeak: [0, 0, 0, 0], bandTop: [0, 0, 0, 0],
  bandKinds: [0, 0, 0, 0], // and the most established species that sang in it at once since it was last silent
  oneAt: null, // since when one band has held nearly all the singers (null: it does not)
  many: 0, // the most voices (bands with VOICE.many of the singers) heard since one voice was last told
  marks: [], // every 5 minutes, the singers of weight: { t, sp: [[serial, band, pop]] } (the last hour)
  said: [], // [key, t] of the voices' stories told (the last 48)
  lastTold: -1e9,
});

// The stories are whole messages (docs/i18n.md): names, numbers and durations come in as arguments, the
// variants (guilds, causes, directions, turns of phrase) as selects on keys, and the logic reads only keys
// and numbers. A guild is one of these keys; a select on {guild} names a predator in its `other` branch.
const GUILDS = ['producer', 'grazer', 'scavenger', 'predator'];
// i18n: a count in words, inside a sentence ("no species", "seven cells"): twelve and under in words, more in figures
const numWord = (n) => tr('chron.word.num', '{n, select, 0 {no} 1 {one} 2 {two} 3 {three} 4 {four} 5 {five} 6 {six} 7 {seven} 8 {eight} 9 {nine} 10 {ten} 11 {eleven} 12 {twelve} other {{n, number}}}', { n });
// i18n: the same, beginning a sentence ("Seven cells from elsewhere were set down")
const numWordStart = (n) => tr('chron.word.num-start', '{n, select, 0 {No} 1 {One} 2 {Two} 3 {Three} 4 {Four} 5 {Five} 6 {Six} 7 {Seven} 8 {Eight} 9 {Nine} 10 {Ten} 11 {Eleven} 12 {Twelve} other {{n, number}}}', { n });
/** A span of simulated time in words: "40 seconds", "12 minutes", "1 hour 5 minutes". */
export function durWords(s) {
  s = Math.max(0, s);
  // i18n: a span of simulated time, inside a sentence ("after 40 seconds"): {n} seconds, a multiple of five
  if (s < 90) return tr('chron.dur.seconds', '{n, plural, other {# seconds}}', { n: Math.max(1, Math.round(s / 5) * 5) });
  const m = Math.round(s / 60);
  // i18n: a span of simulated time, inside a sentence ("for 12 minutes"): {n} minutes, from 2 to 59
  if (m < 60) return tr('chron.dur.minutes', '{n, plural, other {# minutes}}', { n: m });
  const h = Math.floor(m / 60), r = m % 60;
  // i18n: a span of simulated time, inside a sentence ("an hour 5 minutes", "3 hours"): {h} hours and {m} minutes
  return tr('chron.dur.hours', '{h, plural, one {an hour} other {{h} hours}}{m, plural, =0 {} one { # minute} other { # minutes}}', { h, m: r || 0 });
}
// a share's key: all, three_quarters, two_thirds, half, third, quarter, few
const shareKey = (f) => (f >= 0.9 ? 'all' : f >= 0.72 ? 'three_quarters' : f >= 0.6 ? 'two_thirds' : f >= 0.45 ? 'half'
  : f >= 0.3 ? 'third' : f >= 0.2 ? 'quarter' : 'few');
// i18n: a share of something, inside a sentence ("half of all that lives", "lost a third of its cells")
const shareText = (share) => tr('chron.word.share', '{share, select, all {nearly all} three_quarters {three quarters} two_thirds {two thirds} half {half} third {a third} quarter {a quarter} other {a few}}', { share });
/** A share in words: "nearly all", "three quarters", "half"... */
export function shareWords(f) {
  return shareText(shareKey(f));
}
// a list: "A and B", "A, B and C"
function andList(xs) {
  if (xs.length < 2) return xs.join('');
  // i18n: the last two items of a list ("A and B"; "A, B and C")
  let s = tr('chron.list.last', '{a} and {b}', { a: xs[xs.length - 2], b: xs[xs.length - 1] });
  // i18n: an item of a list of three or more before the rest of it ({b}: "B and C")
  for (let i = xs.length - 3; i >= 0; i--) s = tr('chron.list.more', '{a}, {b}', { a: xs[i], b: s });
  return s;
}
// i18n: two clauses of one sentence, one after the other ("A slept as cysts; B flourished")
const clauses = (xs) => xs.reduce((a, b) => tr('chron.list.clauses', '{a}; {b}', { a, b }));
// i18n: two sentences of a story, one after the other
const sentences = (xs) => xs.reduce((a, b) => tr('chron.join.sentences', '{a} {b}', { a, b }));
// the four quarters of the world's map, as on a slide (x east, y down the view, so south): a key
const compass = (x, y) => {
  const ns = y < 0.33 ? 'north' : y > 0.67 ? 'south' : '', ew = x < 0.33 ? 'west' : x > 0.67 ? 'east' : '';
  return ns && ew ? `${ns}_${ew}` : ns || ew || 'middle';
};
// i18n: a part of the pool, as on a map, inside a sentence ("to the north-west of the pool", "in the middle")
const quarterWords = (q) => tr('chron.word.quarter', '{q, select, north {north} south {south} east {east} west {west} north_east {north-east} north_west {north-west} south_east {south-east} south_west {south-west} other {middle}}', { q });
const heading = (dx, dy) => {
  const a = Math.atan2(dy, dx) * 180 / Math.PI; // y grows southward
  const dir = ['east', 'south_east', 'south', 'south_west', 'west', 'north_west', 'north', 'north_east'][((Math.round(a / 45) % 8) + 8) % 8];
  // i18n: a direction of travel, inside a sentence ("shifted 2 mm south-east", "pursued its quarry west across the pool")
  return tr('chron.word.heading', '{dir, select, east {east} south_east {south-east} south {south} south_west {south-west} west {west} north_west {north-west} north {north} other {north-east}}', { dir });
};
const lenWords = (u) => {
  const mm = (u * UM_PER_UNIT) / 1000;
  // i18n: a distance: {n} millimeters; {n} micrometers
  return mm >= 1 ? tr('chron.word.mm', '{n} mm', { n: mm.toFixed(mm >= 10 ? 0 : 1) }) : tr('chron.word.um', '{n} µm', { n: Math.round(mm * 1000) });
};

/**
 * How well a hunter's receptors fit a quarry's surface, as mealMissed in shaders.js weighs recognition
 * (its cell types by their share, against the quarry's first type's surface): -1..1.
 */
export function fitOf(h, q, K = DEFAULT_K) {
  const sh = roleShares(h);
  let f = 0;
  for (let r = 0; r < 3; r++) if (sh[r] > 0.001) f += sh[r] * affinity(h, r, q, 0, K);
  return f;
}

/** The world's firsts a species may bring, from its genome: [key] each (chron.first tells them). */
export function firstsOf(g, K = DEFAULT_K) {
  const out = [];
  out.push([`guild:${dietGuild(g)}`]);
  const multi = (g.adhesion || 0) > K.adhMin;
  if (multi) out.push(['multi']);
  if (multi && growPlan(g, K)) out.push(['tree']);
  if (multi && g.swim * (1 - g.photo) >= 0.8) out.push(['swimbody']);
  if ((g.calcify || 0) > 0.1) out.push(['calcify']);
  if ((g.thermo || 0) > 0.2) out.push(['heat']);
  if (K.heat && (g.topt ?? 19) > 38) out.push(['thermophile']);
  if (K.heat && (g.topt ?? 19) < 10) out.push(['cold']);
  if (roleShares(g).filter((v) => v > 0.1).length === 3) out.push(['types3']);
  return out;
}

/** A circular mean on the torus from summed (cos + 1) * 127 terms: [position 0..1, concentration 0..1]. */
function circ(sc, ss, n) {
  const c = sc / n / 127 - 1, s = ss / n / 127 - 1;
  const R = Math.hypot(c, s);
  return [((Math.atan2(s, c) / (2 * Math.PI)) + 1) % 1, R];
}

/**
 * createChronicler({ K, link, tune }):
 *   link(serial, name) -> html for a species' name (the page's spLink); tune overrides TUNE
 * Returns { observe, note, reset, watch, relations, latest, save, load }.
 */
export function createChronicler({ K = DEFAULT_K, link = (s, n) => esc(n), tune = {} } = {}) {
  const T = { ...TUNE, ...tune };
  let S;
  function reset() {
    S = {
      sp: new Map(), // serial -> stats
      pairs: new Map(), // h · 2^26 + q -> { h, q, bins: [[t, tries, meals]] } (one bin a minute, the last hour)
      watch: { version: 0, serials: new Array(SPL_WATCH).fill(0) },
      versions: new Map(), // watch map version -> serials by index
      prevPairs: null, prevVer: -1, prevSlot: null, prevCause: null,
      tokens: T.storyCap, lastStory: -1e9, lastReal: -1e9, lastTick: -1e9, slowNext: 0,
      told: new Map(), // kind -> t, "kind:key" -> t, "sp:serial" -> t
      pending: null, latest: new Map(), // serial -> { t, text }
      top: { serial: 0, since: 0 }, guilds: null, guildGone: {},
      firsts: new Set(), maxLiving: 0, collapsed: false, record: 0,
      eraMark: null, eventMark: null, excursion: null, genusMarks: [], stoneMarks: [],
      hand: null, handTold: [], wry: -1e9, // the hand's act waiting to be told; those told, [t, tool, wry]; its last wry line
      ext: [], // [t, serial] of established species lost, for waves of extinction
      voice: {}, // per kind, how many times it has spoken (vary: its turns of phrase take turns)
      song: freshVoices(), // the world's voices: chorus and quiet, its bands, the stories of them told
    };
  }
  reset();

  // ------------------------------------------------------------------ bookkeeping
  function track(sp) {
    if (!S.sp.has(sp.serial)) {
      S.sp.set(sp.serial, { serial: sp.serial, s: [], l: [], acc: new Array(NC).fill(0), cum: new Array(NC).fill(0), rng: [], diet: new Map(), eaters: new Map(), lastL: -1e9, reign: 0, low: null });
    }
  }
  // the sample nearest to t - ago (fine samples first, then coarse)
  function popAgo(st, t, ago) {
    const want = t - ago;
    const arr = ago <= T.short ? st.s : st.l;
    let best = null;
    for (const x of arr) if (x[0] <= want + T.sample) best = x; else break;
    return best ? best[1] : null;
  }
  // deaths and births in (t0, t1]: [born, starved, old, eaten, scalded, stranded, cyst, woke]
  function causesIn(st, t0, t1 = Infinity) {
    const out = new Array(NC).fill(0);
    for (const x of st.s) if (x[0] > t0 && x[0] <= t1) for (let i = 0; i < NC; i++) out[i] += x[2][i];
    return out;
  }
  function peakIn(st, t0) {
    let p = null;
    for (const x of st.s) if (x[0] >= t0 && (!p || x[1] > p[1])) p = x;
    return p;
  }
  // meals between species, by minute
  // keyed by both serials (as text: a world running for weeks takes serials past what one number holds)
  function pairOf(h, q) {
    const key = `${h}:${q}`;
    let p = S.pairs.get(key);
    if (!p) S.pairs.set(key, (p = { h, q, bins: [], fit: null }));
    return p;
  }
  function pairSum(p, t0, t1 = Infinity) {
    let tries = 0, meals = 0;
    for (const b of p.bins) if (b[0] > t0 && b[0] <= t1) { tries += b[1]; meals += b[2]; }
    return [tries, meals];
  }

  // The species the page should watch in the species ledger: the established, by numbers (consumers
  // weighted up: they are fewer, and they make the stories), each keeping its index while it lives.
  function chooseWatch(reg) {
    const W = S.watch;
    const alive = [];
    for (const sp of reg.values()) if (sp.alive && sp.established) alive.push(sp);
    const rank = new Map(alive.map((sp) => [sp, sp.pop * (dietGuild(sp.genome) === 'producer' ? 1 : 3)]));
    alive.sort((a, b) => rank.get(b) - rank.get(a));
    const keepTo = new Set(alive.slice(0, SPL_WATCH + 32).map((sp) => sp.serial));
    const want = alive.slice(0, SPL_WATCH).map((sp) => sp.serial);
    const next = W.serials.map((s) => (s && keepTo.has(s) ? s : 0));
    const have = new Set(next.filter(Boolean));
    let i = 0;
    for (const s of want) {
      if (have.has(s)) continue;
      while (i < next.length && next[i]) i++;
      if (i >= next.length) break;
      next[i] = s; have.add(s);
    }
    if (next.some((s, k) => s !== W.serials[k])) {
      W.version = (W.version + 1) >>> 0 || 1;
      W.serials = next;
      S.versions.set(W.version, next.slice());
      for (const v of S.versions.keys()) if (S.versions.size > 6 && v !== W.version) S.versions.delete(v);
    }
  }

  // the species ledger: per-slot causes (cumulative, zeroed when a slot is claimed), watched pairs, ranges
  function ingestSpl(spl, slotSerial, t) {
    // causes, by slot: a slot's counts belong to the species in it now; a new species' started at zero
    const cause = spl.subarray(SPL_CAUSE, SPL_CAUSE + MAXK * NC);
    if (S.prevCause) {
      for (let k = FIRST_LIFE; k < MAXK; k++) {
        const serial = slotSerial[k];
        if (!serial) continue;
        const st = S.sp.get(serial);
        if (!st) continue;
        const same = S.prevSlot[k] === serial;
        for (let i = 0; i < NC; i++) {
          const d = same ? (cause[k * NC + i] - S.prevCause[k * NC + i]) >>> 0 : cause[k * NC + i];
          if (d < 1e8) st.acc[i] += d;
        }
      }
    }
    S.prevCause = cause.slice();
    S.prevSlot = slotSerial.slice();
    // pairs, by watched index: counted only across an interval in which both indices kept their species
    const ver = spl[0], ser = S.versions.get(ver);
    const pairs = spl.subarray(SPL_PAIR, SPL_PAIR + SPL_WATCH * SPL_WATCH * 2);
    const prevSer = S.versions.get(S.prevVer);
    if (S.prevPairs && ser && prevSer) {
      const bin = Math.floor(t / MIN) * MIN;
      for (let a = 0; a < SPL_WATCH; a++) {
        const h = ser[a];
        if (!h || prevSer[a] !== h) continue;
        for (let b = 0; b < SPL_WATCH; b++) {
          const q = ser[b];
          if (!q || prevSer[b] !== q || q === h) continue;
          const o = (a * SPL_WATCH + b) * 2;
          const dt = (pairs[o] - S.prevPairs[o]) >>> 0, dm = (pairs[o + 1] - S.prevPairs[o + 1]) >>> 0;
          if (!dt || dt > 1e8) continue;
          const p = pairOf(h, q);
          const last = p.bins[p.bins.length - 1];
          if (last && last[0] === bin) { last[1] += dt; last[2] += dm; } else p.bins.push([bin, dt, dm]);
          const hs = S.sp.get(h), qs = S.sp.get(q);
          if (hs && dm) hs.diet.set(q, (hs.diet.get(q) || 0) + dm);
          if (qs && dm) qs.eaters.set(h, (qs.eaters.get(h) || 0) + dm);
        }
      }
    }
    S.prevPairs = pairs.slice();
    S.prevVer = ser ? ver : -1;
    // where each species is
    for (let k = FIRST_LIFE; k < MAXK; k++) {
      const o = SPL_RANGE + k * 5, n = spl[o + 4];
      if (n < 12) continue;
      const st = S.sp.get(slotSerial[k]);
      if (!st) continue;
      const [x, Rx] = circ(spl[o], spl[o + 1], n), [y, Ry] = circ(spl[o + 2], spl[o + 3], n);
      st.where = [t, x, y, Rx, Ry];
    }
  }

  // ------------------------------------------------------------------ the observation
  /**
   * obs: { t, now (ms, real), reg (serial -> species record), genera, living, stone, count, est,
   *   founders, slotSerial (Uint32Array by slot, or null), spl (the species ledger, or null),
   *   temp (the water's background), light (ambient), world: [W, H], event: { type, phase } | null,
   *   excursion (the heat wave or cold snap under way, or null), focus (a serial the viewer is looking at) }
   * Returns the stories to log now: [{ html, text, col, kind, key, moment, subjects, score }] (key and moment, where a story has them, tell it apart from others of its kind: 'first:multi', 'back').
   */
  function observe(obs) {
    const { t, reg } = obs;
    // species: their numbers, sampled every T.sample simulated seconds; between samples only the
    // species ledger is read (a census at real time costs next to nothing)
    const fresh = t - S.lastTick >= T.sample;
    if (!fresh && !obs.spl) return [];
    if (obs.living == null) { let living = 0; for (const sp of reg.values()) if (sp.alive) living += sp.pop; obs.living = living; }
    for (const sp of reg.values()) if (sp.established && (sp.alive || S.sp.has(sp.serial))) track(sp);
    if (obs.spl && obs.slotSerial) ingestSpl(obs.spl, obs.slotSerial, t);
    if (!S.eraMark && obs.era) S.eraMark = { t, name: obs.era, snap: snapshot(reg, obs.living) };
    // the watch list matters for the next copy of the species ledger: chosen as one arrives
    if (obs.spl || !S.watch.version) chooseWatch(reg);
    if (!fresh) return [];
    S.lastTick = t;
    for (const st of S.sp.values()) {
      const sp = reg.get(st.serial);
      const pop = sp && sp.alive ? sp.pop : 0;
      st.s.push([t, pop, st.acc]);
      for (let i = 0; i < NC; i++) st.cum[i] += st.acc[i];
      st.acc = new Array(NC).fill(0);
      trim(st.s, t - T.short);
      if (t - st.lastL >= MIN) { st.l.push([t, pop]); st.lastL = t; trim(st.l, t - T.long); }
      if (st.where && t - (st.rng.at(-1)?.[0] ?? -1e9) >= MIN) { st.rng.push(st.where); trim(st.rng, t - 40 * MIN); }
    }
    for (const p of S.pairs.values()) if (p.bins.length && p.bins[0][0] < t - 60 * MIN) trim(p.bins, t - 60 * MIN);
    // the candidates
    const cands = [];
    const add = (c) => { if (c && c.score > 0) cands.push(c); };
    for (const detect of FAST) detect(obs, add);
    if (S.eraMark?.pending) add(eraStory(obs));
    if (S.eventMark?.done) add(eventStory(obs));
    if (S.excursion && t > S.excursion.end) add(excursionStory(obs));
    if (S.hand) add(handStory(obs));
    // the slow detectors (minute-scale stories) take turns, one a sample, so no census pays for them all
    SLOW[S.slowNext++ % SLOW.length](obs, add);
    // forget the long dead
    for (const [serial] of S.sp) {
      const sp = reg.get(serial);
      if (!sp || (!sp.alive && t - (sp.extinct ?? t) > 30 * MIN)) S.sp.delete(serial);
    }
    for (const [k, p] of S.pairs) if (!p.bins.length) S.pairs.delete(k);
    // (and what was told of species the registry no longer holds)
    for (const serial of S.latest.keys()) if (!reg.has(serial)) { S.latest.delete(serial); S.told.delete(`sp:${serial}`); S.told.delete(`last:${serial}`); }
    return choose(cands, obs);
  }

  // ------------------------------------------------------------------ telling
  const toldAt = (key) => S.told.get(key) ?? -1e9;
  function choose(cands, obs) {
    const { t } = obs;
    const now = obs.now ?? 0;
    S.tokens = Math.min(T.storyCap, S.tokens + (t - (S.lastBudget ?? t)) / T.storyEvery);
    S.lastBudget = t;
    if (S.pending && t > S.pending.until) S.pending = null;
    if (S.pending) cands.push(S.pending);
    for (const c of cands) {
      // the viewer's own come first: a species they named, or the one they are looking at
      c.rank = c.score;
      for (const s of c.subjects || []) {
        const sp = obs.reg.get(s);
        if (sp && sp.given) c.rank += 0.15;
        if (obs.focus === s) c.rank += 0.05;
      }
    }
    // a species just written about waits (a weightier story only a while; a death, the end of its story, not at all)
    const subjectGap = (c) => (c.final ? T.subjectGap / 3 : c.rank >= 0.7 ? T.subjectGap / 3 : T.subjectGap);
    const ok = (c) => (c.force || t - toldAt(c.kind) >= T.kindGap)
      && (c.force || !(c.subjects || []).some((s) => t - toldAt(`sp:${s}`) < subjectGap(c)))
      && (!c.key || t - toldAt(c.key) >= (c.keyGap ?? 30 * MIN));
    const live = cands.filter(ok).sort((a, b) => b.rank - a.rank);
    T.debug?.(t, cands, live);
    if (!live.length) return [];
    const best = live[0];
    const settling = t < T.warm && !best.force;
    const gapOk = now - S.lastReal >= T.gapReal && t - S.lastStory >= T.gapSim;
    const afford = S.tokens >= 1 ? best.rank >= T.need : best.rank >= T.borrow && S.tokens > -1;
    if (settling || !afford) return [];
    if (!gapOk) {
      if (best.rank >= 0.6 && best !== S.pending && (!S.pending || best.rank > S.pending.rank)) S.pending = { ...best, until: t + T.wait };
      return [];
    }
    S.pending = null;
    S.tokens -= 1;
    S.lastStory = t; S.lastReal = now;
    S.told.set(best.kind, t);
    S.voice[best.kind] = (S.voice[best.kind] || 0) + 1;
    if (best.key) S.told.set(best.key, t);
    for (const s of best.subjects || []) { S.told.set(`sp:${s}`, t); S.told.set(`last:${s}`, best.kind); }
    const text = best.html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    for (const s of best.subjects || []) S.latest.set(s, { t, text, html: best.html });
    best.onTold?.();
    return [{ html: best.html, text, col: best.col, kind: best.kind, key: best.key, moment: best.moment, subjects: best.subjects || [], score: best.score }];
  }

  // ------------------------------------------------------------------ helpers for the stories
  // the narrator's turns of phrase for a kind of story, one after another, so the same words do not come every
  // time: which of its n turns (0..n-1) a story of this kind takes now (the next once one is told: choose; a story
  // weighed and not told, or weighed again until it is, takes none)
  const vary = (kind, n) => (S.voice[kind] || 0) % n;
  // i18n: in place of a species' name, when its record is gone
  const L = (reg, serial) => { const sp = reg.get(serial); return sp ? link(serial, sp.name) : tr('chron.word.unrecorded', 'an unrecorded species'); };
  // i18n: the same, beginning a sentence
  const Lstart = (reg, serial) => { const sp = reg.get(serial); return sp ? link(serial, sp.name) : tr('chron.word.unrecorded-start', 'An unrecorded species'); };
  const guildOf = (sp) => dietGuild(sp.genome);
  const descendants = (reg, serial) => {
    const out = [];
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established || sp.serial === serial) continue;
      let a = sp.ancestor, n = 0;
      while (a && n++ < 200) { if (a === serial) { out.push(sp); break; } a = reg.get(a)?.ancestor; }
    }
    return out.sort((a, b) => b.pop - a.pop);
  };
  const genusAlive = (reg, genus) => { for (const sp of reg.values()) if (sp.alive && sp.genus === genus) return true; return false; };
  const genusCount = (reg, genus) => { let n = 0; for (const sp of reg.values()) if (sp.genus === genus && sp.established) n++; return n; };
  const topBy = (m) => { let k = null, v = 0, sum = 0; for (const [a, b] of m) { sum += b; if (b > v) { v = b; k = a; } } return [k, v, sum]; };

  // why a species is dwindling (or went): the deaths that took it over [t0, t], read against its
  // hunters, its food and the water. Returns { why (chron.why's key), cause, by, and what its words need }.
  function whyDeclined(ctx, sp, st, t0) {
    const { reg, t } = ctx;
    const c = causesIn(st, t0, t);
    const deaths = c[C.starved] + c[C.old] + c[C.eaten] + c[C.scalded] + c[C.stranded];
    if (deaths < 8) return null;
    const share = (i) => c[i] / deaths;
    const births = c[C.born];
    const before = causesIn(st, t0 - (t - t0), t0)[C.born];
    const guild = guildOf(sp);
    const ev = ctx.event;
    // its hunters over the stretch
    const eaters = new Map();
    for (const p of S.pairs.values()) if (p.q === sp.serial) { const [, m] = pairSum(p, t0, t); if (m) eaters.set(p.h, m); }
    const [eater, em, esum] = topBy(eaters);
    if (share(C.eaten) >= 0.45) {
      if (eater && em >= 0.4 * esum && reg.get(eater)) {
        const eg = guildOf(reg.get(eater));
        const verb = guild === 'producer' ? 'grazed' : eg === 'predator' ? 'hunted' : 'eaten';
        return { cause: 'eaten', by: eater, why: 'eaten_by', verb, who: L(reg, eater) };
      }
      return { cause: 'eaten', why: guild === 'producer' ? 'grazed_away' : 'devoured' };
    }
    if (share(C.stranded) >= 0.35) {
      return { cause: 'stranded', why: ev?.type === 'frost' ? 'ice' : ev?.type === 'drought' ? 'mud' : 'shallows' };
    }
    if (share(C.scalded) >= 0.35) {
      const g = sp.genome;
      return ctx.excursion && ctx.excursion.dT > 0 ? { cause: 'scalded', why: 'fever' } : { cause: 'scalded', why: 'scalded', temp: Math.round(ctx.temp), topt: Math.round(g.topt) };
    }
    if (share(C.starved) >= 0.4) {
      if (guild === 'producer') {
        if (ev?.type === 'duckweed') return { cause: 'starved', why: 'duckweed' };
        if (ev?.type === 'storm' || ev?.type === 'frost') return { cause: 'starved', why: 'dark' };
        if ((ctx.light ?? 1) < 0.16) return { cause: 'starved', why: 'light_failing' };
        return { cause: 'starved', why: 'light_taken' };
      }
      // its food: what it ate before the decline
      const [food, fm, fsum] = topBy(st.diet);
      const fsp = food && reg.get(food);
      if (fsp && fm >= 0.35 * fsum) {
        if (!fsp.alive) return { cause: 'starved', by: food, why: 'food_gone', who: L(reg, food) };
        const fst = S.sp.get(food);
        const was = fst && popAgo(fst, t, t - t0 + 5 * MIN);
        if (was && fsp.pop < 0.5 * was) return { cause: 'starved', by: food, why: 'food_dwindled', who: L(reg, food) };
        return { cause: 'starved', by: food, why: 'food_endured', who: L(reg, food) };
      }
      return { cause: 'starved', why: guild === 'grazer' ? 'meadows' : guild === 'scavenger' ? 'no_dead' : 'no_prey' };
    }
    if (share(C.old) >= 0.4 && births < 0.4 * Math.max(1, before)) {
      // a rival of its own guild, rising
      let rival = null, gain = 0;
      for (const o of reg.values()) {
        if (!o.alive || !o.established || o.serial === sp.serial || guildOf(o) !== guild) continue;
        const ost = S.sp.get(o.serial);
        const was = ost && popAgo(ost, t, t - t0);
        if (was != null && o.pop - was > gain && o.pop > 2 * was) { gain = o.pop - was; rival = o; }
      }
      return rival ? { cause: 'old', by: rival.serial, why: 'outbred', who: L(reg, rival.serial) } : { cause: 'old', by: undefined, why: 'aged' };
    }
    return null;
  }
  // i18n: what befell a species: the rest of a sentence whose subject is the species ("It {why}." in an
  // i18n: obituary or a crash, "...is ended: it {why}" in a reign's end). {who}: the species that ate it, its food, or its rival (a link); {temp}: how warm the water grew, {topt}: what it was made for (°C); other: aged
  const whyText = (w) => tr('chron.why', '{why, select,eaten_by {was {verb, select,grazed {grazed down}hunted {hunted down}other {eaten}} by {who}, which pursued it without rest}grazed_away {was grazed away by many mouths at once}devoured {was devoured by many hunters at once}ice {was taken by the ice}mud {was left to perish upon the mud as the water fled}shallows {was stranded in the shallows}fever {perished in the fever of the heat wave}scalded {was scalded, the water grown to {temp}° though it was made for {topt}°}duckweed {starved in the shadow of the duckweed}dark {starved beneath a sky that gave no light}light_failing {starved in the failing light}light_taken {starved, its place in the light taken by others}food_gone {starved when {who}, the food it lived on, vanished from the pool}food_dwindled {starved as {who}, upon which it fed, dwindled away}food_endured {starved, though {who}, its food, endured}meadows {starved as the meadows thinned}no_dead {starved, for even the dead grew scarce}no_prey {starved for want of prey}outbred {was outbred, it would seem, by {who}; it ceased to divide, and its cells grew old and died}other {ceased to divide, and its cells grew old and died}}',
    { why: w.why, verb: w.verb, who: w.who, temp: w.temp, topt: w.topt });

  // ------------------------------------------------------------------ detectors
  // Life all but gone, and life come back.
  function detectCollapse(ctx, add) {
    const { t, living } = ctx;
    if (living > S.maxLiving) { S.maxLiving = living; S.maxAt = t; }
    if (!S.collapsed && S.maxLiving >= 2000 && living < 0.03 * S.maxLiving) {
      S.collapsed = { t, low: living };
      add({ kind: 'collapse', force: true, score: 1, col: 0xff6a6aff,
        // i18n: {max}: the most cells that ever lived at once; {at}: when, on the world's clock (1:23:45); {left}: how many live now
        html: tr('chron.collapse.fell', '<b>Life has all but failed.</b> Of the {max, number} cells that lived at {at}, {left, number} remain; from these few, or from the silt itself, whatever comes next must be made.', { max: S.maxLiving, at: fmtClock(S.maxAt), left: living }) });
    } else if (S.collapsed) {
      S.collapsed.low = Math.min(S.collapsed.low, living);
      if (living >= 0.25 * S.maxLiving) {
        const top = [...ctx.reg.values()].filter((s) => s.alive && s.established).sort((a, b) => b.pop - a.pop)[0];
        const since = S.collapsed.t;
        S.collapsed = false;
        add({ kind: 'collapse', force: true, score: 0.8, moment: 'back', col: 0xff7fe0b0, subjects: top ? [top.serial] : [],
          // i18n: {n}: the cells living now (hundreds at least); {dur}: how long since life all but failed (chron.dur.*); {name}: the most numerous species (a link), when {first} is yes
          html: tr('chron.collapse.back', '<b>Life has returned</b>, as it returns to all who wait: {n, plural, other {# cells}}, {dur} after it fell to almost nothing{first, select, yes {, and {name} the first among them} other {}}.',
            { n: living, dur: durWords(t - since), first: top ? 'yes' : 'no', name: top ? L(ctx.reg, top.serial) : '' }) });
      }
    }
  }

  // The last of a guild gone, and a guild's return.
  function detectGuilds(ctx, add) {
    const { reg, t, living } = ctx;
    const cells = { producer: 0, grazer: 0, scavenger: 0, predator: 0 }, last = {};
    for (const sp of reg.values()) {
      if (!sp.alive) continue;
      const g = guildOf(sp);
      cells[g] += sp.pop;
      if (sp.established && (!last[g] || sp.pop > last[g].pop)) last[g] = sp;
    }
    const prev = S.guilds;
    S.guilds = { cells, t, last, peak: prev ? Object.fromEntries(Object.keys(cells).map((g) => [g, Math.max(cells[g], (prev.peak[g] || 0) * (t - prev.t > 600 ? 0.9 : 1))])) : cells };
    if (!prev) return;
    for (const g of Object.keys(cells)) {
      const had = S.guilds.peak[g] >= Math.max(50, 0.005 * living);
      if (prev.cells[g] > 0 && cells[g] === 0 && had && !S.guildGone[g]) {
        S.guildGone[g] = t;
        const lastSp = prev.last[g];
        add({ kind: 'guild', force: true, score: 0.95, col: 0xffff5e7a, subjects: lastSp ? [lastSp.serial] : [],
          html: lastSp
            // i18n: the last of a guild died out: {guild} (other: predator); {name}: the last species of it (a link)
            ? tr('chron.guild.gone-last', '<b>The last {guild, select,producer {producer}grazer {grazer}scavenger {scavenger}other {predator}} is gone.</b> With {name} perished, {guild, select,producer {nothing in the pool lives on light any longer}grazer {no mouth in all the pool now crops the meadows}scavenger {the dead lie where they fall, and none comes to take them}other {nothing hunts, and the hunted may at last rest}}.', { guild: g, name: L(reg, lastSp.serial) })
            // i18n: the last of a guild died out: {guild} (other: predator), its last species unknown
            : tr('chron.guild.gone', '<b>The last {guild, select,producer {producer}grazer {grazer}scavenger {scavenger}other {predator}} is gone.</b> {guild, select,producer {Nothing in the pool lives on light any longer}grazer {No mouth in all the pool now crops the meadows}scavenger {The dead lie where they fall, and none comes to take them}other {Nothing hunts, and the hunted may at last rest}}.', { guild: g }) });
      } else if (S.guildGone[g] && last[g] && cells[g] > 0) {
        const since = S.guildGone[g];
        delete S.guildGone[g];
        if (t - since < 5 * MIN) continue;
        const sp = last[g], anc = sp.ancestor && reg.get(sp.ancestor);
        const origin = sp.founder ? 'spark' : anc ? 'descent' : 'unknown';
        add({ kind: 'guild', score: 0.75, moment: 'back', col: 0xff7fe0b0, subjects: [sp.serial],
          // i18n: a guild come back after dying out: {guild} (other: predator); {name}: the first species of it again (a link), sprung from silt,
          // i18n: descended from {ancestor} (a link) of guild {ancestorGuild}, or of unknown origin; {since}: when the guild died out, on the world's clock
          html: tr('chron.guild.back', '<b>{guild, select,producer {Producers}grazer {Grazers}scavenger {Scavengers}other {Predators}} are back.</b> {name}, {origin, select,spark {sparked from silt}descent {descended from {ancestor}, {ancestorGuild, select,producer {a producer}grazer {a grazer}scavenger {a scavenger}other {a predator}}}other {of unrecorded ancestry}}, is the first {guild, select,producer {producer}grazer {grazer}scavenger {scavenger}other {predator}} the pool has known since {since}; what is lost is seldom lost for ever.',
            { guild: g, name: L(reg, sp.serial), origin, ancestor: anc ? L(reg, anc.serial) : '', ancestorGuild: anc ? guildOf(anc) : '', since: fmtClock(since) }) });
      }
    }
  }

  // Post-mortems, the end of a genus, and waves of extinction.
  function detectExtinctions(ctx, add) {
    const { reg, t } = ctx;
    for (const [serial, st] of S.sp) {
      const sp = reg.get(serial);
      if (!sp || sp.alive || st.gone) continue;
      st.gone = t;
      const life = (sp.extinct ?? t) - (sp.born || 0);
      const peakShare = st.peakShare || 0;
      const reigned = st.reign || 0;
      // the end of a genus that lasted: four species or more over half an hour
      const gen = ctx.genera?.get(sp.genus);
      const genusEnds = !genusAlive(reg, sp.genus) && genusCount(reg, sp.genus) >= 4 && t - (gen?.born ?? t) >= 30 * MIN;
      // a species of some weight: a fiftieth of the living at its height
      if (sp.peak >= 3 * ctx.est && peakShare >= 0.02) S.ext.push([t, serial]);
      const notable = sp.peak >= 3 * ctx.est && ((peakShare >= 0.02 && life >= 20 * MIN) || (peakShare >= 0.08 && life >= 12 * MIN) || reigned >= 5 * MIN || sp.given || genusEnds);
      if (!notable) continue;
      // its decline: from its last peak (within twenty minutes) to its end
      const pk = peakIn(st, t - 20 * MIN);
      const t0 = Math.min(pk ? pk[0] : t - 10 * MIN, t - 3 * MIN);
      const why = whyDeclined(ctx, sp, st, t0);
      const bits = [];
      // i18n: why a species died ({why}: chron.why), in its obituary
      if (why) bits.push(tr('chron.obit.why', 'It {why}.', { why: whyText(why) }));
      // a hunter it outlived
      const [hunter, hm, hsum] = topBy(st.eaters);
      const hsp = hunter && reg.get(hunter);
      if (hsp && !hsp.alive && hm >= 0.25 * hsum && hsp.extinct && hsp.extinct < t - MIN && why?.by !== hunter) {
        // i18n: in an obituary: {name}, a species that hunted the dead one and died out before it (a link)
        bits.push(tr('chron.obit.hunter-gone', '{name} had hunted it, and went before it to the grave.', { name: L(reg, hunter) }));
      }
      const kids = descendants(reg, serial);
      // i18n: in an obituary: {genus}, the genus's name; {count}: how many species it had, in words (chron.word.num; {n} as a number)
      if (genusEnds) { const n = genusCount(reg, sp.genus); bits.push(tr('chron.obit.genus-end', 'With it the genus <b>{genus}</b> comes to an end, after {count} species.', { genus: esc(sp.genus), count: numWord(n), n })); }
      // i18n: in an obituary: {name}, its most numerous living descendant (a link); {others}: how many more there are ({count} in words)
      else if (kids.length) bits.push(tr('chron.obit.line', 'Yet its line endures in {name}{others, plural, =0 {} one { and {count} other} other { and {count} others}}.', { name: L(reg, kids[0].serial), others: kids.length - 1, count: numWord(kids.length - 1) }));
      // i18n: an obituary's first sentence: {name}, the species (a link); {life}: how long it lived; {reign}: how long of that it was the most numerous, when {reigned} is yes
      const head = tr('chron.obit.head', '{name} is no more, after {life} of life{reigned, select,yes {, {reign} of that as the most numerous species in the pool}other {}}.',
        { name: L(reg, serial), life: durWords(life), reigned: reigned >= 10 * MIN ? 'yes' : 'no', reign: durWords(reigned) });
      // its crash told lately, its death adds little
      const lately = t - toldAt(`sp:${serial}`) < 20 * MIN && S.told.get(`last:${serial}`) === 'crash';
      const score = 0.5 + (reigned >= 10 * MIN ? 0.2 : 0) + 0.15 * Math.min(1, life / 3600) + 0.15 * Math.min(1, peakShare / 0.2) + (genusEnds ? 0.1 : 0) + (why ? 0.05 : -0.1) - (lately ? 0.25 : 0);
      add({ kind: 'obit', score, col: sp.genome.col, subjects: [serial], key: `obit:${serial}`, final: true,
        html: sentences([head, ...bits]).trim() });
    }
    // a wave of extinctions: species of weight lost at three times the pace of the hour before
    S.ext = S.ext.filter(([x]) => x > t - 70 * MIN);
    const recent = S.ext.filter(([x]) => x > t - 10 * MIN), lost = recent.length;
    const base = (S.ext.length - lost) / 6;
    let weighty = 0;
    for (const sp of reg.values()) if (sp.alive && sp.established && (S.sp.get(sp.serial)?.peakShare || 0) >= 0.02) weighty++;
    if (t >= 30 * MIN && lost >= Math.max(5, 0.3 * (weighty + lost), 3 * base) && t - toldAt('mass') >= 20 * MIN) {
      const named = recent.map(([, s]) => reg.get(s)).filter(Boolean).sort((a, b) => b.peak - a.peak).slice(0, 2).map((sp) => L(reg, sp.serial));
      const ev = ctx.event || (S.eventMark && t - (S.eventMark.end ?? t) < 10 * MIN ? S.eventMark : null);
      add({ kind: 'mass', score: 0.9, col: 0xffff5e7a, subjects: [], force: true,
        // i18n: a wave of extinctions: {event}, the pool's event under way or just past (other: none); {count}: how many species of weight died out, in words ({n} as a number);
        // i18n: {named}: the greatest one or two of them, links in a list (chron.list.*), when {some} is yes
        html: tr('chron.mass', '{event, select, drought {In ten minutes the drought has killed off {count} species} storm {In ten minutes the storm has carried off {count} species} frost {In ten minutes the frost has killed off {count} species} duckweed {In ten minutes the duckweed’s shade has killed off {count} species} other {<b>A great dying.</b> In ten minutes {count} species have perished}}{some, select, yes {, {named} among them} other {}}.',
          { event: ev ? ev.type : '', count: numWord(lost), n: lost, some: named.length ? 'yes' : 'no', named: andList(named) }) });
    }
  }

  // The most numerous species: a long reign, and its end.
  function detectReign(ctx, add) {
    const { reg, t, living } = ctx;
    let best = null;
    for (const sp of reg.values()) if (sp.alive && sp.established && (!best || sp.pop > best.pop)) best = sp;
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established) continue;
      const st = S.sp.get(sp.serial);
      if (st && living > 0) st.peakShare = Math.max(st.peakShare || 0, sp.pop / living);
    }
    const R = S.top;
    const cur = reg.get(R.serial);
    if (!best) return;
    if (!cur || !cur.alive || (best.serial !== R.serial && best.pop > cur.pop * 1.25)) {
      const was = cur && R.serial ? { serial: R.serial, len: t - R.since } : null;
      S.top = { serial: best.serial, since: t, marks: 0 };
      if (was && was.len >= 20 * MIN && t > T.warm) {
        const wst = S.sp.get(was.serial);
        const why = cur && cur.alive && wst ? whyDeclined(ctx, cur, wst, t - 10 * MIN) : null;
        add({ kind: 'reign', score: 0.55 + Math.min(0.3, was.len / 7200), col: best.genome.col, subjects: [was.serial, best.serial],
          // i18n: the most numerous species overtaken: {dur}, how long it was; {name}: it (a link); {why}: what befell it (chron.why), when {fell} is yes;
          // i18n: {next}: the new most numerous (a link); {kind}: what that is (chron.word.kind)
          html: tr('chron.reign.ended', 'After {dur}, the reign of {name} is ended{fell, select, yes {: it {why}} other {}}. {next}, {kind}, now holds the pool.',
            { dur: durWords(was.len), name: L(reg, was.serial), fell: why ? 'yes' : 'no', why: why ? whyText(why) : '', next: L(reg, best.serial), kind: kindWords(kindOf(best)) }) });
      }
      return;
    }
    const st = S.sp.get(R.serial);
    if (st) st.reign = t - R.since;
    const len = t - R.since, marks = [3600, 7200, 14400, 28800];
    const m = marks.findIndex((x) => len < x);
    const passed = m < 0 ? marks.length : m;
    if (passed > (R.marks || 0)) {
      R.marks = passed;
      const share = shareKey(cur.pop / Math.max(1, living));
      add({ kind: 'reign', score: 0.35 + 0.05 * passed, col: cur.genome.col, subjects: [R.serial], key: `reign:${R.serial}:${passed}`,
        // i18n: a long reign: {dur}, how long; {name}, the most numerous species (a link); {part}: its share of the living (chron.word.share), or when only a few, {n} cells
        html: tr('chron.reign.held', 'For {dur} {name} has held the pool, {share, select, few {{n, plural, other {# cells strong}}} other {{part} of all that lives}}; few reigns last so long.',
          { dur: durWords(len), name: L(reg, R.serial), share, n: cur.pop, part: shareText(share) }) });
    }
  }
  // what a species is, by how it moves, its body and its diet: keys for chron.word.kind and chron.word.kinds
  const kindOf = (sp) => {
    const g = sp.genome, mob = mobilityGuild(g);
    return { how: mob === 'sessile' || mob === 'swimmer' || mob === 'drifter' ? mob : 'crawler', multi: (g.adhesion || 0) > K.adhMin ? 'yes' : 'no', guild: dietGuild(g) };
  };
  // i18n: what a species is, inside a sentence: "a drifting producer", "an anchored many-celled hunter" ({how}: sessile is anchored, other crawling; {guild} other: predator)
  const kindWords = (k) => tr('chron.word.kind', '{how, select, sessile {an anchored} swimmer {a swimming} drifter {a drifting} other {a crawling}} {multi, select, yes {multicellular } other {}}{guild, select, producer {producer} grazer {grazer} scavenger {scavenger} other {predator}}', { how: k.how, multi: k.multi, guild: k.guild });
  // i18n: the same, of many, without an article: "from drifting producers to anchored many-celled hunters"
  const kindsWords = (k) => tr('chron.word.kinds', '{how, select, sessile {anchored} swimmer {swimming} drifter {drifting} other {crawling}} {multi, select, yes {multicellular } other {}}{guild, select, producer {producers} grazer {grazers} scavenger {scavengers} other {predators}}', { how: k.how, multi: k.multi, guild: k.guild });

  // Crashes, booms and comebacks of single species.
  function detectSwings(ctx, add) {
    const { reg, t, living, est } = ctx;
    if (t < T.warm) return;
    for (const st of S.sp.values()) {
      const sp = reg.get(st.serial);
      if (!sp || !sp.alive || !sp.established) continue;
      // every swing told is of a species of some weight (a crash from 2% of the living, a boom to 5%, a comeback from 1.5%)
      if ((st.peakShare || 0) < 0.015 && sp.pop < 0.01 * living && !st.low) continue;
      const pk = peakIn(st, t - 15 * MIN);
      if (!pk) continue;
      // a crash: down to a quarter or less of a big peak within ten minutes, a peak near the highest it has
      // known this hour (a species that booms and busts every few minutes is cycling, not crashing)
      const high = st.l.reduce((m, x) => (x[0] >= t - 60 * MIN ? Math.max(m, x[1]) : m), 0);
      if (pk[1] >= Math.max(4 * est, 0.02 * living) && pk[1] >= 0.8 * high && sp.pop <= 0.25 * pk[1] && t - pk[0] <= 10 * MIN && st.crashed !== pk[0]) {
        st.crashed = pk[0];
        const why = whyDeclined(ctx, sp, st, pk[0]);
        // meadows boom and bust as grazers find them: only the great ones are news
        const share = pk[1] / Math.max(1, living);
        add({ kind: 'crash', score: 0.4 + 0.25 * Math.min(1, share / 0.2) + (why ? 0.05 : 0) - (guildOf(sp) === 'producer' ? 0.05 : 0), col: sp.genome.col, subjects: [sp.serial], key: `crash:${sp.serial}`, keyGap: 60 * MIN,
          // i18n: a species crashed: {turn}, the narrator's turn of phrase (they take turns); {dur}: in how long; {name}: the species (a link); {from}, {to}: its cells then and now;
          // i18n: {why}: what befell it (chron.why), when {fell} is yes
          html: tr('chron.crash', '{turn, select, 0 {How swiftly fortune turns:} 1 {Greatness is a brief thing here:} other {The pool gives, and the pool takes:}} in {dur} {name} has gone from {from, plural, other {# cells}} to {to, number}.{fell, select, yes { It {why}.} other {}}',
            { turn: vary('crash', 3), dur: durWords(t - pk[0]), name: L(reg, sp.serial), from: pk[1], to: sp.pop, fell: why ? 'yes' : 'no', why: why ? whyText(why) : '' }) });
      }
      // near extinction: remember the low, and its recovery
      if (st.low && t - st.low.t > 40 * MIN) st.low = null;
      if (pk[1] >= Math.max(4 * est, 0.015 * living) && sp.pop <= Math.max(3, 0.05 * pk[1]) && (!st.low || sp.pop < st.low.n)) st.low = { n: sp.pop, t, peak: pk[1] };
      if (st.low && sp.pop >= 0.5 * st.low.peak && sp.pop >= 3 * est && t - st.low.t >= 2 * MIN) {
        const c = causesIn(st, st.low.t - 2 * MIN, t);
        const slept = c[C.woke] > 0.3 * sp.pop;
        add({ kind: 'comeback', score: 0.65, col: sp.genome.col, subjects: [sp.serial], key: `back:${sp.serial}`, keyGap: 40 * MIN,
          // i18n: a species nearly gone has recovered: {name} (a link); {low}: its fewest cells, at {at} on the world's clock; {now}: its cells now; {woke}: yes when cysts woke to save it; {turn}: the closing line (they take turns)
          html: tr('chron.comeback', '<b>Back from the brink.</b> {name}, brought down to {low, plural, one {# cell} other {# cells}} at {at}, now numbers {now, number}{woke, select, yes {, its sleeping cysts having woken to save it} other {}}. {turn, select, 0 {Those who can wait are seldom wholly lost.} 1 {It was given up for gone, and was not.} other {Patience has served it well.}}',
            { name: L(reg, sp.serial), low: st.low.n, at: fmtClock(st.low.t), now: sp.pop, woke: slept ? 'yes' : 'no', turn: vary('comeback', 3) }) });
        st.low = null;
      }
      // a boom: five times its numbers ten minutes ago, to a new height and a twentieth of the living
      const was = popAgo(st, t, 10 * MIN);
      const hist = st.l.reduce((m, x) => (x[0] < t - 10 * MIN ? Math.max(m, x[1]) : m), 0);
      if (was != null && was > 0 && sp.pop >= 5 * was && sp.pop >= 0.05 * living && sp.pop >= 10 * est && sp.pop > 1.5 * hist) {
        const [food, fm, fsum] = topBy(st.diet);
        const feasts = food && fm >= 0.4 * fsum && reg.get(food);
        add({ kind: 'boom', score: 0.45 + 0.2 * Math.min(1, sp.pop / living / 0.25), col: sp.genome.col, subjects: [sp.serial], key: `boom:${sp.serial}`,
          // i18n: a species booming: {turn}, the narrator's turn of phrase (they take turns); {name}: the species (a link); {food}: what it eats most (a link), when {feasts} is yes; {was}, {now}: its cells then and now
          html: tr('chron.boom', '{turn, select, 0 {Fortune smiles upon} 1 {The tide has turned for} other {These are good days for}} {name}{feasts, select, yes {, which feasts upon {food}} other {}}: {was, plural, other {# cells}} ten minutes ago, {now, number} now.',
            { turn: vary('boom', 3), name: L(reg, sp.serial), feasts: feasts ? 'yes' : 'no', food: feasts ? L(reg, food) : '', was, now: sp.pop }) });
      }
    }
  }

  // The world's firsts.
  function detectFirsts(ctx, add) {
    const { reg, t } = ctx;
    for (const sp of reg.values()) {
      if (!sp.established || !sp.alive) continue;
      const st = S.sp.get(sp.serial);
      if (!st || st.firstsDone) continue;
      st.firstsDone = true;
      for (const [key] of firstsOf(sp.genome, K)) {
        if (S.firsts.has(key)) continue;
        S.firsts.add(key);
        // a world's first minutes set what it starts with
        if (t < 3 * MIN) continue;
        add({ kind: 'first', score: key === 'multi' || key === 'guild:predator' ? 0.75 : 0.65, col: sp.genome.col, subjects: [sp.serial], key: `first:${key}`, keyGap: Infinity,
          // i18n: a world's first: {name}, the species (a link); {what}: what it is the first of (other: three kinds of cell)
          html: tr('chron.first', '<b>Never before in this world:</b> {name} is the first {what, select,guild_producer {species to live on light}guild_grazer {species to graze}guild_scavenger {species to live on the dead}guild_predator {species to hunt living prey}multi {multicellular organism}tree {species to grow as a branching tree}swimbody {multicellular body that swims}calcify {species to build reef stone}heat {heat-maker, warming the water around it}thermophile {thermophile, at home in water above 38°}cold {cold-lover, at home in water below 10°}other {species to grow three kinds of cell}}.',
            { name: L(reg, sp.serial), what: key.replace(':', '_') }) });
      }
    }
  }

  // Arms races: a hunter genus losing (or finding) its grip on a prey genus as their signatures drift.
  function detectArms(ctx, add) {
    const { reg, t } = ctx;
    if (t < 25 * MIN) return;
    const G = new Map(); // "hg|qg" -> { a: [tries, meals, fitSum], b: [...], h: Map, q: Map }
    for (const p of S.pairs.values()) {
      const h = reg.get(p.h), q = reg.get(p.q);
      if (!h || !q || h.genus === q.genus) continue;
      const key = `${h.genus}|${q.genus}`;
      let g = G.get(key);
      if (!g) G.set(key, (g = { hg: h.genus, qg: q.genus, a: [0, 0, 0], b: [0, 0, 0], hb: new Map(), qb: new Map(), hguild: guildOf(h), qguild: guildOf(q) }));
      const fit = p.fit ?? (p.fit = fitOf(h.genome, q.genome, K));
      const [ta, ma] = pairSum(p, t - 20 * MIN, t - 10 * MIN), [tb, mb] = pairSum(p, t - 6 * MIN, t);
      g.a[0] += ta; g.a[1] += ma; g.a[2] += ta * fit;
      g.b[0] += tb; g.b[1] += mb; g.b[2] += tb * fit;
      if (tb) { g.hb.set(p.h, (g.hb.get(p.h) || 0) + tb); g.qb.set(p.q, (g.qb.get(p.q) || 0) + tb); }
    }
    for (const g of G.values()) {
      if (g.a[0] < 150 || g.b[0] < 150 || g.hguild === 'scavenger') continue;
      const ra = g.a[1] / g.a[0], rb = g.b[1] / g.b[0];
      const fa = g.a[2] / g.a[0], fb = g.b[2] / g.b[0];
      const losing = ra >= 0.12 && rb <= 0.55 * ra && fb <= fa - 0.15;
      const winning = rb >= 0.12 && rb >= 1.8 * ra && fb >= fa + 0.15;
      if (!losing && !winning) continue;
      const [qs] = topBy(g.qb), [hs] = topBy(g.hb);
      // one in how many tries succeeds, in words
      const oneIn = (r) => numWord(Math.max(1, Math.round(1 / Math.max(r, 1e-3))));
      const html = losing
        // i18n: an arms race lost: {prey} and {hunters}, two genera's names; {guild}: the hunters' guild (other: predator; never scavengers); {bite}: yes when the prey are producers (bitten, not caught);
        // i18n: {now}, {then}: one in how many tries succeeds now and ten minutes ago, in words; {preyName}, {hunterName}: a newer prey species and a hunter (links)
        ? tr('chron.arms.slipping', 'The <b>{prey}</b> are slipping from the grasp of the <b>{hunters}</b>. Their {guild, select, producer {producers} grazer {grazers} other {predators}} now {bite, select, yes {land bites on} other {take}} one in {now} of those they pursue, where ten minutes since it was one in {then}; for the newer <b>{prey}</b>, such as {preyName}, wear surfaces that the receptors of {hunterName} scarcely fit.',
          { prey: esc(g.qg), hunters: esc(g.hg), guild: g.hguild, bite: g.qguild === 'producer' ? 'yes' : 'no', now: oneIn(rb), then: oneIn(ra), preyName: L(reg, qs), hunterName: L(reg, hs) })
        // i18n: an arms race won: {hunters} and {prey}, two genera's names; {now}, {then}: one in how many tries succeeds now and ten minutes ago, in words; {hunterName}: a newer hunter species (a link)
        : tr('chron.arms.grip', 'The <b>{hunters}</b> have taken the measure of the <b>{prey}</b>: one in {now} of their attempts now succeeds, where it was one in {then}, for their newer species, such as {hunterName}, carry receptors that fit the surfaces of the <b>{prey}</b> all too well.',
          { hunters: esc(g.hg), prey: esc(g.qg), now: oneIn(rb), then: oneIn(ra), hunterName: L(reg, hs) });
      add({ kind: 'arms', score: 0.7, col: reg.get(hs)?.genome.col ?? 0xffffffff, subjects: [hs, qs], key: `arms:${g.hg}|${g.qg}`, keyGap: 40 * MIN, html });
    }
  }

  // A consumer living almost entirely on one species, and that food failing.
  function detectDiets(ctx, add) {
    const { reg, t } = ctx;
    if (t < T.warm) return;
    const recent = new Map(); // h -> Map(q -> meals)
    for (const p of S.pairs.values()) {
      const [, m] = pairSum(p, t - 10 * MIN, t);
      if (!m) continue;
      if (!recent.has(p.h)) recent.set(p.h, new Map());
      recent.get(p.h).set(p.q, m);
    }
    for (const [h, m] of recent) {
      const [q, qm, sum] = topBy(m);
      const hsp = reg.get(h), qsp = reg.get(q);
      if (!hsp || !qsp || !hsp.alive || sum < 80 || qm < 0.75 * sum || hsp.genus === qsp.genus) continue;
      // species of some weight only: a hundredth of the living
      if (hsp.pop < 0.01 * ctx.living) continue;
      add({ kind: 'diet', score: 0.4, col: hsp.genome.col, subjects: [h, q], key: `diet:${h}:${q}`, keyGap: Infinity,
        // i18n: {hunter} lives on {food} (links); {share}: how much of its food that is (chron.word.share)
        html: tr('chron.diet.bound', '{hunter} has bound its fate to {food}: {share} of all it eats.', { hunter: L(reg, h), food: L(reg, q), share: shareWords(qm / sum) }) });
      const qst = S.sp.get(q), pk = qst && peakIn(qst, t - 15 * MIN);
      if (qsp.alive && pk && qsp.pop <= 0.4 * pk[1] && pk[1] >= Math.max(3 * ctx.est, 0.01 * ctx.living)) {
        add({ kind: 'diet', score: 0.55 + 0.1 * Math.min(1, hsp.pop / ctx.living / 0.05), col: qsp.genome.col, subjects: [q, h], key: `food:${h}:${q}`, keyGap: 30 * MIN,
          // i18n: {food}, a species that {hunter} lives on (links), is failing: {share}, how much of its food it is (chron.word.share); {from}, {to}: its cells then and now
          html: tr('chron.diet.failing', '{food}, which is {share} of what {hunter} eats, has fallen from {from, plural, other {# cells}} to {to, number}. Where the one goes, the other may soon follow.',
            { food: L(reg, q), share: shareWords(qm / sum), hunter: L(reg, h), from: pk[1], to: qsp.pop }) });
      }
    }
  }

  // Hunter and hunted cycling: the prey booms, the hunter follows, both crash, again and again.
  function peaksOf(series, rel = 0.35) {
    // zigzag: turning points whose swing is at least rel of the larger side
    const out = [];
    if (series.length < 5) return out;
    let dir = 0, ext = series[0];
    for (const x of series) {
      if (dir >= 0) {
        if (x[1] >= ext[1]) ext = x;
        else if (x[1] <= ext[1] * (1 - rel)) { if (dir === 1 || out.length || ext !== series[0]) out.push(['peak', ...ext]); dir = -1; ext = x; }
      } else {
        if (x[1] <= ext[1]) ext = x;
        else if (x[1] >= Math.max(1, ext[1]) * (1 + rel / (1 - rel))) { out.push(['low', ...ext]); dir = 1; ext = x; }
      }
    }
    return out.filter((p) => p[0] === 'peak').map((p) => p[1]);
  }
  function detectCycles(ctx, add) {
    const { reg, t } = ctx;
    if (t < 40 * MIN) return;
    const byH = new Map();
    for (const p of S.pairs.values()) {
      const [, m] = pairSum(p, t - 60 * MIN, t);
      if (m < 60) continue;
      if (!byH.has(p.h)) byH.set(p.h, []);
      byH.get(p.h).push([p.q, m]);
    }
    for (const [h, list] of byH) {
      const sum = list.reduce((a, b) => a + b[1], 0);
      for (const [q, m] of list) {
        if (m < 0.4 * sum) continue;
        const hs = S.sp.get(h), qs = S.sp.get(q), hsp = reg.get(h), qsp = reg.get(q);
        if (!hs || !qs || !hsp?.alive || !qsp?.alive) continue;
        const pq = peaksOf(qs.l.filter((x) => x[0] > t - 90 * MIN)), ph = peaksOf(hs.l.filter((x) => x[0] > t - 90 * MIN));
        let n = 0, lag = 0;
        for (let i = 0; i < pq.length; i++) {
          const next = pq[i + 1] ?? Infinity;
          const f = ph.find((x) => x > pq[i] + 30 && x < Math.min(next, pq[i] + 15 * MIN));
          if (f != null) { n++; lag += f - pq[i]; }
        }
        if (n < 3) continue;
        add({ kind: 'cycle', score: 0.7, col: hsp.genome.col, subjects: [h, q], key: `cycle:${h}:${q}`, keyGap: 90 * MIN,
          // i18n: {hunter} and {prey} (links) rise and fall in turn: {count}, how many times, in words ({n} as a number); {lag}: how long after the prey the hunter peaks
          html: tr('chron.cycle', '{hunter} and {prey} are bound together as hunter and hunted: {count} times now {prey} has flourished, {hunter} has followed it some {lag} later, and both have fallen together.',
            { hunter: L(reg, h), prey: L(reg, q), count: numWord(n), n, lag: durWords(lag / n) }) });
      }
    }
  }

  // Where species live: on the move, spreading out, or pushed into a corner.
  function detectRanges(ctx, add) {
    const { reg, t, living, world } = ctx;
    if (t < T.warm || !world) return;
    for (const st of S.sp.values()) {
      const sp = reg.get(st.serial);
      if (!sp?.alive || !sp.established || sp.pop < 0.03 * living || st.rng.length < 3) continue;
      const now = st.rng[st.rng.length - 1], then = st.rng.find((x) => x[0] >= t - 12 * MIN && x[0] <= t - 8 * MIN);
      if (!then || now[0] < t - 2 * MIN) continue;
      const tight = (r) => Math.min(r[3], r[4]), loose = (r) => Math.max(r[3], r[4]);
      if (tight(now) >= 0.45 && tight(then) >= 0.45) {
        const dx = wrap01(now[1] - then[1]), dy = wrap01(now[2] - then[2]);
        const d = Math.hypot(dx * world[0], dy * world[1]);
        if (d >= 0.2 * Math.min(world[0], world[1])) {
          // chasing its food?
          const [food, fm, fsum] = topBy(st.diet);
          // (a ternary, not `&&`: a false fst is not nullish, and `false?.rng.at` throws)
          const fst = food && fm >= 0.4 * fsum ? S.sp.get(food) : null;
          const fn = fst?.rng?.at(-1), ft = fst?.rng?.find((x) => x[0] >= t - 12 * MIN && x[0] <= t - 8 * MIN);
          const chase = fn && ft && Math.min(fn[3], fn[4]) >= 0.35 && wrap01(fn[1] - ft[1]) * dx + wrap01(fn[2] - ft[2]) * dy > 0.5 * (dx * dx + dy * dy);
          add({ kind: 'range', score: chase ? 0.6 : 0.45, col: sp.genome.col, subjects: chase ? [sp.serial, food] : [sp.serial], key: `move:${sp.serial}`, keyGap: 30 * MIN,
            html: chase
              // i18n: {name} (a link) has followed {food} (a link): {heading}, which way (chron.word.heading); {len}: how far; {dur}: in how long
              ? tr('chron.range.chase', '{name} has pursued {food}, its quarry, {heading} across the pool: {len} in {dur}.', { name: L(reg, sp.serial), food: L(reg, food), heading: heading(dx, dy), len: lenWords(d), dur: durWords(now[0] - then[0]) })
              // i18n: {name} (a link) has moved {len} {heading} (chron.word.heading) in {dur}, to {quarter} (chron.word.quarter)
              : tr('chron.range.move', '{name} is on the move: its cells have shifted {len} {heading} in {dur}, to the {quarter} of the pool.', { name: L(reg, sp.serial), len: lenWords(d), heading: heading(dx, dy), dur: durWords(now[0] - then[0]), quarter: quarterWords(compass(now[1], now[2])) }) });
        }
      }
      const was = popAgo(st, t, 10 * MIN);
      if (tight(then) >= 0.6 && loose(now) <= 0.25 && was != null && sp.pop >= 2 * was) {
        add({ kind: 'range', score: 0.55, col: sp.genome.col, subjects: [sp.serial], key: `spread:${sp.serial}`, keyGap: 60 * MIN,
          // i18n: {name} (a link) has spread out from {quarter} (chron.word.quarter); {was}, {now}: its cells then and now
          html: tr('chron.range.spread', '{name} has broken from its refuge in the {quarter} and spread across the pool: {was, plural, other {# cells}} ten minutes ago, {now, number} now.', { name: L(reg, sp.serial), quarter: quarterWords(compass(then[1], then[2])), was, now: sp.pop }) });
      } else if (loose(then) <= 0.25 && tight(now) >= 0.6 && was != null && sp.pop <= 0.5 * was) {
        add({ kind: 'range', score: 0.5, col: sp.genome.col, subjects: [sp.serial], key: `pocket:${sp.serial}`, keyGap: 60 * MIN,
          // i18n: {name} (a link) is shrunk into {quarter} (chron.word.quarter)
          html: tr('chron.range.pocket', '{name}, which once was everywhere, is reduced to a last refuge in the {quarter} of the pool.', { name: L(reg, sp.serial), quarter: quarterWords(compass(now[1], now[2])) }) });
      }
    }
  }

  // A genus radiating: many new species at once.
  function detectRadiation(ctx, add) {
    const { reg, t } = ctx;
    if (t < T.warm) return;
    const fresh = new Map();
    for (const sp of reg.values()) {
      if (!sp.established || (sp.establishedAt ?? 0) < t - 15 * MIN) continue;
      if (!fresh.has(sp.genus)) fresh.set(sp.genus, []);
      fresh.get(sp.genus).push(sp);
    }
    for (const [genus, list] of fresh) {
      const alive = list.filter((sp) => sp.alive);
      if (list.length < 6 || alive.length < 4) continue;
      // a radiation spreads into new ways of living: three kinds at least (diet, movement, body)
      const kinds = new Map();
      for (const sp of list) { const k = kindOf(sp); kinds.set(`${k.how}|${k.multi}|${k.guild}`, k); }
      if (kinds.size < 3) continue;
      const sorted = [...kinds.values()];
      const lead = alive.sort((a, b) => b.pop - a.pop)[0];
      add({ kind: 'radiation', score: Math.min(0.75, 0.45 + 0.05 * kinds.size), col: lead.genome.col, subjects: [lead.serial], key: `rad:${genus}`, keyGap: 40 * MIN,
        // i18n: a genus radiating: {genus}, its name; {count}: how many new species, in words ({n} as a number); {dur}: in how long; {first}, {last}: two of their ways of living (chron.word.kinds); {name}: the most numerous (a link)
        html: tr('chron.radiation', 'The genus <b>{genus}</b> flourishes: {count} new species in {dur}, from {first} to {last}, with {name} at their head.',
          { genus: esc(genus), count: numWord(list.length), n: list.length, dur: durWords(t - Math.min(...list.map((sp) => sp.establishedAt ?? t))), first: kindsWords(sorted[0]), last: kindsWords(sorted[sorted.length - 1]), name: L(reg, lead.serial) }) });
    }
  }

  // Lineages tracking the water, and growing or shrinking, over the last hour.
  function detectTrends(ctx, add) {
    const { reg, t } = ctx;
    if (t - (S.genusMarks.at(-1)?.t ?? -1e9) >= 5 * MIN) {
      const mark = { t, temp: ctx.temp, g: new Map() };
      for (const sp of reg.values()) {
        if (!sp.alive || !sp.established) continue;
        let m = mark.g.get(sp.genus);
        if (!m) mark.g.set(sp.genus, (m = { n: 0, topt: 0, size: 0, swim: 0, multi: 0, pop: 0 }));
        const g = sp.genome, w = sp.pop;
        m.pop += w; m.n++;
        m.topt += w * (g.topt ?? 19); m.size += w * g.size; m.swim += w * g.swim * (1 - g.photo); m.multi += w * ((g.adhesion || 0) > K.adhMin ? 1 : 0);
      }
      for (const m of mark.g.values()) for (const k of ['topt', 'size', 'swim', 'multi']) m[k] /= Math.max(1, m.pop);
      S.genusMarks.push(mark);
      while (S.genusMarks.length && S.genusMarks[0].t < t - 2 * 3600) S.genusMarks.shift();
    }
    if (t < 40 * MIN) return;
    const now = S.genusMarks.at(-1);
    const then = S.genusMarks.find((m) => m.t >= t - 50 * MIN && m.t <= t - 30 * MIN);
    if (!now || !then) return;
    for (const [genus, a] of now.g) {
      const b = then.g.get(genus);
      if (!b || a.pop < 0.02 * ctx.living || b.pop < 3 * ctx.est || genusCount(reg, genus) < 3) continue;
      const lead = [...reg.values()].filter((sp) => sp.alive && sp.genus === genus).sort((x, y) => y.pop - x.pop)[0];
      if (!lead) continue;
      const ago = durWords(now.t - then.t);
      const dT = a.topt - b.topt, dW = now.temp - then.temp;
      if (K.heat && Math.abs(dT) >= 5 && Math.abs(dW) >= 4 && Math.sign(dT) === Math.sign(dW)) {
        add({ kind: 'trend', score: 0.6, col: lead.genome.col, subjects: [lead.serial], key: `temp:${genus}`, keyGap: 60 * MIN,
          // i18n: a genus ({genus}, its name) following the water's temperature: {warmed}, yes when it warmed (else cooled); {ago}: over how long; {now}, {then}: the warmth they thrive at now and then (°C)
          html: tr('chron.trend.temp', 'The <b>{genus}</b> have followed the water as it {warmed, select, yes {warmed} other {cooled}}: in {ago} their cells have come to thrive near {now}°, where once they wanted {then}°.',
            { genus: esc(genus), warmed: dW > 0 ? 'yes' : 'no', ago, now: Math.round(a.topt), then: Math.round(b.topt) }) });
      } else if (a.size >= 1.3 * b.size || a.size <= b.size / 1.3) {
        const up = a.size > b.size, r = up ? a.size / b.size : b.size / a.size;
        const by = r >= 1.9 ? (up ? 'twice' : 'half') : r >= 1.45 ? (up ? 'half_again' : 'third_smaller') : (up ? 'third_larger' : 'quarter_smaller');
        add({ kind: 'trend', score: 0.5, col: lead.genome.col, subjects: [lead.serial], key: `size:${genus}`, keyGap: 60 * MIN,
          // i18n: a genus ({genus}, its name) grown or shrunk over {ago}: {up}, yes when grown; {by}: how much (other: a quarter smaller); {name}: its most numerous species (a link)
          html: tr('chron.trend.size', 'In {ago} the <b>{genus}</b> have {up, select, yes {grown} other {dwindled}}: their cells are now {by, select, twice {twice the size they were} half {half the size they were} half_again {half again as large as they were} third_smaller {a third smaller than they were} third_larger {a third larger than they were} other {a quarter smaller than they were}}, and {name} the greatest of their number.',
            { ago, genus: esc(genus), up: up ? 'yes' : 'no', by, name: L(reg, lead.serial) }) });
      } else if (a.swim - b.swim >= 0.35) {
        add({ kind: 'trend', score: 0.5, col: lead.genome.col, subjects: [lead.serial], key: `swim:${genus}`, keyGap: 60 * MIN,
          // i18n: a genus ({genus}, its name) taken to swimming over {ago}; {name}: its most numerous species (a link); {much}: twice, or other (far more)
          html: tr('chron.trend.swim', 'In {ago} the <b>{genus}</b> have learned to swim: {name} and its kin now swim {much, select, twice {twice as hard as} other {far harder than}} their forebears did.',
            { ago, genus: esc(genus), name: L(reg, lead.serial), much: a.swim / Math.max(0.05, b.swim) >= 2 ? 'twice' : 'far' }) });
      } else if (a.multi >= 0.6 && b.multi <= 0.2) {
        add({ kind: 'trend', score: 0.55, col: lead.genome.col, subjects: [lead.serial], key: `multi:${genus}`, keyGap: 90 * MIN,
          // i18n: a genus ({genus}, its name) become many-celled over {ago}; {name}: its most numerous species (a link)
          html: tr('chron.trend.multi', 'The <b>{genus}</b>, solitary once, now live in bodies: in {ago} their single cells gave way to multicellular kin such as {name}.', { genus: esc(genus), ago, name: L(reg, lead.serial) }) });
      }
    }
  }

  // The rest: elders, records, reefs, life from the silt, daughters overtaking their mothers.
  function detectMisc(ctx, add) {
    const { reg, t, living } = ctx;
    if (t < T.warm) return;
    let oldest = null, thriving = 0;
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established) continue;
      thriving++;
      if (!oldest || sp.born < oldest.born) oldest = sp;
    }
    if (oldest) {
      const age = t - oldest.born, marks = [7200, 14400, 28800];
      const m = marks.filter((x) => age >= x).length;
      const st = S.sp.get(oldest.serial);
      if (st && m > (st.elder || 0)) {
        st.elder = m;
        const kin = genusCount(reg, oldest.genus) - 1;
        add({ kind: 'elder', score: 0.4 + 0.05 * m, col: oldest.genome.col, subjects: [oldest.serial], key: `elder:${oldest.serial}:${m}`, keyGap: Infinity,
          // i18n: the oldest species: {name} (a link), {age}: how long it has lived; {count}: how many species of its genus there have been besides, in words ({n} as a number), when {kin} is yes
          html: tr('chron.elder', '{name} has lived {age}, the eldest in all the pool{kin, select, yes {; it has seen {count} species of its own genus arise, and many of them perish} other {}}.',
            { name: L(reg, oldest.serial), age: durWords(age), kin: kin >= 3 ? 'yes' : 'no', count: numWord(kin), n: kin }) });
      }
    }
    // diversity at a new height
    if (t >= 20 * MIN && thriving > Math.max(8, S.record * 1.15)) {
      if (S.record) add({ kind: 'record', score: 0.45, col: 0xff7fe0b0, subjects: [], key: 'record', keyGap: 30 * MIN,
        // i18n: diversity at a new height: {count}, how many species thrive, in words ({n} as a number)
        html: tr('chron.record', 'Never has the pool been so rich: {count} species thrive in it at once.', { count: numWord(thriving), n: thriving }) });
      S.record = thriving;
    } else if (thriving > S.record) S.record = thriving;
    // reef stone spreading
    if (ctx.stone != null) {
      S.stoneMarks.push([t, ctx.stone]);
      while (S.stoneMarks.length && S.stoneMarks[0][0] < t - 20 * MIN) S.stoneMarks.shift();
      const then = S.stoneMarks.find((x) => x[0] >= t - 16 * MIN);
      if (then && t - then[0] >= 12 * MIN && ctx.stone >= 1.5 * then[1] && ctx.stone - then[1] >= 0.005 * (ctx.count || 1)) {
        const builder = [...reg.values()].filter((sp) => sp.alive && sp.established && (sp.genome.calcify || 0) > 0.05).sort((a, b) => b.pop * b.genome.calcify - a.pop * a.genome.calcify)[0];
        if (builder) add({ kind: 'reef', score: 0.5, col: builder.genome.col, subjects: [builder.serial], key: 'reef', keyGap: 45 * MIN,
          // i18n: reef stone growing: {twice}, yes for twice as much (else half again); {dur}: since how long; {name}: the species building most of it (a link)
          html: tr('chron.reef', 'The reefs are rising: {twice, select, yes {twice} other {half again}} the stone there was {dur} ago, laid down grain by grain by {name} and its like.',
            { twice: ctx.stone >= 2 * then[1] ? 'yes' : 'no', dur: durWords(t - then[0]), name: L(reg, builder.serial) }) });
      }
    }
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.established) continue;
      // life from the silt, taking a tenth of the pool
      if (sp.founder && sp.serial > (ctx.founders ?? Infinity) && sp.pop >= 0.1 * living && living > 500) {
        const share = shareKey(sp.pop / living);
        add({ kind: 'spark', score: 0.6, col: sp.genome.col, subjects: [sp.serial], key: `spark:${sp.serial}`, keyGap: Infinity,
          // i18n: a species sprung from silt, grown great: {name} (a link); {at}: when it sprang, on the world's clock; {part}: its share of the pool (chron.word.share), or a tenth
          html: tr('chron.spark', 'From a single grain of silt, all this: {name}, sparked into life at {at}, now holds {share, select, few {a tenth} other {{part}}} of the pool.',
            { name: L(reg, sp.serial), at: fmtClock(sp.born), share, part: shareText(share) }) });
      }
      // a daughter overtaking the species it came from
      const anc = sp.ancestor && reg.get(sp.ancestor);
      if (anc && anc.alive && anc.established && sp.pop >= 3 * anc.pop && sp.pop >= 0.03 * living) {
        const a = S.sp.get(anc.serial), b = S.sp.get(sp.serial);
        const aw = a && popAgo(a, t, 10 * MIN), bw = b && popAgo(b, t, 10 * MIN);
        if (aw != null && bw != null && aw >= 2 * bw) {
          add({ kind: 'succession', score: 0.45, col: sp.genome.col, subjects: [sp.serial, anc.serial], key: `succ:${sp.serial}`, keyGap: Infinity,
            // i18n: {name} (a link) now outnumbers {ancestor} (a link): {now} cells to {ancestorNow}, where ten minutes ago it had {then} to {ancestorThen}
            html: tr('chron.succession', 'The descendant has overtaken its ancestor: {name} now outnumbers {ancestor}, from which it descends, {now, plural, other {# cells}} to {ancestorNow, number}, where ten minutes ago it had {then, number} to {ancestorThen, number}.',
              { name: L(reg, sp.serial), ancestor: L(reg, anc.serial), now: sp.pop, ancestorNow: anc.pop, then: bw, ancestorThen: aw }) });
        }
      }
    }
  }

  // ------------------------------------------------------------------ the world's voices
  // From the census alone: each species' song (call: its loudness and band), its alarm, and its ear (drawn up or
  // pushed down each band's slope), weighed by its cells; who eats whom from the watched pairs. A species "sings" if it
  // carries a song at all (it sings while fed, on its cadence). Nothing here with signals off (K.signal 0, or no heat),
  // where every one of these genes is zero.
  const signals = !!(K.signal && K.heat);
  const saidAt = (key) => { const s = S.song.said; for (let i = s.length - 1; i >= 0; i--) if (s[i][0] === key) return s[i][1]; return -1e9; };
  // a story of the voices told: the family's gap begins, and its key (kept apart from S.told, bounded) is remembered
  const said = (key, t, also) => () => {
    const V = S.song;
    V.lastTold = t;
    if (key) { V.said.push([key, t]); if (V.said.length > 48) V.said.shift(); }
    also?.();
  };
  // who sings, and in which band: { sing (cells), band: [cells ×4], top: [the most numerous established singer ×4], lead,
  // kinds: established singing species, and bandKinds of them in each band }
  function tally(reg) {
    const band = [0, 0, 0, 0], top = [null, null, null, null], bandKinds = [0, 0, 0, 0];
    let sing = 0, lead = null, kinds = 0;
    for (const sp of reg.values()) {
      if (!sp.alive || !sp.pop) continue;
      const [a, b] = songOf(sp.genome);
      if (!a) continue;
      sing += sp.pop; band[b] += sp.pop;
      if (!sp.established) continue;
      kinds++; bandKinds[b]++;
      if (!top[b] || sp.pop > top[b].pop) top[b] = sp;
      if (!lead || sp.pop > lead.pop) lead = sp;
    }
    return { sing, band, top, lead, kinds, bandKinds };
  }
  // a moment of the voices, offered while it holds (VOICE.offer at most), so a story that loses its turn is not lost
  const offer = (o) => { const V = S.song; if (!V.offers.some((x) => x.what === o.what && x.b === o.b)) V.offers.push(o); };
  const unoffer = (what, b) => { const V = S.song; V.offers = V.offers.filter((x) => !(x.what === what && x.b === b)); };

  // The first chorus and the great quiet, one voice left, a band first sung in and a band fallen silent.
  function detectVoices(ctx, add) {
    if (!signals) return;
    const { reg, t, living } = ctx;
    if (living < 500) return;
    const V = S.song, v = tally(reg), share = v.sing / living;
    // a chorus: half the living singing for three minutes, from under two fifths; a quiet: a tenth, after a chorus
    if (V.state === 'new') V.state = share < VOICE.arm ? 'armed' : 'unarmed';
    if (V.state === 'unarmed' && share < VOICE.arm) V.state = 'armed';
    V.hi = share >= VOICE.chorus && v.kinds >= VOICE.choir ? (V.hi ?? t) : null;
    V.lo = share <= VOICE.quiet ? (V.lo ?? t) : null;
    if ((V.state === 'armed' || V.state === 'quiet') && V.hi != null && t - V.hi >= VOICE.hold) {
      unoffer('quiet');
      offer({ what: 'chorus', t, again: V.state === 'quiet' });
      V.state = 'chorus'; V.peak = null;
    }
    if (V.state === 'chorus') {
      if (!V.peak || share > V.peak[1]) {
        V.peak = [t, share, living];
        V.singers = [...reg.values()].filter((sp) => sp.alive && sp.established && songOf(sp.genome)[0]).sort((a, b) => b.pop - a.pop).slice(0, 16).map((sp) => sp.serial);
      }
      if (V.lo != null && t - V.lo >= VOICE.hold) {
        // why: life itself crashed, or the singers were hunted out, or the silent simply outlasted them
        let eaten = 0, deaths = 0;
        for (const s of V.singers) {
          const st = S.sp.get(s);
          if (!st) continue;
          const c = causesIn(st, t - 20 * MIN, t);
          eaten += c[C.eaten]; deaths += c[C.starved] + c[C.old] + c[C.eaten] + c[C.scalded] + c[C.stranded];
        }
        const why = living < 0.4 * V.peak[2] ? 'crash' : deaths >= 20 && eaten >= 0.45 * deaths ? 'hunted' : 'outlasted';
        unoffer('chorus');
        offer({ what: 'quiet', t, why, at: V.peak[0], was: V.peak[1] });
        V.state = 'quiet';
      }
    }
    // the bands: first sung in (an established singer, after the world's first minutes), used, fallen silent
    for (let b = 0; b < 4; b++) {
      const f = v.band[b] / living;
      if (v.top[b] && V.bandFirst[b] == null) V.bandFirst[b] = t < 3 * MIN ? -1 : t;
      if (f >= VOICE.band && V.bandFirst[b] > 0 && !V.bandDone[b]) { V.bandDone[b] = true; offer({ what: 'first', t, b, at: V.bandFirst[b] }); }
      if (f >= VOICE.band || V.bandFirst[b] === -1) V.bandDone[b] = true;
      if (f > V.bandPeak[b]) { V.bandPeak[b] = f; if (v.top[b]) V.bandTop[b] = v.top[b].serial; }
      V.bandKinds[b] = Math.max(V.bandKinds[b], v.bandKinds[b]);
      // (a band one species held falls silent with it: its death is the story, not the band's)
      if (V.bandPeak[b] >= VOICE.band && f < 0.002 && !v.top[b]) {
        if (V.bandKinds[b] >= 3) offer({ what: 'silent', t, b, who: V.bandTop[b], peak: V.bandPeak[b] });
        V.bandPeak[b] = 0; V.bandTop[b] = 0; V.bandKinds[b] = 0;
      }
    }
    // one voice: a band holding nearly all the singers of a choir for three minutes, where two or more were heard
    const b1 = v.band.indexOf(Math.max(...v.band));
    const one = share >= 0.2 && v.kinds >= VOICE.choir && v.band[b1] >= VOICE.one * v.sing;
    if (share >= 0.2 && v.kinds >= VOICE.choir) V.many = Math.max(V.many, v.band.filter((x) => x >= VOICE.many * v.sing).length);
    V.oneAt = one ? (V.oneAt ?? t) : null;
    if (one && V.many >= 2 && t - V.oneAt >= VOICE.hold && t >= T.warm) { offer({ what: 'one', t, b: b1, many: V.many }); V.many = 1; }
    // what is on offer, while it holds
    const holds = (o) => (o.what === 'chorus' ? V.state === 'chorus' && share >= 0.45
      : o.what === 'quiet' ? V.state === 'quiet' && share <= 0.15
        : o.what === 'first' ? v.band[o.b] >= 0.02 * living && v.top[o.b]
          : o.what === 'silent' ? !v.top[o.b]
            : v.band[o.b] >= 0.85 * v.sing);
    V.offers = V.offers.filter((o) => t - o.t < VOICE.offer && holds(o));
    for (const o of V.offers) add(voiceStory(o, ctx, v, share));
  }
  function voiceStory(o, ctx, v, share) {
    const { reg, t } = ctx;
    const V = S.song;
    const done = said(o.what === 'chorus' || o.what === 'quiet' ? null : `${o.what}:${o.b}`, t, () => unoffer(o.what, o.b));
    const band = o.b != null ? o.b : 0;
    // (the bands' stories keep to the family's gap; the chorus and the quiet do not)
    if ((o.what === 'first' || o.what === 'silent' || o.what === 'one') && t - V.lastTold < T.voiceGap) return null;
    if (o.what === 'chorus') {
      const lead = v.lead;
      return { kind: 'chorus', score: o.again ? 0.7 : 0.8, col: lead?.genome.col ?? 0xffa0e3f1, subjects: lead ? [lead.serial] : [], key: 'voice:chorus', keyGap: 20 * MIN, onTold: done,
        // i18n: the first chorus: {again}, yes after a great quiet; {part}: the share of the living that sing (chron.word.share);
        // i18n: {name}: the most numerous singing species (a link) and {band} the band it sings in (chron.word.band), when {lead} is yes
        html: tr('chron.voice.chorus', '<b>{again, select, yes {The pool has found its voice again.} other {The pool has found its voice.}}</b> Now {part} of its cells sing{lead, select, yes {, {name} the greatest of the choir, singing in {band}} other {}}.',
          { again: o.again ? 'yes' : 'no', part: shareWords(share), lead: lead ? 'yes' : 'no', name: lead ? L(reg, lead.serial) : '', band: bandWords(songOf(lead?.genome ?? {})[1]) }) };
    }
    if (o.what === 'quiet') {
      const n = share > 0 ? Math.max(2, Math.round(1 / share)) : 0;
      return { kind: 'chorus', score: o.why === 'crash' ? (S.collapsed ? 0.45 : 0.62) : 0.75, col: 0xffa0e3f1, subjects: [], key: 'voice:quiet', keyGap: 20 * MIN, onTold: done,
        // i18n: a great quiet after a chorus: {at}, when the most sang, on the world's clock (1:23:45), and {part} how many (chron.word.share); {none}: yes when none sing now,
        // i18n: else one cell in {n} sings; {why}: crash (life itself fell), hunted (the singers were eaten), other (the silent outlasted them)
        html: tr('chron.voice.quiet', '<b>A great quiet has fallen on the pool.</b> At {at}, {part} of its cells sang; now {none, select, yes {none sing} other {scarcely one in {n, number} sings}}{why, select, crash {, for the singers went down with the rest of life} hunted {, for the singers were hunted out and only the silent remain} other {, and the silent have outlasted the singers}}.',
          { at: fmtClock(o.at), part: shareWords(o.was), none: n ? 'no' : 'yes', n, why: o.why }) };
    }
    if (o.what === 'one') {
      const lead = v.top[band];
      return { kind: 'chorus', score: 0.62, col: lead?.genome.col ?? 0xffa0e3f1, subjects: lead ? [lead.serial] : [], onTold: done,
        // i18n: the singers thinned to one band: {part}, the share of the singers in it (chron.word.share); {band}: which (chron.word.band); {count}: how many bands were heard before, in words ({n} as a number);
        // i18n: {name}: the most numerous species singing in it (a link), when {lead} is yes
        html: tr('chron.voice.one', '<b>One voice now fills the water.</b> Of all that sing in the pool, {part} sing in {band}, where lately {count} bands were heard{lead, select, yes {; {name} is the greatest of the choir} other {}}.',
          { part: shareWords(v.band[band] / Math.max(1, v.sing)), band: bandWords(band), count: numWord(o.many), n: o.many, lead: lead ? 'yes' : 'no', name: lead ? L(reg, lead.serial) : '' }) };
    }
    if (o.what === 'first') {
      const lead = v.top[band];
      return { kind: 'band', score: 0.62, col: lead.genome.col, subjects: [lead.serial], onTold: done,
        // i18n: a band sung in for the first time: {band} (chron.word.band-start, beginning the sentence); {at}: when its first established singer arose, on the world's clock; {name}: its most numerous singer now (a link)
        html: tr('chron.voice.first', '<b>A new voice in the water.</b> {band} had no singers of its own until {at}; now {name} and its kind fill it.',
          { band: bandWordsStart(band), at: fmtClock(o.at), name: L(reg, lead.serial) }) };
    }
    // a band fallen silent
    const who = o.who && reg.get(o.who) ? o.who : 0;
    return { kind: 'band', score: o.peak >= 0.08 ? 0.64 : 0.6, col: 0xffa0e3f1, subjects: who && reg.get(who).alive ? [who] : [], onTold: done,
      // i18n: a band no one sings in any longer: {band} (chron.word.band-start, beginning the sentence); {name}: the species that sang in it most at its height (a link), when {who} is yes
      html: tr('chron.voice.silent', '{band} has fallen silent: no species in the pool sings in it now{who, select, yes {, where once {name} and its kind filled it} other {}}.',
        { band: bandWordsStart(band), who: who ? 'yes' : 'no', name: who ? L(reg, who) : '' }) };
  }

  // Eavesdroppers (eaters drawn to the band their food sings in), prey that shun the band their hunters call in, and
  // two singers that shared a band parting (one's descendants moved to another).
  function detectEars(ctx, add) {
    if (!signals) return;
    const { reg, t, living, est } = ctx;
    const V = S.song;
    // every five minutes, the singers of weight (a fiftieth of the living), for the partings
    if (t - (V.marks.at(-1)?.t ?? -1e9) >= 5 * MIN) {
      const sp = [];
      for (const s of reg.values()) {
        if (!s.alive || !s.established || s.pop < 0.02 * living) continue;
        const [a, b] = songOf(s.genome);
        if (a) sp.push([s.serial, b, s.pop]);
      }
      V.marks.push({ t, living, sp: sp.sort((x, y) => y[2] - x[2]).slice(0, 40) });
      while (V.marks.length && V.marks[0].t < t - 60 * MIN) V.marks.shift();
    }
    if (t < 20 * MIN || t - V.lastTold < T.voiceGap) return;
    // who ate whom over the last twenty minutes, among the watched
    const diet = new Map(), eaters = new Map();
    const into = (m, a, b, n) => { let x = m.get(a); if (!x) m.set(a, (x = new Map())); x.set(b, n); };
    for (const p of S.pairs.values()) {
      const [, m] = pairSum(p, t - 20 * MIN, t);
      if (m) { into(diet, p.h, p.q, m); into(eaters, p.q, p.h, m); }
    }
    const weighty = (sp) => sp.pop >= Math.max(3 * est, 0.01 * living);
    const eater = (sp) => { const g = guildOf(sp); return g === 'predator' || g === 'grazer'; };
    for (const [h, m] of diet) {
      const [q, qm, sum] = topBy(m);
      const hsp = reg.get(h), qsp = reg.get(q);
      if (!hsp?.alive || !qsp?.alive || sum < VOICE.meals || qm < 0.4 * sum || !eater(hsp) || !weighty(hsp) || qsp.pop < 3 * est) continue;
      const [qa, qb] = songOf(qsp.genome), [ha, hb] = songOf(hsp.genome);
      // drawn to its food's band (and not to its own kind's: one that sings there too may only be gathering)
      if (!qa || earOf(hsp.genome, qb) < VOICE.ear || (ha && hb === qb)) continue;
      const key = `ear:${hsp.genus}:${qb}`;
      if (t - saidAt(key) < 3 * 3600) continue;
      const silent = !ha && !alarmOf(hsp.genome)[0];
      add({ kind: 'ear', score: 0.6 + 0.08 * Math.min(1, hsp.pop / living / 0.05) + (silent ? 0.03 : 0), col: hsp.genome.col, subjects: [h, q], onTold: said(key, t),
        // i18n: an eater drawn to the band its food sings in: {name} (a link); {guild}: grazer, or other (a predator); {silent}: yes when it makes no call of its own;
        // i18n: {band}: the band (chron.word.band); {food}: what it eats most (a link), {share} of what it eats (chron.word.share)
        html: tr('chron.voice.ear', '{guild, select, grazer {{name} finds its meadows by ear} other {{silent, select, yes {{name} hunts in silence, by ear} other {{name} hunts by ear}}}}: it is drawn to {band}, in which {food}, {share} of what it eats, sings. {guild, select, grazer {The song that keeps its food together gives it away.} other {The song that gathers its quarry’s kind now calls their hunters too.}}',
          { guild: guildOf(hsp) === 'grazer' ? 'grazer' : 'predator', silent: silent ? 'yes' : 'no', name: L(reg, h), band: bandWords(qb), food: L(reg, q), share: shareWords(qm / sum) }) });
    }
    for (const [q, m] of eaters) {
      const [h, hm, sum] = topBy(m);
      const qsp = reg.get(q), hsp = reg.get(h);
      if (!qsp?.alive || !hsp?.alive || sum < VOICE.meals || hm < 0.4 * sum || !eater(hsp) || !weighty(qsp)) continue;
      // the band its eater calls in (its song, else its alarm), which it shuns
      const [sa, sb] = songOf(hsp.genome), [aa, ab] = alarmOf(hsp.genome);
      const calls = sa && earOf(qsp.genome, sb) <= -VOICE.ear ? 'song' : aa && earOf(qsp.genome, ab) <= -VOICE.ear ? 'alarm' : null;
      if (!calls) continue;
      const b = calls === 'song' ? sb : ab;
      const key = `shun:${qsp.genus}:${b}`;
      if (t - saidAt(key) < 3 * 3600) continue;
      add({ kind: 'ear', score: 0.6 + 0.06 * Math.min(1, qsp.pop / living / 0.1), col: qsp.genome.col, subjects: [q, h], onTold: said(key, t),
        // i18n: prey that shun the band their eater calls in: {name} (a link); {band}: the band (chron.word.band); {eater}: what eats it most (a link), {guild}: grazer, or other (a predator);
        // i18n: {calls}: alarm when the eater's call there is its alarm, other its song; {sings}: yes when the prey sings itself (and so falls silent)
        html: tr('chron.voice.shun', '{name} shuns {band}, in which {eater}, the {guild, select, grazer {grazer} other {hunter}} that takes it most, {calls, select, alarm {cries its alarm} other {sings}}: at the sound of it, its cells {sings, select, yes {fall silent and draw away} other {draw away}}.',
          { name: L(reg, q), band: bandWords(b), eater: L(reg, h), guild: guildOf(hsp) === 'grazer' ? 'grazer' : 'predator', calls, sings: songOf(qsp.genome)[0] ? 'yes' : 'no' }) });
    }
    // partings: two species of weight that shared a band 30 to 50 minutes ago; now a descendant of one sings in another
    // (its forebear fallen to half or less), and the other or its line still holds the band
    const then = V.marks.find((x) => x.t >= t - 50 * MIN && x.t <= t - 30 * MIN);
    if (!then) return;
    const was = new Map(then.sp.map((x) => [x[0], x]));
    const big = (x) => x[2] >= 0.03 * then.living;
    for (const d of reg.values()) {
      if (!d.alive || !d.established || d.pop < 0.02 * living || was.has(d.serial)) continue;
      const [da, db] = songOf(d.genome);
      if (!da) continue;
      const line = new Set();
      let a = d.ancestor, n = 0, A = null;
      while (a && n++ < 200) { line.add(a); if (!A && was.has(a)) A = was.get(a); a = reg.get(a)?.ancestor; }
      if (!A || A[1] === db || !big(A)) continue;
      const asp = reg.get(A[0]);
      if (asp?.alive && asp.pop > 0.5 * A[2]) continue;
      for (const B of then.sp) {
        if (B[0] === A[0] || B[1] !== A[1] || !big(B) || line.has(B[0])) continue;
        const key = `part:${A[0]}:${B[0]}`;
        if (saidAt(key) > -1e9) continue;
        // who holds the band now: the other itself, or the most numerous of its line still singing there
        const inBand = (sp) => sp?.alive && sp.pop >= 0.01 * living && songOf(sp.genome)[0] && songOf(sp.genome)[1] === B[1];
        const bsp = reg.get(B[0]);
        const holder = inBand(bsp) ? bsp : descendants(reg, B[0]).find(inBand);
        if (!holder || line.has(holder.serial) || holder.serial === d.serial) continue;
        add({ kind: 'band', score: 0.65, col: d.genome.col, subjects: [d.serial, holder.serial], onTold: said(key, t),
          // i18n: two singers parting: {name} (a link), descended from {forebear} (a link), now sings in {to} (chron.word.band), leaving {from} (the band its forebear sang in) to {holder} (a link),
          // i18n: the species (or a descendant of the one) that shared it with the forebear
          html: tr('chron.voice.part', '{name}, descended from {forebear}, now sings in {to}, leaving {from} to {holder}, with whose line its forebears once shared it. Where two voices sang over one another, each now has a band of its own.',
            { name: L(reg, d.serial), forebear: L(reg, A[0]), to: bandWords(db), from: bandWords(A[1]), holder: L(reg, holder.serial) }) });
        break;
      }
    }
  }

  const FAST = [detectCollapse, detectGuilds, detectExtinctions, detectReign, detectSwings, detectFirsts, detectVoices];
  const SLOW = [detectArms, detectDiets, detectCycles, detectRanges, detectRadiation, detectTrends, detectMisc, detectEars];

  // ------------------------------------------------------------------ the climate's news
  function snapshot(reg, living) {
    const pops = new Map(), cum = new Map(), guilds = { producer: 0, grazer: 0, scavenger: 0, predator: 0 }, genera = new Set(), generaPop = new Map();
    for (const sp of reg.values()) {
      if (!sp.alive) continue;
      guilds[guildOf(sp)] += sp.pop;
      genera.add(sp.genus);
      generaPop.set(sp.genus, (generaPop.get(sp.genus) || 0) + sp.pop);
      if (!sp.established) continue;
      pops.set(sp.serial, sp.pop);
      const st = S.sp.get(sp.serial);
      if (st) cum.set(sp.serial, st.cum.slice());
    }
    return { pops, cum, guilds, genera, generaPop, living };
  }
  /**
   * The page's news: note('era', { t, name, prev, reg, living }) as an era begins; note('event', { t,
   * type, phase, reg, living }) as one of the pool's events begins (phase its first), turns and ends
   * (phase null); note('excursion', { t, dT, dur, reg, living }) as a heat wave or cold snap begins.
   */
  function note(kind, d) {
    if (kind === 'era') {
      const was = S.eraMark;
      S.eraMark = { t: d.t, name: d.name, snap: snapshot(d.reg, d.living) };
      if (was) S.eraMark.pending = { from: was, name: d.prev ?? was.name, newName: d.name };
    } else if (kind === 'event') {
      const m = S.eventMark;
      // its first phase begins it; its later phases go on with it; none ends it
      if (d.phase && (!m || m.end != null || m.type !== d.type)) S.eventMark = { type: d.type, t: d.t, snap: snapshot(d.reg, d.living) };
      else if (!d.phase && m && m.type === d.type && m.end == null) { m.end = d.t; m.done = true; }
    } else if (kind === 'excursion') {
      S.excursion = { t: d.t, dT: d.dT, end: d.t + d.dur, snap: snapshot(d.reg, d.living) };
    } else if (kind === 'hand') {
      S.hand = { act: d.act, before: d.before, after: d.after, world: d.world, until: d.t + 10 * MIN };
    }
  }

  // The hand's act, told as weather (docs/hand.md): what touched which water and for how long, then what the
  // species there did after, from the counts of each species within its reach as it began and a few minutes
  // after it ended. Never "you"; now and then, at most once an hour and never twice running, a wry word.
  // The tools (a.tool): lamp, shade, warm (the stage), cold (the cold probe), touch, needle, call (a call into the water), ride (the reins),
  // pipette (cells drawn up), setdown (cells set down from the pipette); a select on {tool} names setdown in its `other` branch.
  function handStory(ctx) {
    const { reg, t } = ctx;
    const h = S.hand, a = h.act, tool = a.tool;
    if (t > h.until) { S.hand = null; return null; }
    const [W, H] = h.world;
    // i18n: where in the pool the hand did something ({q}: as chron.word.quarter)
    const place = tr('chron.hand.place', '{q, select, north {the northern waters} south {the southern waters} east {the eastern waters} west {the western waters} north_east {the north-eastern waters} north_west {the north-western waters} south_east {the south-eastern waters} south_west {the south-western waters} other {the middle of the pool}}', { q: compass(a.x / W, a.y / H) });
    const dur = a.end - a.at;
    const how = tool === 'needle' ? 'burst' : tool === 'touch' && a.n ? 'drops' : dur >= 20 ? 'long' : 'once';
    let up = null, down = null;
    for (const [serial, n1] of h.after) {
      const n0 = h.before.get(serial) || 0;
      if (n1 >= 8 && n1 >= 2 * Math.max(3, n0) && reg.get(serial) && (!up || n1 - n0 > up[2] - up[1])) up = [serial, n0, n1];
    }
    for (const [serial, n0] of h.before) {
      const n1 = h.after.get(serial) || 0;
      if (n0 >= 8 && n1 <= 0.3 * n0 && reg.get(serial) && (!down || n0 - n1 > down[1] - down[2])) down = [serial, n0, n1];
    }
    S.hand = null;
    const bits = [];
    // i18n: after the hand's act, a species there thrived: {name} (a link); {tool}: what was done (other: setdown); {from}, {to}: its cells there before and after
    if (up) bits.push(tr('chron.hand.rose', '{name} {tool, select, lamp {bloomed under it} shade {thrived in the dark} warm {took to the warmth} cold {took to the cold} touch {gathered there after} needle {moved in after} call {gathered to it} ride {gathered where it went} pipette {took the room they left} other {took hold there}}, from {from, plural, =0 {none} other {#}} to {to, plural, other {# cells}}',
      { name: L(reg, up[0]), tool, from: up[1] || 0, to: up[2] }));
    // i18n: after the hand's act, a species there dwindled: {name} (a link); {from}, {to}: its cells there before and after, or gone when {gone} is yes
    if (down && down[0] !== up?.[0]) bits.push(tr('chron.hand.fell', '{name} {gone, select, yes {was gone from it} other {fell from {from, number} to {to, number}}}', { name: L(reg, down[0]), gone: down[2] ? 'no' : 'yes', from: down[1], to: down[2] }));
    // (an act that changed nothing there goes untold, but for a needle's or a pipette's work)
    const pricks = (a.tool === 'needle' && a.n >= 3) || ((a.tool === 'pipette' || a.tool === 'setdown') && a.n >= 10);
    if (!bits.length && !pricks) return null;
    const again = S.handTold.some(([t0, tool]) => tool === a.tool && t - t0 < 2 * 3600);
    const wry = again && t - S.wry >= 3600 && !S.handTold.at(-1)?.[2];
    // i18n: what the hand did, as weather: {tool} (other: setdown); {place}: where (chron.hand.place); {how}: long when it lasted {dur}, drops when the water was touched with {count} drops,
    // i18n: burst when the needle burst {count} cells; {count}: how many, in words ({n} as a number); {countStart}: the same beginning the sentence
    const act = tr('chron.hand.act', '{tool, select, lamp {A light fell on {place}{how, select, long { for {dur}} other {}}} shade {A shadow lay over {place}{how, select, long { for {dur}} other {}}} warm {Warmth was laid on {place}{how, select, long { for {dur}} other {}}} cold {A chill was laid on {place}{how, select, long { for {dur}} other {}}} touch {Something stirred {place}{how, select, drops { with {count} {n, plural, one {drop} other {drops}}} long { for {dur}} other {}}} needle {A needle went through {place}, and {count} {n, plural, one {cell} other {cells}} burst} call {A call rang out over {place}{how, select, long { for {dur}} other {}}} ride {A cell was steered to {place}{how, select, long { for {dur}} other {}}} pipette {Something drew up {count} {n, plural, one {cell} other {cells}} from {place}{how, select, long { for {dur}} other {}}} other {{countStart} {n, plural, one {cell from elsewhere was} other {cells from elsewhere were}} set down in {place}{how, select, long { for {dur}} other {}}}}',
      { tool, place, how, dur: durWords(dur), count: numWord(a.n), n: a.n, countStart: numWordStart(a.n) });
    // i18n: the hand's act ({act}: chron.hand.act) and, when {some} is yes, what the species there did after ({after}: chron.hand.rose, chron.hand.fell, in a list)
    const told = tr('chron.hand.told', '{act}{some, select, yes {; {after}} other {}}.', { act, some: bits.length ? 'yes' : 'no', after: andList(bits) });
    // i18n: the hand has done the same before (at most once an hour, never twice running): {tool} (other: pipette or setdown)
    const sameAgain = wry ? tr('chron.hand.again', 'Someone has been at {tool, select, lamp {the lamp} shade {the shade} warm {the stage} cold {the cold probe} touch {the water} needle {the needle} call {the caller} ride {the reins} other {the pipette}} again.', { tool }) : null;
    return { kind: 'hand', score: 0.48 + 0.14 * bits.length + (pricks ? 0.14 : 0), col: 0xffa0e3f1, subjects: [up?.[0], down?.[0]].filter(Boolean),
      html: sameAgain ? sentences([sameAgain, told]) : told,
      onTold: () => { if (wry) S.wry = t; S.handTold.push([t, a.tool, wry]); if (S.handTold.length > 20) S.handTold.shift(); } };
  }


  // an era's character: who rose, who fell, the genera lost
  function eraStory(ctx) {
    const { reg, t, living } = ctx;
    const pend = S.eraMark.pending;
    S.eraMark.pending = null;
    const from = pend.from.snap, to = S.eraMark.snap;
    if (t - pend.from.t < 5 * MIN) return null;
    let rise = null, fall = null;
    for (const [serial, p1] of to.pops) {
      const p0 = from.pops.get(serial) || 0;
      if (p1 >= 0.05 * to.living && p1 >= 2 * Math.max(1, p0) && (!rise || p1 - p0 > rise[2])) rise = [serial, p0, p1 - p0];
    }
    for (const [serial, p0] of from.pops) {
      const p1 = to.pops.get(serial) || 0;
      if (p0 >= 0.05 * from.living && p1 <= 0.4 * p0 && (!fall || p0 - p1 > fall[2])) fall = [serial, p0, p0 - p1, p1];
    }
    // genera of weight lost: a fiftieth of the living when the era began
    const lostGenera = [...from.generaPop].filter(([g, n]) => !to.genera.has(g) && n >= 0.02 * from.living).map(([g]) => g);
    const lost = [...from.pops.keys()].filter((s) => !to.pops.has(s)).length;
    const born = [...to.pops.keys()].filter((s) => !from.pops.has(s)).length;
    const share = (snap, g) => snap.guilds[g] / Math.max(1, Object.values(snap.guilds).reduce((a, b) => a + b, 0));
    let best = null, bd = 0;
    for (const g of GUILDS) { const dd = share(to, g) - share(from, g); if (dd > bd) { bd = dd; best = g; } }
    // the era's character: a guild's, or losses, new, flourishing, lean
    const character = bd >= 0.1 ? best
      : lost >= 8 ? 'losses' : born >= 10 ? 'new' : living >= 1.5 * from.living ? 'flourishing' : living <= 0.5 * from.living ? 'lean' : null;
    const bits = [];
    // i18n: in an era's summary: {name} (a link) rose to {n} cells
    if (rise && reg.get(rise[0])) bits.push(tr('chron.era.rose', '{name} rose to {n, plural, other {# cells}}', { name: L(reg, rise[0]), n: to.pops.get(rise[0]) }));
    // i18n: in an era's summary: {name} (a link) fell from {from} cells to {to}, or was lost when {lost} is yes
    if (fall && reg.get(fall[0])) bits.push(tr('chron.era.fell', '{name} {lost, select, yes {was lost} other {fell from {from, number} to {to, number}}}', { name: L(reg, fall[0]), lost: fall[3] ? 'no' : 'yes', from: fall[1], to: fall[3] }));
    if (lostGenera.length) {
      bits.push(lostGenera.length <= 2
        // i18n: in an era's summary: one or two genera ({n}) died out; {genera}: their names, in a list
        ? tr('chron.era.genera-lost', '{n, plural, one {the genus {genera} died out} other {the genera {genera} died out}}', { n: lostGenera.length, genera: andList(lostGenera.map((g) => `<b>${esc(g)}</b>`)) })
        // i18n: in an era's summary: {count} genera died out, in words ({n} as a number)
        : tr('chron.era.genera-many', '{count} genera of note died out', { count: numWord(lostGenera.length), n: lostGenera.length }));
    }
    const score = 0.2 + (rise ? 0.12 : 0) + (fall ? 0.15 : 0) + (lostGenera.length ? 0.08 : 0) + (bd >= 0.1 ? 0.2 : character ? 0.05 : 0);
    if (!bits.length) return null;
    const subj = [rise?.[0], fall?.[0]].filter((s) => s && reg.get(s));
    return { kind: 'era', score, col: 0xffa0e3f1, subjects: subj, force: score >= 0.7, key: 'era', keyGap: 30 * MIN,
      // i18n: an era's summary: {era}, its name; {character}: what kind of era it was (a guild's, other: none); {what}: who rose, who fell, the genera lost (chron.era.*, in a list)
      html: tr('chron.era.passed', '<b>{era}</b> has passed into history{character, select,producer {, a producers’ era}grazer {, a grazers’ era}scavenger {, a scavengers’ era}predator {, a predators’ era}losses {, an era of losses}new {, an era of new species}flourishing {, a flourishing era}lean {, a lean era}other {}}: {what}.',
        { era: esc(eraName(pend.name)), character: character || 'none', what: andList(bits) }) };
  }

  // what one of the pool's events did, and to whom
  function eventStory(ctx) {
    const { reg, living } = ctx;
    const ev = S.eventMark;
    ev.done = false;
    const from = ev.snap;
    // the species of weight it took (a hundredth of the living as it began)
    const lost = [...from.pops].filter(([s, p0]) => p0 >= 0.01 * from.living && !reg.get(s)?.alive).map(([s]) => reg.get(s)).filter(Boolean).sort((a, b) => b.peak - a.peak);
    let win = null, slept = null, sank = null;
    for (const [serial, p0] of from.pops) {
      const sp = reg.get(serial);
      if (!sp?.alive) continue;
      if (sp.pop >= 2 * Math.max(1, p0) && sp.pop - p0 >= 0.01 * living && (!win || sp.pop - p0 > win[1])) win = [serial, sp.pop - p0, p0];
      const st = S.sp.get(serial), c0 = from.cum.get(serial);
      if (st && c0) {
        const c = st.cum.map((x, i) => x - c0[i]);
        if (c[C.cyst] + c[C.woke] >= 0.3 * Math.max(10, p0) && p0 >= 3 * ctx.est && (!slept || p0 > slept[1])) slept = [serial, p0];
        if (p0 >= 0.03 * from.living && sp.pop <= 0.3 * p0 && (!sank || p0 - sp.pop > sank[1])) sank = [serial, p0 - sp.pop, p0];
      }
    }
    // the clauses of the aftermath (the first begins its sentence: a name there is capitalized, a count is chron.word.num-start)
    const bits = [];
    const named = (serial) => (bits.length ? L(reg, serial) : Lstart(reg, serial));
    // i18n: after an event: {name} (a link) slept through it as cysts; {event}: which (drought, frost, other)
    if (slept) bits.push(tr('chron.event.slept', '{name} {event, select, drought {lay sleeping as cysts upon the mud and woke with the rain} frost {slept in the ice as cysts and woke with the thaw} other {withdrew into cysts and waited for better days}}', { name: named(slept[0]), event: ev.type }));
    // i18n: after an event: {name} (a link) grew from {from} cells to {to}
    if (win) bits.push(tr('chron.event.flourished', '{name} flourished, from {from, plural, other {# cells}} to {to, number}', { name: named(win[0]), from: win[2], to: reg.get(win[0]).pop }));
    // i18n: after an event: {name} (a link) lost {share} of its cells (chron.word.share)
    if (sank && sank[0] !== slept?.[0]) bits.push(tr('chron.event.sank', '{name} lost {share} of its cells', { name: named(sank[0]), share: shareWords(sank[1] / sank[2]) }));
    if (lost.length) {
      const first = !bits.length;
      bits.push(lost.length <= 2
        // i18n: after an event: {names}, one or two species ({n}, links in a list), died out
        ? tr('chron.event.lost', '{names} did not live to see it end', { names: andList(lost.map((sp, i) => (i || !first ? L(reg, sp.serial) : Lstart(reg, sp.serial)))), n: lost.length })
        // i18n: after an event: {count} species died out, in words ({n} as a number; at the start of a sentence, {count} begins it, chron.word.num-start); {name}: the greatest of them (a link)
        : tr('chron.event.lost-many', '{count} species did not live to see it end, {name} the greatest of them', { count: first ? numWordStart(lost.length) : numWord(lost.length), n: lost.length, name: L(reg, lost[0].serial) }));
    }
    if (!bits.length) return null;
    const score = 0.45 + 0.1 * bits.length + (lost.length >= 3 ? 0.1 : 0);
    return { kind: 'aftermath', score, col: 0xff9ad6e8, subjects: [slept?.[0], win?.[0], sank?.[0], lost[0]?.serial].filter(Boolean).slice(0, 3), force: true,
      // i18n: an event's aftermath: {event}, which is over (other: one without a name); {what}: what it did, clauses (chron.event.*) joined by chron.list.clauses
      html: tr('chron.event.over', '{event, select, drought {The drought is past} storm {The storm is spent} frost {The frost has lifted} duckweed {The duckweed has drifted on} other {It is over}}. {what}.', { event: ev.type, what: clauses(bits) }) };
  }

  // a heat wave's scalding, or a cold snap's sleep
  function excursionStory(ctx) {
    const { reg } = ctx;
    const x = S.excursion;
    S.excursion = null;
    let total = 0, worst = null, slept = null;
    for (const [serial, c0] of x.snap.cum) {
      const st = S.sp.get(serial), sp = reg.get(serial);
      if (!st || !sp) continue;
      const scald = st.cum[C.scalded] - c0[C.scalded], cyst = st.cum[C.cyst] - c0[C.cyst];
      total += scald;
      if (scald > (worst?.[1] ?? 0)) worst = [serial, scald];
      if (cyst > (slept?.[1] ?? 0) && cyst >= 0.3 * (x.snap.pops.get(serial) || 1)) slept = [serial, cyst];
    }
    if (x.dT > 0 && worst && total >= 0.03 * Math.max(1, x.snap.living)) {
      const g = reg.get(worst[0]).genome;
      return { kind: 'heat', score: 0.5 + Math.min(0.2, total / x.snap.living), col: 0xff3a8aff, subjects: [worst[0]],
        // i18n: a heat wave's toll: {n} cells scalded, {most} (yes: most, else many) of them {name} (a link), a species at its best near {topt} °C
        html: tr('chron.heat.scalded', 'The heat wave has scalded {n, plural, other {# cells}}, {most, select, yes {most} other {many}} of them {name}, a species at its best near {topt}°.', { n: total, most: worst[1] >= 0.5 * total ? 'yes' : 'no', name: L(reg, worst[0]), topt: Math.round(g.topt) }) };
    }
    if (x.dT < 0 && slept) {
      return { kind: 'heat', score: 0.45, col: 0xffd68a3d, subjects: [slept[0]],
        // i18n: a cold snap: {name} (a link) made {n} cysts
        html: tr('chron.heat.cysts', 'When the cold came, {name} withdrew into {n, plural, other {# cysts}}, to wait for better days.', { name: L(reg, slept[0]), n: slept[1] }) };
    }
    return null;
  }

  // ------------------------------------------------------------------ the page's API
  return {
    observe, note, reset,
    /** The species ledger's watch list: { version, serials (SPL_WATCH, 0 free) }. */
    watch: () => S.watch,
    /** What a species eats most and what eats it most, among the watched (serials, or null), from the meals counted. */
    relations(serial) {
      const st = S.sp.get(serial);
      if (!st) return { food: null, eater: null };
      const top = (m) => { const [k, v, sum] = topBy(m); return k && v >= 0.25 * sum && v >= 5 ? k : null; };
      return { food: top(st.diet), eater: top(st.eaters) };
    },
    /** The latest story told about a species, or null: { t, text, html }. */
    latest: (serial) => S.latest.get(serial) || null,
    /** What a saved world keeps of the chronicler (the stories' memory, not the ledger's baselines). */
    save() {
      const keep = { ...S, prevPairs: null, prevVer: -1, prevSlot: null, prevCause: null, pending: null, versions: new Map(), lastReal: -1e9 };
      keep.firsts = [...S.firsts];
      keep.eraMark = S.eraMark ? { ...S.eraMark, snap: null, pending: null } : null;
      keep.eventMark = null; keep.excursion = null;
      return keep;
    },
    load(o) {
      reset();
      if (!o) return;
      Object.assign(S, o, { firsts: new Set(o.firsts || []), versions: new Map(), watch: { version: (o.watch?.version || 0) + 1, serials: new Array(SPL_WATCH).fill(0) }, lastReal: -1e9 });
      if (S.eraMark && !S.eraMark.snap) S.eraMark = null;
      S.song = { ...freshVoices(), ...(o.song || {}) }; // (a save from before the voices, or with fewer of their fields)
    },
  };
}

/** The watch map for the engine (eng.setWatch): slot -> index + 1, from the watch list and each species' slot. */
export function watchMap(watch, reg, out = new Uint32Array(MAXK)) {
  out.fill(0);
  watch.serials.forEach((s, i) => {
    const sp = s && reg.get(s);
    if (sp && sp.alive && sp.slot >= FIRST_LIFE && sp.slot < MAXK) out[sp.slot] = i + 1;
  });
  return out;
}
