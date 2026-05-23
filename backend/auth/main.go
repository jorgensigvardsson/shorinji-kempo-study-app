package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/api"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/provider"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/envutil"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
)

func main() {
	// Flag name                 Env var                        Default
	addr               := flag.String("addr",               envutil.String("SERVICE_LISTEN_ADDRESS",   ":8081"),                              "listen address")
	dataDir            := flag.String("data-dir",           envutil.String("SERVICE_DATA_DIR",         "data"),                               "directory for user storage")
	keyFile            := flag.String("key-file",           envutil.String("SERVICE_KEY_FILE",         "data/signing.key"),                   "RSA private key PEM file (generated if absent)")
	issuer             := flag.String("issuer",             envutil.String("SERVICE_ISSUER",           "http://localhost:8081"),              "JWT issuer URL")
	frontendURL        := flag.String("frontend-url",       envutil.String("SERVICE_FRONTEND_URL",     "http://localhost:5173"),              "frontend URL to redirect to after login")
	googleClientID     := flag.String("google-client-id",   envutil.String("GOOGLE_CLIENT_ID",         ""),                                   "Google OAuth client ID")
	googleClientSecret := flag.String("google-client-secret", envutil.String("GOOGLE_CLIENT_SECRET",   ""),                                   "Google OAuth client secret")
	googleRedirectURI  := flag.String("google-redirect-uri", envutil.String("GOOGLE_REDIRECT_URI",     "http://localhost:8081/auth/callback"), "Google OAuth redirect URI")
	googleDomains      := flag.String("google-domains",     envutil.String("GOOGLE_DOMAINS",           "gmail.com,googlemail.com"),           "comma-separated email domains for Google OIDC")
	rateLimitRPS       := flag.Float64("rate-limit-rps",    envutil.Float64("RATE_LIMIT_RPS",          1.0),                                  "max requests per second per IP (0 = disabled)")
	rateLimitBurst     := flag.Float64("rate-limit-burst",  envutil.Float64("RATE_LIMIT_BURST",        5.0),                                  "rate limit burst size")
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

	limiter := ratelimit.New(*rateLimitRPS, *rateLimitBurst)
	log.Printf("rate limiting: %.1f req/s per IP, burst %d", *rateLimitRPS, int(*rateLimitBurst))

	mux := http.NewServeMux()
	api.NewHandler(providers, domains, userStore, tokenManager, *frontendURL, limiter).Register(mux)

	srv := &http.Server{Addr: *addr, Handler: mux}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
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
