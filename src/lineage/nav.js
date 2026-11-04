// Where the Lineage view is: a lineage explored (its first species' serial, or null for the whole
// world) and a span of time ('all', the last N seconds as a string, or a dragged [t0, t1]), with the
// way back through the places it has been. The path above a lineage is its real ancestry, so a
// breadcrumb goes up one lineage at a time. Pure: no DOM (test/lineage.test.js).
import { memberAt } from './model.js';

/** The strands from the root of st's tree down to st. */
export function ancestry(st) {
  const path = [];
  for (let s = st; s; s = s.parent) path.push(s);
  return path.reverse();
}

/** The species a strand is known by, in the tree and the breadcrumbs alike and whatever span is shown
 * (so a lineage keeps its name as the view moves): its most numerous now if it lives (else its latest
 * living), or its first if it is gone. */
export function strandLead(st) {
  const n = st.alive ? memberAt({ members: st.nodes }, st.end) || st.nodes.findLast((x) => x.alive) : null;
  return n || st.nodes[0];
}
/** What a strand is called (strandLead's name). */
export const strandName = (st) => strandLead(st).name;

const sameSpan = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a[0] === b[0] && a[1] === b[1] : a === b);
export const sameLoc = (a, b) => a.root === b.root && sameSpan(a.span, b.span);

/** The places the view has been, the most recent last, kept to limit: go(from) before moving on,
 * back() for where it was. */
export function history(limit = 40) {
  const past = [];
  return {
    go(from) { if (!past.length || !sameLoc(past.at(-1), from)) past.push(from); if (past.length > limit) past.shift(); },
    back: () => past.pop() || null,
  };
}

/**
 * Which breadcrumbs fit in room px: widths of every crumb (separators included), the first (the
 * whole world) and the last (where the view is) always kept, then its parent, then those above it;
 * ell the width of the ellipsis standing for those left out. Returns the kept indices in order, -1
 * where the ellipsis goes.
 */
export function fitCrumbs(widths, room, ell) {
  const n = widths.length, sum = (a) => a.reduce((s, i) => s + widths[i], 0);
  if (n <= 2 || sum(widths.map((_, i) => i)) <= room) return widths.map((_, i) => i);
  const keep = [n - 1];
  for (let i = n - 2; i >= 1; i--) {
    if (sum([0, i, ...keep]) + ell > room) break;
    keep.unshift(i);
  }
  return [0, -1, ...keep];
}
