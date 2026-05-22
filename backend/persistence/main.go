package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/api"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/jwks"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func main() {
	// Flag name             Env var                    Default
	addr            := flag.String("addr",               env("SERVICE_LISTEN_ADDRESS", ":8080"),                        "listen address")
	storage         := flag.String("storage",            env("SERVICE_STORAGE",        "file"),                         "storage backend: file | cosmosdb")
	dataDir         := flag.String("data-dir",           env("SERVICE_DATA_DIR",       "data"),                         "directory for document storage (file backend)")
	frontendURL     := flag.String("frontend-url",       env("SERVICE_FRONTEND_URL",   "http://localhost:5173"),        "frontend origin for CORS")
	jwksURL         := flag.String("jwks-url",           env("AUTH_JWKS_URL",          "http://localhost:8081/.well-known/jwks.json"), "auth service JWKS endpoint")
	cosmosEndpoint  := flag.String("cosmosdb-endpoint",  env("COSMOS_DB_ENDPOINT",     ""),                             "Cosmos DB account endpoint URL")
	cosmosKey       := flag.String("cosmosdb-key",       env("COSMOS_DB_KEY",          ""),                             "Cosmos DB account key")
	cosmosDatabase  := flag.String("cosmosdb-database",  env("COSMOS_DB_DATABASE",     ""),                             "Cosmos DB database name")
	cosmosContainer := flag.String("cosmosdb-container", env("COSMOS_DB_CONTAINER",    ""),                             "Cosmos DB container name")

	flag.Parse()

	var s store.Store
	switch *storage {
	case "file":
		s = store.NewFileStore(*dataDir)
	case "cosmosdb":
		if *cosmosEndpoint == "" || *cosmosKey == "" || *cosmosDatabase == "" || *cosmosContainer == "" {
			log.Fatal("cosmosdb backend requires --cosmosdb-endpoint, --cosmosdb-key, --cosmosdb-database, and --cosmosdb-container")
		}
		s = store.NewCosmosDBStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosContainer)
	default:
		log.Fatalf("unknown storage backend %q (choose file or cosmosdb)", *storage)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	keyCache := jwks.NewCache(*jwksURL)
	if err := keyCache.Start(ctx); err != nil {
		log.Fatalf("jwks: initial fetch from %s failed: %v", *jwksURL, err)
	}

	mux := http.NewServeMux()
	api.NewHandler(s, keyCache, *frontendURL).Register(mux)

	srv := &http.Server{Addr: *addr, Handler: mux}

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
