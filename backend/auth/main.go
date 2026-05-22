package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/api"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/provider"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func main() {
	// Flag name                 Env var                        Default
	addr               := flag.String("addr",               env("SERVICE_LISTEN_ADDRESS",   ":8081"),                             "listen address")
	dataDir            := flag.String("data-dir",           env("SERVICE_DATA_DIR",         "data"),                              "directory for user storage")
	keyFile            := flag.String("key-file",           env("SERVICE_KEY_FILE",         "data/signing.key"),                  "RSA private key PEM file (generated if absent)")
	issuer             := flag.String("issuer",             env("SERVICE_ISSUER",           "http://localhost:8081"),             "JWT issuer URL")
	frontendURL        := flag.String("frontend-url",       env("SERVICE_FRONTEND_URL",     "http://localhost:5173"),             "frontend URL to redirect to after login")
	googleClientID     := flag.String("google-client-id",   env("GOOGLE_CLIENT_ID",         ""),                                  "Google OAuth client ID")
	googleClientSecret := flag.String("google-client-secret", env("GOOGLE_CLIENT_SECRET",   ""),                                  "Google OAuth client secret")
	googleRedirectURI  := flag.String("google-redirect-uri", env("GOOGLE_REDIRECT_URI",     "http://localhost:8081/auth/callback"), "Google OAuth redirect URI")
	// Comma-separated email domains that route to the Google provider.
	// Default covers both consumer Gmail domain variants.
	googleDomains      := flag.String("google-domains",     env("GOOGLE_DOMAINS",           "gmail.com,googlemail.com"),          "comma-separated email domains for Google OIDC")
	flag.Parse()

	key, err := token.LoadOrGenerateKey(*keyFile)
	if err != nil {
		log.Fatalf("load/generate signing key: %v", err)
	}
	log.Println("signing key loaded")

	tokenManager := token.NewManager(key, *issuer)
	userStore := store.NewFileUserStore(*dataDir)

	providers := make(map[string]provider.Provider)
	domains := make(map[string]string) // email domain → provider name

	if *googleClientID != "" && *googleClientSecret != "" {
		g, err := provider.NewGoogle(context.Background(), *googleClientID, *googleClientSecret, *googleRedirectURI)
		if err != nil {
			log.Fatalf("init Google provider: %v", err)
		}
		providers["google"] = g
		for _, d := range splitDomains(*googleDomains) {
			domains[d] = "google"
		}
		log.Printf("Google OIDC provider enabled (domains: %s)", *googleDomains)
	} else {
		log.Println("Google OIDC provider disabled (set --google-client-id and --google-client-secret to enable)")
	}

	mux := http.NewServeMux()
	api.NewHandler(providers, domains, userStore, tokenManager, *frontendURL).Register(mux)

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
	stop()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
	log.Println("stopped")
}

func splitDomains(s string) []string {
	var out []string
	for _, d := range strings.Split(s, ",") {
		if d = strings.TrimSpace(strings.ToLower(d)); d != "" {
			out = append(out, d)
		}
	}
	return out
}
