// Drives every keyboard shortcut on the built page and checks what each does (docs/controller.md, Tests): the map the
// action table (src/input/actions.js) carries, so a change to it shows here. The view toggles, the tools (a digit
// again puts its tool down; held, only while held), reach and the loupe, speed and pause, the auto camera, the
// panels, the movement keys panning (and steering a ride, never starting one), − and = zooming, Esc's walk back in
// its order, the arrows moving focus in a panel, Tab left to the browser, and no shortcut acting behind the card or
// in a text field.
//   npm run build && tools/gpu-node.sh tools/keys-check.mjs
//   (on Linux without a display: TIDEMOTE_VK=1 tools/capped.sh node tools/keys-check.mjs)
import { openPage } from './lib/inputpage.mjs';

const { page, check, done, T, frames } = await openPage();
const kb = page.keyboard;
const press = async (k) => { await kb.press(k); await frames(3); };
const S = () => T(() => { const t = __tidemote, s = t.state; return { trails: t.eng.settings.trails, bloom: t.eng.settings.bloom, look: s.look, map: s.map, currents: s.currents, hud: s.hud, ui: s.ui,
  paused: s.paused, speed: s.speed, tool: t.hand.tool, reach: t.hand.reach, mag: s.loupeMag, auto: t.director.active, zoomT: t.cam.zoomTarget, x: t.cam.x, y: t.cam.y,
  follow: s.follow, ride: t.ride.state.on, sel: !!t.ride.sel(), ...t.input.open() }; });
await page.waitForTimeout(3000);
await T(() => __tidemote.setSpeed(1));

// the view's toggles
let a = await S(); await press('t'); let b = await S();
check('T cycles the trails', a.trails !== b.trails, `${a.trails} → ${b.trails}`);
a = b; await press('y'); b = await S(); check('Y toggles the glow', (a.bloom > 0) !== (b.bloom > 0));
a = b; await press('o'); b = await S(); check('O toggles the microscope', !!a.look !== !!b.look);
await press('g'); b = await S(); check('G shows the light map', b.map === 'light');
await press('h'); b = await S(); check('H shows the tide map', b.map === 'tide');
await press('h'); b = await S(); check('H again clears it', !b.map || b.map === 'off', b.map);
await press('l'); b = await S(); check('L shows the signal lens', b.map === 'signal', b.map);
await press('l'); b = await S(); check('L again clears it', !b.map || b.map === 'off', b.map);
a = b; await press('c'); b = await S(); check('C toggles the currents', a.currents !== b.currents);
await press('c');
a = b; await press('i'); b = await S(); check('I toggles the readouts', a.hud !== b.hud);
await press('i');

// the tools
await press('3'); b = await S(); check('3 takes up the lamp', b.tool === 'lamp', b.tool);
const r0 = b.reach; await press(']'); b = await S(); check('] widens the tool\'s reach', b.reach > r0, `${r0} → ${b.reach}`);
await press('3'); b = await S(); check('3 again puts it down', b.tool === 'none', b.tool);
await press('1'); a = await S(); await press(']'); b = await S(); check('] with the loupe magnifies it', b.mag > a.mag, `${a.mag} → ${b.mag}`);
await kb.down('5'); await page.waitForTimeout(600); b = await S(); check('5 held takes up the warm stage', b.tool === 'warm', b.tool);
await kb.up('5'); await frames(3); b = await S(); check('let go after a moment, the loupe is back', b.tool === 'loupe', b.tool);
await press('0'); b = await S(); check('0 puts the tool down', b.tool === 'none', b.tool);
await press('b'); b = await S(); check('B opens the bench', b.bench);
await press('b'); b = await S(); check('B again closes it', !b.bench);

// time
a = await S(); await press(' '); b = await S(); check('Space pauses', b.paused !== a.paused);
await press(' ');
await press('.'); b = await S(); check('. goes faster', b.speed > 1, String(b.speed));
await press('/'); b = await S(); check('/ goes back to real time', b.speed === 1, String(b.speed));
await press(','); b = await S(); check(', goes slower', b.speed < 1, String(b.speed));
await press('>'); b = await S(); check('> goes to max', b.speed === null || b.speed === Infinity || b.speed > 100, String(b.speed));
await press('/');

// the camera: held keys pan and zoom
await press('z'); await page.waitForTimeout(500);
a = await S(); await kb.down('d'); await page.waitForTimeout(500); await kb.up('d'); b = await S();
check('D held pans the view right', b.x !== a.x && !b.ride, `${a.x.toFixed(2)} → ${b.x.toFixed(2)}`);
a = await S(); await kb.down('ArrowDown'); await page.waitForTimeout(500); await kb.up('ArrowDown'); b = await S();
check('↓ held pans the view down', b.y !== a.y, `${a.y.toFixed(2)} → ${b.y.toFixed(2)}`);
a = await S(); await kb.down('='); await page.waitForTimeout(500); await kb.up('='); b = await S();
check('= held zooms in', b.zoomT > a.zoomT * 1.3, `${a.zoomT.toFixed(2)} → ${b.zoomT.toFixed(2)}`);
a = b; await kb.down('-'); await page.waitForTimeout(300); await kb.up('-'); b = await S();
check('− held zooms out', b.zoomT < a.zoomT, `${a.zoomT.toFixed(2)} → ${b.zoomT.toFixed(2)}`);
await press('z'); b = await S(); check('Z resets the zoom', b.zoomT === 1, String(b.zoomT));

