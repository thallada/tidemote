#!/bin/bash
# The brain's knockout test (docs/brain.md): fork a grown world and run it on with the brains' stroke off,
# doubled, or the brain off (the rules back), 3 seeds × 12 reps × 120 s. Then: node tools/brain/fork-ends.cjs $OUT/s*.json
cd "$(dirname "$0")/../.."
OUT=${OUT:-runs/stroke}
mkdir -p $OUT
V='[{"name":"keep","step":1},{"name":"still","step":1,"k":{"brainThrust":0}},{"name":"double","step":1,"k":{"brainThrust":2}},{"name":"nobrain","step":1,"k":{"brain":0}}]'
for s in 1 2 3; do
  tools/gpu-node.sh tools/fork.mjs --n 32768 --warm 1800 --horizon 120 --reps 12 --eras --seed $s --k '{"brain":1}' --variants "$V" --out $OUT/s$s.json > $OUT/s$s.log 2>&1 &
done
wait
