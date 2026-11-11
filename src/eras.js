// The climate eras' names: pure, and the same in the page, the soundtrack's worklet and headless runs.
// i18n-ignore-file (every word here is a key: an era's name is kept in English, and eraName in eraname.js
// gives it in the page's words, one message for each pattern and one for each word)
//
// An era is named as it begins, for what marks it: the water warming or cooling (a heat wave or a cold snap to
// come), the light rising or failing, the water falling to bare the floor or rising over it again, the pool's
// last upheaval (a storm, a drought, a frost, a duckweed), and, where the page tells it (lifeFacts), the life
// holding the pool: a bloom or a dwindling, hunters or grazers or scavengers gaining, a genus reigning, many new
// species, a recovery. The strongest of these is the era's theme, the next may color it, and one of a dozen
// patterns gives it words. A world has a word of its own for each theme ("The Drowning"), counted when it
// returns ("The Second Drowning"), and quiet stretches take a place-like stage name ("The Vothian", then
// "Late Vothian"). Names are drawn from two numbers the climate draws at the era's start (so its random
// stream is the same whatever the name), never repeat in what the world's record holds, and never put the
// same head word on two eras in a row. Nothing here grows with time: the memo is a fixed handful of fields.
import { prng } from './names.js';

export const FIRST_ERA = 'The First Tides';
// the widest an era's name may be, in characters (the status rail's era box, in capitals; the card's foot)
export const NAME_MAX = 22;

