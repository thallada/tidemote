#!/usr/bin/env bash
# The release workflow's archives (Tidemote-VERSION-OS-ARCH.zip or .tar.gz, each one top folder, anywhere
# under ARTIFACTS) unpacked as CONTENT/windows/, CONTENT/mac/, CONTENT/linux/: what goes into each Steam
# depot and itch.io channel.
#   bash desktop/scripts/unpack-artifacts.sh ARTIFACTS CONTENT
set -euo pipefail
src=$1 dst=$2
mkdir -p "$dst"
found=0
while IFS= read -r -d '' a; do
  name=$(basename "$a"); stem=${name%.zip}; stem=${stem%.tar.gz}
  os=$(echo "$stem" | awk -F- '{ print $(NF-1) }') # VERSION may hold dashes; OS and ARCH end the name
  case "$os" in windows|mac|linux) ;; *) echo "$name: no OS in its name" >&2; exit 1 ;; esac
  tmp=$(mktemp -d)
  case "$name" in *.tar.gz) tar -xzf "$a" -C "$tmp" ;; *.zip) unzip -q "$a" -d "$tmp" ;; esac
  top=("$tmp"/*)
  [ ${#top[@]} -eq 1 ] && [ -d "${top[0]}" ] || { echo "$name: expected one top folder, found ${#top[@]}" >&2; exit 1; }
  rm -rf "${dst:?}/$os"
  mv "${top[0]}" "$dst/$os"
  rmdir "$tmp"
  found=$((found + 1))
  echo "$os: $name, $(find "$dst/$os" -type f | wc -l) files, $(du -sh "$dst/$os" | cut -f1)"
done < <(find "$src" -type f \( -name 'Tidemote-*.zip' -o -name 'Tidemote-*.tar.gz' \) -print0)
[ "$found" -gt 0 ] || { echo "no Tidemote archives under $src" >&2; exit 1; }
# Electron's framework is held together by symlinks; an unzip that flattened them would ship a Mac build
# whose signature no longer verifies.
if [ -d "$dst/mac" ] && [ -z "$(find "$dst/mac" -type l -print -quit)" ]; then
  echo "mac: no symlinks survived unpacking" >&2; exit 1
fi
