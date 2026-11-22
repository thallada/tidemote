// The viewer's actions and how each is reached, by key and by controller (docs/controller.md): one table that the
// keyboard handler, the gamepad poller, the hints, the Controls dialog and the tests all read, so they cannot
// drift apart. Pure (no DOM); the page carries out an action by its id (main.js, act()).
//
// Keys match KeyboardEvent.key (a letter in either case), or .code where the key's place matters more than what
// it prints (the movement keys, so WASD steers on any layout). Pad inputs name the Standard Gamepad's buttons by
// place (S E W N: the bottom, right, left and top face buttons), drawn with the pad's own glyphs (glyphs.js).
import { tr } from '../i18n.js';
// the movement keys are the ride's steering keys (ride.js), which pan the camera when not riding
export { isRideKey as isMoveKey, keyWay } from '../ride.js';

/** The Standard Gamepad's buttons, by index. */
export const BTN = { S: 0, E: 1, W: 2, N: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const BTN_NAME = Object.fromEntries(Object.entries(BTN).map(([k, v]) => [v, k]));

/** The tools, in the order of the digits that take them up (hand.js TOOLS). */
export const TOOL_IDS = ['none', 'loupe', 'touch', 'lamp', 'shade', 'warm', 'cold', 'needle', 'pipette', 'call'];

// Keys held rather than pressed: each frame they move the camera (or steer a ride) and zoom, as a stick and the
// triggers do.
const ZOOM_KEYS = { '=': 1, '+': 1, '-': -1, _: -1 };

// What each key does: [key(s), action id, needs shift?]. Letters match either case.
const KEYMAP = [
  ['Escape', 'back'], ['Backspace', 'lineage-back'], [' ', 'pause'], [',', 'slower'], ['.', 'faster'], [['/', '<'], 'realtime'], ['>', 'max'], // i18n-ignore (key names, selectors and styles)
  ['?', 'help'], ['Enter', 'ride'], ['Tab', 'hop'], // i18n-ignore (key names, selectors and styles)
  ['t', 'trails'], ['y', 'glow'], ['o', 'look'], ['g', 'map-light'], ['e', 'map-heat'], ['h', 'map-tide'], ['l', 'map-signal'], ['c', 'currents'],
  ['b', 'bench'], ['v', 'settings'], ['k', 'lab'], ['[', 'reach-down'], [']', 'reach-up'],
  ['p', 'auto'], ['x', 'next-scene'], ['r', 'film'], ['m', 'sound'], ['u', 'interface'], ['i', 'readouts'], ['f', 'fullscreen'], ['z', 'zoom-reset'],
];
const BY_KEY = new Map();
for (const [ks, id] of KEYMAP) for (const k of [].concat(ks)) { BY_KEY.set(k, id); if (k.length === 1 && k.toLowerCase() !== k.toUpperCase()) BY_KEY.set(k.toUpperCase(), id); }
for (let d = 0; d < TOOL_IDS.length; d++) BY_KEY.set(String(d), `tool-${TOOL_IDS[d]}`);

/** A held key's zoom direction (+1 in, −1 out), or 0. */
export const zoomKey = (key) => ZOOM_KEYS[key] || 0;

/**
 * The action a key press asks for, or null: from a KeyboardEvent's { key, code, shiftKey }. The held keys
 * (movement, zoom) are not actions here (isMoveKey, zoomKey); Shift+R is the one shifted letter with its own action.
 */
export function matchKey(e) {
  if (e.shiftKey && e.key === 'R') return 'reset-world';
  return BY_KEY.get(e.key) || null;
}

// ------------------------------------------------------------ the controller
// The contexts a pad press is read in, most particular first: a rose open (rose.js reads the stick itself), a panel
// holding focus (focus.js moves it), riding, a tool in hand, the world.
// For each context, what each button does when pressed (press), tapped (released before HOLD_MS) or held past it.
// A button bound to a tap or hold in a context acts on release or at the hold, never on press. (Only the bumpers
// have both: a quarter second tells a tap from a hold without a hurried tap passing for a hold.)
export const HOLD_MS = 250;
const PAD_WORLD = {
  [BTN.S]: { press: 'select' }, [BTN.E]: { press: 'back' }, [BTN.W]: { press: 'ride' }, [BTN.N]: { press: 'panel' },
  [BTN.UP]: { press: 'auto-next' }, [BTN.DOWN]: { press: 'pause' }, [BTN.LEFT]: { press: 'slower' }, [BTN.RIGHT]: { press: 'faster' },
  [BTN.LB]: { tap: 'swap-tool', hold: 'rose-tools' }, [BTN.RB]: { tap: 'bench', hold: 'rose-view' },
  [BTN.MENU]: { press: 'settings' }, [BTN.VIEW]: { press: 'lab' }, [BTN.R3]: { press: 'zoom-reset' },
};
// (X with the pipette: switch between loading and dispensing; with the call: its next band; the other tools have one way)
const PAD_TOOL = { ...PAD_WORLD, [BTN.S]: { press: 'apply' }, [BTN.W]: { press: 'switch-mode' } };
const PAD_RIDE = { ...PAD_WORLD, [BTN.S]: { press: 'hop' }, [BTN.W]: { press: 'ride' } };
// In a panel the d-pad and the stick move focus (focus.js), S presses what has it (a slider or a list: takes hold of
// it, so the d-pad and the stick change it, until S or E lets go; a glossary term: shows or hides its hint), E goes
// back a layer, the bumpers change tab; the rest are the world's.
const PAD_PANEL = {
  ...PAD_WORLD, [BTN.S]: { press: 'activate' }, [BTN.E]: { press: 'panel-back' }, [BTN.W]: {} /* (X: nothing in a panel) */, [BTN.N]: { press: 'panel-back' },
  [BTN.UP]: { press: 'nav-up', repeat: true }, [BTN.DOWN]: { press: 'nav-down', repeat: true }, [BTN.LEFT]: { press: 'nav-left', repeat: true }, [BTN.RIGHT]: { press: 'nav-right', repeat: true },
  [BTN.LB]: { press: 'tab-prev' }, [BTN.RB]: { press: 'tab-next' },
};
export const PAD_MAP = { world: PAD_WORLD, tool: PAD_TOOL, ride: PAD_RIDE, panel: PAD_PANEL };

/** The binding of pad button b in context ctx ('world', 'tool', 'ride', 'panel'): { press | tap | hold, repeat } or null. */
export const padBinding = (b, ctx) => (PAD_MAP[ctx] || PAD_WORLD)[b] || null;

// ------------------------------------------------------------ the roses (rose.js): a sector each, clockwise from the top
// (the tools: the call only in a world with signals, main.js)
export const ROSE_TOOLS = ['loupe', 'touch', 'lamp', 'shade', 'warm', 'cold', 'needle', 'pipette', 'call'];
export const ROSE_VIEW = ['map-light', 'map-heat', 'map-tide', 'currents', 'trails', 'glow', 'look', 'film'];

// ------------------------------------------------------------ the Controls dialog
// Rows in groups, each with what it does and how, by keyboard and mouse and by controller. A key token is a key's
// own name (drawn as a <kbd>) or a word (key.* messages); a pad token is a button (BTN name), a stick ('L', 'R'),
// or a word. Built at load (tr()).
const K = (s) => ({ k: s });
const W = (s) => ({ w: s });
const P = (s) => ({ p: s });
export function helpRows() {
  // i18n: names of keys and mouse gestures in the Controls dialog
  const click = W(tr('key.click', 'Click')), drag = W(tr('key.drag', 'Drag')), wheel = W(tr('key.wheel', 'Wheel'));
  const space = K(tr('key.space', 'Space')), esc = K(tr('key.esc', 'Esc')), enter = K(tr('key.enter', 'Enter')), tab = K(tr('key.tab', 'Tab'));
  const shiftWheel = W(tr('key.shift-wheel', '⇧ Wheel'));
  // i18n: how a controller button is used in the Controls dialog: held down, tapped, while riding, or a place in Settings
  const hold = W(tr('pad.hold', 'hold')), tap = W(tr('pad.tap', 'tap')), riding = W(tr('pad.riding', 'riding')), inSettings = W(tr('pad.in-settings', 'in Settings'));
  // i18n: in the Controls dialog: a key held down (Shift, for the pipette's other way while held); the Controls found
  // in Settings, at its foot
  const keyHeld = W(tr('key.held', 'held')), toControls = W(tr('pad.to-controls', 'then Controls'));
  // i18n: in the Controls dialog: a choice made on the Bench drawer (the call's band)
  const onBench = W(tr('key.on-bench', 'on the Bench'));
  return [
    { group: tr('help.group.look', 'Look'), rows: [
      { text: tr('help.k1', 'Examine a cell or particle'), keys: [click], pad: [P('S')] },
      { text: tr('help.k2', 'Pan · zoom'), keys: [drag, K('W A S D'), K('↑ ← ↓ →'), wheel, K('−'), K('=')], pad: [P('L'), P('LT'), P('RT')] },
      { text: tr('help.zoom-reset', 'Reset zoom'), keys: [K('Z')], pad: [P('R3')] },
      { text: tr('help.k5', 'Auto camera · go to next scene'), keys: [K('P'), K('X')], pad: [P('UP')] },
      { text: tr('help.k9', 'Back: put the tool down, get off, close a panel, clear the highlight and map'), keys: [esc], pad: [P('E')] },
    ] },
    { group: tr('help.group.time', 'Time'), rows: [
      { text: tr('help.k3', 'Pause · resume'), keys: [space], pad: [P('DOWN')] },
      { text: tr('help.k4', 'Slower · faster · real time · max'), keys: [K(','), K('.'), K('/'), K('>')], pad: [P('LEFT'), P('RIGHT')] },
    ] },
    { group: tr('help.group.specimen', 'The specimen'), rows: [
      { text: tr('help.k8', 'Ride the specimen: follow and control it · switch to newest kin'), keys: [enter, tab], pad: [P('W'), riding, P('S')] },
      { text: tr('help.k-steer', 'Riding: steer the specimen (gathers speed when held); tapping around the specimen also steers'), keys: [K('W A S D'), K('↑ ← ↓ →')], pad: [P('L')] },
      { text: tr('help.panel', 'Into the side panel · scroll it'), keys: [tab, wheel], pad: [P('N'), P('R')] },
    ] },
    { group: tr('help.group.hand', 'The hand'), rows: [
      { text: tr('help.k16', 'Swap tools: 1. loupe, 2. touch, 3. lamp, 4. shade, 5. warm, 6. cold, 7. needle, 8. pipette, 9. call · 0. pan'), keys: [K('1–9'), K('0')], pad: [P('LB'), W(tr('pad.lb-tools', 'held: the tool rose · tapped: the last tool'))] },
      { text: tr('help.tool-use', 'Use the tool in hand'), keys: [click], pad: [P('S')] },
      { text: tr('help.pipette-mode', 'Pipette: switch between loading and dispensing'), keys: [K('⇧'), keyHeld], pad: [P('W')] },
      { text: tr('help.call-band', 'Call: choose its band (rumble, song, click or flash)'), keys: [onBench], pad: [P('W')] },
      { text: tr('help.k18', 'Adjust tool effect radius (with the loupe: its magnification)'), keys: [K('['), K(']'), shiftWheel], pad: [P('R')] },
      { text: tr('help.k17', 'The bench · drop tool'), keys: [K('B'), esc], pad: [P('RB'), tap, P('E')] },
    ] },
    { group: tr('help.group.view', 'View'), rows: [
      { text: tr('help.k14', 'Light map · heat map · tide map · currents'), keys: [K('G'), K('E'), K('H'), K('C')], pad: [P('RB'), hold] },
      // (the signal lens, a map too, is not on the view rose's eight points: a controller chooses it in Settings → Display)
      { text: tr('help.signal-lens', 'Signal lens: the calls in the water'), keys: [K('L')], pad: [inSettings] },
      { text: tr('help.k13', 'Cycle cell trails rendering'), keys: [K('T')], pad: [P('RB'), hold] },
      { text: tr('help.k15', 'Toggle: glow · microscope'), keys: [K('Y'), K('O')], pad: [P('RB'), hold] },
      { text: tr('help.k6', 'Start · stop filming'), keys: [K('R')], pad: [P('RB'), hold] },
      { text: tr('help.k10', 'Collapse or open the Field Lab'), keys: [K('K')], pad: [P('VIEW')] },
      { text: tr('help.k-lineage-back', 'In the Lab’s Lineage view: go back up a species in the lineage tree'), keys: [esc, K('⌫')], pad: [P('E')] },
      { text: tr('help.k11', 'Settings'), keys: [K('V')], pad: [P('MENU')] },
      { text: tr('help.list', 'This list of controls'), keys: [K('?')], pad: [P('MENU'), toControls] },
      { text: tr('help.k12', 'Sound on or off'), keys: [K('M')], pad: [inSettings] },
      { text: tr('help.k19', 'Full screen · hide readouts · hide everything'), keys: [K('F'), K('I'), K('U')], pad: [inSettings] },
      { text: tr('help.k20', 'Discard this world and start a new one'), keys: [K('⇧R ⇧R')], pad: [inSettings] },
    ] },
  ];
}