const W = (s) => s.split('|');
// What can mark an era. adj: "The Pale …"; noun: its head word ("The Thaw", "The Long Thaw", "The Second
// Thaw"); q: what an era is of ("Years of Thin Light"); phrase: whole names of its own.
export const THEMES = {
  warm: {
    adj: W('Warm|Rising|Amber|Fevered|Languid|Heavy|Torpid|Copper|Sultry|Tepid'),
    noun: W('Thaw|Warming|Fever|Swelter|Simmer|Summer|Languor|Glow|Kindling|Torpor'),
    q: W('Warm Water|Fever|Long Summer|Amber Water|Languor|Slow Heat|Warmth'),
    phrase: W('The Water Warms|Summer in the Shallows|Warm Water Rising'),
  },
  cold: {
    adj: W('Pale|Bitter|Rimed|Brittle|Hoar|Frigid|Glass|White|Hard|Numb'),
    noun: W('Chill|Rime|Glaze|Freeze|Winter|Hardening|Cooling|Hoarfrost|Numbing|Clearing'),
    q: W('Ice|Rime|Glass Water|Cold Water|Hoarfrost|Clear Cold|Slow Cold'),
    phrase: W('The Water Cools|When the Ice Came|The Cold Deepens'),
  },
  bright: {
    adj: W('Bright|Silver|Gilded|Open|Lucent|High|Shining|Limpid|Burnished|Radiant'),
    noun: W('Glare|Dazzle|Noon|Brightening|Radiance|Gleam|Glint|Luster|Clarity|Shimmer'),
    q: W('Long Light|High Light|Silver Light|Glare|Open Light|Clear Light|Bright Water'),
    phrase: W('The Light Returns|Light in Every Basin|The Bands Burn Bright'),
  },
  dim: {
    adj: W('Dim|Hollow|Grey|Umber|Veiled|Sunless|Shaded|Dusky|Murky|Clouded'),
    noun: W('Murk|Dusk|Gloaming|Dimming|Umbra|Twilight|Pall|Shade|Darkening|Gloom'),
    q: W('Thin Light|Low Light|Dusk|Shadow|Grey Water|Failing Light|Little Light'),
    phrase: W('The Light Withdraws|Under Thin Light|The Bands Grow Faint'),
  },
  low: {
    adj: W('Bare|Shallow|Thin|Salt|Stranded|Ebbing|Drawn|Exposed|Narrow|Parted'),
    noun: W('Ebb|Shallows|Drawdown|Stranding|Shoaling|Baring|Retreat|Lowstand|Recession|Narrowing'),
    q: W('Low Water|Bare Ground|Sandbars|Islands|Shallow Water|Salt|Stranded Pools'),
    phrase: W('The Water Falls|The Floor Laid Bare|Islands in the Pool|When the Bars Rose'),
  },
  flood: {
    adj: W('Brimming|Deep|Full|Drowned|Returning|Spilling|Risen|Welling|Flooding|Lapping'),
    noun: W('Drowning|Flood|Return|Inundation|Swell|Overflow|Highstand|Refilling|Spillover|Welling'),
    q: W('High Water|Deep Water|Rising Water|Drowned Bars|Full Water|Welling Water'),
    phrase: W('The Water Returns|Over the Islands|When the Bars Drowned|The Basins Fill'),
  },
  calm: {
    adj: W('Still|Quiet|Long|Patient|Even|Soft|Mild|Settled|Slow|Gentle'),
    noun: W('Calm|Hush|Stillness|Lull|Quiet|Slackening|Doldrums|Repose|Respite|Stillstand'),
    q: W('Still Water|Slack Water|Slow Water|Quiet|Patience|Small Things|Calm'),
    phrase: W('The Water Rests|The Long Afternoon|Under Even Light'),
  },
  shift: {
    adj: W('Restless|Shifting|Turning|Wandering|Fickle|Unquiet|Broken|Crossing|Errant|Uneasy'),
    noun: W('Drift|Gyre|Surge|Turning|Churn|Upheaval|Eddy|Unrest|Tides|Turnover'),
    q: W('Cross Currents|Eddies|Drift|Unrest|Turning Water|New Currents|Changing Water'),
    phrase: W('The Currents Turn|The Water Turns Over|New Currents Run'),
  },
  bloom: {
    adj: W('Green|Teeming|Verdant|Crowded|Fecund|Lush|Swarming|Thick|Abundant|Fruitful'),
    noun: W('Bloom|Flush|Burgeoning|Swarming|Greening|Plenty|Abundance|Quickening|Teeming|Multitude'),
    q: W('Plenty|Abundance|Green Water|Swarms|Multitudes|Crowding|Thick Water'),
    phrase: W('The Water Greens|Life in Every Drop|Every Basin Teems'),
  },
  lean: {
    adj: W('Lean|Hungry|Empty|Sparse|Barren|Ashen|Wasted|Meager|Bleak|Gaunt'),
    noun: W('Dwindling|Famine|Hunger|Wasting|Thinning|Dearth|Winnowing|Emptying|Attrition|Want'),
    q: W('Hunger|Scarcity|Want|Dearth|Empty Water|Famine|Leanness'),
    phrase: W('The Water Empties|Few Remain|The Living Thin'),
  },
  hunt: {
    adj: W('Red|Sharp|Watchful|Grim|Iron|Keen|Hunted|Wary|Fierce|Taut'),
    noun: W('Hunt|Harrowing|Pursuit|Reckoning|Chase|Siege|Predation|Stalking|Culling|Ambush'),
    q: W('Hunters|Predators|Pursuit|Ambush|Stalkers|the Hunt|Sharp Mouths'),
    phrase: W('The Hunters Rise|The Hunters Gather|The Hunted Scatter'),
  },
  graze: {
    adj: W('Pastoral|Meadow|Shorn|Cropped|Unhurried|Placid|Close|Browsing'),
    noun: W('Gleaning|Grazing|Cropping|Harvest|Browse|Mowing|Pasturage|Foraging'),
    q: W('Grazers|Gleaners|Browsers|Harvest|Herds|Cropping|Pasture'),
    phrase: W('The Grazers Spread|The Meadows Shorn'),
  },
  scavenge: {
    adj: W('Fallow|Spent|Husked|Picked|Moldering|Sour|Sodden|Rotting'),
    noun: W('Salvage|Leavings|Scavenging|Rot|Decay|Remains|Husking|Picking'),
    q: W('Scavengers|Husks|Leavings|Salvage|Remains|Decay'),
    phrase: W('Nothing Goes to Waste|The Husks Are Taken'),
  },
  radiate: {
    adj: W('Branching|Manifold|New|Young|Budding|Strange|Diverging|Myriad|Untried|Novel'),
    noun: W('Radiation|Branching|Divergence|Unfolding|Parting|Proliferation|Sundering|Flowering|Speciation|Invention'),
    q: W('New Forms|Many Forms|Branching|Divergence|Strange Forms|Novelty|First Forms'),
    phrase: W('The Lines Branch|Many New Forms|The Tree Spreads'),
  },
  recover: {
    adj: W('Mending|Tender|Wakening|Healing|Renewed|Quickened|Kindled|Fresh'),
    noun: W('Recovery|Mending|Regrowth|Renewal|Resurgence|Wakening|Rekindling|Revival|Restoration|Healing'),
    q: W('Mending|Regrowth|Renewal|Second Growth|Return|Healing|New Growth'),
    phrase: W('Life Returns|The Slow Return|Green Again'),
  },
  // a genus holding the pool: "The Quesku Ascendancy", "Age of Quesku", "The Queskian"
  reign: { noun: W('Ascendancy|Reign|Dominion|Sway|Primacy|Heyday|Tenure|Hegemony|Zenith|Supremacy') },
  // a quiet stretch named like a stage of the rocks: "The Vothian", "Late Vothian"
  stage: {},
};
// the era after one of the pool's events: named for it ("After the Rains"), or in the words of what follows it
const EVENTS = {
  storm: { words: W('Storm|Rains|Squall|Downpour'), like: 'calm', phrase: W('The Calm After|The Storm Passes') },
  drought: { words: W('Drought|Dry Spell|Parching|Drying'), like: 'flood', phrase: W('Rain on the Mud|The Mud Drinks') },
  frost: { words: W('Frost|Ice|Freeze|Long Night'), like: 'warm', phrase: W('The Ice Lets Go|Out of the Ice') },
  duckweed: { words: W('Duckweed|Shade|Fronds|Green Shade'), like: 'bright', phrase: W('Out of the Shade|The Fronds Drift On') },
};
for (const [k, e] of Object.entries(EVENTS)) THEMES[`after-${k}`] = { ...THEMES[e.like], phrase: e.phrase, event: e.words, like: e.like };
// who holds the pool, by diet or by how they move: "Age of Pale Grazers"
export const KIN = { producer: 'Light-Eaters', grazer: 'Grazers', scavenger: 'Scavengers', predator: 'Hunters', swimmer: 'Swimmers', drifter: 'Drifters', crawler: 'Crawlers', sessile: 'Mats' };
const KIN_THEME = { predator: 'hunt', grazer: 'graze', scavenger: 'scavenge' };
// a kind of life is notable at this share of the living (a diet's, or a way of moving's)
const KIN_AT = { predator: 0.08, grazer: 0.3, scavenger: 0.15, producer: 0.85, swimmer: 0.35, drifter: 0.4, crawler: 0.4, sessile: 0.5 };
export const SPAN = W('Age|Years|Days|Time');
const SPAN_W = [0.35, 0.35, 0.2, 0.1];
export const TIME = W('Years|Days|Hours');
export const ORDINAL = W('Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth');
const COIN_END = W('ian|ian|ocene');
// the world's own stage names, built as the rocks' are from places: "Kalovian", "Velenocene"
const STEM = [W('Kal|Tor|Bra|Vel|Oss|Mar|Thal|Nor|Sar|Ast|Hel|Dov|Lor|Var|Ren|Mos|Bel|Tav|Ul|Esk|Gar|Quen|Ith|Ost'), W('ov|ar|in|en|oc|an|er|et|ad|is|um|ol|ith|ev')];
// the real world's periods, epochs and stages, which a coined name never is
const REAL = new Set(W('Cambrian|Ordovician|Silurian|Devonian|Permian|Triassic|Jurassic|Paleocene|Eocene|Oligocene|Miocene|Pliocene|Pleistocene|Holocene|Anthropocene|Aalenian|Bajocian|Bathonian|Callovian|Oxfordian|Kimmeridgian|Tithonian|Berriasian|Valanginian|Hauterivian|Barremian|Aptian|Albian|Cenomanian|Turonian|Coniacian|Santonian|Campanian|Maastrichtian|Danian|Selandian|Thanetian|Ypresian|Lutetian|Bartonian|Priabonian|Rupelian|Chattian|Aquitanian|Burdigalian|Langhian|Serravallian|Tortonian|Messinian|Zanclean|Piacenzian|Gelasian|Calabrian|Ionian|Tarantian|Induan|Olenekian|Anisian|Ladinian|Carnian|Norian|Rhaetian|Hettangian|Sinemurian|Toarcian|Asselian|Sakmarian|Artinskian|Kungurian|Roadian|Wordian|Capitanian|Tonian|Stenian|Ectasian|Calymmian|Statherian|Orosirian|Rhyacian|Siderian|Ediacaran|Cryogenian|Hadean|Archean|Darriwilian|Sandbian|Katian|Hirnantian|Rhuddanian|Aeronian|Telychian|Homerian|Gorstian|Ludfordian|Lochkovian|Pragian|Emsian|Eifelian|Givetian|Frasnian|Famennian|Tournaisian|Visean|Serpukhovian|Bashkirian|Moscovian|Kasimovian|Gzhelian|Fortunian|Drumian|Guzhangian|Paibian|Jiangshanian|Tremadocian|Floian|Dapingian'));
const OPPOSITE = { warm: 'cold', cold: 'warm', bright: 'dim', dim: 'bright', low: 'flood', flood: 'low', bloom: 'lean', lean: 'bloom', recover: 'lean' };
const LIFE = new Set(['bloom', 'lean', 'hunt', 'graze', 'scavenge', 'radiate', 'recover']);

