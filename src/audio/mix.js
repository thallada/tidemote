// The soundtrack's mix as the viewer sets it (Settings → Audio), each choice named by what it does to the sound,
// and what the audio thread makes of it (Conductor.message 'mix'): a gain for each layer (Engine.groups: the
// voices the conductor schedules for the score, the cells, the water and the hand), the reverb's size and share
// (FDN.p) and the master's tone (Master.p). Pure (test/mix.test.js); the defaults leave the soundtrack exactly as it
// was before there was a mix.

export const LAYERS = ['music', 'cells', 'water', 'tools'];
const LEVELS = [['Off', 0], ['Quiet', 0.5], ['Normal', 1], ['Loud', 1.6]];

// each setting: its label, its choices (a label and what it sets) and the default's index (its hint: src/guide.js,
// audio + its key)
export const MIX = {
  music: { name: 'Music', choices: LEVELS, def: 2 },
  cells: { name: 'Cells', choices: LEVELS, def: 2 },
  water: { name: 'Water', choices: LEVELS, def: 2 },
  tools: { name: 'Tools', choices: LEVELS.slice(0, 3), def: 2 },
  // the reverb: its decay's multiple and its wet share's
  space: { name: 'Space', choices: [['Close', { space: 0.5, wet: 0.45 }], ['Normal', { space: 1, wet: 1 }], ['Vast', { space: 1.8, wet: 1.4 }]], def: 1 },
  // the master: its low-pass tone's multiple, its high shelf (dB) and the shelf's corner (Hz)
  tone: { name: 'Tone', choices: [['Warm', { toneMul: 0.075, air: 0, airHz: 8000 }], ['Normal', { toneMul: 1, air: 2.5, airHz: 8000 }], ['Bright', { toneMul: 1.12, air: 10, airHz: 2500 }]], def: 1 },
  background: { name: 'When hidden', choices: [['Fade out', false], ['Keep playing', true]], def: 0 },
};

/** The default mix: each setting's default choice (an index into its choices). */
export const defaultMix = () => Object.fromEntries(Object.entries(MIX).map(([k, s]) => [k, s.def]));

/** A mix (choice indices, any missing or out of range at its default) made whole. */
export function fullMix(m = {}) {
  const out = defaultMix();
  for (const [k, s] of Object.entries(MIX)) if (Number.isInteger(m[k]) && m[k] >= 0 && m[k] < s.choices.length) out[k] = m[k];
  return out;
}

/** What the audio thread is sent for a mix: { type: 'mix', groups, fdn, master }. */
export function mixMessage(m) {
  const f = fullMix(m), of = (k) => MIX[k].choices[f[k]][1];
  return { type: 'mix', groups: Object.fromEntries(LAYERS.map((k) => [k, of(k)])), fdn: { ...of('space') }, master: { ...of('tone') } };
}
