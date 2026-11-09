// The live annotations as a showcase: the full interface (1280x720 at device scale 3, 4K HEVC) over a still camera at
// a spot where much happens (hunts, bodies, a mix of species, births), notes always on and paced for reading on film:
// up to three at once, each held 10-22 s, a new one every 3 s. A take starts once notes are up (a natural pre-roll), and
// its JSON keeps how many notes were on screen each half second (meta.onScreen) and the share of the take with two or
// more (meta.noteShare), to choose among the takes by.
//   tools/gpu-node.sh tools/promo/notes.mjs --out /mnt/d/tidemote-promo/lib2/n01 --mature 1500 [--takes 4] [--secs 25]
import { cliArgs, aim, openOffline, MEDIA, S } from './olab.mjs';

const v = { out: MEDIA + '/n01', mature: 1500, takes: 4, secs: 25, ...cliArgs() };
const W = 1280, H = 720;
const P = await openOffline({ ...v, ui: true, vw: W, vh: H, scale: +(v.scale ?? 3), hevc: true, track: ['#hud', '#dock', '#feed', '#rail'], notes: 2 });
const { page, T, setSpeed, wait } = P;
const log = (...a) => console.log(`[${v.out.split('/').pop()}]`, ...a);

await setSpeed(1); await wait(3);
await P.calm();
// the pace for film (the page's own: two at once, 6-16 s, 6 s apart; the same notes, read more easily on a cut)
await T(() => {
  const t = globalThis.__tidemote;
  t.state.notes = 2;
  Object.assign(t.notes.T, { maxOn: 3, gap: 3, dwell: 10, minLife: 6, life: 22, lifeOne: 12, typeCool: 8, keyCool: 40, subjectCool: 30, variety: 40 });
});
await page.mouse.move(W - 1, H * 0.5); // the pointer out of the way (no hover hints)

// notes on screen now: shown and not leaving
const onScreen = () => T(() => { const N = globalThis.__tidemote.notes; return (N.notes || []).filter((n) => n.exitAt == null).length; });

const plan = [[160, 'kills'], [240, 'bodies'], [120, 'diverse'], [200, 'births'], [300, 'kills'], [160, 'total']].slice(0, +v.takes);
const used = [];
let i = 0;
for (const [z, key] of plan) {
  const [best] = await P.bestSpots(1, z, [key, 'total'], { avoid: used });
  if (!best) continue;
  used.push(best);
  await aim(page, best, z);
  // pre-roll: the notes find their stories (up to 20 s, until two are up)
  for (let t = 0; t < 20 && (await onScreen()) < 2; t++) await wait(1);
  const meta = { cat: 'notes', zoom: z, speed: 1, notes: 2, pace: 'showcase', what: `annotations over a still camera (${key})`, onScreen: [] };
  await P.shot(`notes_show_${i++}_z${z}`, S(+v.secs), { pre: 30, meta, each: async (f) => {
    if (f >= 0 && f % 30 === 0) meta.onScreen.push(await onScreen());
    if (f === S(+v.secs) - 1) meta.noteShare = +(meta.onScreen.filter((x) => x >= 2).length / meta.onScreen.length).toFixed(2);
  } });
  log(`take ${i - 1}: spot ${best.r.toFixed(2)}, notes on screen ${meta.onScreen.join('')}`);
}
await P.close();
console.log('done');
