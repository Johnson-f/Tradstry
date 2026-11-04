#!/usr/bin/env bash
# Saves compiled dependencies for the next run. The backend's own artifacts and
# test binaries are dropped first: they're rebuilt every time and would only
# bloat the cache.
set -euo pipefail
cd "${SEMAPHORE_GIT_DIR:?}"

rm -rf backend/target/debug/incremental
for name in tradstry libtradstry $(basename -s .rs backend/tests/*.rs); do
  rm -rf backend/target/debug/deps/"${name:?}"-* backend/target/debug/.fingerprint/"${name:?}"-* backend/target/debug/"${name:?}"
done

cache store "${CARGO_CACHE_KEY}" backend/target
cache store "cargo-${RUST_VERSION}-master" backend/target
