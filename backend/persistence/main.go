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

func main() {
	addr := flag.String("addr", ":8080", "listen address")

	// Storage backend selection
	storage := flag.String("storage", "file", "storage backend: file | cosmosdb")

	// File backend flags
	dataDir := flag.String("data-dir", "data", "directory for document storage (file backend)")

	// CosmosDB backend flags
	cosmosEndpoint  := flag.String("cosmosdb-endpoint", "", "Cosmos DB account endpoint URL")
	cosmosKey       := flag.String("cosmosdb-key", "", "Cosmos DB account key")
	cosmosDatabase  := flag.String("cosmosdb-database", "", "Cosmos DB database name")
	cosmosContainer := flag.String("cosmosdb-container", "", "Cosmos DB container name")

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
