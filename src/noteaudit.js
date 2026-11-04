// A check on the live annotations as drawn (docs/annotations.md, Checking): how steadily their marks and labels ride
// the scene, and whether any two pieces of text overlap. Off unless asked for (noteView.audit(true), from tools);
// pure, fed by src/noteview.js as it draws.
//   jerk: the second difference of a mark's place from frame to frame, taken in the world (its screen place less the
//   camera's pan and zoom, from a fixed world point's screen place and the scale: frame()) and told in screen px:
//   steady motion has little, a mark that snaps or wobbles has much, however the camera moves. 'cam' is that fixed
//   point itself (≈0, but for the water's bending of the view).
//   Labels hold still on the screen (their leaders reach to their cells): 'label' is measured on the screen.
//   blinks: labels readable (past half their alpha) for under 1.5 s: there should be none.
export function createAudit() {
  let S, tracks, boxes, frame, T = { ox: 0, oy: 0, rx: 0, ry: 0, k: 1 };
  function reset() {
    S = { frames: 0, jerk: {}, overlapFrames: 0, overlaps: 0, examples: [], moves: 0, flips: 0, swaps: 0, hidden: 0, blinks: 0, blinked: [] };
    tracks = new Map();
    boxes = [];
    frame = 0;
  }
  reset();
  const cat = (c) => (S.jerk[c] ||= { n: 0, sum: 0, max: 0, over1: 0, over3: 0 });
  return {
    reset,
    begin() { frame++; S.frames++; boxes = []; },
    /** this frame's camera: world point (rx, ry) shows at screen (ox, oy), k px a world unit */
    frame(ox, oy, rx, ry, k) { T = { ox, oy, rx, ry, k }; },
    /** the fixed point changed (the view left it, or wrapped round the world): places are measured afresh */
    rebase() { tracks.clear(); },
    /** a mark's (or label's) screen position this frame, by a key that names it from frame to frame */
    point(c, key, sx, sy) {
      const k = `${c}|${key}`, tr = tracks.get(k), x = T.rx + (sx - T.ox) / T.k, y = T.ry + (sy - T.oy) / T.k;
      if (tr && tr.f === frame - 1 && tr.b) {
        const j = Math.hypot(x - 2 * tr.a[0] + tr.b[0], y - 2 * tr.a[1] + tr.b[1]) * T.k, J = cat(c);
        J.n++; J.sum += j; J.max = Math.max(J.max, j);
        if (j > 1) J.over1++;
        if (j > 3) J.over3++;
      }
      tracks.set(k, { f: frame, a: [x, y], b: tr && tr.f === frame - 1 ? tr.a : null });
    },
    /** a place meant to hold still on the screen (a label), measured there rather than in the world */
    screen(c, key, x, y) {
      const T0 = T;
      T = { ox: 0, oy: 0, rx: 0, ry: 0, k: 1 };
      this.point(c, key, x, y);
      T = T0;
    },
        /** a piece of text (or a tag) as drawn: its owner and its box */
    box(owner, s, l, t, r, b) { boxes.push({ owner, s, l, t, r, b }); },
    count(k) { S[k]++; },
    /** a label readable for less than a moment and a half before it went (what it said, for how long) */
    blink(what, secs) { S.blinks++; if (S.blinked.length < 40) S.blinked.push(`${what} (${secs.toFixed(2)} s)`); },
    end() {
      let any = false;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (w > 1 && h > 1) {
          S.overlaps++; any = true;
          if (S.examples.length < 40) S.examples.push(`${a.owner}:"${a.s}" × ${b.owner}:"${b.s}" (${w.toFixed(0)}×${h.toFixed(0)})`);
        }
      }
      if (any) S.overlapFrames++;
      if (tracks.size > 20000) for (const [k, tr] of tracks) if (tr.f < frame - 2) tracks.delete(k);
    },
    summary() {
      const jerk = Object.fromEntries(Object.entries(S.jerk).map(([c, J]) => [c, { n: J.n, mean: +(J.sum / Math.max(1, J.n)).toFixed(3), max: +J.max.toFixed(1), over1: +(J.over1 / Math.max(1, J.n)).toFixed(4), over3: +(J.over3 / Math.max(1, J.n)).toFixed(4) }]));
      return { ...S, jerk };
    },
  };
}
