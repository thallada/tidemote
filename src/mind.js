// What the selected cell is doing and why: reads the mindMain replay (shaders.js) of its last decision.
// A cell has no brain. Each frame it sums pulls and pushes from everything within reach (its receptors
// against their surface signatures, appetite for the foods its diet favors, schooling, bonds, stone),
// then eats, divides or neither. These helpers name the outcome; they are pure and tested.
import { MIND_HEAD, MIND_NBR, MIND_NBR_WORDS } from './shaders.js';
import { divEnergy } from './genome.js';
import { tr } from './i18n.js';

const HUSK = 2;

/** Decode a mind buffer (u32/f32 views of one readback; layout in mindMain). Null if the cell was not found. */
export function parseMind(u32, f32) {
  if (u32[1] !== 1) return null;
  const v2 = (o) => [f32[o], f32[o + 1]];
  const flags = u32[2];
  const stride = f32[17], acc = f32[20];
  const n = Math.min(u32[7], MIND_NBR);
  const nbrs = [];
  // each sample stands for `stride` particles, as in lifeMain's scan
  for (let k = 0; k < n; k++) {
    const o = MIND_HEAD + k * MIND_NBR_WORDS;
    nbrs.push({ kind: u32[o], inside: u32[o + 1] === 1, d: v2(o + 2), fSig: f32[o + 4] * acc * stride, fDiet: f32[o + 5] * acc * stride, j: u32[o + 6], fFlee: f32[o + 7] * acc * stride });
  }
  return {
    hungry: !!(flags & 1), siltNear: !!(flags & 2),
    food: flags & 4 ? { kind: u32[3], dist: f32[4], j: u32[5], d: v2(56) } : null,
    image: u32[6], seen: u32[7], sampled: n,
    photoGain: f32[8], upkeep: f32[9], light: f32[10], nutr: f32[11], kinN: f32[12],
    bonds: f32[13], kinCost: f32[14], stoneN: f32[15], eatEff: f32[16], stride, dt: f32[18], energy: f32[19],
    vel: v2(22),
    drives: {
      space: v2(24), kin: v2(26), other: v2(28), diet: v2(30), matter: v2(32), forage: v2(34),
      align: v2(36), bond: v2(38), stone: v2(40), swim: v2(42), heat: v2(50), flee: v2(60), light: v2(64), will: v2(66),
    },
    flow: v2(44),
    matterN: [f32[46], f32[47], f32[48], f32[49]],
    // warmth: its own temperature (body warmth included), the water's, how well it works there
    // (perf, a rate multiplier) and how many tolerances it is from its optimum (x)
    warmth: f32[21], water: f32[52], perf: f32[53], x: f32[54], torpid: !!(u32[55] & 1),
    // the energy it divides at (with the child's body), dormant (a cyst), old enough to divide,
    // how full its gut is (0..1, dropped as dung when full), producers around it
    divE: f32[58], cyst: !!(u32[59] & 1), mature: !!(u32[59] & 2), gut: f32[62], plantN: f32[63],
    nbrs,
  };
}

// The pulls the page shows, in a fixed order per species (only those its genome makes possible),
// so the rows never reorder. Each sums one or more of mindMain's force terms.
// i18n: the pulls on a cell, each a row in the specimen panel's Behavior section beside the compass
const GROUPS = [
  { key: 'food', label: tr('mind.pull.food', 'Appetite'), parts: ['diet', 'forage'], tip: 'mind-food', css: '#ff8a6b', when: (g, K) => (1 - g.photo) ** 2 > 0.1 },
  { key: 'flee', label: tr('mind.pull.flee', 'Fleeing hunters'), parts: ['flee'], tip: 'mind-flee', css: '#8fc8ff', when: (g, K) => K.flee > 0 && g.dFlesh <= 0.5 && g.photo <= 0.4 && g.swim > 0.01 },
  { key: 'other', label: tr('mind.pull.other', 'Other species'), parts: ['other'], tip: 'mind-other', css: '#c79bff' },
  { key: 'kin', label: tr('mind.pull.kin', 'Own kind'), parts: ['kin'], tip: 'mind-kin', css: '#f1e3a0' },
  { key: 'space', label: tr('mind.pull.space', 'Personal space'), parts: ['space'], tip: 'personalspace', css: '#8fa3a6' },
  { key: 'matter', label: tr('mind.pull.matter', 'Matter & stone'), parts: ['matter', 'stone'], tip: 'mind-matter', css: '#6fa0c0' },
  { key: 'bond', label: tr('mind.pull.bond', 'Bonds'), parts: ['bond'], tip: 'bond', css: '#ffb36b', when: (g, K) => (g.adhesion || 0) > K.adhMin },
  { key: 'align', label: tr('mind.pull.align', 'Schooling'), parts: ['align'], tip: 'schooling', css: '#7fe0c0', when: (g) => g.align > 0.02 },
  { key: 'swim', label: tr('mind.pull.swim', 'Swimming'), parts: ['swim'], tip: 'swimming', css: '#e2f1f0', when: (g) => g.swim * (1 - g.photo) > 0.01 },
  { key: 'heat', label: tr('mind.pull.heat', 'Warmth'), parts: ['heat'], tip: 'thermotaxis', css: '#ff8a3a', when: (g, K) => K.heat && g.swim * (1 - g.photo) > 0.01 },
  { key: 'light', label: tr('mind.pull.light', 'Light'), parts: ['light'], tip: 'phototaxis', css: '#ffe27a', when: (g, K) => K.phototaxis > 0 && Math.abs(g.phototaxis || 0) > 0.005 },
  // a ridden cell's will (docs/hand.md): the viewer's, one drive among the rest
  { key: 'will', label: tr('mind.pull.will', 'Will'), parts: ['will'], tip: 'will', css: '#f1e3a0', when: (g, K, ridden) => ridden },
];
/** The pulls shown for a cell of genome g (ridden: it is being ridden, and has a will). */
export const groupsFor = (g, K, ridden = false) => GROUPS.filter((gr) => !gr.when || gr.when(g, K, ridden));

