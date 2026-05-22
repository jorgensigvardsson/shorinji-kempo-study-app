package main

import (
	"flag"
	"log"
	"net/http"

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

	log.Printf("listening on %s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
