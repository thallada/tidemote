#!/usr/bin/env bash
# The release workflow's artifacts (desktop-windows/, desktop-mac/, desktop-linux/, each an archive with
# one top folder) unpacked as CONTENT/windows/, CONTENT/mac/, CONTENT/linux/: what goes into each
# Steam depot and itch.io channel.
#   bash desktop/scripts/unpack-artifacts.sh ARTIFACTS CONTENT
set -euo pipefail
src=$1 dst=$2
mkdir -p "$dst"
for dir in "$src"/desktop-*/; do
  os=$(basename "$dir"); os=${os#desktop-}
  tmp=$(mktemp -d)
  shopt -s nullglob
  for a in "$dir"Tidemote-*.tar.gz; do tar -xzf "$a" -C "$tmp"; done
  for a in "$dir"Tidemote-*.zip; do unzip -q "$a" -d "$tmp"; done
  shopt -u nullglob
  top=("$tmp"/*)
  [ ${#top[@]} -eq 1 ] && [ -d "${top[0]}" ] || { echo "desktop-$os: expected one top folder, found ${#top[@]}" >&2; exit 1; }
  rm -rf "${dst:?}/$os"
  mv "${top[0]}" "$dst/$os"
  rmdir "$tmp"
  echo "$os: $(find "$dst/$os" -type f | wc -l) files, $(du -sh "$dst/$os" | cut -f1)"
done
# Electron's framework is held together by symlinks; an unzip that flattened them would ship a Mac build
# whose signature no longer verifies.
if [ -d "$dst/mac" ] && [ -z "$(find "$dst/mac" -type l -print -quit)" ]; then
  echo "mac: no symlinks survived unpacking" >&2; exit 1
fi
