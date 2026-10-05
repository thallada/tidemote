// Formatting and vocabulary shared by the page's panels.
import { unpackUnorm } from './genome.js';

const nf = new Intl.NumberFormat('en-US');
export const fmt = (n) => nf.format(n);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pad = (n) => String(n).padStart(2, '0');
export const fmtClock = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600); const m = Math.floor(s / 60) % 60; return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
export const fmtDur = (s) => (s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.floor(s / 60)}m ${pad(Math.floor(s % 60))}s` : `${Math.floor(s / 3600)}h ${pad(Math.floor(s / 60) % 60)}m`);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cssRgb = (c, k = 1) => `rgb(${c.slice(0, 3).map((v) => Math.round(clamp(v * k, 0, 1) * 255)).join(',')})`;
export const cssCol = (u, k = 1) => cssRgb(unpackUnorm(u), k);
export const term = (key, label) => `<span class="term" data-tip="${key}" tabindex="0">${label}</span>`;
export const spLink = (serial, name) => `<a href="#" class="sp" data-serial="${serial}">${esc(name)}</a>`;
export const meter = (frac, cls = '') => `<span class="meter ${cls}"><i style="width:${(clamp(frac, 0, 1) * 100).toFixed(1)}%"></i></span>`;
export const ROLE = ['α', 'β', 'γ'];

export const MATTER = [
  { name: 'Silt', css: '#5d6a82', blurb: 'Inert mineral grit carried on the currents. The Tide charges it into glint, and cells build their offspring out of it.' },
  { name: 'Glint', css: '#b9e6ff', blurb: 'Silt charged by the Tide: free-floating food. Its charge fades back to silt if nothing eats it.' },
  { name: 'Husk', css: '#9a6c4c', blurb: 'The remains of a dead cell. Scavengers feed on what energy is left; the rest crumbles back into silt.' },
  { name: 'Stone', css: '#c2b8a8', blurb: 'Bedrock, or the skeleton a calcifying cell left where it settled. Stone never drifts and the living cannot pass through it. Prey shelters in its crevices, and it slowly wears back into silt.' },
];
export const CAUSE = { 0: '', 1: 'starved', 2: 'died of old age', 3: 'was consumed', 4: 'crumbled from a husk', 5: 'charged by the Tide', 6: 'faded back to silt', 7: 'wore away from stone', 8: 'sparked into life from glint', 9: 'built from silt by its parent' };
export const LIVING_CSS = '#ff9a6a';
