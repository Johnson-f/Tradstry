# syntax=docker/dockerfile:1

# The backend as one static binary on an empty image.
#   docker build -t tradstry-backend .
#   docker run --env-file backend/.env -p 7900:7900 tradstry-backend
# Migrations are compiled into the binary and run on startup.

ARG RUST_VERSION=1.99.1
ARG ALPINE_VERSION=3.24

FROM rust:${RUST_VERSION}-alpine${ALPINE_VERSION} AS chef
RUN apk add --no-cache musl-dev ca-certificates
RUN cargo install cargo-chef --version 0.1.78 --locked
WORKDIR /app

FROM chef AS planner
COPY backend/ .
RUN cargo chef prepare --recipe-path recipe.json

# Dependencies build in their own stage, reused until Cargo.toml or Cargo.lock
# change. CI caches this stage alone.
FROM chef AS deps
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --locked --recipe-path recipe.json

FROM deps AS build
COPY backend/ .
RUN cargo build --release --locked --bin tradstry

FROM scratch AS backend
LABEL org.opencontainers.image.source=https://github.com/Johnson-f/Tradstry
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /app/target/release/tradstry /tradstry
USER 65532:65532
ENV PORT=7900 RUST_LOG=info
EXPOSE 7900
ENTRYPOINT ["/tradstry"]
