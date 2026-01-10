#!/usr/bin/env bash
set -euo pipefail

VERSION="${SQLITE_VEC_VERSION:-0.1.6}"
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux) PLATFORM="linux" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_TAG="x86_64" ;;
  arm64|aarch64) ARCH_TAG="aarch64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

case "$PLATFORM" in
  windows) LIB_NAME="vec0.dll" ;;
  macos) LIB_NAME="vec0.dylib" ;;
  linux) LIB_NAME="vec0.so" ;;
esac

ASSET="sqlite-vec-${VERSION}-loadable-${PLATFORM}-${ARCH_TAG}.tar.gz"
URL="https://github.com/asg017/sqlite-vec/releases/download/v${VERSION}/${ASSET}"

case "$PLATFORM" in
  windows)
    if [[ -z "${APPDATA:-}" ]]; then
      echo "APPDATA is not set; unable to resolve SpellbookVault path." >&2
      exit 1
    fi
    DATA_DIR="${APPDATA}/SpellbookVault"
    ;;
  macos)
    DATA_DIR="${HOME}/Library/Application Support/SpellbookVault"
    ;;
  linux)
    DATA_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/SpellbookVault"
    ;;
esac

mkdir -p "$DATA_DIR"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Downloading ${URL}"
curl -fsSL "$URL" -o "${TMP_DIR}/${ASSET}"
tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"

if [[ ! -f "${TMP_DIR}/${LIB_NAME}" ]]; then
  echo "Expected ${LIB_NAME} in archive, but it was not found." >&2
  exit 1
fi

cp "${TMP_DIR}/${LIB_NAME}" "${DATA_DIR}/${LIB_NAME}"
chmod 755 "${DATA_DIR}/${LIB_NAME}"

echo "Installed ${LIB_NAME} to ${DATA_DIR}"
