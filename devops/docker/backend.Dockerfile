# syntax=docker/dockerfile:1
# Multistage: build the Rust backend and the JS projector, then a thin runtime image.

FROM rust:1.99-bookworm AS chef
RUN cargo install cargo-chef --locked
RUN apt-get update && apt-get install -y pkg-config libssl-dev mold && rm -rf /var/lib/apt/lists/*
# mold links the large backend binary far faster than the default GNU ld. Set here so
# the dependency cook and the final build share identical flags; any difference
# would make cargo rebuild every dependency.
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"
WORKDIR /app

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY build.rs ./
COPY proto ./proto
COPY src ./src
COPY database ./database
COPY migration ./migration
RUN cargo chef prepare --recipe-path recipe.json

# Compiled dependencies only. Its own target so CI can cache this layer, which changes
# only with Cargo.lock, without exporting the per-commit source and build layers.
FROM chef AS deps
COPY --from=planner /app/recipe.json recipe.json
# Cook exactly the packages and binaries the builder compiles. Cooking the whole
# workspace resolves different dependency features, and the final build would then
# recompile every dependency whose features differ.
RUN cargo chef cook --release --recipe-path recipe.json \
    -p tradstry-backend --bin tradstry-backend

FROM deps AS builder
COPY Cargo.toml Cargo.lock ./
COPY build.rs ./
COPY proto ./proto
COPY src ./src
COPY database ./database
COPY migration ./migration
COPY schema ./schema
RUN cargo build --release -p tradstry-backend --bin tradstry-backend

# Projector: Build JS projection (needs bun, node_modules, shared schema).
FROM oven/bun:1.3.13-slim AS projector-deps
WORKDIR /projector
COPY projector/package.json projector/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY projector/*.mjs ./
COPY --from=notebook-core . /core
# Two generated bundles, mirroring `bun run sync-core`: seed.mjs imports the seed bundle,
# nodes/markdown import the core one. The .gen.mjs files are untracked build artifacts, so
# CI's git checkout never has them — they MUST be regenerated here, both of them. yjs stays
# external so the seed's Y.Doc uses the one copy in node_modules, not a second bundled one.
RUN bun build /core/src/index.ts --target=bun --format=esm \
      --outfile notebook-core.gen.mjs --external lexical --external '@lexical/*' --external yjs \
 && bun build /core/src/seed.ts --target=bun --format=esm \
      --outfile notebook-seed.gen.mjs --external lexical --external '@lexical/*' --external yjs

FROM debian:bookworm-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg && rm -rf /var/lib/apt/lists/*
# Bun pinned for Lexical ESM compatibility.
COPY --from=oven/bun:1.3.13-slim /usr/local/bin/bun /usr/local/bin/bun
RUN useradd --create-home appuser
RUN mkdir -p /run/tradstry && chown appuser:appuser /run/tradstry
USER appuser
WORKDIR /home/appuser
COPY --from=builder /app/target/release/tradstry-backend .
COPY --from=projector-deps --chown=appuser:appuser /projector ./projector

ENV RUST_LOG=info
ENV RUST_BACKTRACE=1
EXPOSE 7899
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -sf http://localhost:7899/ || test $? -eq 22
CMD ["./tradstry-backend"]
