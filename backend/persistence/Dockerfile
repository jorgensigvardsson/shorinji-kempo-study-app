# Build context must be backend/ (go.work and shared/ must be in scope)
#   from repo root:           docker build -f backend/persistence/Dockerfile -t sk-persistence backend/
#   from backend/persistence/: docker build -f Dockerfile -t sk-persistence ..

FROM golang:1.26-alpine AS builder

WORKDIR /src
COPY . .

RUN --mount=type=cache,target=/root/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath \
        -ldflags="-s -w" \
        -o /persistence \
        ./persistence

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /persistence /persistence
USER 65534:65534
EXPOSE 8080
ENTRYPOINT ["/persistence"]
