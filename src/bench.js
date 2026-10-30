// The bench (docs/hand.md): the tools in the dock's middle on screens wide enough for them, the Bench drawer above
// the dock (a tile for each tool, a hint for the one in hand, its Reach), and on a phone the held strip that a tool
// in hand folds the drawer to. Built once and updated in place (render), so nothing moves under the pointer.
import { TOOLS, REACH, keyOf, toolOf, works } from './hand.js';
import { wireCardDrag, countText } from './minicard.js';

const $ = (id) => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches;
const icon = (id) => `<svg aria-hidden="true"><use href="#i-t-${id}"/></svg>`;
// Reach on a logarithmic slider: 0..1000 over the tool's range ({ min, max })
const toSlider = (r, { min, max }) => Math.round((1000 * Math.log(r / min)) / Math.log(max / min));
const fromSlider = (v, { min, max }) => min * Math.exp((v / 1000) * Math.log(max / min));
// Load or Dispense: what the pipette's press does
const modes = (id) => `<span class="pip-mode segs" role="group" aria-label="The pipette's press"><button type="button" class="chip" data-mode="0" id="${id}-load" aria-pressed="true" data-hint="A press draws up cells at the tip, all in reach as it is held">Load</button><button type="button" class="chip" data-mode="1" id="${id}-dispense" aria-pressed="false" data-hint="A press sets the tip card’s cells down">Dispense</button></span>`;

/**
 * A row that scrolls sideways fades at an edge only where there is more beyond it (fade-l, fade-r), as it scrolls
 * and as what is in it changes.
 */
function fadeEdges(row) {
  const mark = () => {
    const more = row.scrollWidth - row.clientWidth;
    row.classList.toggle('fade-l', row.scrollLeft > 2);
    row.classList.toggle('fade-r', more > 2 && row.scrollLeft < more - 2);
  };
  row.addEventListener('scroll', mark, { passive: true });
  new ResizeObserver(mark).observe(row);
  new MutationObserver(mark).observe(row, { childList: true });
  return mark;
}

/**
 * A panel at the screen's foot that a swipe down closes (as the specimen's sheet): a drag that starts down, on
 * anything but a slider (on a card, at once: held first, it lifts the card), follows the finger and, past a little
 * way, close().
 */
