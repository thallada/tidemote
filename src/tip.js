// Hover, focus and tap hints. Glossary terms carry data-tip (a GLOSSARY key); controls carry
// data-hint ("Label · key"). No element carries a title attribute, so nothing competes with these.
import { GLOSSARY } from './guide.js';

export function createTips(tip) {
  let owner = null;
  let via = '';
  let rect = null; // what opened the hint: 'hover', 'tap' or 'focus'; each closes its own way
  const textFor = (el) => {
    if (el.dataset.tip) return GLOSSARY[el.dataset.tip] ? { text: GLOSSARY[el.dataset.tip] } : null;
    const h = el.dataset.hint;
    if (!h) return null;
    const i = h.lastIndexOf(' · ');
    return i > 0 ? { text: h.slice(0, i), key: h.slice(i + 3) } : { text: h };
  };
  function show(el, how) {
    const t = textFor(el);
    if (!t) return;
    owner = el;
    via = how;
    tip.textContent = t.text;
    if (t.key) { const k = document.createElement('kbd'); k.textContent = t.key; tip.append(k); }
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    rect = r;
    const tw = Math.min(300, innerWidth - 16);
    tip.style.maxWidth = `${tw}px`;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const above = r.top - h - 8 > 8 && (r.bottom + h + 8 > innerHeight || r.top > innerHeight / 2);
    tip.style.left = `${left}px`;
    tip.style.top = `${above ? r.top - h - 8 : r.bottom + 8}px`;
    el.setAttribute('aria-describedby', 'tip');
  }
  function hide() {
    if (owner) owner.removeAttribute('aria-describedby');
    owner = null;
    tip.hidden = true;
  }
  const target = (e) => e.target.closest && e.target.closest('[data-tip],[data-hint]');
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = target(e);
    if (el && el !== owner) show(el, 'hover');
    else if (!el && owner && via === 'hover') hide();
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && owner && via === 'hover' && !owner.contains(e.relatedTarget)) hide();
  });
  // touch: a tap on a term opens its hint, which stays after the finger lifts; the next tap
  // anywhere (the term included) closes it
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { if (owner) hide(); return; }
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && el !== owner) { show(el, 'tap'); return; }
    if (owner) hide();
  }, true);
  document.addEventListener('focusin', (e) => {
    const el = target(e);
    if (el && el.matches(':focus-visible')) show(el, 'focus');
  });
  document.addEventListener('focusout', () => { if (owner && via === 'focus') hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && owner) hide(); }, true);
  // Live panels re-render the element a hint belongs to: move the hint to its replacement (the same
  // term, where the old one was) instead of closing it.
  function check() {
    if (!owner || owner.isConnected) return;
    const key = owner.dataset.tip ? `[data-tip="${owner.dataset.tip}"]` : `[data-hint="${CSS.escape(owner.dataset.hint || '')}"]`;
    const old = rect;
    let best = null, bd = 24;
    for (const el of document.querySelectorAll(key)) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left - old.left, r.top - old.top);
      if (d < bd) { bd = d; best = el; }
    }
    if (best) { owner = best; owner.setAttribute('aria-describedby', 'tip'); } else hide();
  }
  return { hide, check };
}
