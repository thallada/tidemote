#!/usr/bin/env bash
# Build the headless-surface Vulkan layer into DIR (default runs/vklayer) and print the directory to
# pass as TIDEMOTE_VK_LAYER (bench.mjs --linux, sim.mjs --chrome, ensemble.mjs --chrome).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=$(realpath -m "${1:-$here/../../../runs/vklayer}")
mkdir -p "$out"
gcc -shared -fPIC -O2 -o "$out/libvk_headless.so" "$here/headless.c"
cat > "$out/headless.json" <<JSON
{ "file_format_version": "1.1.2",
  "layer": { "name": "VK_LAYER_TIDEMOTE_headless", "type": "GLOBAL", "library_path": "$out/libvk_headless.so",
    "api_version": "1.4.329", "implementation_version": "1", "description": "advertise VK_EXT_headless_surface",
    "instance_extensions": [{ "name": "VK_EXT_headless_surface", "spec_version": "1" }] } }
JSON
echo "$out"