function swipeDown(el, close) {
  let drag = null, swiped = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('input')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, card: !!e.target.closest('.mini'), at: performance.now() };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y, dx = e.clientX - drag.x;
    if (!drag.on) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { drag = null; return; }
      if (dy < 10 || dy < Math.abs(dx)) return;
      if (drag.card && performance.now() - drag.at > 350) { drag = null; return; }
      drag.on = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* the pointer already ended */ }
    }
    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    el.style.transform = '';
    swiped = performance.now();
    if (e.type === 'pointerup' && e.clientY - d.y > 48) close();
  };
  // (a swipe is no tap on what it began on)
  el.addEventListener('click', (e) => { if (performance.now() - swiped < 300) { e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
/** One reach step up or down (the keys, the held strip's − and +). */
export const reachStep = (r, d) => Math.min(REACH.max, Math.max(REACH.min, r * 1.25 ** d));

/**
 * hand: the page's hand (src/hand.js); pick(id) takes up a tool (the one in hand: puts it down); reach(r) sets the
 * reach of the tool in hand, size() -> { min, max, v, text } its range and value; onToggle(open) as the drawer
 * opens or closes. pip: the pipette's strip, its runs from the tip: view() -> { count, limit, keys,
 * held: [[cells, bodies]], armed, mixed (a species in more than one run) }, cards(flat) -> its mini-cards' markup,
 * move(key, i) (to place i, 0 the tip), open(key) (its full card), drop(key, x, y) (a card dragged out onto
 * the world), save(key) (dragged onto the Lab: its card into the cabinet), saveAll() (every card into the
 * cabinet), sort() (each species' runs as one), cabinet() (opens it), arm(on) (Dispense: a press sets down rather
 * than draws up).
 */
export function createBench({ hand, pick, reach, size, onToggle = () => {}, pip }) {
  const drawer = $('bench'), btn = $('bench-open'), held = $('held'), dock = $('tools');
  dock.innerHTML = TOOLS.map((t, i) => `<button type="button" class="tool" data-tool="${t.id}" aria-pressed="false" aria-label="${t.name}" data-hint="${t.name} · ${i}">${icon(t.id)}<kbd>${i}</kbd></button>`).join('');
  drawer.innerHTML = `<div class="grab" aria-hidden="true"><i></i></div><div class="bench-tools">
      <div class="sub-h"><span class="bench-t">Tools<i class="bench-note">tap to pick one up · hold its key for a moment’s use</i></span><span class="sub-a" id="bench-held"></span></div>
      <div class="tiles" role="radiogroup" aria-label="Tools">${TOOLS.map((t, i) => `<button type="button" role="radio" class="tile" data-tool="${t.id}" aria-checked="false" aria-label="${t.name}" data-hint="${t.name} · ${i}"><kbd>${i}</kbd>${icon(t.id)}<span>${t.name}</span></button>`).join('')}</div>
      <p class="bench-hint" id="bench-hint" aria-live="polite"></p>
      <label class="reach"><span class="lbl term" data-tip="toolreach" tabindex="0">Reach</span><input type="range" id="reach" min="0" max="1000" step="1" aria-label="Reach"><b id="reach-v" translate="no"></b></label>
    </div>
    <div class="bench-pip">
      <div class="sub-h"><span class="bench-t">Pipette</span><span class="sub-a" id="pip-n"></span>${modes('pip')}<button type="button" class="chip" id="pip-sort" data-hint="Each species’ cells together, one card each">Sort</button><button type="button" class="chip" id="pip-keep" data-hint="Every card not saved yet into the cabinet">Save all</button></div>
      <div class="strip" id="pip-strip"></div>
    </div>`;
  held.innerHTML = `<kbd id="held-k"></kbd><b id="held-n"></b><span class="held-reach"><button type="button" class="ghost" data-d="-1" aria-label="Less reach"><svg><use href="#i-minus"/></svg></button><b id="held-r" translate="no"></b><button type="button" class="ghost" data-d="1" aria-label="More reach"><svg><use href="#i-plus"/></svg></button></span>${modes('held')}<button type="button" class="ghost" id="held-down" aria-label="Put the tool down" data-hint="Put it down · Esc"><svg><use href="#i-close"/></svg></button><div class="strip flat" id="held-strip"></div>`;
  const slider = $('reach'), strip = $('pip-strip'), hstrip = $('held-strip');
  const fades = [strip, hstrip, drawer.querySelector('.tiles')].map(fadeEdges);

  const toolClick = (e) => { const b = e.target.closest('[data-tool]'); if (b) pick(b.dataset.tool); };
  dock.addEventListener('click', toolClick);
  drawer.addEventListener('click', toolClick);
  slider.addEventListener('input', () => reach(fromSlider(+slider.value, size())));
  const mode = (e) => { const m = e.target.closest('[data-mode]'); if (m) { pip.arm(m.dataset.mode === '1'); render(); } return !!m; };
  held.addEventListener('click', (e) => {
    const d = e.target.closest('[data-d]');
    if (d) reach(reachStep(hand.reach, +d.dataset.d));
    else if (e.target.closest('#held-down')) pick('none');
    else mode(e);
  });
  drawer.addEventListener('click', (e) => {
    if (mode(e)) return;
    if (e.target.closest('#pip-keep')) pip.saveAll();
    else if (e.target.closest('#pip-sort')) { pip.sort(); render(); }
    else if (e.target.closest('.grab')) toggle(false);
  });
  swipeDown(drawer, () => toggle(false));
  // the strip's cards: a tap opens its card, a drag along the strip moves it (the first is at the tip), onto the world
  // sets all of it down there, onto the Lab keeps its card
  const drags = [strip, hstrip].map((row) => wireCardDrag(row, {
    tap: (key) => pip.open(key),
    reorder: (key, i) => { pip.move(key, i); render(); },
    drop: (key, x, y, el) => { if (el?.id === 'stage') pip.drop(key, x, y); else if (el?.closest('#lab, #lab-open')) pip.save(key); },
  }));
  btn.addEventListener('click', () => toggle());
  strip.addEventListener('click', (e) => { if (e.target.closest('[data-cabinet]')) pip.cabinet(); });

  function toggle(on = drawer.hidden) {
    drawer.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    render();
    onToggle(on);
  }
  function render() {
    const t = toolOf(hand.tool), up = works(t.id), sz = size();
    for (const b of dock.children) b.setAttribute('aria-pressed', String(b.dataset.tool === t.id));
    for (const b of drawer.querySelectorAll('.tile')) {
      const on = b.dataset.tool === t.id;
      // (the tool taken up comes into view in a row that scrolls, as on a phone)
      if (on && b.getAttribute('aria-checked') !== 'true' && !drawer.hidden) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      b.setAttribute('aria-checked', String(on));
    }
    $('bench-held').innerHTML = up ? `${t.name} in hand<i class="bench-esc"> · Esc puts it down</i>` : t.id === 'loupe' ? 'The loupe in hand' : 'Nothing in hand';
    $('bench-hint').innerHTML = `<b>${t.name}</b> · ${(coarse && t.touch) || t.hint}`;
    if (document.activeElement !== slider) slider.value = toSlider(sz.v, sz);
    $('reach-v').textContent = t.id === 'needle' ? 'a point' : t.id === 'none' ? '–' : sz.text;
    slider.disabled = t.id === 'needle' || t.id === 'none';
    // the bench button names the tool in hand (on a phone, where the dock has no tools)
    $('bench-i').setAttribute('href', t.id !== 'none' ? `#i-t-${t.id}` : '#i-bench');
    $('bench-l').textContent = t.id !== 'none' ? t.name : 'Bench';
    btn.classList.toggle('in-hand', up);
    // a tool in hand on a phone, the drawer closed: the held strip
    held.hidden = !(up && drawer.hidden && innerWidth <= 980);
    $('held-k').textContent = keyOf(t.id);
    $('held-n').textContent = t.name;
    $('held-r').textContent = sz.text;
    held.querySelector('.held-reach').hidden = t.id === 'needle' || t.id === 'pipette';
    renderPip(t.id === 'pipette');
  }
  // the pipette's contents: rebuilt only when its species change, never under the pointer; what it holds of each
  // updated in place (it changes every few frames while it draws up or sets down)
  let pipKey = '';
  function renderPip(inHand) {
    const v = pip.view(), key = `${v.keys.join(',')}|${inHand}`;
    held.querySelector('.pip-mode').hidden = !inHand;
    for (const b of document.querySelectorAll('.pip-mode [data-mode]')) b.setAttribute('aria-pressed', String((b.dataset.mode === '1') === v.armed));
    $('pip-keep').hidden = !v.keys.some((k) => !k.endsWith('*'));
    $('pip-sort').hidden = !v.mixed;
    held.classList.toggle('pip', inHand);
    const tool = dock.querySelector('[data-tool="pipette"]');
    tool.dataset.count = v.count ? (v.count > 999 ? `${Math.floor(v.count / 1000)}k` : v.count) : '';
    $('pip-n').textContent = v.count ? `${v.count.toLocaleString('en-US')} / ${v.limit.toLocaleString('en-US')}${v.count >= v.limit ? ' · full' : ''}` : 'empty';
    if (drags.some((d) => d.dragging())) return;
    if (key === pipKey) {
      for (const row of [strip, hstrip]) [...row.querySelectorAll('.mini .mc-n b')].forEach((b, i) => { if (v.held[i]) b.innerHTML = countText(...v.held[i], row === hstrip); });
      return;
    }
    pipKey = key;
    strip.innerHTML = v.keys.length ? pip.cards(false)
      : '<div class="pip-empty"><b>Nothing in the pipette.</b><span>Draw cells up from the world with the pipette (8), or bring cards from the cabinet.</span><button type="button" class="link" data-cabinet>Open the cabinet</button></div>';
    hstrip.innerHTML = inHand ? pip.cards(true) : '';
    fades.forEach((f) => f());
  }
  addEventListener('resize', render);
  render();
  return { render, toggle, isOpen: () => !drawer.hidden };
}
