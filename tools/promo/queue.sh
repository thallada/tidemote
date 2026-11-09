#!/bin/bash
# The library's filming queue: one GPU job at a time from queue.txt (a line: NAME SCRIPT ARGS...; # for comments), read
# afresh before each job so jobs can be added while it runs; a job whose log ends in "done" is skipped, one that fails is
# marked NAME.failed and passed over. Stops when the disk falls under 25 GB. Each world is catalogued as it finishes.
# Films PROMO_HTML (the build pinned for the library: a worktree of main, docs/promo.md).
#   setsid nohup tools/promo/queue.sh >> /mnt/d/tidemote-promo/lib2/queue.log 2>&1 &
cd "$(dirname "$0")/../.."
M=${PROMO_ROOT:-/mnt/d/tidemote-promo}/lib2 HTML=${PROMO_HTML:-../tidemote-wt/promo2/dist/tidemote.html}
while true; do
  job=""
  while read -r name script args; do
    [[ -z "$name" || "$name" == \#* ]] && continue
    if [[ -f $M/$name.log ]] && tail -1 "$M/$name.log" | grep -q "done"; then continue; fi
    if [[ -f $M/$name.failed ]]; then continue; fi
    job="$name $script $args"; break
  done < tools/promo/queue.txt
  [[ -z "$job" ]] && { echo "QUEUE EMPTY $(date +%T)"; break; }
  set -- $job; name=$1; script=$2; shift 2
  free=$(df --output=avail -BG "$M" | tail -1 | tr -dc 0-9)
  if [ "$free" -lt 25 ]; then echo "only ${free}G free, stopping before $name"; break; fi
  echo "=== $name $script $* $(date '+%m-%d %T') (${free}G free)"
  tools/gpu-node.sh tools/promo/$script --out "$M/$name" --html "$HTML" "$@" > "$M/$name.log" 2>&1
  tail -1 "$M/$name.log"
  tail -1 "$M/$name.log" | grep -q "done" || { echo "  $name failed"; touch "$M/$name.failed"; }
  node tools/promo/catalog.mjs --only "$name" --jobs 3 2>&1 | tail -1
done
echo QUEUE STOPPED $(date '+%m-%d %T')
