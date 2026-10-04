import { PICK_WORDS } from './shaders.js';

// Gathered records contain a particle followed by two partner IDs (0xffffffff if absent).
// The caller filters to one species; asymmetric bonds count as undirected edges.
export function traceBody(u32, f32, n, startId) {
  const idIndex = new Map();
  const X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * PICK_WORDS;
    idIndex.set(u32[o + 7], i);
    X[i] = f32[o]; Y[i] = f32[o + 1];
  }
  const start = idIndex.get(startId);
  if (start === undefined) return null;

  const edges = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let b = 10; b < PICK_WORDS; b++) {
      const id = u32[i * PICK_WORDS + b];
      if (id === 0xffffffff) continue;
      const j = idIndex.get(id);
      if (j === undefined) continue; // A truncated readback may omit a partner.
      edges[i].push(j); edges[j].push(i);
    }
  }
  const seen = new Uint8Array(n);
  const body = [start];
  seen[start] = 1;
  for (let head = 0; head < body.length; head++) {
    for (const j of edges[body[head]]) {
      if (seen[j]) continue;
      seen[j] = 1;
      body.push(j);
    }
  }
  return { body, X, Y };
}
