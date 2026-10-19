#!/usr/bin/env bash
# sheet.sh DIR OUT.png [START=1] [STEP=6] [COLS=4] [ROWS=3] [WIDTH=480] [CROP=w:h:x:y]
d=$1; out=$2; start=${3:-1}; step=${4:-6}; cols=${5:-4}; rows=${6:-3}; w=${7:-480}; crop=${8:-in_w:in_h-50:0:0}
ffmpeg -loglevel error -y -start_number $start -framerate 60 -i $d/f%04d.jpg -vf "crop=$crop,select='not(mod(n\,$step))',scale=$w:-1,drawtext=text='%{n}':x=4:y=4:fontcolor=white:fontsize=14,tile=${cols}x${rows}" -frames:v 1 $out
