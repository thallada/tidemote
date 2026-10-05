import { PICK_WORDS } from './shaders.js';

// Gathered records contain a particle followed by two partner IDs (0xffffffff if absent).
// The caller filters to one species; asymmetric bonds count as undirected edges.
function bondGraph(u32, f32, n) {
  const index = new Map();
  const X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * PICK_WORDS;
    index.set(u32[o + 7], i);
    X[i] = f32[o]; Y[i] = f32[o + 1];
  }
  const edges = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let b = 10; b < PICK_WORDS; b++) {
      const id = u32[i * PICK_WORDS + b];
      if (id === 0xffffffff) continue;
      const j = index.get(id);
      if (j === undefined) continue; // A truncated readback may omit a partner.
      edges[i].push(j); edges[j].push(i);
    }
  }
  return { index, X, Y, edges };
}

function component(edges, seen, start) {
  const body = [start];
  seen[start] = 1;
  for (let head = 0; head < body.length; head++) {
    for (const j of edges[body[head]]) {
      if (seen[j]) continue;
      seen[j] = 1;
      body.push(j);
    }
  }
  return body;
}

export function traceBody(u32, f32, n, startId) {
  const { index, X, Y, edges } = bondGraph(u32, f32, n);
  const start = index.get(startId);
  if (start === undefined) return null;
  return { body: component(edges, new Uint8Array(n), start), X, Y };
}

// Re-finds a body traced before: of the bodies holding any of its previous members (a Map or Set
// keyed by ID), the one sharing the most, so the body survives the death of any one cell and a
// split follows the larger part. Ties go to the body holding preferId. Without previous members
// it traces from preferId. Returns null if none of them is in the readback.
export function retraceBody(u32, f32, n, prev, preferId) {
  const { index, X, Y, edges } = bondGraph(u32, f32, n);
  const seen = new Uint8Array(n);
  const prefer = index.get(preferId);
  if (!prev || !prev.size) return prefer === undefined ? null : { body: component(edges, seen, prefer), X, Y, index };
  let best = null, bestShared = 0;
  for (const id of prev.keys()) {
    const i = index.get(id);
    if (i === undefined || seen[i]) continue;
    const body = component(edges, seen, i);
    let shared = 0;
    for (const k of body) if (prev.has(u32[k * PICK_WORDS + 7])) shared++;
    if (shared > bestShared || (shared === bestShared && prefer !== undefined && body.includes(prefer))) { best = body; bestShared = shared; }
  }
  return best && { body: best, X, Y, index };
}

// Of the candidate indices, those within r of the body, directly or through other such
// candidates, on a wrapping W x H world.
export function nearBody(X, Y, body, candidates, r, W, H) {
  const out = new Set();
  const gw = Math.max(1, Math.floor(W / r)), gh = Math.max(1, Math.floor(H / r));
  const cw = W / gw, ch = H / gh;
  const key = (x, y) => (((Math.floor(y / ch) % gh) + gh) % gh) * gw + (((Math.floor(x / cw) % gw) + gw) % gw);
  const wrap = (d, w) => d - w * Math.round(d / w);
  const pending = new Map(); // grid cell -> candidates not yet reached
  for (const c of candidates) {
    const k = key(X[c], Y[c]);
    let l = pending.get(k);
    if (!l) pending.set(k, (l = []));
    l.push(c);
  }
  // Flood outward from the body through the candidates.
  const queue = [...body];
  for (let head = 0; head < queue.length && pending.size; head++) {
    const i = queue[head];
    const cx = Math.floor(X[i] / cw), cy = Math.floor(Y[i] / ch);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const k = key((cx + ox + 0.5) * cw, (cy + oy + 0.5) * ch);
        const l = pending.get(k);
        if (!l) continue;
        for (let n = l.length - 1; n >= 0; n--) {
          const c = l[n];
          if (Math.hypot(wrap(X[i] - X[c], W), wrap(Y[i] - Y[c], H)) >= r) continue;
          out.add(c); queue.push(c);
          l[n] = l[l.length - 1]; l.pop();
        }
        if (!l.length) pending.delete(k);
      }
    }
  }
  return out;
}

// Bonds inside a large body break and re-form all the time (a cell dies, a child bonds to its
// parent), so the cells reachable through bonds flicker from one trace to the next: a body of a
// few hundred cells can lose and regain half of them between traces. Membership is smoothed: a
// cell joins as soon as it is traced into the body; a member still pressed against it (`touching`,
// a Set of IDs) stays; any other leaves after `grace` traces in a row outside it. A member missing
// from the readback has died or changed species and leaves at once, unless the readback is
// partial (present = null).
// members: Map id -> traces missed in a row. Mutated and returned.
export function settleMembers(members, bodyIds, present, grace, touching = null) {
  const inBody = new Set(bodyIds);
  for (const [id, missed] of members) {
    if (inBody.has(id)) continue;
    if (touching && touching.has(id)) { members.set(id, 0); continue; }
    if ((present && !present.has(id)) || missed + 1 > grace) members.delete(id);
    else members.set(id, missed + 1);
  }
  for (const id of inBody) members.set(id, 0);
  return members;
}
