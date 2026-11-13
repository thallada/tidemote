#!/usr/bin/env bash
# A kernel's registers on an Adreno 630 as Mesa's compiler has them (tools/adreno/README.md): one line an entry point,
#   its widest moment (vec4 registers wanted, of 48: past them values spill to memory), the registers used, the waves
#   of threads the GPU keeps at once with that many (16 at 12 or fewer, 12 to 16, 10 to 19, 8 to 24, 6 to 32, 4 to 48),
#   instructions, and spills. RAW=1 prints Mesa's whole output (the disassembly) instead.
M=${MESA_BUILD:-$HOME/tools/mesa-dev/mesa/build}
[ -e "$M/src/freedreno/drm-shim/libfreedreno_noop_drm_shim.so" ] || { echo "regs: no Mesa build at $M (tools/adreno/README.md)" >&2; exit 2; }
export VK_DRIVER_FILES=$M/src/freedreno/vulkan/freedreno_devenv_icd.x86_64.json VK_ICD_FILENAMES=$M/src/freedreno/vulkan/freedreno_devenv_icd.x86_64.json
export LD_PRELOAD=$M/src/freedreno/drm-shim/libfreedreno_noop_drm_shim.so FD_GPU_ID=${FD_GPU_ID:-630} MESA_LOADER_DRIVER_OVERRIDE=msm
export IR3_SHADER_DEBUG=${IR3_SHADER_DEBUG:-cs,fs,nocache} MESA_SHADER_CACHE_DISABLE=true
cd "$(dirname "$0")" || exit 2
if [ -n "$RAW" ]; then exec node regs.mjs "$@"; fi
node regs.mjs "$@" 2>&1 | awk '
  /^=== /{name=$0; sub(/^=== /,"",name); order[++n]=name}
  /max pressure/{match($0,/full [0-9]+/); p=substr($0,RSTART+5,RLENGTH-5)/8; if (p>peak[name]) peak[name]=p}
  / half, /{match($0,/[0-9]+ full/); full[name]=substr($0,RSTART,RLENGTH-5)}
  /max_waves/{match($0,/[0-9]+ max_waves/); w[name]=substr($0,RSTART,RLENGTH-10)}
  / instr, /{match($0,/[0-9]+ instr/); ins[name]=substr($0,RSTART,RLENGTH-6)}
  /[ \t](stp|ldp)[ \t]/{sp[name]++}
  /^ERR|^regs:/{print}
  END{for(i=1;i<=n;i++){k=order[i]; printf "%-30s widest %5.1f  used %2s  waves %2s  instr %6s  spills %d\n", k, peak[k], full[k], w[k], ins[k], sp[k]}}'
