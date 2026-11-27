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
# Windows programs start in the session of the WSL relay this shell's WSL_INTEROP leads to. A WSL started by a service
# (after a crash, or by a task at boot) puts them in session 0, which has no desktop: there Chrome composites in software
# and a page's WebGPU canvas comes out blank. So when this shell's relay is in session 0, use a relay in the console's
# session (a desktop's: not 0) if one exists (a wsl.exe started from the desktop), remembered for the next run while it lasts.
session_of() { WSL_INTEROP=$1 timeout 20 powershell.exe -NoProfile -c '[Diagnostics.Process]::GetCurrentProcess().SessionId' 2>/dev/null | tr -d '\r' | tail -1; }
if [[ -n "${WSL_INTEROP:-}" && "${TIDEMOTE_ANY_SESSION:-}" != 1 ]]; then
  CACHE=/tmp/tidemote-console-interop
  if [[ "$(session_of "$WSL_INTEROP")" == 0 ]]; then
    PICK=""
    if [[ -S "$(cat "$CACHE" 2>/dev/null)" && "$(session_of "$(cat "$CACHE")")" =~ ^[1-9] ]]; then PICK=$(cat "$CACHE")
    else for S in /run/WSL/*_interop; do [[ -S "$S" && "$(session_of "$S")" =~ ^[1-9] ]] && { PICK=$S; echo "$S" > "$CACHE"; break; }; done; fi
    if [[ -n "$PICK" ]]; then export WSL_INTEROP=$PICK
    else echo "gpu-node: Windows programs start in a session with no desktop (WSL started by a service); pages will draw blank. Start any wsl.exe from the desktop to give them one." >&2; fi
  fi
fi
exec "$NODE" "$@"
