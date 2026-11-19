// Moving focus by direction (docs/controller.md): the d-pad and the stick (and the arrow keys, in a panel) take focus
// to the nearest control that way, within the panel on top. No maintained library does this without a framework,
// and the CSS proposal never shipped; this is the small part we need.
//
// The core (nextIndex) is pure: rectangles in, the one to go to out. The DOM side finds the controls of a root (what
// can take focus and shows), remembers each root's last focused control, steps sliders and changes tabs.

/**
 * Of candidate rects, the index of the one to go to from rect `from` in direction dir ('up', 'down', 'left',
 * 'right'), or −1. A candidate must lie that way (its middle past `from`'s middle along dir); among those the nearest
 * wins, distance along dir plus twice the offset across it (none where they overlap across it), so a control in
 * line beats a nearer one off to the side.
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
    const lo = h ? Math.max(r.top, from.top) : Math.max(r.left, from.left), hi = h ? Math.min(r.bottom, from.bottom) : Math.min(r.right, from.right);
    const across = hi > lo ? 0 : h ? Math.abs(cy - fy) : Math.abs(cx - fx);
    const score = gap + along * 0.1 + 2 * across;
    if (score < bs) { bs = score; best = i; }
  });
  return best;
}

const FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex], [role="tab"], summary'; // i18n-ignore (key names, selectors and styles)

/** Whether el can take focus and shows: not disabled, not inside something hidden or inert, with a box on the screen. */
export function canFocus(el) {
  if (el.disabled || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if (el.getAttribute('tabindex') === '-1' && el.getAttribute('role') !== 'tab') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0;
}

/** The controls of root that can take focus now. */
export const controlsOf = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(canFocus);

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
    /** Move focus within root by dir; a slider steps instead (left, right), and a select changes its option (up, down). */
    move(root, dir) {
      const a = document.activeElement;
      if (a && root.contains(a)) {
        if (a.type === 'range' && (dir === 'left' || dir === 'right')) {
          const step = +a.step || 1, v = Math.min(+a.max, Math.max(+a.min, +a.value + (dir === 'right' ? step : -step)));
          if (v !== +a.value) { a.value = v; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); }
          return true;
        }
        if (a.tagName === 'SELECT' && (dir === 'up' || dir === 'down')) {
          const i = Math.min(a.options.length - 1, Math.max(0, a.selectedIndex + (dir === 'down' ? 1 : -1)));
          if (i !== a.selectedIndex) { a.selectedIndex = i; a.dispatchEvent(new Event('change', { bubbles: true })); }
          return true;
        }
      }
      const list = controlsOf(root);
      if (!list.length) return false;
      if (!a || !root.contains(a) || !list.includes(a)) { show(list[0]); return true; }
      const i = nextIndex(a.getBoundingClientRect(), list.map((el) => el.getBoundingClientRect()), dir);
      if (i >= 0) show(list[i]);
      return i >= 0;
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
      if (row.contains(a)) t.focus({ preventScroll: true });
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