// Each pattern: its English (the key's shape; eraname.js has a message for each) and how often it is chosen.
// ok(c): whether it can name this era (c: the theme's context, below).
const PATTERNS = {
  // a theme's own word names its first era more often than not ("The Drowning"); counted when it returns
  noun: { w: 0.5, ok: (c) => c.v.noun, make: (c, r) => { const n = c.first ? c.sig : pick(r, c.v.noun); return { name: `The ${n}`, head: n, sig: n === c.sig }; } },
  'adj-noun': { w: 3, ok: (c) => c.v.noun && c.adjs, make: (c, r) => { const n = pick(r, c.v.noun), a = pick(r, c.adjs(r)); return echo(a, n) ? null : { name: `The ${a} ${n}`, head: n }; } },
  ordinal: { w: 1.5, ok: (c) => c.v.noun && c.nth >= 2 && c.nth <= 9, make: (c) => ({ name: `The ${ORDINAL[c.nth - 2]} ${c.sig}`, head: c.sig, sig: true }) },
  span: { w: 2, ok: (c) => c.v.q, make: (c, r) => { const q = pick(r, c.v.q); return { name: `${weighted(r, SPAN, SPAN_W)} of ${q}`, head: q }; } },
  years: { w: 0.9, ok: (c) => c.adjs, make: (c, r) => { const t = pick(r, TIME); return { name: `The ${pick(r, c.adjs(r))} ${t}`, head: t }; } },
  kin: { w: 1.2, ok: (c) => c.kin && c.adjs, make: (c, r) => ({ name: `${weighted(r, SPAN, SPAN_W)} of ${pick(r, c.adjs(r))} ${KIN[c.kin]}`, head: KIN[c.kin] }) },
  phrase: { w: 0.8, ok: (c) => c.v.phrase, make: (c, r) => { const p = pick(r, c.v.phrase); return { name: p, head: p }; } },
  after: { w: 3, ok: (c) => c.v.event, make: (c, r) => { const e = pick(r, c.v.event); return { name: r() < 0.3 ? `In the Wake of the ${e}` : `After the ${e}`, head: e }; } },
  genus: { w: 2.5, ok: (c) => c.genus && c.v.noun, make: (c, r) => { const n = pick(r, c.v.noun); return { name: `The ${c.genus} ${n}`, head: n, genus: c.genus }; } },
  'genus-span': { w: 1, ok: (c) => c.genus, make: (c, r) => ({ name: `${weighted(r, SPAN, SPAN_W)} of ${c.genus}`, head: c.genus, genus: c.genus }) },
  // a stage runs on: the same coin again is its late part ("The Queskian", then "Late Queskian")
  coin: { w: 1.5, ok: (c) => c.coin, make: (c, r) => { const late = c.late && r() < 0.8, name = `${late ? 'Late' : 'The'} ${c.coin}`; return { name, head: name, coin: c.coin, late, genus: c.genus }; } },
};
// the patterns each kind of theme may take
const FOR = {
  reign: ['genus', 'genus-span', 'coin'],
  stage: ['coin'],
  after: ['after', 'phrase', 'adj-noun', 'noun', 'span'],
  life: ['noun', 'adj-noun', 'ordinal', 'span', 'years', 'kin', 'phrase', 'genus'],
  climate: ['noun', 'adj-noun', 'ordinal', 'span', 'years', 'kin', 'phrase'],
};
// an aftermath's own words come first; what follows it, less often
const AFTER_W = { after: 3, phrase: 1.5, 'adj-noun': 0.8, noun: 0.4, span: 0.6 };

