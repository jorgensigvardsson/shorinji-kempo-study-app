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
	dataDir := flag.String("data-dir", "data", "directory for document storage")
	flag.Parse()

	// "default" is a placeholder key until authentication provides a real user identity.
	s := store.NewFileStore(*dataDir, "default")

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
