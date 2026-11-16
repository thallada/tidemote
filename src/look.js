// The look: what darkfield illumination and the camera make of the specimen, as the composite, the loupe and the
// close-up draw it (Post.look in src/shaders.js: lookScene before the tone curve, lookTone, lookGrade after the gamma
// curve; the shallow focus and the field iris in the optics). docs/look.md. Settings → Display scales it as a whole
// (Microscope) and sets its grain (Film grain).

/** Post.look's tunables, in its order (4 vec4s; the last word unused). dof is the shallow focus's blur toward the
 * edges (field curvature) and down a pile, waves the blur the sea's waves add as they pass (lensScene). */
export const LOOK = ['prism', 'relief', 'rims', 'fringe', 'halation', 'veil', 'film', 'grain', 'sat', 'density', 'contrast', 'black', 'dof', 'iris', 'waves'];
export const LOOK_WORDS = 16;

/** Darkfield, as chosen by eye (docs/look.md). */
export const DARKFIELD = { prism: 0.4, relief: 0.4, rims: 0.45, fringe: 0.2, halation: 0.45, veil: 0.5, film: 0.25, grain: 0.25, sat: 0.1, density: 0.25, contrast: 0.3, black: 0.6, dof: 0.9, iris: 0.2, waves: 0.6 };

/** Settings → Display → Focus blur: Off, Subtle, Normal (Darkfield's), Strong (the waves' blur as it was until 2026-11). */
export const FOCUS = [{ dof: 0, waves: 0 }, { dof: 0.7, waves: 0.4 }, { dof: 0.9, waves: 0.6 }, { dof: 1, waves: 0.8 }];

/** Post.look's words for tunables p ({ id: value }, missing ones 0) at strength s. */
export function packLook(p, s = 1) {
  const w = new Float32Array(LOOK_WORDS);
  LOOK.forEach((k, i) => { w[i] = (p[k] ?? 0) * s; });
  return w;
}