const pick = (r, a) => a[Math.floor(r() * a.length)];
// an adjective that only echoes its noun ("The Rimed Rime", "The Dim Dimming")
const echo = (a, n) => a.slice(0, 3) === n.slice(0, 3);
function weighted(r, items, ws) {
  let x = r() * ws.reduce((a, b) => a + b, 0), i = 0;
  while (i < items.length - 1 && x >= ws[i]) { x -= ws[i]; i++; }
  return items[i];
}
const hash = (...xs) => { let h = 2166136261; for (const x of xs) h = Math.imul(h ^ (x >>> 0), 16777619) ^ (h >>> 13); return h >>> 0; };
const hashStr = (s, ...xs) => hash(...xs, ...[...s].map((ch) => ch.charCodeAt(0)));

/** A world's naming record, kept with its climate: fixed in size however long the world runs. */
// (sig: how often each theme's own word has named an era; last: the era before's theme, head word, coin and genus;
// living, species, guilds: the life as it began)
export const eraMemo = () => ({ seed: null, sig: {}, last: null, living: 0, species: 0, guilds: null, coins: 0 });

/**
 * How strongly each theme marks an era, strongest first ([theme, strength]; a theme at 0.45 or more names it).
 * f: { dT (°C the water's warmth moves this era), temp (°C it heads for), light, prevLight (the light's level, 0-1),
 * level, prevLevel (the water's level, 1 full), excursion (a heat wave's or cold snap's degrees, 0 for none),
 * events (the pool's events since the last era began, their types), life (null, or lifeFacts: below) }.
 */
