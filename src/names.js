// Deterministic, pronounceable names for species and genera.
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ONSET = ['v', 'th', 'k', 'z', 'qu', 'r', 'm', 's', 'n', 'x', 'ph', 'dr', 'gh', 'l', 'y', 'sk', 'tr', 'h', 'b', 'c', 'vr', 'ch'];
const NUC = ['a', 'o', 'e', 'i', 'u', 'ae', 'ou', 'y', 'ia', 'eo', 'a', 'o'];
const CODA = ['', '', 'n', 'r', 'th', 'x', 's', 'l', 'm', 'k', 'sh', 'rn'];
const SUFFIX = ['a', 'is', 'ae', 'um', 'ex', 'ine', 'oth', 'ula', 'ix', 'ora', 'yx', 'ens'];
const pick = (r, a) => a[Math.floor(r() * a.length)];
export function word(r, n) {
  let w = '';
  for (let i = 0; i < n; i++) {
    w += pick(r, ONSET) + pick(r, NUC) + (i === n - 1 ? pick(r, CODA) : '');
  }
  return w;
}
export const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Retry collisions against the existing genus names without mutating the registry.
export function genusName(serial, existing) {
  const r = prng(Math.imul(serial, 2654435761) ^ 0x51ed);
  let name;
  for (let tries = 0; tries < 8; tries++) {
    name = cap(word(r, r() < 0.6 ? 2 : 3));
    if (!existing.has(name)) break;
  }
  return name;
}

export function speciesEpithet(serial) {
  const r = prng(Math.imul(serial ^ 0x9e3779b9, 40503));
  return word(r, 1 + (r() < 0.5 ? 1 : 0)) + pick(r, SUFFIX);
}
