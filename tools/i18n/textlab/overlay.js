// In the text editor's live page (tools/i18n/textlab.mjs injects it into the marked build): Alt-click any text to
// open its message in the editor; an edit saved there shows here at once (static text in place, the rest the next
// time the page writes it).
(() => {
  const I = globalThis.__i18n; // the marked build's (src/i18n.js)
  if (!I) return;
  const ids = (s) => (s ? I.marks(s) : []);
  const ATTRS = ['aria-label', 'data-hint', 'alt', 'placeholder', 'title'];
  // the messages an element shows: its own text first, then its attributes, then its parents'
  const found = (el) => {
    const out = [];
    for (let e = el, depth = 0; e && e !== document.body && depth < 4; e = e.parentElement, depth++) {
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('');
      out.push(...ids(own), ...ids(e.textContent && depth === 0 ? e.textContent : ''));
      for (const a of ATTRS) out.push(...ids(e.getAttribute(a)));
      if (e.id === 'tip' || out.length) break;
    }
    return [...new Set(out)];
  };
  let outlined = null;
  const outline = (e) => { if (outlined) outlined.style.outline = outlined.__o || ''; outlined = e; if (e) { e.__o = e.style.outline; e.style.outline = '2px solid #ffcf4a'; } };
  addEventListener('mousemove', (ev) => { if (!ev.altKey) { if (outlined) outline(null); return; } const e = document.elementFromPoint(ev.clientX, ev.clientY); if (e !== outlined) outline(e && found(e).length ? e : null); }, true);
  addEventListener('keyup', (ev) => { if (ev.key === 'Alt') outline(null); }, true);
  addEventListener('click', (ev) => {
    if (!ev.altKey) return;
    // the hint showing, if the pointer is over what it explains
    const tip = document.getElementById('tip');
    let list = found(ev.target);
    if (!list.length && tip && !tip.hidden) list = ids(tip.textContent);
    if (!list.length) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    parent.postMessage({ kind: 'textlab-pick', ids: list }, location.origin);
  }, true);
  addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.data?.kind !== 'textlab-set') return;
    const { id, text } = ev.data;
    I.setMessage(id, text);
    // static text: an element marked with this id holding only words
    const m = I.mark(id, '');
    for (const e of document.querySelectorAll(`[data-i18n="${CSS.escape(id)}"]`)) if (![...e.children].some((c) => c.textContent.trim()) && !/[<{]/.test(text)) {
      const t = [...e.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (t) t.nodeValue = text + m;
    }
    const at = /^(.*)\.(aria|hint|alt|ph|title)$/.exec(id);
    if (at) for (const e of document.querySelectorAll(`[data-i18n="${CSS.escape(at[1])}"]`)) e.setAttribute({ aria: 'aria-label', hint: 'data-hint', alt: 'alt', ph: 'placeholder', title: 'title' }[at[2]], text + m);
  });
})();