export function eraThemes(f, memo = eraMemo()) {
  const s = {}, add = (t, v) => { if (v > 0) s[t] = (s[t] || 0) + v; };
  const dL = (f.light ?? 0.2) - (f.prevLight ?? f.light ?? 0.2), dT = f.dT || 0, exc = f.excursion || 0;
  add('warm', (dT - 3) / 5); add('warm', f.temp >= 24 ? 0.3 : 0); add('warm', exc > 0 ? 0.35 : 0);
  add('cold', (-dT - 3) / 5); add('cold', f.temp <= 8 ? 0.3 : 0); add('cold', exc < 0 ? 0.35 : 0);
  add('bright', (dL - 0.04) / 0.1); add('bright', f.light >= 0.3 ? 0.3 : 0);
  add('dim', (-dL - 0.04) / 0.1); add('dim', f.light <= 0.14 ? 0.3 : 0);
  const level = f.level ?? 1, prev = f.prevLevel ?? 1;
  if (level < 1) add('low', prev < 1 ? 0.5 : 1); else if (prev < 1) add('flood', 1);
  const ev = f.events?.at(-1);
  if (EVENTS[ev]) add(`after-${ev}`, 0.75);
  add('calm', Math.abs(dT) < 2 && Math.abs(dL) < 0.03 ? 0.5 : 0);
  add('shift', Math.abs(dL) > 0.1 && Math.abs(dT) > 4 ? 0.5 : 0);
  const L = f.life;
  if (L?.living > 0) {
    const ratio = memo.living > 0 ? L.living / memo.living : 1;
    add('bloom', ratio >= 1.4 ? 0.5 + (ratio - 1.4) : 0);
    add('lean', ratio <= 0.65 ? 0.5 + (0.65 - ratio) : 0);
    const was = memo.last?.theme || '';
    if (ratio >= 1.15 && (was === 'lean' || was.startsWith('after-'))) add('recover', 0.8);
    if (L.genus && L.genus[1] >= 0.35) add('reign', 0.4 + (L.genus[1] - 0.35) * 2);
    const g = L.guilds || {}, pg = memo.guilds;
    add('hunt', g.predator >= KIN_AT.predator ? 0.4 + g.predator * 2 : 0);
    add('hunt', pg && g.predator >= 0.03 && g.predator >= 1.6 * (pg.predator || 0) ? 0.5 : 0);
    add('graze', g.grazer >= KIN_AT.grazer ? 0.3 + g.grazer : 0);
    add('scavenge', g.scavenger >= KIN_AT.scavenger ? 0.3 + g.scavenger * 2 : 0);
    if (memo.species > 0 && L.species >= 1.35 * memo.species && L.species >= memo.species + 5) add('radiate', 0.8);
  }
  return Object.entries(s).sort((a, b) => b[1] - a[1]);
}

