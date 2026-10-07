// A species' song drawn, two ways: as an instrument readout (the page's HUD language:
// hairlines, ticks, corner brackets), a piano roll on hairline rails over a beat scale; and as a
// sigil, the song drawn as the organism that sings it. Pure (strings of SVG), shared by the
// specimen panel, the Lab and the tools. Styling lives in page.css (.song …, .sigil …).

import { roleShares, roleColor, cellShape } from './genome.js';
import { OUTLINES } from './glyphs.js';
import { DEFAULT_K } from './shaders.js';

const r1 = (x) => Math.round(x * 10) / 10;

function span(lines) {
  let lo = Infinity, hi = -Infinity;
  for (const l of lines) for (const nt of l) {
    lo = Math.min(lo, Math.floor(nt.deg), nt.grace ?? Infinity);
    hi = Math.max(hi, Math.ceil(nt.deg), nt.grace ?? -Infinity);
  }
  return [lo, hi];
}

/**
 * The piano roll. m: a motif (audio/motif.js). Each note is a bar on the rail of its scale degree,
 * as long as it sounds and as strong as its accent; a thin line joins each note's end to the
 * next note's start (the contour), the second voice is drawn in outline, chromatic notes carry a
 * mark, and the tonic's rails are a little brighter. ghost: an ancestor's motif drawn faintly behind, the notes that changed
 * outlined. The bars carry data-k / data-l (note, line) so a playhead can light them in place.
 */
export function songSVG(m, { w = 300, h = 68, col = '#7fd6df', col2 = col, ghost = null, label = 'Its song' } = {}) {
  const lines = [m.notes, m.voice2 || [], ...(ghost ? [ghost.notes] : [])];
  const [lo, hi] = span(lines);
  const rows = hi - lo + 1, pad = 8, base = h - 7; // the beat scale runs along the bottom
  const rowH = Math.min(8, (base - pad - 2) / rows);
  const top = pad + (base - pad - 2 - rowH * rows) / 2;
  const y = (d) => top + (hi - d + 0.5) * rowH;
  const cyc = Math.max(m.cycle, ghost ? ghost.cycle : 0);
  const sx = (w - 2 * pad) / cyc, x = (t) => pad + t * sx;
  const bh = Math.max(2, rowH * 0.5);
  let s = `<svg class="song-roll" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">`;
  // corner brackets, as around the close-up viewer
  const c = 6;
  s += `<path class="brk" d="M.5 ${c}V.5H${c}M${w - c} .5H${w - 0.5}V${c}M.5 ${h - c}V${h - 0.5}H${c}M${w - c} ${h - 0.5}H${w - 0.5}V${h - c}"/>`;
  // the beat scale: a tick every step, longer each beat (4 steps) and each bar (16)
  let ticks = '';
  for (let t = 0; t <= cyc + 1e-6; t += 1) { const L = t % 16 === 0 ? 5 : t % 4 === 0 ? 3 : 1.5; ticks += `M${r1(x(t))} ${base}v${L}`; }
  s += `<path class="tick" d="M${pad} ${base}H${w - pad}${ticks}"/>`;
  for (let d = lo; d <= hi; d++) s += `<line class="rail${(((d % 7) + 7) % 7) === 0 ? ' tonic' : ''}" x1="${pad}" x2="${w - pad}" y1="${r1(y(d))}" y2="${r1(y(d))}"/>`;
  if (m.cycle < cyc - 1e-6 || ghost) s += `<line class="bar" x1="${r1(x(m.cycle))}" x2="${r1(x(m.cycle))}" y1="${pad}" y2="${h - pad}"/>`;
  const barLen = (nt) => Math.max(2, Math.min(nt.dur * Math.min(1, nt.leg ?? 1), cyc - nt.at) * sx - 1);
  const bar = (nt, cls, extra = '') => {
    const len = barLen(nt);
    return `<rect class="${cls}" x="${r1(x(nt.at))}" y="${r1(y(nt.deg) - bh / 2)}" width="${r1(len)}" height="${r1(bh)}"${extra}/>`;
  };
  // the ancestor's notes that this song no longer plays
  if (ghost) for (const nt of ghost.notes) if (!m.notes.some((q) => Math.abs(q.at - nt.at) < 1e-6 && Math.abs(q.deg - nt.deg) < 1e-6)) s += bar(nt, 'ghost');
  (m.voice2 || []).forEach((nt, k) => { s += bar(nt, 'v2', ` data-k="${k}" data-l="1" style="stroke:${col2}"`); });
  // a riff on the ancestor: outline the notes that moved (a whole new phrase outlines nothing)
  const moved = ghost ? m.notes.map((nt, k) => { const g = ghost.notes[k]; return !g || Math.abs(g.at - nt.at) > 1e-6 || Math.abs(g.deg - nt.deg) > 1e-6; }) : [];
  const riff = moved.filter(Boolean).length <= Math.max(1, m.notes.length * 0.6);
  const changed = (nt, k) => riff && moved[k];
  // the contour: from where each note ends to where the next begins
  s += `<path class="contour" style="stroke:${col}" d="${m.notes.slice(1).map((nt, k) => { const a = m.notes[k]; return `M${r1(x(a.at) + barLen(a))} ${r1(y(a.deg))}L${r1(x(nt.at))} ${r1(y(nt.deg))}`; }).join('')}"/>`;
  m.notes.forEach((nt, k) => {
    if (nt.grace != null) s += `<circle class="grace" cx="${r1(x(nt.at) - 2.5)}" cy="${r1(y(nt.grace))}" r="1.3" style="fill:${col}"/>`;
    s += bar(nt, `nt${changed(nt, k) ? ' changed' : ''}`, ` data-k="${k}" data-l="0" style="fill:${col};fill-opacity:${(0.35 + 0.55 * nt.acc).toFixed(2)}"`);
    s += `<path class="on" d="M${r1(x(nt.at))} ${r1(y(nt.deg) - bh / 2 - 2)}v${r1(bh + 4)}" style="stroke:${col}"/>`; // the attack
    if (Math.round(nt.deg) !== nt.deg) s += `<path class="chrom" d="M${r1(x(nt.at))} ${r1(y(nt.deg) - bh / 2 - 2.5)}h3"/>`;
  });
  s += `<line class="ph" x1="0" x2="0" y1="${pad - 4}" y2="${base}"/>`;
  return s + '</svg>';
}

