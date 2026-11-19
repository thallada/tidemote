// Drives the built page with a scripted gamepad (navigator.getGamepads replaced; docs/controller.md, Tests) and checks
// what a controller does: the intro begun by its A, the hints and the reticle following it (and not a mouse moved),
// the stick panning and the triggers zooming, A selecting what is under the reticle, X riding and the stick steering,
// B walking back, the tool rose and the view rose, a tool applied, the bench, Settings and the Lab entered and left
// with focus moving by the d-pad and tabs by the bumpers, the Controls held open by View, the d-pad's time, a Deck's
// glyphs, and a pad unplugged mid-pan letting go.
//   npm run build && tools/gpu-node.sh tools/pad-check.mjs [--size 1280x800]
//   (on Linux without a display: TIDEMOTE_VK=1 tools/capped.sh node tools/pad-check.mjs)
import { openPage, BTN } from './lib/inputpage.mjs';

const at = process.argv.indexOf('--size');
const [w, h] = at > 0 ? process.argv[at + 1].split('x').map(Number) : [1366, 768];
const { page, check, done, T, pad, frames } = await openPage({ size: { width: w, height: h }, intro: true });
const tag = `${w}×${h}`;
const S = () => T(() => { const t = __tidemote, s = t.state, i = t.input; return { glyphs: i.mode.glyphs, pointer: i.mode.pointer, family: i.mode.family, ctx: i.padCtx(),
  live: document.body.classList.contains('live'), aim: !document.getElementById('aim').hidden, rose: i.rose.shown, x: t.cam.x, y: t.cam.y, zoomT: t.cam.zoomTarget,
  tool: t.hand.tool, held: !!t.hand.held, map: s.map, paused: s.paused, speed: s.speed, auto: t.director.active, ride: t.ride.state.on, sel: !!t.ride.sel(),
  u: Math.hypot(...t.ride.state.th.u), focus: document.activeElement?.closest('[data-nav-root]')?.id || null, active: document.activeElement?.id || document.activeElement?.tagName, ...i.open() }; });

// the intro: a pad plugged in, its A on Begin
await page.waitForFunction(() => document.getElementById('intro').classList.contains('ask'), null, { polling: 100, timeout: 120000 });
await pad.plug();
let b = await S();
check(`${tag} the intro waits on Begin`, !b.live, JSON.stringify({ live: b.live, focus: b.focus }));
await pad.press(BTN.S);
await page.waitForFunction(() => document.body.classList.contains('live'), null, { polling: 100, timeout: 20000 }).catch(() => {});
b = await S();
check(`${tag} A on Begin begins the world`, b.live);
check(`${tag} the hints and pointer follow the pad`, b.glyphs === 'pad' && b.pointer === 'pad' && b.family === 'xbox', JSON.stringify(b));
await page.waitForTimeout(3000);
await T(() => __tidemote.setSpeed(1));
b = await S(); check(`${tag} the reticle (or the loupe in hand) sits at the view's middle`, b.aim || b.tool === 'loupe', JSON.stringify({ aim: b.aim, tool: b.tool }));
await pad.press(BTN.LB); b = await S(); check(`${tag} LB tapped puts the loupe down: the reticle shows`, b.tool === 'none' && b.aim, JSON.stringify({ aim: b.aim, tool: b.tool }));

// the stick pans, the triggers zoom
let a = await S(); await pad.stick(1, 0); await page.waitForTimeout(500); await pad.stick(0, 0); b = await S();
check(`${tag} the left stick pans`, b.x !== a.x, `${a.x.toFixed(2)} → ${b.x.toFixed(2)}`);
a = b; await pad.trig(BTN.RT, 1); await page.waitForTimeout(500); await pad.trig(BTN.RT, 0); b = await S();
check(`${tag} RT zooms in`, b.zoomT > a.zoomT * 1.3, `${a.zoomT.toFixed(2)} → ${b.zoomT.toFixed(2)}`);
a = b; await pad.trig(BTN.LT, 1); await page.waitForTimeout(300); await pad.trig(BTN.LT, 0); b = await S();
check(`${tag} LT zooms out`, b.zoomT < a.zoomT, `${a.zoomT.toFixed(2)} → ${b.zoomT.toFixed(2)}`);
await pad.press(BTN.R3); b = await S(); check(`${tag} R3 resets the zoom`, b.zoomT === 1, String(b.zoomT));