// a coined stage name from a stem: "Quesku" → "Queskian", "Vrouth" → "Vrouthocene"
const coinOf = (stem, end) => {
  const s = stem.replace(/[aeiouy]+$/, ''), c = (s.length >= 3 ? s : stem) + end;
  return REAL.has(c) ? null : c;
};
// a genus a name can carry: one word, not one of the names' own words
let WORDS;
const plainGenus = (g) => {
  WORDS ||= new Set(Object.values(THEMES).flatMap((t) => [...(t.adj || []), ...(t.noun || [])]));
  return typeof g === 'string' && /^[A-Z][a-z]{2,11}$/.test(g) && !WORDS.has(g) ? g : null;
};

/**
 * The name of an era beginning now (an English key: eraName gives it in the page's words). f: what marks it
 * (eraThemes); draws: two numbers in [0, 1) the climate drew for its name; memo: the world's naming record
 * (eraMemo, updated here); used: the names the world's record holds (none is given again).
 * life (f.life), from the page: { living (cells), species (established), guilds: { producer, grazer, scavenger,
 * predator } and moves: { swimmer, drifter, crawler, sessile } (shares of the living), genus: [name, share]
 * (the genus with the most cells), top: { predator, grazer, scavenger } (each diet's leading genus, or null) }.
 */