// ── the sigil: the song as its organism ──────────────────────────────────────
// Each note is one cell, drawn in the shape and colour of the cell type that sings it (α the
// melody, β a colony's second voice; a free-living species with several cell types deals its
// notes among them by its body plan), as large as the note is long and turned by its pitch. The
// cells are packed on the sunflower spiral in the order they sing, as a colony grows, and bonded
// to their nearest earlier neighbours (two partners at most, as in the sim) only where the
// species bonds; free-living cells float apart.
const rgb = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;

// the role of each note: α for the melody unless the species has no second voice, in which case
// the melody's notes are dealt among its cell types by its body plan (largest remainder)
function noteRoles(m, g) {
  if (m.voice2) return m.notes.map(() => 0);
  const sh = roleShares(g), n = m.notes.length, out = [];
  const want = sh.map((v) => (v > 0.05 ? v : 0)), tot = want.reduce((a, b) => a + b, 0) || 1, got = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    let best = 0, bd = -Infinity;
    for (let r = 0; r < 3; r++) { const d = (want[r] / tot) * (k + 1) - got[r]; if (d > bd) { bd = d; best = r; } }
    got[best]++; out.push(best);
  }
  return out;
}

/** The sigil of a species. v: its voice (audio/mapping.js voiceOf), g: its genome. */
export function sigilSVG(v, g, { size = 26, label = '' } = {}) {
  const m = v.motif, roles = noteRoles(m, g);
  const cells = [...m.notes.map((nt, i) => ({ nt, role: roles[i], line: 0 })), ...(m.voice2 || []).map((nt) => ({ nt, role: 1, line: 1 }))]
    .sort((a, b) => a.nt.at - b.nt.at || a.line - b.line);
  const maxDur = Math.max(...cells.map((c) => c.nt.dur));
  cells.forEach((c, k) => { const a = k * 2.39996, r = 0.62 * Math.sqrt(k + 0.5); c.x = Math.cos(a) * r; c.y = Math.sin(a) * r; c.size = 0.75 + 0.5 * (c.nt.dur / maxDur); });
  // fit: a cell is about one unit across
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of cells) { const r = c.size * 0.5; x0 = Math.min(x0, c.x - r); x1 = Math.max(x1, c.x + r); y0 = Math.min(y0, c.y - r); y1 = Math.max(y1, c.y + r); }
  const k = (size * 0.94) / Math.max(x1 - x0, y1 - y0);
  const cx = size / 2 - ((x0 + x1) / 2) * k, cy = size / 2 - ((y0 + y1) / 2) * k;
  const X = (c) => r1(cx + c.x * k), Y = (c) => r1(cy + c.y * k), cellR = Math.min(k * 0.42, size * 0.22);
  let s = `<svg class="sigil" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"${label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"'}>`;
  if ((g.adhesion || 0) > DEFAULT_K.adhMin) {
    const deg = new Map(), pairs = [];
    cells.forEach((c, i) => {
      const near = cells.slice(0, i).filter((o) => (deg.get(o) || 0) < 2).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)).slice(0, i > 2 ? 2 : 1);
      for (const o of near) { if ((deg.get(c) || 0) >= 2) break; pairs.push([o, c]); deg.set(o, (deg.get(o) || 0) + 1); deg.set(c, (deg.get(c) || 0) + 1); }
    });
    s += `<g class="bonds" stroke-width="${r1(Math.max(0.6, size * 0.022))}" style="stroke:${rgb(roleColor(g, 0))}">${pairs.map(([a, b]) => `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}"/>`).join('')}</g>`;
  }
  for (const c of cells) {
    const col = rgb(roleColor(g, c.role)), sc = Math.round(cellR * c.size * 100) / 100;
    s += `<g class="cell" style="color:${col}"><path d="${OUTLINES[cellShape(g, c.role)]}" fill-rule="evenodd" transform="translate(${X(c)} ${Y(c)}) rotate(${Math.round(c.nt.deg * 32)}) scale(${sc})" style="fill:${col}"/></g>`;
  }
  return s + '</svg>';
}
