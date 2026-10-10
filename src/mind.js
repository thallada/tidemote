// What the selected cell is doing and why: reads the mindMain replay (shaders.js) of its last decision.
// A cell has no brain. Each frame it sums pulls and pushes from everything within reach (its receptors
// against their surface signatures, appetite for the foods its diet favours, schooling, bonds, stone),
// then eats, divides or neither. These helpers name the outcome; they are pure and tested.
import { MIND_HEAD, MIND_NBR, MIND_NBR_WORDS } from './shaders.js';

const NONE = 0xffffffff;
const GLINT = 1, HUSK = 2;

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
    nbrs.push({ kind: u32[o], inside: u32[o + 1] === 1, d: v2(o + 2), fSig: f32[o + 4] * acc * stride, fDiet: f32[o + 5] * acc * stride, j: u32[o + 6] });
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
      align: v2(36), bond: v2(38), stone: v2(40), swim: v2(42), heat: v2(50),
    },
    flow: v2(44),
    matterN: [f32[46], f32[47], f32[48], f32[49]],
    // warmth: its own temperature (body warmth included), the water's, how well it works there
    // (perf, a rate multiplier) and how many tolerances it is from its optimum (x)
    warmth: f32[21], water: f32[52], perf: f32[53], x: f32[54], torpid: !!(u32[55] & 1),
    nbrs,
  };
}

// The pulls the page shows, in a fixed order per species (only those its genome makes possible),
// so the rows never reorder. Each sums one or more of mindMain's force terms.
const GROUPS = [
  { key: 'food', label: 'Appetite', parts: ['diet', 'forage'], tip: 'mind-food', css: '#ff8a6b', when: (g, K) => (1 - g.photo) ** 2 > 0.1 },
  { key: 'other', label: 'Other species', parts: ['other'], tip: 'mind-other', css: '#c79bff' },
  { key: 'kin', label: 'Own kind', parts: ['kin'], tip: 'mind-kin', css: '#f1e3a0' },
  { key: 'space', label: 'Personal space', parts: ['space'], tip: 'personalspace', css: '#8fa3a6' },
  { key: 'matter', label: 'Matter & stone', parts: ['matter', 'stone'], tip: 'mind-matter', css: '#6fa0c0' },
  { key: 'bond', label: 'Bonds', parts: ['bond'], tip: 'bond', css: '#ffb36b', when: (g, K) => (g.adhesion || 0) > K.adhMin },
  { key: 'align', label: 'Schooling', parts: ['align'], tip: 'schooling', css: '#7fe0c0', when: (g) => g.align > 0.02 },
  { key: 'swim', label: 'Swimming', parts: ['swim'], tip: 'swimming', css: '#e2f1f0', when: (g) => g.swim * (1 - g.photo) > 0.01 },
  { key: 'heat', label: 'Warmth', parts: ['heat'], tip: 'thermotaxis', css: '#ff8a3a', when: (g, K) => K.heat && g.swim * (1 - g.photo) > 0.01 },
];
export const groupsFor = (g, K) => GROUPS.filter((gr) => !gr.when || gr.when(g, K));

