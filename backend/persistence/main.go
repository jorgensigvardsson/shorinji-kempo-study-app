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
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

// env returns the value of an environment variable, or fallback if not set.
// Flags defined with env() as their default value automatically honour both
// sources: the env var sets the default, a CLI flag overrides it.
func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func main() {
	// Flag name            Env var                    Default
	addr            := flag.String("addr",               env("SERVICE_LISTEN_ADDRESS", ":8080"), "listen address")
	storage         := flag.String("storage",            env("SERVICE_STORAGE",        "file"),  "storage backend: file | cosmosdb")
	dataDir         := flag.String("data-dir",           env("SERVICE_DATA_DIR",       "data"),  "directory for document storage (file backend)")
	cosmosEndpoint  := flag.String("cosmosdb-endpoint",  env("COSMOS_DB_ENDPOINT",     ""),      "Cosmos DB account endpoint URL")
	cosmosKey       := flag.String("cosmosdb-key",       env("COSMOS_DB_KEY",          ""),      "Cosmos DB account key")
	cosmosDatabase  := flag.String("cosmosdb-database",  env("COSMOS_DB_DATABASE",     ""),      "Cosmos DB database name")
	cosmosContainer := flag.String("cosmosdb-container", env("COSMOS_DB_CONTAINER",    ""),      "Cosmos DB container name")

	flag.Parse()

	var s store.Store
	switch *storage {
	case "file":
		// "default" is a placeholder key until authentication provides a real user identity.
		s = store.NewFileStore(*dataDir, "default")
	case "cosmosdb":
		if *cosmosEndpoint == "" || *cosmosKey == "" || *cosmosDatabase == "" || *cosmosContainer == "" {
			log.Fatal("cosmosdb backend requires --cosmosdb-endpoint, --cosmosdb-key, --cosmosdb-database, and --cosmosdb-container")
		}
		s = store.NewCosmosDBStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosContainer)
	default:
		log.Fatalf("unknown storage backend %q (choose file or cosmosdb)", *storage)
	}

	mux := http.NewServeMux()
	api.NewHandler(s).Register(mux)

	srv := &http.Server{Addr: *addr, Handler: mux}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("listening on %s", *addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	stop() // unregister signal handler so a second Ctrl+C kills immediately
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
	log.Println("stopped")
}
