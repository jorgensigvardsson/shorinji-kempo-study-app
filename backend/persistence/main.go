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
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/authclient"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/jwks"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/push"
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
	pushContainer   := flag.String("cosmosdb-push-container", envutil.String("COSMOS_DB_PUSH_CONTAINER", "pushsubscriptions"),                    "Cosmos DB container name for push subscriptions")
	userDataContainer := flag.String("cosmosdb-userdata-container", envutil.String("COSMOS_DB_USERDATA_CONTAINER", "userdata"),                   "Cosmos DB container name for the split-item document store")
	userDataShadow  := flag.Bool("userdata-shadow-writes", envutil.Bool("USERDATA_SHADOW_WRITES", true),                                          "also write every accepted document to the split-item store")
	userDataReads   := flag.Bool("userdata-reads",       envutil.Bool("USERDATA_READS",          false),                                         "serve reads from the split-item store, keeping the original written as the way back (requires the backfill to have run)")
	rateLimitRPS    := flag.Float64("rate-limit-rps",    envutil.Float64("RATE_LIMIT_RPS",        2.0),                                            "max requests per second per IP (0 = disabled)")
	rateLimitBurst  := flag.Float64("rate-limit-burst",  envutil.Float64("RATE_LIMIT_BURST",      10.0),                                           "rate limit burst size")
	vapidPublicKey  := flag.String("vapid-public-key",   envutil.String("VAPID_PUBLIC_KEY",       ""),                                             "VAPID public key (base64url); enables push when set with the private key")
	vapidPrivateKey := flag.String("vapid-private-key",  envutil.String("VAPID_PRIVATE_KEY",      ""),                                             "VAPID private key (base64url)")
	vapidSubject    := flag.String("vapid-subject",      envutil.String("VAPID_SUBJECT",          "mailto:jorgen.sigvardsson@gmail.com"),          "VAPID subject (mailto: or site URL)")
	pushAdminToken  := flag.String("push-admin-token",   envutil.String("PUSH_ADMIN_TOKEN",       ""),                                             "bearer token authorizing POST /push/broadcast")

	flag.Parse()

	var s store.Store
	var pushStore store.PushStore
	// The split-item store the document is migrating to: written alongside the store
	// above, never read from, until the split has proven itself against real data.
	var userDataStore store.UserDataStore
	switch *storage {
	case "file":
		s = store.NewFileStore(*dataDir)
		pushStore = store.NewFilePushStore(*dataDir)
		if *userDataShadow {
			userDataStore = store.NewFileUserDataStore(*dataDir)
		}
	case "cosmosdb":
		if *cosmosEndpoint == "" || *cosmosKey == "" || *cosmosDatabase == "" || *cosmosContainer == "" {
			log.Fatal("cosmosdb backend requires --cosmosdb-endpoint, --cosmosdb-key, --cosmosdb-database, and --cosmosdb-container")
		}
		if err := store.ProvisionCosmos(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosContainer, *pushContainer, *userDataContainer); err != nil {
			log.Fatalf("cosmos provisioning: %v", err)
		}
		cs, err := store.NewCosmosDBStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosContainer)
		if err != nil {
			log.Fatalf("init CosmosDB store: %v", err)
		}
		s = cs
		ps, err := store.NewCosmosPushStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *pushContainer)
		if err != nil {
			log.Fatalf("init CosmosDB push store: %v", err)
		}
		pushStore = ps
		if *userDataShadow {
			uds, err := store.NewCosmosUserDataStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *userDataContainer)
			if err != nil {
				log.Fatalf("init CosmosDB user data store: %v", err)
			}
			userDataStore = uds
		}
	default:
		log.Fatalf("unknown storage backend %q (choose file or cosmosdb)", *storage)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Non-fatal by design: a JWKS endpoint that is briefly unreachable must not
	// take the service down permanently. See jwks.Cache.Start.
	keyCache := jwks.NewCache(*jwksURL)
	keyCache.Start(ctx)

	limiter := ratelimit.New(*rateLimitRPS, *rateLimitBurst)
	log.Printf("rate limiting: %.1f req/s per IP, burst %d", *rateLimitRPS, int(*rateLimitBurst))

	handler := api.NewHandler(s, keyCache, *frontendURL, *authIssuerURL, limiter)
	if *vapidPublicKey != "" && *vapidPrivateKey != "" {
		sender := push.New(*vapidPublicKey, *vapidPrivateKey, *vapidSubject)
		handler.WithPush(pushStore, sender, *pushAdminToken, authclient.New(*authIssuerURL))
		log.Printf("push notifications enabled (broadcast %s)",
			map[bool]string{true: "authorized via PUSH_ADMIN_TOKEN", false: "disabled — no PUSH_ADMIN_TOKEN"}[*pushAdminToken != ""])
	} else {
		log.Print("push notifications disabled — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable")
	}

	if userDataStore != nil {
		handler.WithUserDataShadow(userDataStore)
		if *userDataReads {
			handler.WithUserDataReads()
			log.Print("user data: reading from the split-item store; the original container is kept written as the way back")
		} else {
			log.Print("user data: writing the split-item store, still reading from the original")
		}
	} else {
		log.Print("user data: split-item store disabled")
	}

	mux := http.NewServeMux()
	handler.Register(mux)

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
