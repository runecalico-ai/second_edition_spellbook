#!/usr/bin/env bash
# Linux release bundles. Prepend a PATH wrapper so linuxdeploy's patchelf does
# not rewrite bundled sqlite-vec (vec0.so), which would diverge AppImage vs deb.
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
wrapper="$script_dir/patchelf-skip-sqlite-vec"

if [[ ! -f "$wrapper" ]]; then
  echo "tauri_build_linux: missing $wrapper" >&2
  exit 1
fi
chmod +x "$wrapper" 2>/dev/null || true

wrap_dir="$(mktemp -d "${TMPDIR:-/tmp}/patchelf-skip.XXXXXX")"
cleanup() {
  rm -rf "$wrap_dir"
}
trap cleanup EXIT

ln -sf "$wrapper" "$wrap_dir/patchelf"
# linuxdeploy looks up `patchelf` on PATH and also honors $PATCHELF. Set both:
# AppImage runtime may prepend its bundled usr/bin/patchelf ahead of PATH.
export PATH="$wrap_dir:$PATH"
export PATCHELF="$wrap_dir/patchelf"

echo "tauri_build_linux: using patchelf wrapper at $wrap_dir/patchelf (PATCHELF=$PATCHELF)" >&2

tauri build --bundles appimage,deb --config src-tauri/tauri.release.conf.json "$@"
