// Split check: does a step spread over two frames (engine frame's split: its first half after one frame's drawing,
// the rest before the next's) leave the world as a whole step does? One world grown at --ticks, then from the same
// moment --steps steps run whole (one drawn frame each) twice, and split (two drawn frames each, drawn in between as
// the page draws them; the last one's second half left for readState to finish, as a save between the halves does),
// with draws to an offscreen target. Prints the words of each buffer a save keeps (readState) that differ from the
// first whole run's (the particles and intents matched by id); the second whole run shows the GPU's own
// nondeterminism (a step's atomics and float sums), which on a real GPU hides any difference. Mesa's lavapipe on one
// thread is deterministic, and there every word must match (docs/fast-forward.md, Split steps):
//   LP_NUM_THREADS=0 node tools/splitcheck.mjs --cpu --n 4096 --steps 40 --warm 40
//   tools/gpu-node.sh tools/splitcheck.mjs --n 8192 --steps 1
import { stepArgs, grownWorld, living, diffState, report } from './lib/stepcheck.mjs';

const v = stepArgs();
const { device, eng, name, S, frame } = await grownWorld(v);

async function run(split) {
  eng.writeState(S);
  for (let s = 0; s < +v.steps; s++) {
    // (the last step's second half left owed: readState finishes it, as a save between the halves does)
    if (split) { eng.lerp = 0.75; frame({ split: true }); eng.lerp = 0.25; if (s < +v.steps - 1) frame({ paused: true }); }
    else { eng.lerp = 0.5; frame(); }
    // (now and then a frame's GPU work finished before the next is sent, as the page's pace makes it)
    if (s % 16 === 15) await device.queue.onSubmittedWorkDone();
  }
  return eng.readState();
}
const ref = await run(false), again = await run(false), split = await run(true);
report([
  `${name}: ${v.n} particles (${living(S)} living), ${v.steps} steps of ${v.ticks} ticks from one moment`,
  `whole again vs whole: ${JSON.stringify(diffState(ref, again))}  clock ${again.cpu.simTime === ref.cpu.simTime && again.cpu.frameNo === ref.cpu.frameNo}`,
  `split vs whole:       ${JSON.stringify(diffState(ref, split))}  clock ${split.cpu.simTime === ref.cpu.simTime && split.cpu.frameNo === ref.cpu.frameNo}`,
  `living at the end: ${living(ref)} / ${living(again)} / ${living(split)}`,
]);