const len = (v) => Math.hypot(v[0], v[1]);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The mode readout: one or two words for each state, its target shown beside it.
// i18n: the Behavior section's Mode row: one or two words for what the cell is doing
const MODES = {
  divide: tr('mind.mode.divide', 'Dividing'),
  seeksilt: tr('mind.mode.seeksilt', 'Ready to divide'),
  scavenge: tr('mind.mode.scavenge', 'Scavenging'),
  graze: tr('mind.mode.graze', 'Grazing'),
  hunt: tr('mind.mode.hunt', 'Hunting'),
  starve: tr('mind.mode.starve', 'Starving'),
  flee: tr('mind.mode.flee', 'Fleeing'),
  stalk: tr('mind.mode.stalk', 'Stalking'),
  seekgraze: tr('mind.mode.seekgraze', 'Seeking forage'),
  forage: tr('mind.mode.forage', 'Foraging'),
  avoid: tr('mind.mode.avoid', 'Avoiding'),
  follow: tr('mind.mode.follow', 'Drawn in'),
  bask: tr('mind.mode.bask', 'Basking'),
  dark: tr('mind.mode.dark', 'Waiting out the dark'),
  school: tr('mind.mode.school', 'Schooling'),
  body: tr('mind.mode.body', 'Holding together'),
  gather: tr('mind.mode.gather', 'Gathering'),
  spread: tr('mind.mode.spread', 'Spreading out'),
  jostle: tr('mind.mode.jostle', 'Jostled'),
  blocked: tr('mind.mode.blocked', 'Against stone'),
  drift: tr('mind.mode.drift', 'Drifting'),
  cruise: tr('mind.mode.cruise', 'Cruising'),
  idle: tr('mind.mode.idle', 'Idling'),
  torpid: tr('mind.mode.torpid', 'Torpid'),
  cyst: tr('mind.mode.cyst', 'Dormant'),
  rest: tr('mind.mode.rest', 'Resting, fed'),
  young: tr('mind.mode.young', 'Growing up'),
  dung: tr('mind.mode.dung', 'Dropping dung'),
  scalding: tr('mind.mode.scalding', 'Scalding'),
  seekwarm: tr('mind.mode.seekwarm', 'Seeking warmth'),
  seekcool: tr('mind.mode.seekcool', 'Seeking cooler water'),
  huddle: tr('mind.mode.huddle', 'Keeping warm'),
  seeklight: tr('mind.mode.seeklight', 'Following the light'),
  shunlight: tr('mind.mode.shunlight', 'Seeking shade'),
};

/** How well a hunter's build lets it catch a prey cell (0..1), as lifeMain's catch-skill roll. */
export function catchSkill(hunter, prey, K) {
  if (!hunter || !prey) return 0;
  const eatEff = (1 - hunter.photo) ** 2;
  if (eatEff <= 0.1 || (hunter.dFlesh <= K.dietMin && hunter.dGlint <= K.dietMin)) return 0;
  const pref = prey.photo > 0.4 ? K.grazePref * hunter.dGlint + K.plantPref * hunter.dFlesh : hunter.dFlesh;
  if (pref <= K.dietMin) return 0;
  return K.catchSkill > 0 ? Math.min(1, (eatEff * pref) / K.catchSkill) : 1;
}

/** Chance one strike by `g` (at `stoneN` grains of stone and `plantN` producers, with search image `image`) lands on `prey`. */
export function strikeChance(g, prey, preyKind, image, stoneN, K, plantN = 0) {
  const armor = 1 / (1 + K.armor * Math.max(0, (prey.adhesion || 0) - K.adhMin));
  const familiar = image === 0 || image === preyKind ? 1 : 1 - K.searchImage;
  const shelter = 1 - Math.min(K.refugeMax, stoneN * K.refuge);
  // an animal among dense producers hides in them
  const hidden = prey.photo <= 0.4 ? 1 - Math.min(K.refugeMax, plantN * K.plantRefuge) : 1;
  return armor * familiar * catchSkill(g, prey, K) * shelter * hidden;
}

