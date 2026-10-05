// Hover, focus and tap hints. Glossary terms carry data-tip (a GLOSSARY key); controls carry
// data-hint ("Label · key"). No element carries a title attribute, so nothing competes with these.
import { GLOSSARY } from './guide.js';

export function createTips(tip) {
  let owner = null;
  const textFor = (el) => {
    if (el.dataset.tip) return GLOSSARY[el.dataset.tip] ? { text: GLOSSARY[el.dataset.tip] } : null;
    const h = el.dataset.hint;
    if (!h) return null;
    const i = h.lastIndexOf(' · ');
    return i > 0 ? { text: h.slice(0, i), key: h.slice(i + 3) } : { text: h };
  };
  function show(el) {
    const t = textFor(el);
    if (!t) return;
    owner = el;
    tip.textContent = t.text;
    if (t.key) { const k = document.createElement('kbd'); k.textContent = t.key; tip.append(k); }
    tip.hidden = false;
    const r = el.getBoundingClientRect();
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
    if (el && el !== owner) show(el);
    else if (!el && owner) hide();
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && owner && !owner.contains(e.relatedTarget)) hide();
  });
  // touch: a tap on a term toggles its hint; any other tap closes it
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { if (owner) hide(); return; }
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && el !== owner) { show(el); return; }
    if (owner) hide();
  }, true);
  document.addEventListener('focusin', (e) => {
    const el = target(e);
    if (el && el.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', () => { if (owner) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && owner) hide(); }, true);
  return { hide, check() { if (owner && !owner.isConnected) hide(); } };
}
