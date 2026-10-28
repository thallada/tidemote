// The bench (docs/hand.md): the tools in the dock's middle on screens wide enough for them, the Bench drawer above
// the dock (a tile for each tool, a hint for the one in hand, its Reach), and on a phone the held strip that a tool
// in hand folds the drawer to. Built once and updated in place (render), so nothing moves under the pointer.
import { TOOLS, REACH, keyOf, toolOf } from './hand.js';
import { fmtLen } from './fmt.js';
import { wireCardDrag } from './minicard.js';

const $ = (id) => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches;
const icon = (id) => `<svg aria-hidden="true"><use href="#i-t-${id}"/></svg>`;
// Reach on a logarithmic slider: 0..1000 over REACH.min..max
const LOG = Math.log(REACH.max / REACH.min);
const toSlider = (r) => Math.round((1000 * Math.log(r / REACH.min)) / LOG);
const fromSlider = (v) => REACH.min * Math.exp((v / 1000) * LOG);
/** One reach step up or down (the keys, the held strip's − and +). */
export const reachStep = (r, d) => Math.min(REACH.max, Math.max(REACH.min, r * 1.25 ** d));

/**
 * hand: the page's hand (src/hand.js); pick(id) takes up a tool; reach(r) sets the reach; onToggle(open) as the
 * drawer opens or closes. pip: the pipette's strip: view() -> { count, limit, keys, armed }, cards(flat) -> its
 * mini-cards' markup, toTip(key), open(key) (its full card), drop(key, x, y) (a card dragged out onto the world),
 * arm() (Pull: the next touch draws up).
 */
