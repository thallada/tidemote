#!/usr/bin/env bash
# The coarse-beat comparison (docs/fast-forward.md): swimlab over the 12 beat genotypes (amplitude 0.25/0.5, 0.6/1.5/3
# Hz, wave 0.3/0.8 rad a cell) on a body, at each step length, under a #k override; one log a step.
#   tools/swimtable.sh OUTDIR LABEL BODY '{"k":1}' 1 2 3 4 6        then python3 tools/swimtable.py OUTDIR
set -u
OUT=$1; LABEL=$2; BODY=$3; KK=$4; shift 4
mkdir -p "$OUT"
SWEEP='['
for a in 0.25 0.5; do for f in 0.6 1.5 3; do for w in 0.3 0.8; do SWEEP+="{\"beat\":[$a,$f,$w,1]},"; done; done; done
SWEEP="${SWEEP%,}]"
NAME=${BODY//:/_}
for s in "$@"; do
  "$(dirname "$0")/gpu-node.sh" "$(dirname "$0")/swimlab.mjs" --body "$BODY" --seconds 10 --step "$s" --sweep "$SWEEP" --k "$KK" > "$OUT/$LABEL-$NAME-s$s.log" 2>&1
done
