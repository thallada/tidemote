// Lean check: does lifeMain lean (the features idle across the world compiled out, IDLE_* in simWGSL;
// docs/performance.md, Lean step kernels) leave the world as the full kernel does whenever the engine picks it? One
// world grown at --ticks, then from the same moment --steps steps run with the full kernels twice and with the lean
// ones (eng.leanSteps), each step drawn as the page draws it. Prints the words of each buffer a save keeps (readState)
// that differ from the first full run's (the particles and intents matched by id); the second full run shows the GPU's
// own nondeterminism (a step's atomics and float sums), which on a real GPU hides any difference. Mesa's lavapipe on
// one thread is deterministic, and there every word must match:
//   LP_NUM_THREADS=0 node tools/leancheck.mjs --cpu --n 4096 --steps 40 --warm 40 --ticks 1   (and --ticks 2, 6)
// --lamp, --pond: the hand's lamp lit, or the water low, through the run: the engine must pick the full kernels then
// (the lean run then matches as well); with --force the lean kernels are taken all the same, a control: the lamp's
// light or the shore left out, the worlds part.
import { stepArgs, grownWorld, living, diffState, report } from './lib/stepcheck.mjs';

const v = stepArgs({ lamp: { type: 'boolean' }, pond: { type: 'boolean' }, force: { type: 'boolean' } });
const { device, eng, name, S, frame } = await grownWorld(v, (e) => { if (v.force) e._stepLean = () => true; });

async function run(lean) {
  eng.writeState(S);
  eng.leanSteps = lean;
  if (v.lamp) eng.hand.set([eng.grid[0] / 2, eng.grid[1] / 2, 3, 0.8], 0);
  if (v.pond) eng.level = 0.4;
  let picked = 0;
  for (let s = 0; s < +v.steps; s++) {
    eng.lerp = 0.5;
    frame();
    picked += eng.leanRan ? 1 : 0;
    if (s % 16 === 15) await device.queue.onSubmittedWorkDone();
  }
  const st = await eng.readState();
  eng.hand.fill(0, 0, 4); eng.level = 1; eng.leanSteps = true;
  return { st, picked };
}
const ref = await run(false), again = await run(false), lean = await run(true);
report([
  `${name}: ${v.n} particles (${living(S)} living), ${v.steps} steps of ${v.ticks} ticks from one moment${v.lamp ? ', the lamp lit' : ''}${v.pond ? ', the water low' : ''}${v.force ? ', the lean kernels forced' : ''}`,
  `full again vs full: ${JSON.stringify(diffState(ref.st, again.st))}`,
  `lean vs full:       ${JSON.stringify(diffState(ref.st, lean.st))}  (lean kernels in ${lean.picked} of ${v.steps} steps; full runs ${ref.picked + again.picked})`,
  `living at the end: ${living(ref.st)} / ${living(again.st)} / ${living(lean.st)}`,
]);