export function nameEra(f, draws, memo, used = new Set()) {
  const r = prng(hash(Math.floor(draws[0] * 2 ** 32), Math.floor(draws[1] * 2 ** 32), 0x5eed));
  memo.seed ??= hash(Math.floor(draws[0] * 2 ** 32), 0xe7a5);
  const L = f.life, scored = eraThemes(f, memo);
  const can = (t) => (t === 'reign' ? !!plainGenus(L?.genus?.[0]) : !LIFE.has(t) || !!L);
  const strong = scored.filter(([t, s]) => s >= 0.45 && THEMES[t] && can(t)).slice(0, 3);
  const base = () => weighted(r, ['calm', 'shift', 'stage'], [0.4, 0.35, 0.25]);
  const theme = strong.length ? weighted(r, strong.map(([t]) => t), strong.map(([, s]) => s * s)) : base();
  const second = strong.find(([t]) => t !== theme && OPPOSITE[t] !== theme && OPPOSITE[theme] !== t && THEMES[t].adj)?.[0];
  // the notable kinds of life ("Age of Pale Grazers"): the theme's own, else any
  const notable = L ? Object.keys(KIN_AT).filter((k) => ((L.guilds || {})[k] ?? (L.moves || {})[k] ?? 0) >= KIN_AT[k]) : [];
  const last = memo.last || {};
  const context = (t) => {
    const v = THEMES[t], n = (memo.sig[t] || 0) + 1;
    const own = Object.keys(KIN_THEME).find((k) => KIN_THEME[k] === t);
    // the genus a life theme is about: the leading one of its diet (the hunters' for a hunt), else the largest
    const genus = t === 'reign' ? plainGenus(L.genus[0]) : LIFE.has(t) && L ? plainGenus((own && L.top?.[own]) || L.genus?.[0]) : null;
    const stage = t === 'stage' && last.theme === 'stage' && !last.late ? last.coin : null;
    const minted = () => {
      for (let k = 0; k < 4; k++) {
        const h = hash(memo.seed, memo.coins, k, 0xc017), coin = coinOf(STEM[0][h % STEM[0].length] + STEM[1][(h >>> 8) % STEM[1].length], COIN_END[(h >>> 16) % COIN_END.length]);
        if (coin) return coin;
      }
      return null;
    };
    return {
      v, nth: n, first: n === 1, genus,
      sig: v.noun ? v.noun[hashStr(t, memo.seed) % v.noun.length] : null,
      adjs: v.adj ? (rr) => (second && rr() < 0.4 ? THEMES[second].adj : v.adj) : null,
      kin: own && notable.includes(own) ? own : notable.length ? notable[hashStr(t, memo.seed, n) % notable.length] : null,
      coin: t === 'reign' ? genus && coinOf(genus, COIN_END[hashStr(genus, memo.seed) % COIN_END.length]) : t === 'stage' ? stage || minted() : null,
      late: t === 'reign' ? last.genus === genus && !last.late : !!stage,
    };
  };
  const kindOf = (t) => (t === 'reign' || t === 'stage' ? t : t.startsWith('after-') ? 'after' : LIFE.has(t) ? 'life' : 'climate');
  const attempt = (t) => {
    const c = context(t), kind = kindOf(t);
    const pats = FOR[kind].filter((p) => PATTERNS[p].ok(c));
    if (!pats.length) return null;
    const ws = pats.map((p) => (kind === 'after' ? AFTER_W[p] : PATTERNS[p].w) * (p === 'noun' && c.first ? 4 : 1));
    const x = PATTERNS[weighted(r, pats, ws)].make(c, r);
    return x && { ...x, theme: t };
  };
  const fits = (x) => x && x.name.length <= NAME_MAX && !used.has(x.name) && x.head !== last.head;
  let got = null;
  for (let i = 0; i < 64 && !fits(got); i++) got = attempt(i < 40 ? theme : base());
  // (in all the vocabulary every name taken is beyond any world's record; still, never fail)
  for (let i = 0; !fits(got); i++) {
    const v = THEMES[['calm', 'shift'][i % 2]], a = v.adj[(i >> 1) % v.adj.length], n = v.noun[Math.floor(i / 20) % v.noun.length];
    got = { name: `The ${a} ${n}`, head: `${n}${i}`, theme: 'calm' };
  }
  if (got.sig) memo.sig[got.theme] = Math.min(99, (memo.sig[got.theme] || 0) + 1);
  if (got.theme === 'stage' && !got.late && got.coin && got.coin !== last.coin) memo.coins = (memo.coins + 1) % 1e6;
  memo.last = { theme: got.theme, head: got.head, coin: got.coin || null, late: !!got.late, genus: got.genus || null };
  if (L) Object.assign(memo, { living: L.living, species: L.species, guilds: { ...L.guilds } });
  return got.name;
}

