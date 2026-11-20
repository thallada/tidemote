// Moving focus by direction (docs/controller.md): the d-pad and the stick (and the arrow keys, in a panel) take focus
// to the nearest control that way, within the panel on top. No maintained library does this without a framework,
// and the CSS proposal never shipped; this is the small part we need.
//
// The core (nextIndex) is pure: rectangles in, the one to go to out. The DOM side finds the controls of a root (what
// can take focus and shows), remembers each root's last focused control, steps sliders and changes tabs.

/**
 * Of candidate rects, the index of the one to go to from rect `from` in direction dir ('up', 'down', 'left',
 * 'right'), or −1. A candidate must lie that way (its middle past `from`'s middle along dir); among those the nearest
 * wins, distance along dir plus twice the offset across it (none where they overlap across it by more than 3 px), so
 * a control in line beats a nearer one off to the side; ties go to the one whose middle is nearest in line.
 */
export function nextIndex(from, rects, dir) {
  const h = dir === 'left' || dir === 'right', s = dir === 'right' || dir === 'down' ? 1 : -1;
  const mid = (r) => [r.left + r.width / 2, r.top + r.height / 2];
  const [fx, fy] = mid(from);
  let best = -1, bs = Infinity;
  rects.forEach((r, i) => {
    const [cx, cy] = mid(r);
    const along = h ? (cx - fx) * s : (cy - fy) * s;
    if (along <= 1) return;
    // the gap between the edges along dir (0 where they overlap), and across it
    const gap = Math.max(0, h ? (s > 0 ? r.left - from.right : from.left - r.right) : (s > 0 ? r.top - from.bottom : from.top - r.bottom));
    // (in line: overlapping across by more than a sliver; chips in a grid share their borders, a pixel's overlap, and
    // a chip beside the one below must not pass for in line with it)
    const lo = h ? Math.max(r.top, from.top) : Math.max(r.left, from.left), hi = h ? Math.min(r.bottom, from.bottom) : Math.min(r.right, from.right);
    const off = h ? Math.abs(cy - fy) : Math.abs(cx - fx);
    const across = hi - lo > 3 ? 0 : off;
    // (and of those as near, the one whose middle is nearest in line)
    const score = gap + along * 0.1 + 2 * across + 0.05 * off;
    // (a later control must be nearer by more than a pixel: near ties go to the first, in reading order)
    if (score < bs - 1) { bs = score; best = i; }
  });
  return best;
}

const FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex], [role="tab"], summary'; // i18n-ignore (key names, selectors and styles)

/** Whether el can take focus and shows: not disabled, not inside something hidden or inert, with a box on the screen. */
export function canFocus(el) {
  // (nor what is there only for screen readers: .sr-only, a canvas's list of what it draws)
  if (el.disabled || el.closest('[hidden], [inert], [aria-hidden="true"], .sr-only')) return false;
  if (el.getAttribute('tabindex') === '-1' && el.getAttribute('role') !== 'tab') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  // (off the screen only within something that scrolls, which brings it into view: a panel's controls below its fold
  // are reached as Tab reaches them)
  if ((r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) && !inScroller(el)) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0;
}

const inScroller = (el) => {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if ((/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) || (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1)) return true;
  }
  return false;
};

/** The controls of root that can take focus now. */
export const controlsOf = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(canFocus);

/** Whether el is changed by a direction rather than pressed: a slider, a list. */
export const isAdjustable = (el) => !!el && (el.type === 'range' || el.tagName === 'SELECT');

/**
 * Change a slider or a list by d steps (−1, +1; fractions too, for a stick held): a slider by a twentieth of its
 * span a step (its own step if coarser), a list by an option. Whether it changed.
 */
export function adjust(el, d) {
  if (el.type === 'range') {
    const min = +el.min || 0, max = el.max === '' ? 100 : +el.max, span = max - min, st = parseFloat(el.step);
    const step = el.step === '' ? 1 : st > 0 ? st : span / 1000; // (no step: 1; "any": fine)
    const by = Math.max(step, span / 20) * d;
    // (a fraction of a step kept between calls, so a stick held gently still gets there)
    const want = Math.min(max, Math.max(min, (el._adj ?? +el.value) + by));
    const v = Math.min(max, Math.max(min, min + Math.round((want - min) / step) * step));
    el._adj = want;
    if (v === +el.value) return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el.tagName === 'SELECT') {
    const i = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + Math.sign(d)));
    if (i === el.selectedIndex) return false;
    el.selectedIndex = i; el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

export function createFocus() {
  const last = new WeakMap(); // root -> its last focused control
  document.addEventListener('focusin', (e) => {
    for (let n = e.target.parentElement; n; n = n.parentElement) if (n.dataset?.navRoot != null) { last.set(n, e.target); break; }
  });
  const show = (el) => { el.focus({ preventScroll: true }); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); };
  return {
    /** Focus into root: its last focused control if it still shows, else `first` (a selector) or its first control. */
    enter(root, first) {
      if (!root) return false;
      const was = last.get(root);
      const el = (was && root.contains(was) && canFocus(was) && was) || (first && root.querySelector(first)) || controlsOf(root)[0];
      if (el && canFocus(el)) { show(el); return true; }
      return false;
    },
    /** Move focus within root by dir (a slider or a list too: changing one takes hold of it first, adjust below). */
    move(root, dir) {
      const a = document.activeElement;
      const list = controlsOf(root);
      if (!list.length) return false;
      if (!a || !root.contains(a) || !list.includes(a)) { show(list[0]); return true; }
      const i = nextIndex(a.getBoundingClientRect(), list.map((el) => el.getBoundingClientRect()), dir);
      if (i >= 0) show(list[i]);
      return i >= 0;
    },
    /** Focus across into another panel `to`, onto its control nearest that way from the focused one. Whether it did. */
    cross(to, dir) {
      const list = to ? controlsOf(to) : [];
      if (!list.length) return false;
      const a = document.activeElement;
      const i = a && a !== document.body ? nextIndex(a.getBoundingClientRect(), list.map((el) => el.getBoundingClientRect()), dir) : -1;
      show(list[i >= 0 ? i : 0]);
      return true;
    },
    /** The previous or next tab (d: −1, +1) of the tab row nearest focus in root (or root's first). */
    tab(root, d) {
      const a = document.activeElement;
      const row = (a && root.contains(a) && a.closest('[role="tablist"]')) || root.querySelector('[role="tablist"]');
      if (!row) return false;
      const tabs = [...row.querySelectorAll('[role="tab"]')].filter(canFocus);
      const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const t = tabs[(i + d + tabs.length) % tabs.length];
      if (!t) return false;
      t.click();
      // (focus on the tab row, or lost as the tab's contents were drawn anew: onto the new tab)
      const now = document.activeElement;
      if (row.contains(a) || !now || now === document.body || !root.contains(now)) t.focus({ preventScroll: true });
      return true;
    },
    /** Scroll the scroller nearest focus in root (else root's own, or its first) by dy px. */
    scroll(root, dy) {
      const can = (n) => { const cs = getComputedStyle(n); return /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1; };
      let n = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
      while (n && n !== root.parentElement && !can(n)) n = n.parentElement;
      if (!n || !root.contains(n) && n !== root) n = can(root) ? root : [...root.querySelectorAll('*')].find(can);
      if (!n) return false;
      n.scrollTop += dy;
      return true;
    },
  };
}
