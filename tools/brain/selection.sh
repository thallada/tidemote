#!/bin/bash
# The brain's selection test (docs/brain.md): inherited brains against the stranger-brain control
# (brainControl 2), 8 seeds × 120 min at 32k, four runs at a time. Then:
#   node tools/brain-probe.mjs $OUT/only-real-s*.json   (and only-ctrl, led-real, led-ctrl)
cd "$(dirname "$0")/../.."
OUT=${OUT:-runs/brain-sel}
mkdir -p $OUT
run() { tools/gpu-node.sh tools/sim.mjs --n 32768 --minutes 120 --seed $1 --k "$2" --species --print 7200 --out $OUT/$3-s$1.json > $OUT/$3-s$1.log 2>&1; }
O=${O:-'"brain":1,"brainOnly":0.5'}
L=${L:-'"brain":1,"brainOnly":0.5,"brainPulls":0,"brainThrust":2.5'}
for s in 1 2 3 4 5 6 7 8; do
  run $s "{$O}" only-real & run $s "{$O,\"brainControl\":2}" only-ctrl & run $s "{$L}" led-real & run $s "{$L,\"brainControl\":2}" led-ctrl & wait
done