// ---- reading a name back: its pattern and words (for eraName's messages and the soundtrack) ----
const ALL = (k) => [...new Set(Object.values(THEMES).flatMap((t) => t[k] || []))];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const alt = (a) => `(${[...a].sort((x, y) => y.length - x.length).map(esc).join('|')})`;
let RX;
function patterns() {
  if (RX) return RX;
  const N = alt(ALL('noun')), A = alt(ALL('adj')), Q = alt(ALL('q')), S = alt(SPAN), G = '([A-Z][a-z]+)';
  RX = [
    ['phrase', `${alt(ALL('phrase'))}`, ['phrase']],
    ['ordinal', `The ${alt(ORDINAL)} ${N}`, ['nth', 'noun']],
    ['noun', `The ${N}`, ['noun']],
    ['adj-noun', `The ${A} ${N}`, ['adj', 'noun']],
    ['years', `The ${A} ${alt(TIME)}`, ['adj', 'time']],
    ['kin', `${S} of ${A} ${alt(Object.values(KIN))}`, ['span', 'adj', 'kin']],
    ['span', `${S} of ${Q}`, ['span', 'q']],
    ['after', `(After|In the Wake of) the ${alt(ALL('event'))}`, ['form', 'event']],
    ['coin', `(The|Late) ([A-Z][a-z]+(?:${COIN_END.join('|')}))`, ['stage', 'coin']],
    ['genus', `The ${G} ${N}`, ['genus', 'noun']],
    ['genus-span', `${S} of ${G}`, ['span', 'genus']],
  ].map(([p, s, keys]) => [p, new RegExp(`^${s}$`), keys]);
  return RX;
}
/** An era's name read back: { p (its pattern), and its words by slot }, or null for a name this version does not know. */
export function parseEra(name) {
  if (typeof name !== 'string') return null;
  for (const [p, rx, keys] of patterns()) {
    const m = rx.exec(name);
    if (m) return Object.fromEntries([['p', p], ...keys.map((k, i) => [k, m[i + 1]])]);
  }
  return null;
}

// the theme each word belongs to (its first)
let OF;
const themeOf = (k, w) => {
  if (!OF) {
    OF = {};
    for (const [t, v] of Object.entries(THEMES)) for (const key of ['adj', 'noun', 'q', 'phrase', 'event']) for (const x of v[key] || []) (OF[key] ||= {})[x] ??= v.like || t;
  }
  return OF[k]?.[w];
};
/**
 * What an era's name says of it, for the soundtrack: { theme (its head's), tone (its adjective's, else the
 * theme) }, themes as in THEMES (an aftermath's as what follows it); null for the first era or a name unknown.
 */
export function eraTheme(name) {
  const e = parseEra(name);
  if (!e || name === FIRST_ERA) return null;
  let theme;
  switch (e.p) {
    case 'phrase': theme = themeOf('phrase', e.phrase); break;
    case 'span': theme = themeOf('q', e.q); break;
    case 'years': theme = themeOf('adj', e.adj); break;
    case 'kin': theme = KIN_THEME[Object.keys(KIN).find((k) => KIN[k] === e.kin)] || themeOf('adj', e.adj); break;
    case 'after': theme = themeOf('event', e.event); break;
    case 'coin': theme = 'stage'; break;
    case 'genus-span': theme = 'reign'; break;
    default: theme = themeOf('noun', e.noun);
  }
  return { theme, tone: (e.adj && themeOf('adj', e.adj)) || theme };
}
