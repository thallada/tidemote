// Which input the viewer is using (docs/controller.md), as two things kept apart:
//   glyphs: whose names the hints and the Controls dialog lead with, 'keys' or 'pad'. Only a key or a pad's button
//     (or stick) changes it, never the mouse: Steam turns the Deck's trackpad into a mouse, and a mouse that flipped
//     the hints would flip them back and forth (and Valve asks that Deck controls never show keyboard glyphs).
//   pointer: what points, 'mouse', 'touch' or 'pad' (the reticle at the view's middle). A click, a touch, a wheel or
//     the mouse moved a little way takes it from the pad; the pad takes it back with any use.
// Pure: noteInput(mode, event) says whether anything changed.
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Fn', 'OS', 'Dead', 'Unidentified']); // i18n-ignore (key names, selectors and styles)
export const MOUSE_TAKES = 24; // px of mouse movement, after using the pad, before the mouse is the pointer again

export function createMode({ coarse = false } = {}) {
  return { glyphs: 'keys', family: 'xbox', pointer: coarse ? 'touch' : 'mouse', moved: 0 };
}

/**
 * Note an input: { kind: 'key', key } | { kind: 'pad', family } | { kind: 'pointer', type: 'mouse' | 'touch' | 'pen' }
 * (a press) | { kind: 'wheel' } | { kind: 'move', d } (the mouse moved d px). Returns whether the mode changed.
 */
export function noteInput(m, ev) {
  const was = `${m.glyphs} ${m.family} ${m.pointer}`;
  if (ev.kind === 'key') { if (!MODIFIERS.has(ev.key)) m.glyphs = 'keys'; }
  else if (ev.kind === 'pad') { m.glyphs = 'pad'; if (ev.family) m.family = ev.family; m.pointer = 'pad'; m.moved = 0; }
  else if (ev.kind === 'pointer') m.pointer = ev.type === 'mouse' ? 'mouse' : 'touch';
  else if (ev.kind === 'wheel') { if (m.pointer === 'pad') m.pointer = 'mouse'; }
  else if (ev.kind === 'move' && m.pointer === 'pad') { m.moved += ev.d; if (m.moved > MOUSE_TAKES) m.pointer = 'mouse'; }
  return `${m.glyphs} ${m.family} ${m.pointer}` !== was;
}