const len = (v) => Math.hypot(v[0], v[1]);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The mode readout: one or two words for each state, its target shown beside it.
const MODES = {
  divide: 'Dividing', seeksilt: 'Ready to divide', feed: 'Eating glint', scavenge: 'Scavenging', graze: 'Grazing',
  hunt: 'Hunting', starve: 'Starving', flee: 'Fleeing', stalk: 'Stalking', seekgraze: 'Seeking forage',
  forage: 'Foraging', avoid: 'Avoiding', follow: 'Drawn in', bask: 'Basking', dark: 'Waiting out the dark',
  school: 'Schooling', body: 'Holding together', gather: 'Gathering', spread: 'Spreading out', jostle: 'Jostled',
  blocked: 'Against stone', drift: 'Drifting', cruise: 'Cruising', idle: 'Idling',
  torpid: 'Torpid', scalding: 'Scalding', seekwarm: 'Seeking warmth', seekcool: 'Seeking cooler water', huddle: 'Keeping warm',
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

/** Chance one strike by `g` (at `stoneN` grains of stone, with search image `image`) lands on `prey`. */
export function strikeChance(g, prey, preyKind, image, stoneN, K) {
  const armor = 1 / (1 + K.armor * Math.max(0, (prey.adhesion || 0) - K.adhMin));
  const familiar = image === 0 || image === preyKind ? 1 : 1 - K.searchImage;
  const shelter = 1 - Math.min(K.refugeMax, stoneN * K.refuge);
  return armor * familiar * catchSkill(g, prey, K) * shelter;
}

/** Per neighbouring species: how many, how hard they pull or push, and who could eat whom. */
function neighbourSpecies(m, g, kind, genomeOf, K) {
  const map = new Map();
  const scale = m.sampled ? m.seen / m.sampled : 1;
  for (const q of m.nbrs) {
    let s = map.get(q.kind);
    if (!s) {
      const gq = q.kind === kind ? g : genomeOf(q.kind);
      s = { kind: q.kind, kin: q.kind === kind, n: 0, sig: 0, diet: 0, g: gq,
        threat: q.kind === kind ? 0 : catchSkill(gq, g, K), prey: q.kind === kind ? 0 : catchSkill(g, gq, K),
        // how often one of their strikes lands on this cell (taking them to be used to its kind, and in open water)
        danger: q.kind === kind || !gq ? 0 : strikeChance(gq, g, kind, 0, 0, K) };
      map.set(q.kind, s);
    }
    s.n += m.stride * scale;
    // personal space is jostling, not preference: count only the signature pull beyond it
    if (!q.inside) s.sig += q.fSig * scale;
    s.diet += q.fDiet * scale;
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

/**
 * Name what the cell is doing. Returns { key, mode, target, text, why, odds, flags[], groups[], species[], budget, ... }.
 * text, why and a flag's hint may hold {sp} for the target species, which the page names.
 */
export function interpretMind(m, g, kind, { K, genomeOf }) {
  const drives = Object.entries(m.drives).map(([key, v]) => ({ key, v, mag: len(v) }))
    .filter((d) => d.mag > 1e-4).sort((a, b) => b.mag - a.mag);
  const total = drives.reduce((s, d) => s + d.mag, 0) || 1;
  const share = (key) => (drives.find((d) => d.key === key)?.mag || 0) / total;
  const groups = groupsFor(g, K).map((gr) => {
    const v = gr.parts.reduce((a, k) => [a[0] + m.drives[k][0], a[1] + m.drives[k][1]], [0, 0]);
    return { ...gr, v, mag: len(v), share: len(v) / total };
  });
  const species = neighbourSpecies(m, g, kind, genomeOf, K);
  const others = species.filter((s) => !s.kin);
  const E = m.energy, need = g.reproE;
  const lean = 0.55 + 0.45 * Math.min(1, Math.max(0, E / need));
  const net = m.photoGain - m.upkeep;
  // thermal stress costs upkeep; a heat-maker burns extra (thermalPerf mirrors the GPU's stress)
  const heatMaking = K.heat ? K.thermoCost * (g.thermo || 0) : 0;
  const stress = K.heat ? smooth(0.3, 0.9, Math.abs(m.x)) : 0;
  const budget = { light: m.photoGain, upkeep: m.upkeep, net, lean, crowding: m.kinCost - 1, thrift: K.bodyThrift * 0.5 * m.bonds, stress: K.stressCost * stress, heatMaking };
  const deg = (t) => `${Math.round(t)}°`;
  const range = g.topt != null ? `${deg(g.topt)} ± ${Math.round(g.tol)}°` : '';
  const pct = (x) => `${Math.round(x * 100)}%`;
  const hunger = `energy ${E.toFixed(2)} of the ${need.toFixed(2)} it needs to divide`;
  let st = null;

  const threat = others.filter((s) => s.threat >= 0.5).sort((a, b) => a.sig - b.sig)[0];
  const repel = others.filter((s) => s.sig < 0).sort((a, b) => a.sig - b.sig)[0];
  const draw = others.filter((s) => s.sig > 0).sort((a, b) => b.sig - a.sig)[0];

  if (K.heat && m.torpid) {
    st = { key: 'torpid', text: 'Torpid in the cold', why: `At ${deg(m.warmth)} it is ${Math.round((g.topt - g.tol * K.torporAt) - m.warmth + 0.5)}° below the range it can work in (it prefers ${range}): it neither feeds, swims nor divides, and burns ${Math.round(K.torporCost * 100)}% of its upkeep until the water warms.` };
  } else if (E >= need) {
    st = m.siltNear
      ? { key: 'divide', matter: 'Silt', text: 'Dividing', why: `Its energy (${E.toFixed(2)}) has reached the ${need.toFixed(2)} it needs, and a grain of silt is in reach to build a child from.` }
      : { key: 'seeksilt', matter: 'Silt, none in reach', text: 'Ready to divide', why: `It has the energy to divide (${E.toFixed(2)} of ${need.toFixed(2)}) but no grain of silt within reach to build a child from, so it waits. Full, it has stopped feeding.` };
  } else if (m.food && m.hungry) {
    const fk = m.food.kind;
    if (fk === GLINT) st = { key: 'feed', matter: 'Glint', text: 'Eating glint', why: `Hungry (${hunger}), with charged glint in reach.` };
    else if (fk === HUSK) st = { key: 'scavenge', matter: 'Husk', text: 'Scavenging a husk', why: `Hungry (${hunger}), with a husk in reach to pick over.` };
    else {
      const gq = genomeOf(fk);
      const plant = gq && gq.photo > 0.4;
      const p = gq ? strikeChance(g, gq, fk, m.image, m.stoneN, K) : 0;
      const every = K.eatEvery * (plant ? K.biteEvery : K.killEvery) * (m.dt || 1 / 60);
      const unfamiliar = m.image !== 0 && m.image !== fk && K.searchImage > 0;
      const odds = { p, every, verb: plant ? 'bite' : 'kill', unfamiliar };
      st = plant
        ? { key: 'graze', target: fk, odds, text: 'Grazing on {sp}', why: `Hungry (${hunger}), with a {sp} cell in reach to crop. A bite lands about ${pct(p)} of the time, one try every ${every.toFixed(1)} s.` }
        : { key: 'hunt', target: fk, odds, text: 'Hunting {sp}', why: `Hungry (${hunger}), with {sp} in reach. A strike kills about ${pct(p)} of the time, one try every ${every.toFixed(1)} s${unfamiliar ? '; it is used to other prey, so it often misses this one' : ''}.` };
    }
  }
  const left = net < 0 ? E / -net : Infinity;
  if (!st && K.heat && m.x > 0.8) {
    st = { key: 'scalding', text: 'Scalding', why: `At ${deg(m.warmth)} it is far above the ${deg(g.topt)} it prefers: it barely works (${Math.round(m.perf * 100)}%) and may die of the heat any moment.` };
  }
  if (!st && left < 8) {
    st = { key: 'starve', text: 'Starving', why: `Its energy (${E.toFixed(2)}) is nearly spent: about ${Math.max(1, Math.round(left))} s left at ${(-net).toFixed(3)}/s${m.hungry ? ', with nothing it eats in reach' : ''}.` };
  }
  if (!st && threat && -threat.sig > 0.2 * total) {
    st = { key: 'flee', target: threat.kind, text: 'Fleeing {sp}', why: `{sp} hunts cells like this one: about ${pct(threat.danger)} of their strikes would land. This cell's receptors are repelled by {sp}'s surface signature, so it is pushed away from them.` };
  }
  if (!st && m.hungry && share('diet') >= 0.25) {
    const prey = others.filter((s) => s.diet > 0).sort((a, b) => b.diet - a.diet)[0];
    if (prey) {
      const plant = prey.g && prey.g.photo > 0.4;
      st = { key: plant ? 'seekgraze' : 'stalk', target: prey.kind, text: plant ? 'Seeking {sp} to graze' : 'Stalking {sp}', why: `Hungry (${hunger}). Its diet draws it toward {sp} nearby, which is not yet in reach.` };
    }
  }
  if (!st && m.hungry && share('forage') >= 0.25) {
    const glint = g.dGlint * m.matterN[GLINT] >= g.dHusk * m.matterN[HUSK];
    st = { key: 'forage', matter: glint ? 'Glint' : 'Husks', text: glint ? 'Foraging for glint' : 'Foraging for husks', why: `Hungry (${hunger}). Its diet draws it toward the ${glint ? 'glint' : 'husks'} drifting nearby.` };
  }
  if (!st && K.heat && share('heat') >= 0.25) {
    const warmer = g.topt > m.warmth;
    st = { key: warmer ? 'seekwarm' : 'seekcool', text: warmer ? 'Seeking warmth' : 'Seeking cooler water', why: `At ${deg(m.warmth)} it is ${warmer ? 'colder' : 'warmer'} than the ${deg(g.topt)} it prefers, so it swims ${warmer ? 'up' : 'down'} the warmth of the water around it.` };
  }
  if (!st && K.heat && (g.thermo || 0) > 0.2 && m.bonds > 0 && m.x < 0 && m.water < g.topt - 1) {
    st = { key: 'huddle', text: 'Keeping warm', why: `A heat-maker in a body: it burns ${heatMaking.toFixed(3)}/s to run ${deg(m.warmth - m.water)} above the ${deg(m.water)} water, and its body holds the warmth in.` };
  }
  if (!st && repel && -repel.sig > 0.35 * total) {
    st = { key: 'avoid', target: repel.kind, text: 'Keeping away from {sp}', why: 'Its receptors are repelled by the surface signature of {sp}, so it is pushed away from them.' };
  }
  if (!st && draw && draw.sig > 0.35 * total) {
    st = { key: 'follow', target: draw.kind, text: 'Drawn to {sp}', why: 'Its receptors are attracted to the surface signature of {sp}, so it gathers among them.' };
  }
  if (!st && g.photo > 0.4) {
    st = net >= 0
      ? { key: 'bask', text: 'Basking', why: `Photosynthesising: ${m.photoGain.toFixed(3)}/s from ${pct(m.light)} light${K.heat && m.perf > 1.05 ? ` in warm water that suits it (${pct(m.perf)})` : ''}, more than its ${m.upkeep.toFixed(3)}/s upkeep.` }
      : { key: 'dark', text: 'Waiting out the dark', why: `Photosynthesising ${m.photoGain.toFixed(3)}/s from ${pct(m.light)} light${m.nutr < 3 ? ' with little silt nearby for minerals' : ''}: less than its ${m.upkeep.toFixed(3)}/s upkeep, so it is living on its reserves.` };
  }
  if (!st) {
    const top = drives[0];
    const kinSig = species.find((s) => s.kin)?.sig || 0;
    const flowing = len(m.flow) > len(m.vel) && len(m.flow) > 0.05;
    if (top && top.key === 'align') st = { key: 'school', text: 'Schooling', why: 'Steering to match the heading of its own kind around it.' };
    else if (top && top.key === 'bond') st = { key: 'body', text: 'Holding its body together', why: 'Its bonds are the strongest pull on it: the body keeps its shape.' };
    else if (top && top.key === 'kin') st = kinSig >= 0 ? { key: 'gather', text: 'Gathering with its kind', why: 'Drawn toward cells of its own species.' } : { key: 'spread', text: 'Spreading from its kind', why: 'Its own species repels it, so it keeps its distance.' };
    else if (top && top.key === 'space') st = { key: 'jostle', text: 'Jostled in a crowd', why: 'Packed in tight: the strongest push on it is other cells\' personal space.' };
    else if (top && top.key === 'stone') st = { key: 'blocked', text: 'Pressed against stone', why: 'Stone is solid to it; it is being pushed around a grain.' };
    else if (flowing) st = { key: 'drift', text: 'Drifting on the current', why: 'Nothing nearby pulls on it much; the current carries it.' };
    else if (top && top.key === 'swim') st = { key: 'cruise', text: 'Cruising', why: m.hungry ? `Hungry (${hunger}) but nothing it eats is near, so it swims on.` : 'Swimming on, with nothing nearby pulling on it much.' };
    else st = { key: 'idle', text: 'Idling', why: m.hungry ? `Hungry (${hunger}), but nothing it eats is in sight.` : 'Nothing nearby pulls on it much.' };
  }

  // indicator lamps: always the same set, lit or dark, each with its particulars as a hint
  const shelter = Math.min(K.refugeMax, m.stoneN * K.refuge);
  const flags = [
    { key: 'hungry', label: 'Hungry', on: m.hungry, hint: m.hungry ? `Hungry: ${hunger}. It is drawn to food and eats what comes in reach.` : (g.photo > 0.4 && m.eatEff <= 0.1 ? 'Lives on light alone: too committed to photosynthesis to eat.' : `Not hungry: ${hunger}.`) },
    { key: 'full', label: 'Ready to divide', on: E >= need, hint: E >= need ? `Has the energy to divide; ${m.siltNear ? 'a grain of silt is in reach.' : 'needs a grain of silt within reach to build a child from.'}` : `Divides at ${need.toFixed(2)} energy.` },
    { key: 'threat', label: 'Predator in reach', on: !!threat, target: threat ? threat.kind : null, hint: threat ? `{sp}, within reach, hunts cells like this one: about ${pct(threat.danger)} of their strikes would land.` : 'Nothing within reach is built to catch cells like this one.' },
    { key: 'low', label: 'Energy running out', on: left < 30, hint: left < 30 ? `About ${Math.max(1, Math.round(left))} s of energy left without ${g.photo > 0.4 ? 'more light' : 'a meal'}.` : 'Energy reserves are not running out.' },
    { key: 'lean', label: 'Saving energy', on: lean < 0.8, hint: `A cell low on energy slows its metabolism: this one burns ${pct(lean)} of its full upkeep.` },
    { key: 'crowd', label: 'Crowded by kin', on: m.kinCost > 1.01, hint: m.kinCost > 1.01 ? `Packed among ${Math.round(m.kinN)} of its own kind: upkeep +${pct(m.kinCost - 1)}.` : `Fewer than ${K.kinFree + 1} of its own kind around (bond partners aside): no crowding cost.` },
    { key: 'shelter', label: 'Sheltered by stone', on: m.stoneN >= 1, hint: m.stoneN >= 1 ? `Among stone: attacks made from here miss ${pct(shelter)} of the time.` : 'No stone nearby to hide among.' },
  ];
  if (K.heat) {
    // one lamp for temperature: a cell is too cold or too hot, never both
    const cold = m.x < -0.3, hot = m.x > 0.3;
    flags.push({ key: 'thermal', tone: cold ? 'cold' : hot ? 'hot' : '', label: cold ? 'Too cold' : hot ? 'Too hot' : 'Comfortable', on: cold || hot,
      hint: `${deg(m.warmth)}, it prefers ${range}: ${cold ? `${pct(m.perf)} of its best${m.torpid ? '; torpid' : ''}.` : hot ? `${pct(m.perf)} of its best${m.x > 0.8 ? '; it may scald' : ''}.` : 'comfortable.'}` });
  }
  return { ...st, need, mode: MODES[st.key], target: st.target ?? null, flags, groups, drives, total, species, budget };
}

/**
 * Keep each neighbouring species in the row it had: rows[i] is a kind or null. A kind keeps its row
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