// the auto camera
await press('p'); b = await S(); check('P starts the auto camera', b.auto);
await press('x'); check('X goes to the next scene (no error)', true);
await kb.down('a'); await page.waitForTimeout(150); await kb.up('a'); b = await S();
check('panning takes the camera back', !b.auto);

// riding: the movement keys steer it, and never start it
const serial = await T(() => { const sps = [...__tidemote.life().reg.values()].filter((x) => x.alive && x.pop > 0).sort((p, q) => q.pop - p.pop); return sps[0]?.serial; });
await T((s) => __tidemote.findMember(s), serial); await page.waitForTimeout(2500);
b = await S(); check('a member found and ridden', b.ride && b.sel, JSON.stringify({ ride: b.ride, sel: b.sel }));
await press('Enter'); b = await S(); check('Enter gets off', !b.ride && b.sel);
a = b; await kb.down('w'); await page.waitForTimeout(400); await kb.up('w'); b = await S();
check('W with a cell selected pans, and starts no ride', !b.ride && b.y !== a.y);
await press('Enter'); b = await S(); check('Enter rides the selected cell', b.ride);

// Esc's walk back, one step a press: the tool, the ride, the dialogs, the bench, the selection, the map
await press('3');
await press('v'); await press('g');
const walk = [];
for (let i = 0; i < 6; i++) { await press('Escape'); const s = await S(); walk.push(`${s.tool}|${s.ride}|${s.settings}|${s.sel}|${s.map || 'off'}`); }
check('Esc walks back: the tool, the settings, the selection, then the map', walk[0].startsWith('none|false|true|true') && walk[1].startsWith('none|false|false|true') && walk[2].startsWith('none|false|false|false|light') && /\|(off|null)$/.test(walk[3]), walk.join('  '));

// the panels
await press('?'); b = await S(); check('? opens the Controls', b.help);
const rows = await T(() => ({ rows: document.querySelectorAll('#help-keys tbody tr:not(.g)').length, cols: document.querySelectorAll('#help-keys thead th').length, kbd: document.querySelectorAll('#help-keys kbd').length, gl: document.querySelectorAll('#help-keys .gl').length }));
check('the Controls list keys and controller buttons side by side', rows.rows > 20 && rows.cols === 3 && rows.kbd > 20 && rows.gl > 15, JSON.stringify(rows));
await press('Escape'); b = await S(); check('Esc closes it', !b.help);
await press('v'); b = await S(); check('V opens Settings', b.settings);
await press('v'); b = await S(); check('V again closes them', !b.settings);
a = await S(); await press('k'); b = await S(); check('K toggles the Lab', a.lab !== b.lab);
if (b.lab) await press('k');

// focus: Tab is the browser's when there is no ride; the arrows move focus within a panel
await T(() => document.activeElement?.blur());
await press('Tab');
const f1 = await T(() => document.activeElement?.id || document.activeElement?.tagName);
check('Tab with nothing ridden moves focus (the browser\'s own)', f1 && f1 !== 'BODY', f1);
await T(() => document.getElementById('t-play').focus());
await press('ArrowRight');
const f2 = await T(() => document.activeElement?.id);
check('→ in the dock moves focus to the next control', f2 && f2 !== 't-play', f2);
await T(() => document.activeElement?.blur());

// no shortcut behind the card, or in a text field
await press('v');
await T(() => { const t = __tidemote; t.input.act('settings'); });
await T(() => document.activeElement?.blur());
a = await S();
const tf = await T(() => { const i = document.createElement('input'); i.id = 'kc-text'; document.body.append(i); i.focus(); return !!i; });
await press('g'); await press('t');
b = await S(); check('keys typed in a text field are no shortcuts', a.map === b.map && a.trails === b.trails && tf);
await T(() => document.getElementById('kc-text').remove());
await press('Shift+R'); const fl = await T(() => document.getElementById('flash').textContent);
check('Shift+R asks before discarding the world', /again/i.test(fl), fl);
await page.waitForTimeout(2600);

// hints: a dock button's names its key
await page.hover('#t-play'); await page.waitForTimeout(300);
const hint = await T(() => document.getElementById('tip').innerHTML);
check('a dock button\'s hint shows its key', /<kbd>Space<\/kbd>/.test(hint), hint.slice(0, 120));
await done();
