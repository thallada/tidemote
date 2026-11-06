// Stains (Settings → Overlays → Stain, J): as a microscopist stains a slide to see what the eye alone cannot, a stain
// colors every living cell by what its species is: what it eats, its lineage, its grafts, the water it wants, how it
// moves, how new it is. Observational: the engine draws the living in these colors (Engine.setStain) and nothing in
// the world changes. Pure: a species list in, a color per genome slot out (rgba8 packed, a: how strongly it takes;
// the unstained are drawn a dim gray).
import { DEFAULT_K, MAXK } from './shaders.js';

export const STAINS = [
  { id: 'none', name: 'None' },
  { id: 'diet', name: 'Diet', hint: 'What each species lives on: light (green), grazing (gold), the dead (violet), flesh (red), mixed in proportion.' },
  { id: 'clade', name: 'Lineage', hint: 'Each genus its own color: relatives share one, so the mosaic of lineages across the pool shows.' },
  { id: 'graft', name: 'Grafts', hint: 'Species that graft to others (magenta) and the species they hold fast to (cyan); everything else dimmed.' },
  { id: 'warmth', name: 'Warmth', hint: 'The water each species works best in: cold (blue) through temperate (green) to hot (red).' },
  { id: 'motion', name: 'Motion', hint: 'How each species moves: swimmers (cyan), drifters (pale), anchored and sessile life (amber).' },
  { id: 'vigor', name: 'Vigor', cell: true, hint: 'Each cell by its own energy toward dividing: starving (red), hungry (amber), fed (green), ready to divide (white). Hunger fronts and fat meadows show.' },
  { id: 'age', name: 'Novelty', hint: 'How new each species is: those born in the last minutes burn white and gold, the old ones deep blue.' },
];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const pack = (r, g, b, a = 1) => ((Math.round(clamp(r) * 255)) | (Math.round(clamp(g) * 255) << 8) | (Math.round(clamp(b) * 255) << 16) | (Math.round(clamp(a) * 255) << 24)) >>> 0;
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
/** A string's hue, 0..1 (FNV-1a), spread by the golden ratio so neighbors in name are far in color. */
export function hueOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) * 0.618033988749895) % 1;
}
// a ramp through stops [t, [r, g, b]]
function ramp(stops, t) {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return mix3(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  return stops.at(-1)[1];
}
const DIET = { light: [0.45, 1.0, 0.3], graze: [1.0, 0.82, 0.2], husk: [0.68, 0.45, 1.0], flesh: [1.0, 0.25, 0.22] };
const WARM = [[0, [0.25, 0.45, 1.0]], [0.35, [0.3, 0.95, 0.85]], [0.5, [0.55, 1.0, 0.35]], [0.7, [1.0, 0.8, 0.2]], [1, [1.0, 0.22, 0.15]]];
const AGE = [[0, [1.0, 1.0, 0.95]], [0.25, [1.0, 0.78, 0.25]], [0.55, [0.85, 0.3, 0.55]], [1, [0.22, 0.3, 0.85]]];

/** The color a species takes in stain `id`: [r, g, b, a] (a 0: unstained). sp: { genome, genus, born }; ctx: { t, hosts: Set of slots }. */
export function stainOf(id, sp, slot, ctx = {}, K = DEFAULT_K) {
  const g = sp.genome;
  if (id === 'diet') {
    const p = clamp(g.photo), e = 1 - p;
    const c = [0, 1, 2].map((i) => p * DIET.light[i] + e * (g.dGlint * DIET.graze[i] + g.dHusk * DIET.husk[i] + g.dFlesh * DIET.flesh[i]));
    return [...c, 1];
  }
  if (id === 'clade') return [...hsl(hueOf(sp.genus || String(g.serial)), 0.85, 0.6), 1];
  if (id === 'graft') {
    if ((g.graft || 0) > K.graftMin) return [1.0, 0.3, 0.9, 1];
    if (ctx.hosts?.has(slot)) return [0.3, 0.9, 1.0, 1];
    return [0, 0, 0, 0];
  }
  if (id === 'warmth') return [...ramp(WARM, (g.topt ?? 19) / 40), 1];
  if (id === 'motion') {
    const swim = g.swim * (1 - g.photo);
    if (swim > 0.25) return [...mix3([0.55, 0.85, 1.0], [0.2, 0.95, 1.0], clamp((swim - 0.25) / 1.2)), 1];
    if (g.advect < 0.25) return [1.0, 0.7, 0.25, 1];
    return [0.82, 0.86, 0.8, 0.85];
  }
  if (id === 'age') return [...ramp(AGE, Math.sqrt(Math.max(0, (ctx.t ?? 0) - (sp.born ?? 0)) / 3600)), 1];
  return [0, 0, 0, 0];
}

/** How the engine draws stain id: 2 each cell by its own energy (no table), 3 grafts (the table, and the cells holding a graft brighter), 1 the table. */
export const stainMode = (id) => (id === 'vigor' ? 2 : id === 'graft' ? 3 : 1);

/** The stain's colors by genome slot (Uint32Array(MAXK), packed rgba8), for the living species in slots ([slot, sp]). */
export function stainColors(id, slots, ctx = {}, K = DEFAULT_K, out = new Uint32Array(MAXK)) {
  out.fill(0);
  for (const [slot, sp] of slots) if (sp?.genome) out[slot] = pack(...stainOf(id, sp, slot, ctx, K));
  return out;
}

/** The stain's key: [[css color, label]] for a legend. */
export function stainKey(id) {
  const css = (c) => `rgb(${c.map((v) => Math.round(clamp(v) * 255)).join(',')})`;
  if (id === 'diet') return [[css(DIET.light), 'light'], [css(DIET.graze), 'grazing'], [css(DIET.husk), 'the dead'], [css(DIET.flesh), 'flesh']];
  if (id === 'graft') return [[css([1, 0.3, 0.9]), 'grafters'], [css([0.3, 0.9, 1]), 'their hosts']];
  if (id === 'warmth') return [[css(ramp(WARM, 0)), '0°'], [css(ramp(WARM, 0.5)), '20°'], [css(ramp(WARM, 1)), '40°']];
  if (id === 'motion') return [[css([0.2, 0.95, 1]), 'swimmers'], [css([0.82, 0.86, 0.8]), 'drifters'], [css([1, 0.7, 0.25]), 'anchored']];
  if (id === 'age') return [[css(ramp(AGE, 0)), 'new'], [css(ramp(AGE, 0.25)), '4 min'], [css(ramp(AGE, 0.55)), '20 min'], [css(ramp(AGE, 1)), '1 h+']];
  if (id === 'vigor') return [['rgb(255,46,38)', 'starving'], ['rgb(255,184,51)', 'hungry'], ['rgb(140,255,89)', 'fed'], ['rgb(255,255,235)', 'ready']];
  if (id === 'clade') return [[css(hsl(0.0, 0.85, 0.6)), 'one color'], [css(hsl(0.33, 0.85, 0.6)), 'per'], [css(hsl(0.66, 0.85, 0.6)), 'genus']];
  return [];
}
