#!/usr/bin/env bash
# Tests for scripts/patchelf-skip-sqlite-vec: skip sqlite-vec ELFs, forward others.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$ROOT/patchelf-skip-sqlite-vec"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

if [[ ! -f "$WRAPPER" ]]; then
  fail "wrapper missing: $WRAPPER"
fi
if [[ ! -x "$WRAPPER" ]]; then
  fail "wrapper is not executable: $WRAPPER"
fi

WORKDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

LOG="$WORKDIR/patchelf.log"
FAKE_BIN="$WORKDIR/fakebin"
mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/patchelf" <<EOF
#!/bin/sh
{
  printf 'called'
  for _arg in "\$@"; do
    printf ' %s' "\$_arg"
  done
  printf '\n'
} >> "$LOG"
exit 0
EOF
chmod +x "$FAKE_BIN/patchelf"

export PATH="$FAKE_BIN:$PATH"

run_wrapper() {
  "$WRAPPER" "$@"
}

assert_not_called() {
  if [[ -s "$LOG" ]]; then
    fail "$1 still invoked real patchelf: $(cat "$LOG")"
  fi
}

assert_called_with() {
  local needle="$1"
  local msg="$2"
  if ! grep -F -- "$needle" "$LOG" >/dev/null; then
    fail "$msg (log: $(cat "$LOG" 2>/dev/null || echo empty))"
  fi
}

# 1. Skip when an argument is a vec0.so path (linuxdeploy --set-rpath style).
: > "$LOG"
skip_out="$(run_wrapper --set-rpath '$ORIGIN' /tmp/Spellbook.AppDir/usr/lib/Spellbook/resources/sqlite-vec/vec0.so 2>&1)"
assert_not_called "vec0.so skip"
echo "$skip_out" | grep -qi 'skip' || fail "vec0.so skip did not print a skip message: $skip_out"
pass "skips patchelf when ELF path is vec0.so"

# 2. Skip dll and dylib names too.
: > "$LOG"
run_wrapper --set-rpath '$ORIGIN' ./vec0.dll >/dev/null
assert_not_called "vec0.dll skip"
: > "$LOG"
run_wrapper /opt/lib/vec0.dylib >/dev/null
assert_not_called "vec0.dylib skip"
pass "skips vec0.dll and vec0.dylib"

# 3. Forward other ELFs to the real patchelf with the same arguments.
: > "$LOG"
run_wrapper --set-rpath '$ORIGIN' /tmp/Spellbook.AppDir/usr/lib/libwebkit.so
assert_called_with "called --set-rpath \$ORIGIN /tmp/Spellbook.AppDir/usr/lib/libwebkit.so" \
  "did not forward other ELF to real patchelf"
pass "forwards other ELFs to real patchelf"

# 4. PATH-as-patchelf: linuxdeploy looks up \`patchelf\` on PATH. Wrapper dir
# must be stripped so the real binary is found, and vec0.so is still skipped.
WRAP_BIN="$WORKDIR/wrapbin"
mkdir -p "$WRAP_BIN"
ln -s "$WRAPPER" "$WRAP_BIN/patchelf"
export PATH="$WRAP_BIN:$FAKE_BIN:/usr/bin:/bin"

: > "$LOG"
patchelf --set-rpath '$ORIGIN' /tmp/AppDir/usr/lib/Spellbook/resources/sqlite-vec/vec0.so >/dev/null
assert_not_called "PATH-as-patchelf vec0.so skip"
pass "PATH-named patchelf skips vec0.so"

: > "$LOG"
patchelf --set-rpath '$ORIGIN/../lib' /tmp/AppDir/usr/bin/spellbook-desktop
assert_called_with "called --set-rpath \$ORIGIN/../lib /tmp/AppDir/usr/bin/spellbook-desktop" \
  "PATH-named patchelf did not forward other ELF"
pass "PATH-named patchelf forwards other ELFs"

echo "All patchelf-skip-sqlite-vec tests passed."
