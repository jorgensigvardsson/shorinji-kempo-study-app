# Build context must be backend/ (go.work and shared/ must be in scope)
#   from repo root:      docker build -f backend/auth/Dockerfile -t sk-auth backend/
#   from backend/auth/:  docker build -f Dockerfile -t sk-auth ..

FROM golang:1.26-alpine AS builder

WORKDIR /src
COPY . .

RUN --mount=type=cache,target=/root/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath \
        -ldflags="-s -w" \
        -o /auth \
        ./auth

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /auth /auth
USER 65534:65534
EXPOSE 8081
ENTRYPOINT ["/auth"]
