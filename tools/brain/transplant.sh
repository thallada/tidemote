#!/bin/bash
# The brain's transplant test (docs/brain.md): fork a grown world and swap the living species' brains
# whole or in part, 3 seeds × 12 reps × 60 s. Then: node tools/brain/fork-ends.cjs $OUT/p-s*.json
cd "$(dirname "$0")/../.."
OUT=${OUT:-runs/transplant}
mkdir -p $OUT
V='[{"name":"keep","step":1},{"name":"shuffle","step":1,"transplant":"shuffle"},{"name":"steer","step":1,"transplant":"shuffle-steer"},{"name":"acts","step":1,"transplant":"shuffle-acts"},{"name":"state","step":1,"transplant":"shuffle-state"}]'
for s in 1 2 3; do
  tools/gpu-node.sh tools/fork.mjs --n 32768 --warm 1800 --horizon 60 --reps 12 --eras --seed $s --k '{"brain":1}' --variants "$V" --out $OUT/p-s$s.json > $OUT/p-s$s.log 2>&1 &
done
wait
