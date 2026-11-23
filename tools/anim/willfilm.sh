#!/usr/bin/env bash
# Each spot of a tools/anim/willfilm.mjs run as one clip, two of its modes side by side, each labeled, at the frames' real timing: OUT/spotN.mp4, and all spots one after another as OUT/all.mp4.
#   tools/anim/willfilm.sh runs/anim/will/NAME [MODE_A LABEL_A MODE_B LABEL_B]
set -euo pipefail
out=$1; ma=${2:-always}; la=${3:-before (always beating)}; mb=${4:-will}; lb=${5:-after (a beat at will)}
modes=("$ma" "$mb")
font=$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || true)
list="$out/all.txt"; : > "$list"
for spot in $(ls "$out/${modes[0]}"); do
  ins=()
  for m in "${modes[@]}"; do
    d="$out/$m/$spot"
    # a concat list at the frames' own times (the screencast sends frames as they change, not evenly)
    python3 - "$d" <<'PY'
import json, sys, os
d = sys.argv[1]; t = json.load(open(os.path.join(d, 'times.json')))
with open(os.path.join(d, 'frames.txt'), 'w') as f:
    for i in range(len(t)):
        f.write(f"file 'f{i + 1:04d}.jpg'\n")
        f.write(f"duration {max(t[i + 1] - t[i], 1 / 120) if i + 1 < len(t) else 1 / 30:.4f}\n")
PY
    ins+=(-f concat -safe 0 -i "$d/frames.txt")
  done
  ffmpeg -y -loglevel error "${ins[@]}" -filter_complex \
    "[0:v]fps=30,drawtext=fontfile=$font:text='$la':x=16:y=16:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=8[a];\
[1:v]fps=30,drawtext=fontfile=$font:text='$lb':x=16:y=16:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=8[b];\
[a][b]hstack=inputs=2:shortest=1,drawbox=x=iw/2-1:y=0:w=2:h=ih:color=black:t=fill,crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0[v]" \
    -map '[v]' -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart "$out/$spot.mp4"
  echo "file '$spot.mp4'" >> "$list"
  echo "$out/$spot.mp4"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -c copy "$out/all.mp4"
echo "$out/all.mp4"
