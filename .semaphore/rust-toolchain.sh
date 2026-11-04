# Sourced by CI: installs the Rust version the Dockerfile pins, so checks and
# the image always build with the same compiler.
RUST_VERSION="$(sed -n 's/^ARG RUST_VERSION=//p' Dockerfile)"
export RUST_VERSION
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none
fi
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.cargo/env"
fi
rustup toolchain install "$RUST_VERSION" --profile minimal --component rustfmt,clippy
rustup default "$RUST_VERSION"