/** How often a hunter at energy E (dividing at divE) takes a chance at living animal prey (K.satiety). */
export function attackChance(E, divE, K) {
  if (!(K.satiety > 0)) return 1;
  return Math.min(1, Math.max(0, (1 - E / (divE * K.satietyAt)) / K.satiety));
}

/** Per neighboring species: how many, how hard they pull or push, and who could eat whom. */
function neighborSpecies(m, g, kind, genomeOf, K) {
  const map = new Map();
  const scale = m.sampled ? m.seen / m.sampled : 1;
  for (const q of m.nbrs) {
    let s = map.get(q.kind);
    if (!s) {
      const gq = q.kind === kind ? g : genomeOf(q.kind);
      s = { kind: q.kind, kin: q.kind === kind, n: 0, sig: 0, diet: 0, flee: 0, g: gq,
        threat: q.kind === kind ? 0 : catchSkill(gq, g, K), prey: q.kind === kind ? 0 : catchSkill(g, gq, K),
        // how often one of their strikes lands on this cell (taking them to be used to its kind, and in open water)
        danger: q.kind === kind || !gq ? 0 : strikeChance(gq, g, kind, 0, 0, K) };
      map.set(q.kind, s);
    }
    s.n += m.stride * scale;
    // personal space is jostling, not preference: count only the signature pull beyond it
    if (!q.inside) s.sig += q.fSig * scale;
    s.diet += q.fDiet * scale;
    s.flee += (q.fFlee || 0) * scale;
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

/**
 * Name what the cell is doing. Returns { key, mode, target, text, why, odds, flags[], groups[], species[], budget, ... }.
 * text, why and a flag's hint may hold {sp} for the target species, which the page names.
 */
export function interpretMind(m, g, kind, { K, genomeOf, ridden = false }) {
  // a cyst runs no decision: nothing pulls on it (the replay's terms are what it would feel awake)
  const drives = m.cyst ? [] : Object.entries(m.drives).map(([key, v]) => ({ key, v, mag: len(v) }))
    .filter((d) => d.mag > 1e-4).sort((a, b) => b.mag - a.mag);
  const total = drives.reduce((s, d) => s + d.mag, 0) || 1;
  const share = (key) => (drives.find((d) => d.key === key)?.mag || 0) / total;
  const groups = groupsFor(g, K, ridden).map((gr) => {
    const v = m.cyst ? [0, 0] : gr.parts.reduce((a, k) => [a[0] + m.drives[k][0], a[1] + m.drives[k][1]], [0, 0]);
    return { ...gr, v, mag: len(v), share: len(v) / total };
  });
  const species = neighborSpecies(m, g, kind, genomeOf, K);
  const others = species.filter((s) => !s.kin);
  // it divides at its own threshold plus its child's body (lifeMain's divE)
  const E = m.energy, need = m.divE > 0 ? m.divE : divEnergy(g, K);
  const lean = 0.55 + 0.45 * Math.min(1, Math.max(0, E / need));
  const net = m.photoGain - m.upkeep;
  // thermal stress costs upkeep; a heat-maker burns extra (thermalPerf mirrors the GPU's stress)
  const heatMaking = K.heat ? K.thermoCost * (g.thermo || 0) : 0;
  const stress = K.heat ? smooth(0.3, 0.9, Math.abs(m.x)) : 0;
  // a cyst's only cost is its slow leak
  const budget = m.cyst
    ? { gut: m.gut || 0, light: 0, upkeep: K.cystLeak, net: -K.cystLeak, lean: 1, crowding: 0, thrift: 0, stress: 0, heatMaking: 0 }
    : { gut: m.gut || 0, light: m.photoGain, upkeep: m.upkeep, net, lean, crowding: m.kinCost - 1, thrift: K.bodyThrift * 0.5 * m.bonds, stress: K.stressCost * stress, heatMaking };
  // the messages below take temperatures as whole degrees ({t}°) and shares as whole percentages ({p}%)
  const deg = (t) => Math.round(t);
  // i18n: a species' preferred temperature and its tolerance either side, in degrees
  const range = g.topt != null ? tr('mind.range', '{opt}° ± {tol}°', { opt: deg(g.topt), tol: Math.round(g.tol) }) : '';
  const pct = (x) => Math.round(x * 100);
  // its energy and the energy it divides at, as the messages show them
  const e = E.toFixed(2), needs = need.toFixed(2);
  // {sp} stays in the text for the page to fill with the target species' name (mindview.js, specimen.js)
  const sp = '{sp}';
  let st = null;

  const threat = others.filter((s) => s.threat >= 0.5).sort((a, b) => a.sig - b.sig)[0];
  const repel = others.filter((s) => s.sig < 0).sort((a, b) => a.sig - b.sig)[0];
  const draw = others.filter((s) => s.sig > 0).sort((a, b) => b.sig - a.sig)[0];

  // i18n: the Behavior section's headline (text) and its hint (why) for each state. {sp} is the target species'
  // name; {e} its energy and {need} the energy it divides at (both to two decimals)
  if (m.cyst) {
    const lasts = K.cystLeak > 0 ? E / K.cystLeak : Infinity;
    // i18n: {leak} energy a second; {min} minutes its energy lasts (shown under an hour); {wake} seconds
    st = { key: 'cyst', text: tr('mind.state.cyst', 'Dormant'), why: tr('mind.state.cyst.why', 'Asleep as a cyst: it has let go of its body, and neither swims, feeds, divides nor can be eaten; it moves only as the water and its neighbors push it. It leaks {leak}/s of its {e} energy{lasts, select, short { (enough for about {min} min)} other {}} and wakes at random, about once every {wake} s on average, to try its luck again.', { leak: K.cystLeak, e, lasts: lasts < 3600 ? 'short' : 'long', min: Math.round(lasts / 60), wake: Math.round(1 / K.cystWake) }) };
  } else if (K.heat && m.torpid) {
    // i18n: {t} its temperature, {below} degrees below its working range, {range} its preferred range (20° ± 5°), {cost} a percentage
    st = { key: 'torpid', text: tr('mind.state.torpid', 'Torpid in the cold'), why: tr('mind.state.torpid.why', 'At {t}° it is {below}° below the range it can work in (it prefers {range}): it neither feeds, swims nor divides, and burns {cost}% of its upkeep until the water warms.', { t: deg(m.warmth), below: Math.round((g.topt - g.tol * K.torporAt) - m.warmth + 0.5), range, cost: Math.round(K.torporCost * 100) }) };
  } else if (E >= need && !m.mature) {
    // i18n: {at} a percentage of its lifespan, {age} that age in seconds
    st = { key: 'young', text: tr('mind.state.young', 'Growing up'), why: tr('mind.state.young.why', 'It has the energy to divide ({e} of {need}) but is too young: a cell divides only once it is {at}% through its lifespan ({age} s). Full, it has stopped feeding.', { e, need: needs, at: Math.round(K.mature * 100), age: Math.round(K.mature * g.lifespan) }) };
  } else if (E >= need) {
    // i18n: matter: what the Target row names when the target is matter, not a species
    st = m.siltNear
      ? { key: 'divide', matter: tr('mind.target.silt', 'Silt'), text: tr('mind.state.divide', 'Dividing'), why: tr('mind.state.divide.why', 'Its energy ({e}) has reached the {need} it needs, and a grain of silt is in reach to build a child from.', { e, need: needs }) }
      // i18n: {e} its energy and {need} the energy it divides at, to two decimals
      : { key: 'seeksilt', matter: tr('mind.target.silt-none', 'Silt, none in reach'), text: tr('mind.state.seeksilt', 'Ready to divide'), why: tr('mind.state.seeksilt.why', 'It has the energy to divide ({e} of {need}) but no grain of silt within reach to build a child from, so it waits. Full, it has stopped feeding.', { e, need: needs }) };
  } else if (m.gut >= 0.98 && m.siltNear) {
    st = { key: 'dung', matter: tr('mind.target.silt', 'Silt'), text: tr('mind.state.dung', 'Dropping dung'), why: tr('mind.state.dung.why', 'Its gut is full of what it ate but could not digest; it drops it beside a grain of silt as dung, a husk for scavengers.') };
  } else if (m.food && m.hungry) {
    const fk = m.food.kind;
    // i18n: {e} its energy and {need} the energy it divides at, to two decimals
    if (fk === HUSK) st = { key: 'scavenge', matter: tr('mind.target.husk', 'Husk'), text: tr('mind.state.scavenge', 'Scavenging a husk'), why: tr('mind.state.scavenge.why', 'Hungry (energy {e} of the {need} it needs to divide), with a husk in reach to pick over.', { e, need: needs }) };
    else {
      const gq = genomeOf(fk);
      const plant = gq && gq.photo > 0.4;
      const strike = gq ? strikeChance(g, gq, fk, m.image, m.stoneN, K, m.plantN) : 0;
      // a fed hunter rests: it takes a chance at living animals only as often as it is short of food
      const attack = plant ? 1 : attackChance(E, need, K);
      const p = strike * attack;
      const every = K.eatEvery * (plant ? K.biteEvery : K.killEvery) * (m.dt || 1 / 60);
      const unfamiliar = m.image !== 0 && m.image !== fk && K.searchImage > 0;
      const hidden = !plant && gq && gq.photo <= 0.4 && m.plantN * K.plantRefuge >= 0.1;
      const odds = { p, every, verb: plant ? 'bite' : 'kill', unfamiliar, attack };
      // i18n: {p}, {attack}, {strike} percentages; {every} seconds between tries, to a decimal
      st = plant
        ? { key: 'graze', target: fk, odds, text: tr('mind.state.graze', 'Grazing on {sp}', { sp }), why: tr('mind.state.graze.why', 'Hungry (energy {e} of the {need} it needs to divide), with a {sp} cell in reach to crop. A bite lands about {p}% of the time, one try every {every} s.', { e, need: needs, sp, p: pct(p), every: every.toFixed(1) }) }
        : attack < 0.5
          // i18n: {sp} is a species' name; {e} its energy and {need} the energy it divides at, to two decimals; {attack} and {strike} percentages
          ? { key: 'rest', target: fk, odds, text: tr('mind.state.rest', 'Fed, letting {sp} pass', { sp }), why: tr('mind.state.rest.why', 'Well fed (energy {e} of the {need} it needs to divide): a fed hunter strikes only as often as it is short of food, now at about {attack}% of its chances, so {sp} in reach is mostly left alone. When it does strike, it kills about {strike}% of the time.', { e, need: needs, attack: pct(attack), sp, strike: pct(strike) }) }
          : { key: 'hunt', target: fk, odds, text: tr('mind.state.hunt', 'Hunting {sp}', { sp }), why: tr('mind.state.hunt.why', 'Hungry (energy {e} of the {need} it needs to divide), with {sp} in reach. {fed, select, part {Part fed, it takes about {attack}% of its chances; a} other {A}} strike kills about {strike}% of the time, one try every {every} s{unfamiliar, select, yes {; it is used to other prey, so it often misses this one} other {}}{hidden, select, yes {; the producers around hide some of its prey} other {}}.', { e, need: needs, sp, fed: attack < 0.99 ? 'part' : 'hungry', attack: pct(attack), strike: pct(strike), every: every.toFixed(1), unfamiliar: unfamiliar ? 'yes' : 'no', hidden: hidden ? 'yes' : 'no' }) };
    }
  }
  const left = net < 0 ? E / -net : Infinity;
  if (!st && K.heat && m.x > 0.8) {
    // i18n: {t} its temperature, {opt} the temperature it prefers, {perf} a percentage
    st = { key: 'scalding', text: tr('mind.state.scalding', 'Scalding'), why: tr('mind.state.scalding.why', 'At {t}° it is far above the {opt}° it prefers: it barely works ({perf}%) and may die of the heat any moment.', { t: deg(m.warmth), opt: deg(g.topt), perf: Math.round(m.perf * 100) }) };
  }
  if (!st && left < 8) {
    // i18n: {left} seconds; {rate} energy a second, to three decimals
    st = { key: 'starve', text: tr('mind.state.starve', 'Starving'), why: tr('mind.state.starve.why', 'Its energy ({e}) is nearly spent: about {left} s left at {rate}/s{hungry, select, yes {, with nothing it eats in reach} other {}}.', { e, left: Math.max(1, Math.round(left)), rate: (-net).toFixed(3), hungry: m.hungry ? 'yes' : 'no' }) };
  }
  const chaser = others.filter((s) => s.flee > 0).sort((a, b) => b.flee - a.flee)[0];
  if (!st && chaser && share('flee') >= 0.15) {
    // i18n: {danger} a percentage, shown when the hunter is also one that could catch it
    st = { key: 'flee', target: chaser.kind, text: tr('mind.state.flee', 'Fleeing {sp}', { sp }), why: tr('mind.state.flee.why-chased', '{sp} is a hunter, and this cell swims away from hunters near it, the harder the closer they come{known, select, yes {: about {danger}% of their strikes would land} other {}}.', { sp, known: threat && threat.kind === chaser.kind ? 'yes' : 'no', danger: threat ? pct(threat.danger) : 0 }) };
  }
  // a producer does not swim away: its receptors' push from a grazer is avoidance (below)
  if (!st && threat && g.photo <= 0.4 && -threat.sig > 0.2 * total) {
    // i18n: {sp} is a species' name; {danger} a percentage
    st = { key: 'flee', target: threat.kind, text: tr('mind.state.flee', 'Fleeing {sp}', { sp }), why: tr('mind.state.flee.why-repelled', "{sp} hunts cells like this one: about {danger}% of their strikes would land. This cell's receptors are repelled by {sp}'s surface signature, so it is pushed away from them.", { sp, danger: pct(threat.danger) }) };
  }
  if (!st && m.hungry && share('diet') >= 0.25) {
    const prey = others.filter((s) => s.diet > 0).sort((a, b) => b.diet - a.diet)[0];
    if (prey) {
      const plant = prey.g && prey.g.photo > 0.4;
      // i18n: {sp} is a species' name; {e} its energy and {need} the energy it divides at, to two decimals
      st = { key: plant ? 'seekgraze' : 'stalk', target: prey.kind, text: plant ? tr('mind.state.seekgraze', 'Seeking {sp} to graze', { sp }) : tr('mind.state.stalk', 'Stalking {sp}', { sp }), why: tr('mind.state.stalk.why', 'Hungry (energy {e} of the {need} it needs to divide). Its diet draws it toward {sp} nearby, which is not yet in reach.', { e, need: needs, sp }) };
    }
  }
  if (!st && m.hungry && share('forage') >= 0.25) {
    // i18n: {e} its energy and {need} the energy it divides at, to two decimals
    st = { key: 'forage', matter: tr('mind.target.husks', 'Husks'), text: tr('mind.state.forage', 'Foraging for husks'), why: tr('mind.state.forage.why', 'Hungry (energy {e} of the {need} it needs to divide). Its diet draws it toward the husks drifting nearby.', { e, need: needs }) };
  }
  if (!st && K.heat && share('heat') >= 0.25) {
    const warmer = g.topt > m.warmth;
    // i18n: {t} its temperature, {opt} the temperature it prefers
    st = warmer
      ? { key: 'seekwarm', text: tr('mind.state.seekwarm', 'Seeking warmth'), why: tr('mind.state.seekwarm.why', 'At {t}° it is colder than the {opt}° it prefers, so it swims up the warmth of the water around it.', { t: deg(m.warmth), opt: deg(g.topt) }) }
      : { key: 'seekcool', text: tr('mind.state.seekcool', 'Seeking cooler water'), why: tr('mind.state.seekcool.why', 'At {t}° it is warmer than the {opt}° it prefers, so it swims down the warmth of the water around it.', { t: deg(m.warmth), opt: deg(g.topt) }) };
  }
  if (!st && share('light') >= 0.25) {
    const up = (g.phototaxis || 0) > 0;
    // i18n: {light} a percentage of full light
    st = up
      ? { key: 'seeklight', text: tr('mind.state.seeklight', 'Following the light'), why: tr('mind.state.seeklight.why', "At {light}% light, it pushes itself up the light's slope toward the brightest water{producer, select, yes {, where it photosynthesizes best} other {, where producers bloom}}.", { light: pct(m.light), producer: g.photo > 0.4 ? 'yes' : 'no' }) }
      : { key: 'shunlight', text: tr('mind.state.shunlight', 'Seeking shade'), why: tr('mind.state.shunlight.why', "At {light}% light, it pushes itself down the light's slope, away from the bright bands where producers bloom and their grazers and hunters gather.", { light: pct(m.light) }) };
  }
  if (!st && K.heat && (g.thermo || 0) > 0.2 && m.bonds > 0 && m.x < 0 && m.water < g.topt - 1) {
    // i18n: {rate} energy a second, to three decimals; {above} degrees warmer than the water; {water} the water's temperature
    st = { key: 'huddle', text: tr('mind.state.huddle', 'Keeping warm'), why: tr('mind.state.huddle.why', 'A heat-maker in a body: it burns {rate}/s to run {above}° above the {water}° water, and its body holds the warmth in.', { rate: heatMaking.toFixed(3), above: deg(m.warmth - m.water), water: deg(m.water) }) };
  }
  if (!st && repel && -repel.sig > 0.35 * total) {
    // i18n: {sp} is a species' name
    st = { key: 'avoid', target: repel.kind, text: tr('mind.state.avoid', 'Keeping away from {sp}', { sp }), why: tr('mind.state.avoid.why', 'Its receptors are repelled by the surface signature of {sp}, so it is pushed away from them.', { sp }) };
  }
  if (!st && draw && draw.sig > 0.35 * total) {
    // i18n: {sp} is a species' name
    st = { key: 'follow', target: draw.kind, text: tr('mind.state.follow', 'Drawn to {sp}', { sp }), why: tr('mind.state.follow.why', 'Its receptors are attracted to the surface signature of {sp}, so it gathers among them.', { sp }) };
  }
  if (!st && g.photo > 0.4) {
    // i18n: {gain} and {upkeep} energy a second, to three decimals; {light} and {perf} percentages
    st = net >= 0
      ? { key: 'bask', text: tr('mind.state.bask', 'Basking'), why: tr('mind.state.bask.why', 'Photosynthesizing: {gain}/s from {light}% light{warm, select, yes { in warm water that suits it ({perf}%)} other {}}, more than its {upkeep}/s upkeep.', { gain: m.photoGain.toFixed(3), light: pct(m.light), warm: K.heat && m.perf > 1.05 ? 'yes' : 'no', perf: pct(m.perf), upkeep: m.upkeep.toFixed(3) }) }
      : { key: 'dark', text: tr('mind.state.dark', 'Waiting out the dark'), why: tr('mind.state.dark.why', 'Photosynthesizing {gain}/s from {light}% light{poor, select, yes { with little silt nearby for minerals} other {}}: less than its {upkeep}/s upkeep, so it is living on its reserves.', { gain: m.photoGain.toFixed(3), light: pct(m.light), poor: m.nutr < 3 ? 'yes' : 'no', upkeep: m.upkeep.toFixed(3) }) };
  }
  if (!st) {
    const top = drives[0];
    const kinSig = species.find((s) => s.kin)?.sig || 0;
    const flowing = len(m.flow) > len(m.vel) && len(m.flow) > 0.05;
    if (top && top.key === 'align') st = { key: 'school', text: tr('mind.state.school', 'Schooling'), why: tr('mind.state.school.why', 'Steering to match the heading of its own kind around it.') };
    else if (top && top.key === 'bond') st = { key: 'body', text: tr('mind.state.body', 'Holding its body together'), why: tr('mind.state.body.why', 'Its bonds are the strongest pull on it: the body keeps its shape.') };
    else if (top && top.key === 'kin') st = kinSig >= 0 ? { key: 'gather', text: tr('mind.state.gather', 'Gathering with its kind'), why: tr('mind.state.gather.why', 'Drawn toward cells of its own species.') } : { key: 'spread', text: tr('mind.state.spread', 'Spreading from its kind'), why: tr('mind.state.spread.why', 'Its own species repels it, so it keeps its distance.') };
    else if (top && top.key === 'space') st = { key: 'jostle', text: tr('mind.state.jostle', 'Jostled in a crowd'), why: tr('mind.state.jostle.why', "Packed in tight: the strongest push on it is other cells' personal space.") };
    else if (top && top.key === 'stone') st = { key: 'blocked', text: tr('mind.state.blocked', 'Pressed against stone'), why: tr('mind.state.blocked.why', 'Stone is solid to it; it is being pushed around a grain.') };
    else if (flowing) st = { key: 'drift', text: tr('mind.state.drift', 'Drifting on the current'), why: tr('mind.state.drift.why', 'Nothing nearby pulls on it much; the current carries it.') };
    // i18n: {e} its energy and {need} the energy it divides at, to two decimals
    else if (top && top.key === 'swim') st = { key: 'cruise', text: tr('mind.state.cruise', 'Cruising'), why: m.hungry ? tr('mind.state.cruise.why-hungry', 'Hungry (energy {e} of the {need} it needs to divide) but nothing it eats is near, so it swims on.', { e, need: needs }) : tr('mind.state.cruise.why', 'Swimming on, with nothing nearby pulling on it much.') };
    else st = { key: 'idle', text: tr('mind.state.idle', 'Idling'), why: m.hungry ? tr('mind.state.idle.why-hungry', 'Hungry (energy {e} of the {need} it needs to divide), but nothing it eats is in sight.', { e, need: needs }) : tr('mind.state.idle.why', 'Nothing nearby pulls on it much.') };
  }

  // indicator lamps: always the same set, lit or dark, each with its particulars as a hint
  const shelter = Math.min(K.refugeMax, m.stoneN * K.refuge);
  const meadow = g.photo <= 0.4 ? Math.min(K.refugeMax, (m.plantN || 0) * K.plantRefuge) : 0;
  const hid = 1 - (1 - shelter) * (1 - meadow);
  const low = Math.max(1, Math.round(left));
  // i18n: the Behavior section's lamps: a label, and a hint on what lit (or did not light) it. {e} its energy
  // and {need} the energy it divides at (both to two decimals); percentages are whole numbers
  const flags = [
    // i18n: {e} its energy and {need} the energy it divides at, to two decimals
    { key: 'hungry', label: tr('mind.lamp.hungry', 'Hungry'), on: m.hungry, hint: m.hungry ? tr('mind.lamp.hungry.on', 'Hungry: energy {e} of the {need} it needs to divide. It is drawn to food and eats what comes in reach.', { e, need: needs }) : (g.photo > 0.4 && m.eatEff <= 0.1 ? tr('mind.lamp.hungry.light', 'Lives on light alone: too committed to photosynthesis to eat.') : tr('mind.lamp.hungry.off', 'Not hungry: energy {e} of the {need} it needs to divide.', { e, need: needs })) },
    // i18n: {age} seconds; {own} the energy it divides at for itself, to two decimals
    { key: 'full', label: tr('mind.lamp.full', 'Ready to divide'), on: E >= need && m.mature && !m.cyst, hint: E >= need ? (m.mature ? tr('mind.lamp.full.on', 'Has the energy to divide; {silt, select, yes {a grain of silt is in reach.} other {needs a grain of silt within reach to build a child from.}}', { silt: m.siltNear ? 'yes' : 'no' }) : tr('mind.lamp.full.young', 'Has the energy, but divides only once {age} s old.', { age: Math.round(K.mature * g.lifespan) })) : tr('mind.lamp.full.off', "Divides at {need} energy: its own {own} and its child's body.", { need: needs, own: g.reproE.toFixed(2) }) },
    { key: 'threat', label: tr('mind.lamp.threat', 'Predator in reach'), on: !!threat, target: threat ? threat.kind : null, hint: threat ? tr('mind.lamp.threat.on', '{sp}, within reach, hunts cells like this one: about {danger}% of their strikes would land.', { sp, danger: pct(threat.danger) }) : tr('mind.lamp.threat.off', 'Nothing within reach is built to catch cells like this one.') },
    // i18n: {left} seconds
    { key: 'low', label: tr('mind.lamp.low', 'Energy running out'), on: left < 30, hint: left < 30 ? tr('mind.lamp.low.on', 'About {left} s of energy left without {producer, select, yes {more light} other {a meal}}.', { left: low, producer: g.photo > 0.4 ? 'yes' : 'no' }) : tr('mind.lamp.low.off', 'Energy reserves are not running out.') },
    { key: 'lean', label: tr('mind.lamp.lean', 'Saving energy'), on: lean < 0.8, hint: tr('mind.lamp.lean.hint', 'A cell low on energy slows its metabolism: this one burns {lean}% of its full upkeep.', { lean: pct(lean) }) },
    // i18n: {n} cells of its own kind around it; {extra} a percentage
    { key: 'crowd', label: tr('mind.lamp.crowd', 'Crowded by kin'), on: m.kinCost > 1.01, hint: m.kinCost > 1.01 ? tr('mind.lamp.crowd.on', 'Packed among {n} of its own kind: upkeep +{extra}%.', { n: Math.round(m.kinN), extra: pct(m.kinCost - 1) }) : tr('mind.lamp.crowd.off', 'Fewer than {n} of its own kind around (bond partners aside): no crowding cost.', { n: K.kinFree + 1 }) },
    // i18n: {among}: what hides it (stone, producers or both); {hid} a percentage
    { key: 'shelter', label: tr('mind.lamp.shelter', 'Sheltered'), on: hid >= 0.05, hint: hid >= 0.05 ? tr('mind.lamp.shelter.on', '{among, select, both {Among stone and producers} stone {Among stone} other {Hidden among producers}}: attacks on it miss about {hid}% of the time.', { among: shelter > 0 && meadow > 0 ? 'both' : shelter > 0 ? 'stone' : 'producers', hid: pct(hid) }) : g.photo <= 0.4 ? tr('mind.lamp.shelter.off', 'No stone or producers nearby to hide among.') : tr('mind.lamp.shelter.off-producer', 'No stone nearby to hide among.') },
  ];
  if (K.heat) {
    // one lamp for temperature: a cell is too cold or too hot, never both
    const cold = m.x < -0.3, hot = m.x > 0.3;
    // i18n: {t} its temperature, {range} its preferred range (20° ± 5°), {perf} how well it works there (a percentage)
    flags.push({ key: 'thermal', tone: cold ? 'cold' : hot ? 'hot' : '', label: cold ? tr('mind.lamp.cold', 'Too cold') : hot ? tr('mind.lamp.hot', 'Too hot') : tr('mind.lamp.comfortable', 'Comfortable'), on: cold || hot,
      hint: tr('mind.lamp.thermal.hint', '{t}°, it prefers {range}: {state, select, cold {{perf}% of its best{torpid, select, yes {; torpid} other {}}.} hot {{perf}% of its best{scald, select, yes {; it may scald} other {}}.} other {comfortable.}}', { t: deg(m.warmth), range, state: cold ? 'cold' : hot ? 'hot' : 'fine', perf: pct(m.perf), torpid: m.torpid ? 'yes' : 'no', scald: m.x > 0.8 ? 'yes' : 'no' }) });
  }
  // asleep, none of the awake cell's states hold (nothing can catch a cyst)
  if (m.cyst) for (const f of flags) if (f.key !== 'thermal') { f.on = false; if (f.key === 'threat') f.hint = tr('mind.lamp.threat.cyst', 'Nothing can catch a cyst.'); }
  return { ...st, need, mode: MODES[st.key], target: st.target ?? null, flags, groups, drives, total, species, budget };
}

/**
 * Keep each neighboring species in the row it had: rows[i] is a kind or null. A kind keeps its row
 * while present; a new one takes the first free row. Returns the new rows (n of them).
 */
export function slotRows(rows, kinds, n) {
  const out = Array.from({ length: n }, (_, i) => (rows && kinds.includes(rows[i]) ? rows[i] : null));
  for (const k of kinds) {
    if (out.includes(k)) continue;
    const i = out.indexOf(null);
    if (i < 0) break;
    out[i] = k;
  }
  return out;
}

/** Steady the headline: a new state shows once it has held for `hold` consecutive readings. */
export function settleMind(memo, state, hold = 2) {
  const id = `${state.key}:${state.target}`;
  if (!memo || !memo.cur) return { cur: state, id, cand: null, n: 0 };
  if (id === memo.id) return { cur: state, id, cand: null, n: 0 };
  const n = memo.cand === id ? memo.n + 1 : 1;
  if (n >= hold) return { cur: state, id, cand: null, n: 0 };
  return { ...memo, cand: id, n };
}