// A selects what is under the reticle
const cell = await T(() => { const sps = [...__tidemote.life().reg.values()].filter((x) => x.alive && x.pop > 0).sort((p, q) => q.pop - p.pop); return sps[0]?.serial; });
await T((s) => __tidemote.findMember(s), cell); await page.waitForTimeout(2500);
await pad.press(BTN.W); // (found members are ridden: X gets off)
b = await S(); check(`${tag} X gets off a ride`, !b.ride && b.sel, JSON.stringify({ ride: b.ride, sel: b.sel }));
// (the world held still while the reticle is put on the cell, so it is still there when A is pressed)
await T(() => { const t = __tidemote; t.state.paused = true; const s = t.ride.sel(); t.deselect(); return s && t.input.lookAt(s.disp[0], s.disp[1]); });
await frames(4);
const there = await T(() => { const t = __tidemote, s = t.ride.sel(); return s; });
await T(() => { const t = __tidemote; return null; });
await pad.press(BTN.S); await page.waitForTimeout(800);
await T(() => { __tidemote.state.paused = false; });
b = await S(); check(`${tag} A selects the cell under the reticle`, b.sel && b.spec, JSON.stringify({ sel: b.sel, spec: b.spec, before: !!there }));

// X rides; the stick steers; A hops; B gets off
await pad.press(BTN.W); await page.waitForTimeout(400);
b = await S(); check(`${tag} X rides the selected cell`, b.ride && b.ctx === 'ride', b.ctx);
await pad.stick(0, -1); await page.waitForTimeout(1200); b = await S(); await pad.stick(0, 0);
check(`${tag} riding, the stick steers (the throttle builds)`, b.u > 0.3, b.u.toFixed(2));
await pad.press(BTN.S); await page.waitForTimeout(500); check(`${tag} A hops to kin (no error)`, true);
await pad.press(BTN.E); b = await S(); check(`${tag} B gets off`, !b.ride, JSON.stringify({ ride: b.ride }));
await pad.press(BTN.N); b = await S(); check(`${tag} Y moves focus into the specimen panel`, b.focus === 'spec' && b.ctx === 'panel', JSON.stringify({ focus: b.focus, ctx: b.ctx }));
a = b; await pad.press(BTN.DOWN); b = await S(); check(`${tag} the d-pad moves focus within it`, b.active !== a.active && b.focus === 'spec', `${a.active} → ${b.active}`);
await pad.press(BTN.E); b = await S(); check(`${tag} B leaves the panel for the world`, !b.focus && b.ctx === 'world' && b.spec, JSON.stringify({ focus: b.focus, ctx: b.ctx }));
await pad.press(BTN.E); b = await S(); check(`${tag} B again lets the cell go`, !b.sel);

// the tool rose: LB held, the stick at the lamp (right), let go
await pad.down(BTN.LB); await page.waitForTimeout(260);
b = await S(); check(`${tag} LB held opens the tool rose`, b.rose);
const roseFits = await T(() => { const r = document.getElementById('rose').getBoundingClientRect(); return r.left >= -40 && r.right <= innerWidth + 40 && r.top >= -40 && r.bottom <= innerHeight + 40; });
check(`${tag} the rose fits the screen`, roseFits);
await pad.stick(1, 0); await page.waitForTimeout(100); await pad.stick(0, 0); await pad.up(BTN.LB);
b = await S(); check(`${tag} let go, the octant lit is taken: the lamp`, !b.rose && b.tool === 'lamp', b.tool);
await pad.down(BTN.S); await page.waitForTimeout(300); a = await S(); await pad.up(BTN.S); b = await S();
check(`${tag} A held applies the tool, let go lifts it`, a.held && !b.held, JSON.stringify({ during: a.held, after: b.held }));
await pad.press(BTN.LB); b = await S(); check(`${tag} LB tapped puts the tool down`, b.tool === 'none', b.tool);
await pad.press(BTN.LB); b = await S(); check(`${tag} LB tapped again takes it back up`, b.tool === 'lamp', b.tool);
await pad.down(BTN.LB); await page.waitForTimeout(260); await pad.up(BTN.LB); b = await S();
check(`${tag} the rose let go with the stick at rest takes nothing`, !b.rose && b.tool === 'lamp', b.tool);
await pad.press(BTN.E); b = await S(); check(`${tag} B puts the tool down`, b.tool === 'none', b.tool);

// the view rose: RB held, the stick up (the light map)
await pad.down(BTN.RB); await page.waitForTimeout(260); await pad.stick(0, -1); await page.waitForTimeout(80); await pad.up(BTN.RB); await pad.stick(0, 0);
b = await S(); check(`${tag} the view rose turns on the light map`, b.map === 'light', b.map);
await pad.press(BTN.E); b = await S(); check(`${tag} B clears the map`, !b.map || b.map === 'off', b.map);

