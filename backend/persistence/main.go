package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/api"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/jwks"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/envutil"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
)

func main() {
	// Flag name             Env var                    Default
	addr            := flag.String("addr",               envutil.String("SERVICE_LISTEN_ADDRESS", ":8080"),                                        "listen address")
	storage         := flag.String("storage",            envutil.String("SERVICE_STORAGE",        "file"),                                         "storage backend: file | cosmosdb")
	dataDir         := flag.String("data-dir",           envutil.String("SERVICE_DATA_DIR",       "data"),                                         "directory for document storage (file backend)")
	frontendURL     := flag.String("frontend-url",       envutil.String("SERVICE_FRONTEND_URL",   "http://localhost:5173"),                        "frontend origin for CORS")
	jwksURL         := flag.String("jwks-url",           envutil.String("AUTH_JWKS_URL",          "http://localhost:8081/.well-known/jwks.json"),  "auth service JWKS endpoint")
	authIssuerURL   := flag.String("auth-issuer-url",    envutil.String("AUTH_ISSUER_URL",         "http://localhost:8081"),                         "expected JWT issuer (must match auth service SERVICE_ISSUER)")
	cosmosEndpoint  := flag.String("cosmosdb-endpoint",  envutil.String("COSMOS_DB_ENDPOINT",     ""),                                             "Cosmos DB account endpoint URL")
	cosmosKey       := flag.String("cosmosdb-key",       envutil.String("COSMOS_DB_KEY",          ""),                                             "Cosmos DB account key")
	cosmosDatabase  := flag.String("cosmosdb-database",  envutil.String("COSMOS_DB_DATABASE",     ""),                                             "Cosmos DB database name")
	cosmosContainer := flag.String("cosmosdb-container", envutil.String("COSMOS_DB_CONTAINER",    ""),                                             "Cosmos DB container name")
	rateLimitRPS    := flag.Float64("rate-limit-rps",    envutil.Float64("RATE_LIMIT_RPS",        2.0),                                            "max requests per second per IP (0 = disabled)")
	rateLimitBurst  := flag.Float64("rate-limit-burst",  envutil.Float64("RATE_LIMIT_BURST",      10.0),                                           "rate limit burst size")

	flag.Parse()

	var s store.Store
	switch *storage {
	case "file":
		s = store.NewFileStore(*dataDir)
	case "cosmosdb":
		if *cosmosEndpoint == "" || *cosmosKey == "" || *cosmosDatabase == "" || *cosmosContainer == "" {
			log.Fatal("cosmosdb backend requires --cosmosdb-endpoint, --cosmosdb-key, --cosmosdb-database, and --cosmosdb-container")
		}
		if err := store.ProvisionCosmos(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosContainer); err != nil {
			log.Fatalf("cosmos provisioning: %v", err)
		}
		cs, err := store.NewCosmosDBStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosContainer)
		if err != nil {
			log.Fatalf("init CosmosDB store: %v", err)
		}
		s = cs
	default:
		log.Fatalf("unknown storage backend %q (choose file or cosmosdb)", *storage)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	keyCache := jwks.NewCache(*jwksURL)
	if err := keyCache.Start(ctx); err != nil {
		log.Fatalf("jwks: initial fetch from %s failed: %v", *jwksURL, err)
	}

	limiter := ratelimit.New(*rateLimitRPS, *rateLimitBurst)
	log.Printf("rate limiting: %.1f req/s per IP, burst %d", *rateLimitRPS, int(*rateLimitBurst))

	mux := http.NewServeMux()
	api.NewHandler(s, keyCache, *frontendURL, *authIssuerURL, limiter).Register(mux)

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Printf("listening on %s", *addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
	log.Println("stopped")
}
