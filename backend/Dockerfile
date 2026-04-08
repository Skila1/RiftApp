# Runtime needs DATABASE_URL, REDIS_URL, S3_*, JWT_SECRET, ALLOWED_ORIGINS, LIVEKIT_* from the environment.
# Do not rely on localhost defaults for production deploys.

FROM golang:1.25-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /riftapp ./cmd/riftapp

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata curl && \
    adduser -D -H -u 65532 appuser
COPY --from=builder --chown=65532:65532 /riftapp /riftapp
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -sf http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/riftapp"]