// the bench, Settings, the Lab: entered with focus, left by B
await pad.press(BTN.RB); b = await S(); check(`${tag} RB tapped opens the bench, focus in it`, b.bench && b.focus === 'bench', JSON.stringify({ bench: b.bench, focus: b.focus }));
await pad.press(BTN.E); b = await S(); check(`${tag} B closes the bench`, !b.bench && !b.focus);
await pad.press(BTN.MENU); b = await S(); check(`${tag} Menu opens Settings, focus in them`, b.settings && b.focus === 'settings', JSON.stringify({ settings: b.settings, focus: b.focus }));
const tab0 = await T(() => document.querySelector('#set-tabs [aria-selected="true"]')?.textContent);
await pad.press(BTN.RB); const tab1 = await T(() => document.querySelector('#set-tabs [aria-selected="true"]')?.textContent);
check(`${tag} RB changes the Settings tab`, tab0 !== tab1, `${tab0} → ${tab1}`);
a = await S(); await pad.press(BTN.DOWN); await pad.press(BTN.DOWN); b = await S();
check(`${tag} the d-pad moves focus in Settings`, b.active !== a.active && b.focus === 'settings', `${a.active} → ${b.active}`);
await pad.press(BTN.E); b = await S(); check(`${tag} B closes Settings`, !b.settings && !b.focus);
const lab0 = (await S()).lab;
await pad.press(BTN.VIEW); await page.waitForTimeout(300); b = await S();
check(`${tag} View tapped toggles the Lab`, b.lab !== lab0, JSON.stringify({ lab: b.lab, focus: b.focus }));
if (b.lab) {
  check(`${tag} the Lab opened by the pad has focus`, b.focus === 'lab', b.focus);
  await pad.press(BTN.E); b = await S(); check(`${tag} B leaves the Lab`, b.focus !== 'lab');
  await pad.press(BTN.VIEW); await page.waitForTimeout(300);
}

// the Controls, held open by View
await pad.hold(BTN.VIEW, 300); await pad.up(BTN.VIEW); b = await S();
check(`${tag} View held opens the Controls`, b.help && !b.lab === !lab0 || b.help, JSON.stringify({ help: b.help }));
const col = await T(() => ({ gl: document.querySelectorAll('#help-keys .gl').length, a: [...document.querySelectorAll('#help-keys .gl')].some((g) => g.getAttribute('aria-label') === 'A') }));
check(`${tag} its controller column draws the pad's buttons`, col.gl > 15 && col.a, JSON.stringify(col));
await pad.press(BTN.E); b = await S(); check(`${tag} B closes it`, !b.help);
if (b.lab !== lab0) await T(() => { __tidemote.lab.toggle(); document.activeElement?.blur(); });

// the d-pad's time and the auto camera
a = await S(); await pad.press(BTN.DOWN); b = await S(); check(`${tag} d-pad ↓ pauses`, b.paused !== a.paused);
await pad.press(BTN.DOWN);
await pad.press(BTN.RIGHT); b = await S(); check(`${tag} d-pad → goes faster`, b.speed > 1, String(b.speed));
await pad.press(BTN.LEFT); await pad.press(BTN.LEFT); b = await S(); check(`${tag} d-pad ← goes slower`, b.speed < 1, String(b.speed));
await T(() => __tidemote.setSpeed(1));
await pad.press(BTN.UP); b = await S(); check(`${tag} d-pad ↑ starts the auto camera`, b.auto);
await pad.stick(-1, 0); await page.waitForTimeout(200); await pad.stick(0, 0); b = await S(); check(`${tag} the stick takes the camera back`, !b.auto);

// hints: the pad's button in place of the key; a key brings the keys back; a mouse moved doesn't
await page.mouse.move(5, 300);
await page.hover('#t-play'); await page.waitForTimeout(250);
// (hovering took the pointer from the pad; the names are still the pad's)
let tip = await T(() => document.getElementById('tip').innerHTML);
b = await S(); check(`${tag} moving the mouse leaves the pad's names`, b.glyphs === 'pad', b.glyphs);
check(`${tag} a hint shows the pad's button, not the key`, /gl-dpad/.test(tip) && !/<kbd>/.test(tip), tip.slice(0, 160));
await page.keyboard.press('g'); await page.keyboard.press('g'); await page.mouse.move(5, 300); await page.hover('#t-play'); await page.waitForTimeout(250);
tip = await T(() => document.getElementById('tip').innerHTML);
b = await S(); check(`${tag} a key brings the keys' names back`, b.glyphs === 'keys' && /<kbd>Space<\/kbd>/.test(tip), tip.slice(0, 120));

// a Deck's pad: its glyphs
await pad.plug('Steam Deck (Vendor: 28de Product: 1205)');
await pad.press(BTN.R3);
await T(() => __tidemote.input.act('help'));
const deck = await T(() => [...document.querySelectorAll('#help-keys .gl')].map((g) => g.textContent).join(' '));
b = await S(); check(`${tag} a Steam Deck's pad draws the Deck's names`, b.family === 'deck' && /L1/.test(deck) && /R2/.test(deck), deck.slice(0, 80));
await pad.press(BTN.E);

// unplugged mid-pan: the pan stops
await pad.stick(1, 0); await page.waitForTimeout(200); await pad.unplug(); await page.waitForTimeout(100);
a = await S(); await page.waitForTimeout(400); b = await S();
check(`${tag} a pad unplugged mid-pan lets go`, Math.abs(b.x - a.x) < 1e-6, `${a.x.toFixed(3)} → ${b.x.toFixed(3)}`);
await done();
