# The Go MCP server: a static binary on Alpine, run as a non-root user.

FROM golang:1.27.2-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Only the server is built; the test helpers that read the backend's schema
# are not part of it, so this context needs nothing outside the module.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-w -s' -o tradstry-mcp .

FROM alpine:3.24.1
# Certificates for Stytch's signing keys and the Tradstry API; curl for the
# healthcheck and the deploy script's health probe.
RUN apk --no-cache add ca-certificates curl tzdata \
 && addgroup -g 1000 appuser \
 && adduser -D -u 1000 -G appuser appuser
WORKDIR /app
COPY --from=builder /build/tradstry-mcp .
USER appuser

ENV MCP_BIND_ADDR=0.0.0.0:7900
EXPOSE 7900
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://localhost:7900/health || exit 1
CMD ["./tradstry-mcp"]
