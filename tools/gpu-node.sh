#!/usr/bin/env bash
# Run Node with access to the GPU. Under WSL, Linux Dawn sees only llvmpipe (Mesa's dzn bridge lacks a
# feature Dawn requires), so run the Windows build of Node, whose Dawn uses D3D12 on the real GPU. The
# `webgpu` package ships the win32 binary, so the repo's node_modules work unchanged. A portable Node is
# fetched into %LOCALAPPDATA%\tidemote-node on first use. Elsewhere this is plain `node`.
#   tools/gpu-node.sh tools/sim.mjs --n 32768 --minutes 30
set -euo pipefail
if ! grep -qi microsoft /proc/version 2>/dev/null; then exec node "$@"; fi
VERSION=${TIDEMOTE_WIN_NODE_VERSION:-v22.20.0}
if [[ -n "${TIDEMOTE_WIN_NODE:-}" ]]; then
  NODE=$TIDEMOTE_WIN_NODE
else
  LOCAL=$(wslpath "$(cmd.exe /c 'echo %LOCALAPPDATA%' 2>/dev/null | tr -d '\r')")
  DIR="$LOCAL/tidemote-node"
  NODE="$DIR/node-$VERSION-win-x64/node.exe"
  if [[ ! -x "$NODE" ]]; then
    echo "Fetching portable Windows Node $VERSION into $DIR" >&2
    mkdir -p "$DIR"
    curl -fsSL "https://nodejs.org/dist/$VERSION/node-$VERSION-win-x64.zip" -o "$DIR/node.zip"
    unzip -q -o "$DIR/node.zip" -d "$DIR" && rm "$DIR/node.zip"
  fi
fi
exec "$NODE" "$@"