export function createBench({ hand, pick, reach, onToggle = () => {}, pip }) {
  const drawer = $('bench'), btn = $('bench-open'), held = $('held'), dock = $('tools');
  dock.innerHTML = TOOLS.map((t, i) => `<button type="button" class="tool" data-tool="${t.id}" aria-pressed="false" aria-label="${t.name}" data-hint="${t.name} · ${i + 1}">${icon(t.id)}<kbd>${i + 1}</kbd></button>`).join('');
  drawer.innerHTML = `<div class="bench-tools">
      <div class="sub-h"><span class="bench-t">Tools<i class="bench-note">tap to pick one up · hold its key for a moment’s use</i></span><span class="sub-a" id="bench-held"></span></div>
      <div class="tiles" role="radiogroup" aria-label="Tools">${TOOLS.map((t, i) => `<button type="button" role="radio" class="tile" data-tool="${t.id}" aria-checked="false"><kbd>${i + 1}</kbd>${icon(t.id)}<span>${t.name}</span></button>`).join('')}</div>
      <p class="bench-hint" id="bench-hint" aria-live="polite"></p>
      <label class="reach"><span class="lbl term" data-tip="toolreach" tabindex="0">Reach</span><input type="range" id="reach" min="0" max="1000" step="1" aria-label="Reach"><b id="reach-v" translate="no"></b></label>
    </div>
    <div class="bench-pip">
      <div class="sub-h"><span class="bench-t">Pipette</span><span class="sub-a" id="pip-n"></span></div>
      <div class="strip" id="pip-strip"></div>
    </div>`;
  held.innerHTML = `<kbd id="held-k"></kbd><b id="held-n"></b><span class="held-reach"><button type="button" class="ghost" data-d="-1" aria-label="Less reach"><svg><use href="#i-minus"/></svg></button><b id="held-r" translate="no"></b><button type="button" class="ghost" data-d="1" aria-label="More reach"><svg><use href="#i-plus"/></svg></button></span><button type="button" class="btn" id="held-pull" aria-pressed="false" data-hint="The next touch draws up instead of setting down">Pull</button><button type="button" class="btn" id="held-down">Put down</button><div class="strip flat" id="held-strip"></div>`;
  const slider = $('reach'), strip = $('pip-strip'), hstrip = $('held-strip');

  const toolClick = (e) => { const b = e.target.closest('[data-tool]'); if (b) pick(b.dataset.tool); };
  dock.addEventListener('click', toolClick);
  drawer.addEventListener('click', toolClick);
  slider.addEventListener('input', () => reach(fromSlider(+slider.value)));
  held.addEventListener('click', (e) => {
    const d = e.target.closest('[data-d]');
    if (d) reach(reachStep(hand.reach, +d.dataset.d));
    else if (e.target.closest('#held-down')) pick('loupe');
    else if (e.target.closest('#held-pull')) { pip.arm(); render(); }
  });
  // the strip's cards: a tap brings one to the tip, a double tap opens its card, a drag onto the world sets all of it
  // down there
  const drags = [strip, hstrip].map((row) => wireCardDrag(row, {
    tap: (key, double) => { if (double) pip.open(key); else { pip.toTip(key); render(); } },
    drop: (key, x, y, el) => { if (el?.id === 'stage') pip.drop(key, x, y); },
  }));
  btn.addEventListener('click', () => toggle());

  function toggle(on = drawer.hidden) {
    drawer.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    render();
    onToggle(on);
  }
  function render() {
    const t = toolOf(hand.tool), up = t.id !== 'loupe';
    for (const b of dock.children) b.setAttribute('aria-pressed', String(b.dataset.tool === t.id));
    for (const b of drawer.querySelectorAll('.tile')) b.setAttribute('aria-checked', String(b.dataset.tool === t.id));
    $('bench-held').textContent = up ? `${t.name} in hand · Esc puts it down` : 'The loupe in hand';
    $('bench-hint').innerHTML = `<b>${t.name}</b> · ${(coarse && t.touch) || t.hint}`;
    if (document.activeElement !== slider) slider.value = toSlider(hand.reach);
    $('reach-v').textContent = t.id === 'needle' ? 'a point' : fmtLen(hand.reach);
    slider.disabled = t.id === 'needle' || t.id === 'loupe';
    // the bench button names the tool in hand (on a phone, where the dock has no tools)
    $('bench-i').setAttribute('href', up ? `#i-t-${t.id}` : '#i-bench');
    $('bench-l').textContent = up ? t.name : 'Bench';
    btn.classList.toggle('in-hand', up);
    // a tool in hand on a phone, the drawer closed: the held strip
    held.hidden = !(up && drawer.hidden && innerWidth <= 980);
    $('held-k').textContent = keyOf(t.id);
    $('held-n').textContent = t.name;
    $('held-r').textContent = t.id === 'needle' ? 'a point' : fmtLen(hand.reach);
    held.querySelector('.held-reach').hidden = t.id === 'needle' || t.id === 'pipette';
    renderPip(t.id === 'pipette');
  }
  // the pipette's contents: rebuilt only when they change, never under the pointer
  let pipKey = '';
  function renderPip(inHand) {
    const v = pip.view(), key = `${v.count}|${v.keys.join(',')}|${inHand}|${v.armed}`;
    $('held-pull').hidden = !inHand;
    $('held-pull').setAttribute('aria-pressed', String(v.armed));
    held.classList.toggle('pip', inHand);
    const tool = dock.querySelector('[data-tool="pipette"]');
    tool.dataset.count = v.count ? (v.count > 999 ? `${Math.floor(v.count / 1000)}k` : v.count) : '';
    if (key === pipKey || drags.some((d) => d.dragging())) return;
    pipKey = key;
    $('pip-n').textContent = v.count ? `${v.count.toLocaleString('en-US')} / ${v.limit.toLocaleString('en-US')}${v.count >= v.limit ? ' · full' : ''} · tip first` : 'empty';
    strip.innerHTML = v.keys.length ? pip.cards(false)
      : '<div class="pip-empty"><b>Nothing in the pipette.</b><span>Draw cells up from the world with the pipette (8): its right button, or any while it is empty.</span></div>';
    hstrip.innerHTML = inHand ? pip.cards(true) : '';
  }
  addEventListener('resize', render);
  render();
  return { render, toggle, isOpen: () => !drawer.hidden };
}
