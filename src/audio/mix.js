// The soundtrack's mix as the viewer sets it (Settings → Audio), each choice named by what it does to the sound,
// and what the audio thread makes of it (Conductor.message 'mix'): a gain for each layer (Engine.groups: the
// voices the conductor schedules for the score, the cells, the water and the hand), the reverb's size and share
// (FDN.p) and the master's tone (Master.p). Pure (test/mix.test.js); the defaults leave the soundtrack exactly as it
// was before there was a mix.
import { tr } from '../i18n.js';

export const LAYERS = ['music', 'cells', 'water', 'tools'];

// each setting: its label, its choices (a label and what it sets) and the default's index (its hint: src/guide.js,
// audio + its key). (Made in a call marked pure, so a bundle that takes only LAYERS, as the audio thread's does through
// voices.js, leaves it and the page's words out.)
export const MIX = /* @__PURE__ */ (() => {
  // i18n: how loud a layer of the soundtrack plays (Settings → Audio → Mix)
  const LEVELS = [[tr('mix.level.off', 'Off'), 0], [tr('mix.level.quiet', 'Quiet'), 0.5], [tr('mix.level.normal', 'Normal'), 1], [tr('mix.level.loud', 'Loud'), 1.6]];
  return {
    music: { name: tr('mix.music', 'Music'), choices: LEVELS, def: 2 },
    cells: { name: tr('mix.cells', 'Cells'), choices: LEVELS, def: 2 },
    water: { name: tr('mix.water', 'Water'), choices: LEVELS, def: 2 },
    tools: { name: tr('mix.tools', 'Tools'), choices: LEVELS.slice(0, 3), def: 2 },
    // the reverb: its decay's multiple and its wet share's
    // i18n: the soundtrack's room (Settings → Audio → Character): its reverb
    space: { name: tr('mix.space', 'Space'), choices: [[tr('mix.space.close', 'Close'), { space: 0.5, wet: 0.45 }], [tr('mix.space.normal', 'Normal'), { space: 1, wet: 1 }], [tr('mix.space.vast', 'Vast'), { space: 1.8, wet: 1.4 }]], def: 1 },
    // the master: its low-pass tone's multiple, its high shelf (dB) and the shelf's corner (Hz)
    // i18n: the soundtrack's tone (Settings → Audio → Character): darker or brighter
    tone: { name: tr('mix.tone', 'Tone'), choices: [[tr('mix.tone.warm', 'Warm'), { toneMul: 0.075, air: 0, airHz: 8000 }], [tr('mix.tone.normal', 'Normal'), { toneMul: 1, air: 2.5, airHz: 8000 }], [tr('mix.tone.bright', 'Bright'), { toneMul: 1.12, air: 10, airHz: 2500 }]], def: 1 },
    // i18n: what the soundtrack does while the page is hidden (Settings → Audio → Playback)
    background: { name: tr('mix.background', 'When hidden'), choices: [[tr('mix.background.fade', 'Fade out'), false], [tr('mix.background.keep', 'Keep playing'), true]], def: 0 },
  };
})();

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
