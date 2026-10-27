// Live text and markup, written so that only what changed is touched. A panel that rewrites its whole
// markup a few times a second for one changing figure undoes a page translator (Chrome's, Google
// Translate's) as fast as it works: the translated words are replaced by the English again, and they
// flicker or are never translated at all. Here each element remembers what was last written to it
// (not what it holds now, which a translator has changed), and a new markup is compared with that
// one node by node: an unchanged node keeps its DOM, and with it its translation, hover and selection.

const wrote = new WeakMap(); // element -> { text } or { html, frag: the parsed markup last written }

/** Sets an element's text, unless it was last set to the same text. */
export function setText(el, text) {
  const w = wrote.get(el);
  if (w && w.text === text) return false;
  el.textContent = text;
  wrote.set(el, { text });
  return true;
}

const parse = (html) => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };

/** Sets an element's markup, changing only the nodes that differ from the markup last written. */
export function setHTML(el, html) {
  const w = wrote.get(el);
  if (w && w.html === html) return false;
  const frag = parse(html);
  if (w && w.frag) morph(el, w.frag, frag);
  else el.replaceChildren(frag.cloneNode(true));
  wrote.set(el, { html, frag });
  return true;
}

// live mirrors a, the markup last written (a translator wraps a text node in one <font>, so positions
// still match); make it b. The children both share at the start and the end stay (a log's new entry on
// top touches nothing below it); those between are changed pairwise, or replaced when their count changed.
function morph(live, a, b) {
  const L = [...live.childNodes], A = a.childNodes, B = b.childNodes;
  if (L.length !== A.length) { live.replaceChildren(...[...B].map((n) => n.cloneNode(true))); return; }
  let s = 0, e = 0;
  while (s < A.length && s < B.length && A[s].isEqualNode(B[s])) s++;
  while (e < A.length - s && e < B.length - s && A[A.length - 1 - e].isEqualNode(B[B.length - 1 - e])) e++;
  if (A.length === B.length) {
    for (let i = s; i < B.length - e; i++) morphNode(L[i], A[i], B[i]);
    return;
  }
  const at = L[L.length - e] || null;
  for (let i = s; i < L.length - e; i++) L[i].remove();
  for (let i = s; i < B.length - e; i++) live.insertBefore(B[i].cloneNode(true), at);
}
function morphNode(l, p, n) {
  if (p.isEqualNode(n)) return;
  if (p.nodeType === 1 && n.nodeType === 1 && l.nodeType === 1 && p.nodeName === n.nodeName && l.nodeName === n.nodeName) {
    for (const { name } of [...p.attributes]) if (!n.hasAttribute(name)) l.removeAttribute(name);
    for (const { name, value } of [...n.attributes]) {
      if (p.getAttribute(name) === value) continue;
      l.setAttribute(name, value);
      if (name === 'value' && 'value' in l) l.value = value; // a field's shown value, not only its default
    }
    morph(l, p, n);
  } else if (p.nodeType === 3 && n.nodeType === 3 && l.nodeType === 3) l.data = n.data;
  else l.replaceWith(n.cloneNode(true));
}
