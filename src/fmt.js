// Formatting and vocabulary shared by the page's panels.
import { unpackUnorm } from './genome.js';
import { tr, LOCALE } from './i18n.js';

const nf = new Intl.NumberFormat(LOCALE);
export const fmt = (n) => nf.format(n);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pad = (n) => String(n).padStart(2, '0');
export const fmtClock = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600); const m = Math.floor(s / 60) % 60; return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
// i18n: a duration, short: {s} seconds; {m} minutes and {ss} seconds (two digits); {h} hours and {mm} minutes (two digits)
export const fmtDur = (s) => (s < 60 ? tr('fmt.dur.s', '{s} s', { s: Math.round(s) }) : s < 3600 ? tr('fmt.dur.ms', '{m}m {ss}s', { m: Math.floor(s / 60), ss: pad(Math.floor(s % 60)) })
  : tr('fmt.dur.hm', '{h}h {mm}m', { h: Math.floor(s / 3600), mm: pad(Math.floor(s / 60) % 60) }));
// a particle count, short: 64k, 1.5M
export const kfmt = (n) => (n >= 1048576 ? tr('fmt.count.m', '{n}M', { n: +(n / 1048576).toFixed(1) }) : tr('fmt.count.k', '{n}k', { n: Math.round(n / 1024) }));
// when something was saved: today's by the time, older by the day
export const when = (t) => (new Date(t).toDateString() === new Date().toDateString()
  ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cssRgb = (c, k = 1) => `rgb(${c.slice(0, 3).map((v) => Math.round(clamp(v * k, 0, 1) * 255)).join(',')})`;
export const cssCol = (u, k = 1) => cssRgb(unpackUnorm(u), k);
export const term = (key, label) => `<span class="term" data-tip="${key}" tabindex="0">${label}</span>`;
// (translate="no": a species name is a name, not words to translate)
export const spLink = (serial, name) => `<a href="#" class="sp" translate="no" data-serial="${serial}">${esc(name)}</a>`;
/** Hand a file to the browser to download. */
export function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
export const meter = (frac, cls = '') => `<span class="meter ${cls}"><i style="width:${(clamp(frac, 0, 1) * 100).toFixed(1)}%"></i></span>`;
export const ROLE = ['α', 'β', 'γ'];
// A living cell's drawn radius at `ppu` pixels per world unit (vsPoint: 0.085 world units per unit of size).
export const cellRadius = (p, g, ppu) => 0.085 * (g ? g.size : 1) * (1 - 0.12 * (p.role || 0)) * ppu;

// Lengths as the page shows them, in micrometers: a cell of size 1 (0.17 world units across) is
// taken to be 10 µm, about the size of a protist.
export const UM_PER_UNIT = 10 / 0.17;
// a world length (or speed, with unit '/s') in µm, or mm from a millimeter up
/** A length's number as fmtLen prints it and its unit's key ('mm' or 'um'), for a readout that sets them apart. */
export const lenParts = (u) => {
  const um = Math.abs(u) * UM_PER_UNIT;
  return um >= 1000 ? { n: (um / 1000).toFixed(um >= 10000 ? 1 : 2), unit: 'mm' } : { n: um >= 10 ? Math.round(um) : um.toFixed(1), unit: 'um' };
};
export const fmtLen = (u, unit = '') => {
  const { n, unit: mm } = lenParts(u);
  const v = mm === 'mm' ? tr('fmt.len.mm', '{n} mm', { n }) : tr('fmt.len.um', '{n} µm', { n });
  // i18n: a speed: {len} is a length (12 µm), per second
  return unit === '/s' ? tr('fmt.len.per-s', '{len}/s', { len: v }) : v + unit;
};
// round lengths for scale bars, in µm
export const NICE_UM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

// i18n: the kinds of matter: a name, and a line on what it is (the census, the specimen panel)
export const MATTER = [
  { name: tr('matter.silt', 'Silt'), css: '#5d6a82', blurb: tr('matter.silt.blurb', 'Inert mineral grit carried on the currents. Cells build their offspring out of it, and now and then life sparks from it in the light.') },
  null, // (kind 1, once glint: no longer made; kept so the kinds index this)
  { name: tr('matter.husk', 'Husk'), css: '#9a6c4c', blurb: tr('matter.husk.blurb', 'The remains of a dead cell. Scavengers feed on what energy is left; the rest crumbles back into silt.') },
  { name: tr('matter.stone', 'Stone'), css: '#c2b8a8', blurb: tr('matter.stone.blurb', 'Bedrock, or the skeleton a calcifying cell left where it settled. Stone never drifts and the living cannot pass through it. Prey shelters in its crevices, and it slowly wears back into silt.') },
  { name: tr('matter.framboid', 'Framboid'), css: '#ccb373', blurb: tr('matter.framboid.blurb', 'A pyrite framboid: a sphere of tiny iron sulfide crystals, grown from the sulfide a pile of rotting husks releases in cool mud. As it oxidizes it warms the water around it, faster the warmer that water is, until it is spent and crumbles to silt. Solid, like stone.') },
];
// i18n: the kinds of grain a stone is drawn as, by their keys in STONE_KINDS (shaders.js): a picked grain's name
export const GRAIN = { quartz: tr('matter.grain.quartz', 'Quartz'), smokyQuartz: tr('matter.grain.smoky-quartz', 'Smoky quartz'), roseQuartz: tr('matter.grain.rose-quartz', 'Rose quartz'),
  pinkFeldspar: tr('matter.grain.pink-feldspar', 'Pink feldspar'), creamFeldspar: tr('matter.grain.cream-feldspar', 'Cream feldspar'), hornblende: tr('matter.grain.hornblende', 'Hornblende'),
  sand: tr('matter.grain.sand', 'Sand grain'), ironSand: tr('matter.grain.iron-sand', 'Iron-stained sand grain'), foraminifer: tr('matter.grain.foraminifer', 'Foraminifer shell'),
  diatom: tr('matter.grain.diatom', 'Diatom'), shell: tr('matter.grain.shell', 'Shell fragment'), spicule: tr('matter.grain.spicule', 'Sponge spicule') };
// i18n: how a particle came to be what it is, or how a cell died: "It {cause}." (a cell's Origin, a husk's Cause of death)
export const CAUSE = { 0: '', 1: tr('cause.starved', 'starved'), 2: tr('cause.old-age', 'died of old age'), 3: tr('cause.consumed', 'was consumed'), 4: tr('cause.husk-crumbled', 'crumbled from a husk'),
  7: tr('cause.stone-wore', 'wore away from stone'), 8: tr('cause.sparked', 'sparked into life from silt'), 9: tr('cause.built', 'built from silt by its parent'), 10: tr('cause.scalded', 'scalded'),
  12: tr('cause.crystallized', 'crystallized in a rotting pile'), 13: tr('cause.framboid-crumbled', 'crumbled from a spent framboid') };
export const LIVING_CSS = '#ff9a6a';
