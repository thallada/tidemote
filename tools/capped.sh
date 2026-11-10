#!/usr/bin/env bash
# Run a command with its memory capped, so a runaway browser or tool is killed instead of taking the
# machine (or WSL's VM) down with it.
#   tools/capped.sh [-m SIZE] command...      SIZE as systemd takes it: 600M, 4G (default $TIDEMOTE_CAP or 4G)
# It runs ~/.local/bin/capped (a personal wrapper some machines have) when that exists; else a user
# systemd scope with MemoryMax=SIZE and no swap (MemorySwapMax=0: with swap allowed, a scope over its
# cap only swaps); else the command uncapped, saying so on stderr. The command's exit status is kept.
#   TIDEMOTE_VK=1 tools/capped.sh -m 900M node tools/i18n/tour.mjs --out runs/i18n/base
set -euo pipefail
SIZE=${TIDEMOTE_CAP:-4G}
ARGS=()
if [[ "${1:-}" == "-m" ]]; then
  [[ $# -ge 2 ]] || { echo "usage: tools/capped.sh [-m SIZE] command..." >&2; exit 2; }
  SIZE=$2; ARGS=(-m "$2"); shift 2
fi
[[ $# -ge 1 ]] || { echo "usage: tools/capped.sh [-m SIZE] command..." >&2; exit 2; }

OWN="$HOME/.local/bin/capped"
if [[ -x "$OWN" ]]; then exec "$OWN" "${ARGS[@]}" "$@"; fi

# A user systemd that will run a scope whose memory.max is the cap (a quick probe: the bus answers and
# the memory controller is delegated to the user's units).
if command -v systemd-run >/dev/null 2>&1; then
  PROPS=(-p "MemoryMax=$SIZE" -p MemorySwapMax=0)
  # shellcheck disable=SC2016
  if [[ "$(timeout 10 systemd-run --user --scope -q "${PROPS[@]}" -- \
      sh -c 'cat "/sys/fs/cgroup$(sed -n "s/^0:://p" /proc/self/cgroup)/memory.max"' 2>/dev/null)" =~ ^[0-9]+$ ]]; then
    exec systemd-run --user --scope -q "${PROPS[@]}" -- "$@"
  fi
fi

echo "tools/capped.sh: no ~/.local/bin/capped and no user systemd to cap memory with; running uncapped" >&2
exec "$@"
