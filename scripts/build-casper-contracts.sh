#!/usr/bin/env bash
# Build both Casper contracts into install-ready Wasm.
#
# The raw `cargo build` artifact is NOT installable on casper-test: it exceeds
# the install lane limit and contains sign-extension opcodes that the MVP-only
# Casper VM rejects (installs fail late with `ApiError::InvalidArgument [3]`
# after burning the full payment). wasm-opt with `--mvp-features
# --signext-lowering` is therefore part of the build, not an optimization.
#
# Optional env:
#   TOOLCHAIN   default: nightly-2025-03-01
#   TARGET      default: wasm32v1-none
#   MAX_BYTES   default: 100000 (installs observed to fail well above this)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLCHAIN="${TOOLCHAIN:-nightly-2025-03-01}"
TARGET="${TARGET:-wasm32v1-none}"
MAX_BYTES="${MAX_BYTES:-100000}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "FAIL: cargo not found on PATH" >&2
  exit 2
fi

build_contract() {
  local crate="$1" artifact="$2"
  local manifest="$ROOT/contracts/$crate/Cargo.toml"
  local target_dir="$ROOT/contracts/$crate/target"
  local raw="$target_dir/$TARGET/release/$artifact.wasm"
  local out_dir="$ROOT/contracts/$crate/wasm"
  local out="$out_dir/$artifact.wasm"

  echo "[casper] build $crate"
  CARGO_TARGET_DIR="$target_dir" cargo "+$TOOLCHAIN" build \
    --manifest-path "$manifest" --release --target "$TARGET"

  mkdir -p "$out_dir"
  echo "[casper] optimize $crate (MVP-only features)"
  npx --yes --package=binaryen wasm-opt -Oz \
    --mvp-features --signext-lowering --strip-debug --strip-producers \
    "$raw" -o "$out"

  local size
  size="$(wc -c <"$out" | tr -d ' ')"
  if [[ "$size" -gt "$MAX_BYTES" ]]; then
    echo "FAIL: $artifact.wasm is ${size}B (> ${MAX_BYTES}B); install would revert" >&2
    exit 1
  fi
  echo "[casper] $artifact.wasm ${size}B ok"
}

build_contract "casper-decision-proof" "casper-decision-proof"
build_contract "collateral-vault" "collateral-vault"

echo "[casper] contracts built into contracts/*/wasm/"
