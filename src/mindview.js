// The specimen panel's Behaviour instrument and Neighbours table, for the selected living cell.
// Built once per selection (fixed rows, fixed size), then updated in place: readings (mind.js)
// arrive about ten times a second and only values change, so nothing reflows. The compass's arrows
// are eased every frame, so they slide between readings instead of jumping.
import { groupsFor, slotRows } from './mind.js';
import { term, spLink, fmtLen } from './fmt.js';
import { subHead } from './ui.js';

const R = 40; // compass radius, in a -50..50 viewBox
const NB_ROWS = 4; // other species shown (own kind has its own row)
const EASE_MS = 70;

export function createMindView({ K, genomeFor, nameOf, sigil }) {
  let el = null; // the bound container
  let parts = null;
  let rows = null; // neighbour row kinds
  let ease = null; // { groups: Map(key -> {cur, to}), hdg, tgt }
  let last = 0;

  const fix = (x) => x.toFixed(2);
  const plainName = (kind) => { const n = nameOf(kind); return n ? n.name : 'an unnamed species'; };
  const linkName = (kind) => { const n = nameOf(kind); return n ? spLink(n.serial, n.name) : 'unnamed species'; };
  const plain = (text, kind) => (kind == null ? text : text.replaceAll('{sp}', plainName(kind)));
  const pct = (x) => `${Math.round(x * 100)}%`;

  function compassHTML(groups) {
    let s = `<svg class="compass" viewBox="-50 -50 100 100" aria-label="The pulls on this cell, and its heading">`;
    s += `<circle class="c-ring" r="${R}"/><circle class="c-ring faint" r="${R / 2}"/>`;
    let ticks = '';
    for (let a = 0; a < 360; a += 10) {
      const t = (a * Math.PI) / 180, l = a % 90 === 0 ? 6 : a % 30 === 0 ? 3.5 : 2;
      ticks += `M${fix(Math.cos(t) * R)},${fix(Math.sin(t) * R)}L${fix(Math.cos(t) * (R + l))},${fix(Math.sin(t) * (R + l))}`;
    }
    s += `<path class="c-tick" d="${ticks}"/>`;
    s += `<line class="c-hdg" x1="0" y1="0" x2="0" y2="0"/><path class="c-bug" d=""/><path class="c-tgt" d=""/>`;
    s += groups.slice().reverse().map((gr) => `<g class="c-arw" data-k="${gr.key}" style="color:${gr.css}"><line x1="0" y1="0" x2="0" y2="0"/><path d=""/></g>`).join('');
    return s + '<circle class="c-hub" r="1.8"/></svg>';
  }

  /** The markup for one cell of species g in slot `kind`. */
  function html(g, kind) {
    const groups = groupsFor(g, K);
    let h = `<div class="blk mv" data-kind="${kind}">${subHead(`<i class="ico cell"></i>${term('mind', 'Last decision')}`, '<span class="mv-live"><i></i><b>replay</b></span>')}`;
    h += '<div class="mv-read">';
    h += `<div><span>Mode</span><b><span class="mv-mode term" data-hint="" tabindex="0">—</span></b></div>`;
    h += `<div><span>Target</span><b class="mv-target"><span class="mv-sig"></span><span class="mv-tname">—</span><em class="mv-tdist"></em></b></div>`;
    // two lines, always: a long detail wraps rather than being cut, and never moves what follows
    h += `<div class="two"><span>Detail</span><b class="mv-detail">—</b></div>`;
    h += '</div>';
    h += `<div class="mv-pulls">${compassHTML(groups)}<div class="mv-drives">`;
    h += groups.map((gr) => `<div data-k="${gr.key}"><i style="background:${gr.css}"></i><span>${term(gr.tip, gr.label)}</span><span class="meter thin" style="color:${gr.css}"><i style="width:0"></i></span><b>0%</b></div>`).join('');
    h += `<div class="mv-key"><span><i class="dash"></i>heading</span><span><i class="dia"></i>target</span></div></div></div>`;
    // conditions that shape what it does: a fixed set of lamps, lit or dark, never added or removed
    h += `<div class="mv-lamps">${['hungry', 'full', 'threat', 'low', 'lean', 'crowd', 'shelter', ...(K.heat ? ['cold', 'hot'] : [])].map((k) => `<div class="lamp" data-k="${k}"><i></i><span class="term" data-hint="" tabindex="0"></span></div>`).join('')}</div></div>`;
    h += `<div class="blk mv-nb">${subHead(`<i class="ico cell"></i>${term('mind-near', 'Neighbours')}`, 'within its reach')}`;
    h += `<div class="nb-row nb-head"><span></span><span>Species</span><span>Cells</span><span>Role</span><span class="nb-pull term" data-hint="How each species moves this cell: pushes it away (left) or pulls it toward them (right)." tabindex="0"><i>push</i><i>pull</i></span></div>`;
    for (let i = 0; i <= NB_ROWS; i++) h += `<div class="nb-row empty" data-i="${i}"><span class="nb-sig"></span><span class="nb-name">—</span><b class="nb-n"></b><em class="nb-role"></em><span class="dbar"><i></i></span></div>`;
    return h + '</div>';
  }

  function bind(container) {
    el = container;
    const q = (s) => el.querySelector(s);
    parts = {
      mode: q('.mv-mode'), sig: q('.mv-sig'), tname: q('.mv-tname'), tdist: q('.mv-tdist'), detail: q('.mv-detail'),
      live: q('.mv-live'), hdg: q('.c-hdg'), bug: q('.c-bug'), tgt: q('.c-tgt'),
      arrows: new Map([...el.querySelectorAll('.c-arw')].map((n) => [n.dataset.k, { line: n.querySelector('line'), head: n.querySelector('path') }])),
      drives: new Map([...el.querySelectorAll('.mv-drives > div[data-k]')].map((n) => [n.dataset.k, { bar: n.querySelector('.meter i'), val: n.querySelector('b') }])),
      lamps: new Map([...el.querySelectorAll('.lamp')].map((n) => [n.dataset.k, { el: n, label: n.querySelector('span') }])),
      nb: [...el.querySelectorAll('.nb-row[data-i]')].map((n) => ({ row: n, sig: n.querySelector('.nb-sig'), name: n.querySelector('.nb-name'), n: n.querySelector('.nb-n'), role: n.querySelector('.nb-role'), bar: n.querySelector('.dbar i'), kind: null })),
      tkind: undefined,
    };
    rows = null;
    ease = null;
  }
  const bound = () => !!(el && el.isConnected);

  const len = (v) => Math.hypot(v[0], v[1]);
  const unit = (v) => { const l = len(v); return l > 1e-9 ? [v[0] / l, v[1] / l] : [0, 0]; };
  const signed = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(3)}`;

  function update(mind, kind) {
    if (!bound() || !mind) return;
    const head = mind.head || mind;
    // ---- readout
    parts.mode.textContent = head.mode || '—';
    parts.mode.dataset.hint = plain(head.why, head.target);
    const tk = head.target;
    if (tk !== parts.tkind) {
      parts.tkind = tk;
      const g = tk != null ? genomeFor(tk) : null;
      parts.sig.innerHTML = g ? sigil(g, 16) : '';
      parts.tname.innerHTML = tk != null ? linkName(tk) : '—';
    }
    if (tk == null) parts.tname.textContent = head.matter || '—';
    // where the shown mode's target lies in the latest reading: the food in reach, else its nearest cell
    const m = mind.m, food = m.food;
    const q = tk == null ? null : m.nbrs.find((n) => food && n.j === food.j) || m.nbrs.filter((n) => n.kind === tk).sort((a, b) => len(a.d) - len(b.d))[0];
    const tdist = q ? len(q.d) : food && head.matter && head.key !== 'forage' ? food.dist : null;
    parts.tdist.textContent = tdist != null ? `${fmtLen(tdist)} away` : '';
    parts.detail.textContent = detail(head, mind);
    // ---- pulls
    const max = Math.max(1e-6, ...mind.groups.map((g) => g.mag));
    if (!ease) ease = { groups: new Map(), hdg: { cur: [0, 0], to: [0, 0] }, tgt: { cur: null, to: null } };
    for (const gr of mind.groups) {
      const u = unit(gr.v), l = gr.mag > max * 0.02 ? R * Math.sqrt(gr.mag / max) : 0;
      const to = [u[0] * l, u[1] * l];
      const e = ease.groups.get(gr.key);
      if (e) e.to = to; else ease.groups.set(gr.key, { cur: to.slice(), to });
      const d = parts.drives.get(gr.key);
      if (d) { d.bar.style.width = `${(gr.mag / max) * 100}%`; d.val.textContent = pct(gr.share); }
    }
    const hu = unit(m.vel);
    ease.hdg.to = len(m.vel) > 0.02 ? [hu[0] * R, hu[1] * R] : [0, 0];
    ease.tgt.to = q ? unit(q.d) : null;
    if (ease.tgt.to && !ease.tgt.cur) ease.tgt.cur = ease.tgt.to.slice();
    // ---- lamps
    for (const f of mind.flags) {
      const n = parts.lamps.get(f.key);
      if (!n) continue;
      n.el.classList.toggle('on', !!f.on);
      if (n.label.textContent !== f.label) n.label.textContent = f.label;
      n.label.dataset.hint = plain(f.hint, f.target);
    }
    parts.live.classList.remove('blink');
    void parts.live.offsetWidth; // restart the blink
    parts.live.classList.add('blink');
    // ---- neighbours: own kind first, then other species in the rows they had
    const others = mind.species.filter((s) => !s.kin);
    const byKind = new Map(mind.species.map((s) => [s.kind, s]));
    rows = slotRows(rows, others.map((s) => s.kind), NB_ROWS);
    const kinds = [kind, ...rows];
    kinds.forEach((k, i) => {
      const r = parts.nb[i], s = k != null ? byKind.get(k) : null;
      if (r.kind !== k) {
        r.kind = k;
        const g = k != null ? genomeFor(k) : null;
        r.sig.innerHTML = g ? sigil(g, 16) : '';
        r.name.innerHTML = k == null ? '—' : i === 0 ? 'its own kind' : linkName(k);
      }
      r.row.classList.toggle('empty', !s);
      r.n.textContent = s ? String(Math.max(1, Math.round(s.n))) : i === 0 ? '0' : '';
      const role = !s || s.kin ? '' : s.threat >= 0.5 && s.prey >= 0.1 ? 'both' : s.threat >= 0.5 ? 'predator' : s.prey >= 0.1 ? 'prey' : '';
      r.role.textContent = role;
      r.role.className = `nb-role ${role}`;
      const pull = s ? (s.sig + s.diet) / (mind.total || 1) : 0;
      const w = Math.min(1, Math.abs(pull)) * 50;
      r.bar.style.left = `${pull < 0 ? 50 - w : 50}%`;
      r.bar.style.width = `${w}%`;
      r.bar.style.background = pull >= 0 ? 'var(--sun)' : 'var(--cyan)';
    });
  }

  // one line of particulars for the mode shown
  function detail(st, mind) {
    const { net } = mind.budget, m = mind.m;
    if (st.odds) return `${pct(st.odds.p)} per ${st.odds.verb} · one try / ${st.odds.every.toFixed(1)} s`;
    if (st.key === 'flee' || st.key === 'avoid') { const s = mind.species.find((x) => x.kind === st.target); return s && s.danger > 0 ? `about ${pct(s.danger)} of their strikes would land` : 'repelled by their surface signature'; }
    if (st.key === 'starve' || mind.flags.find((x) => x.key === 'low').on) return `≈ ${Math.max(1, Math.round(m.energy / Math.max(1e-6, -net)))} s of energy left · ${signed(net)}/s`;
    if (st.key === 'divide' || st.key === 'seeksilt') return `energy ${m.energy.toFixed(2)} of ${mind.need.toFixed(2)} · ${m.siltNear ? 'silt in reach' : 'no silt in reach'}`;
    if (st.key === 'bask' || st.key === 'dark') return `light ${pct(m.light)} · ${signed(net)}/s net`;
    return `net ${signed(net)}/s between meals`;
  }

  /** Ease the compass toward the latest reading; call every frame. */
  function tick(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (!ease || !bound()) return;
    const k = 1 - Math.exp(-dt / EASE_MS);
    const step = (e) => { e.cur[0] += (e.to[0] - e.cur[0]) * k; e.cur[1] += (e.to[1] - e.cur[1]) * k; };
    for (const [key, e] of ease.groups) {
      step(e);
      const a = parts.arrows.get(key);
      if (!a) continue;
      const [x, y] = e.cur, l = Math.hypot(x, y);
      a.line.setAttribute('x2', fix(x)); a.line.setAttribute('y2', fix(y));
      if (l < 2) { a.head.setAttribute('d', ''); continue; }
      const t = Math.atan2(y, x), h = 5;
      a.head.setAttribute('d', `M${fix(x - h * Math.cos(t - 0.45))},${fix(y - h * Math.sin(t - 0.45))}L${fix(x)},${fix(y)}L${fix(x - h * Math.cos(t + 0.45))},${fix(y - h * Math.sin(t + 0.45))}`);
    }
    step(ease.hdg);
    const [hx, hy] = ease.hdg.cur, hl = Math.hypot(hx, hy);
    parts.hdg.setAttribute('x2', fix(hx)); parts.hdg.setAttribute('y2', fix(hy));
    if (hl > 4) {
      // the heading bug: a chevron outside the ring
      const t = Math.atan2(hy, hx), c = Math.cos(t), s = Math.sin(t), r0 = R + 2.5, r1 = R + 8;
      parts.bug.setAttribute('d', `M${fix(c * r1 - s * 3.5)},${fix(s * r1 + c * 3.5)}L${fix(c * r0)},${fix(s * r0)}L${fix(c * r1 + s * 3.5)},${fix(s * r1 - c * 3.5)}`);
    } else parts.bug.setAttribute('d', '');
    const tg = ease.tgt;
    if (tg.to) {
      tg.cur[0] += (tg.to[0] - tg.cur[0]) * k; tg.cur[1] += (tg.to[1] - tg.cur[1]) * k;
      const [ux, uy] = unit(tg.cur), r = R, d = 3.5;
      parts.tgt.setAttribute('d', `M${fix(ux * (r + d))},${fix(uy * (r + d))}L${fix(ux * r - uy * d)},${fix(uy * r + ux * d)}L${fix(ux * (r - d))},${fix(uy * (r - d))}L${fix(ux * r + uy * d)},${fix(uy * r - ux * d)}Z`);
    } else { tg.cur = null; parts.tgt.setAttribute('d', ''); }
  }

  return { html, bind, update, tick };
}
