package main

import (
	"context"
	"crypto/rsa"
	"flag"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/api"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/email"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/org"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/provider"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/envutil"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
)

func main() {
	// ── General ───────────────────────────────────────────────────────────────
	addr        := flag.String("addr",         envutil.String("SERVICE_LISTEN_ADDRESS", ":8081"),                "listen address")
	dataDir     := flag.String("data-dir",     envutil.String("SERVICE_DATA_DIR",       "data"),                 "directory for file-based storage")
	keyFile     := flag.String("key-file",     envutil.String("SERVICE_KEY_FILE",       "data/signing.key"),     "RSA private key PEM file (generated if absent)")
	keyPEM      := flag.String("key-pem",      envutil.String("SERVICE_KEY_PEM",        ""),                     "RSA private key as PEM string (overrides --key-file; use for secret injection in ACA)")
	issuer      := flag.String("issuer",       envutil.String("SERVICE_ISSUER",         "http://localhost:8081"), "JWT issuer URL")
	frontendURL  := flag.String("frontend-url",  envutil.String("SERVICE_FRONTEND_URL",  "http://localhost:5173"), "frontend origin to redirect to after login")
	cookieDomain := flag.String("cookie-domain", envutil.String("SERVICE_COOKIE_DOMAIN", ""),                     "domain attribute for auth cookies (e.g. .app.shorinjikempo.net for cross-subdomain sharing)")

	// ── Cosmos DB ─────────────────────────────────────────────────────────────
	cosmosEndpoint          := flag.String("cosmos-endpoint",               envutil.String("COSMOS_ENDPOINT",               ""),               "Cosmos DB account endpoint (enables Cosmos stores when set)")
	cosmosKey               := flag.String("cosmos-key",                    envutil.String("COSMOS_KEY",                    ""),               "Cosmos DB account key")
	cosmosDatabase          := flag.String("cosmos-database",               envutil.String("COSMOS_DATABASE",               "shorinji"),       "Cosmos DB database name")
	cosmosUsersContainer    := flag.String("cosmos-users-container",        envutil.String("COSMOS_USERS_CONTAINER",        "users"),          "Cosmos container for user records")
	cosmosIdentityContainer := flag.String("cosmos-identity-index-container", envutil.String("COSMOS_IDENTITY_INDEX_CONTAINER", "identity_index"), "Cosmos container for identity index")
	cosmosTokensContainer   := flag.String("cosmos-tokens-container",       envutil.String("COSMOS_TOKENS_CONTAINER",       "refresh_tokens"), "Cosmos container for refresh tokens")
	cosmosRolesContainer    := flag.String("cosmos-roles-container",        envutil.String("COSMOS_ROLES_CONTAINER",        "roles"),          "Cosmos container for role assignments")
	cosmosOrgsContainer     := flag.String("cosmos-orgs-container",         envutil.String("COSMOS_ORGS_CONTAINER",         "organizations"),  "Cosmos container for the organization tree")
	cosmosJoinContainer     := flag.String("cosmos-join-requests-container", envutil.String("COSMOS_JOIN_REQUESTS_CONTAINER", "joinrequests"),   "Cosmos container for pending join requests")

	// ── OIDC Providers ────────────────────────────────────────────────────────
	googleClientID        := flag.String("google-client-id",        envutil.String("GOOGLE_CLIENT_ID",        ""),                                   "Google OAuth client ID")
	googleClientSecret    := flag.String("google-client-secret",    envutil.String("GOOGLE_CLIENT_SECRET",    ""),                                   "Google OAuth client secret")
	googleRedirectURI     := flag.String("google-redirect-uri",     envutil.String("GOOGLE_REDIRECT_URI",     "http://localhost:8081/auth/callback"), "Google OAuth redirect URI")
	googleDomains         := flag.String("google-domains",          envutil.String("GOOGLE_DOMAINS",          "gmail.com,googlemail.com"),            "comma-separated email domains for Google OIDC")
	microsoftClientID     := flag.String("microsoft-client-id",     envutil.String("MICROSOFT_CLIENT_ID",     ""),                                   "Microsoft OAuth client ID")
	microsoftClientSecret := flag.String("microsoft-client-secret", envutil.String("MICROSOFT_CLIENT_SECRET", ""),                                   "Microsoft OAuth client secret")
	microsoftRedirectURI  := flag.String("microsoft-redirect-uri",  envutil.String("MICROSOFT_REDIRECT_URI",  "http://localhost:8081/auth/callback"), "Microsoft OAuth redirect URI")
	microsoftDomains      := flag.String("microsoft-domains",       envutil.String("MICROSOFT_DOMAINS",       "outlook.com,hotmail.com,live.com,msn.com"), "comma-separated email domains for Microsoft OIDC")

	// ── Email (SMTP) ──────────────────────────────────────────────────────────
	smtpHost     := flag.String("smtp-host",     envutil.String("SMTP_HOST",     ""),          "SMTP relay hostname (enables email sending when set together with --smtp-from)")
	smtpPort     := flag.String("smtp-port",     envutil.String("SMTP_PORT",     "587"),       "SMTP relay port (587 for starttls, 465 for implicit TLS)")
	smtpUsername := flag.String("smtp-username", envutil.String("SMTP_USERNAME", ""),          "SMTP username (empty disables authentication)")
	smtpPassword := flag.String("smtp-password", envutil.String("SMTP_PASSWORD", ""),          "SMTP password")
	smtpFrom     := flag.String("smtp-from",     envutil.String("SMTP_FROM",     ""),          "sender address, optionally with a display name: \"Shorinji Kempo <noreply@example.com>\"")
	smtpTLS      := flag.String("smtp-tls",      envutil.String("SMTP_TLS",      "starttls"),  "connection security: starttls (explicit, port 587), implicit (SMTPS, port 465), or none")

	// ── Feedback ──────────────────────────────────────────────────────────────
	feedbackEmail := flag.String("feedback-email", envutil.String("FEEDBACK_EMAIL", ""), "comma-separated recipient(s) for POST /auth/feedback (empty disables the endpoint)")

	// ── Rate limiting ─────────────────────────────────────────────────────────
	rateLimitRPS   := flag.Float64("rate-limit-rps",   envutil.Float64("RATE_LIMIT_RPS",   1.0), "max requests per second per IP (0 = disabled)")
	rateLimitBurst := flag.Float64("rate-limit-burst", envutil.Float64("RATE_LIMIT_BURST", 5.0), "rate limit burst size")

	flag.Parse()

	// ── Signing key ───────────────────────────────────────────────────────────
	var signingKey *rsa.PrivateKey
	if *keyPEM != "" {
		k, err := token.LoadKeyFromPEM(*keyPEM)
		if err != nil {
			log.Fatalf("parse key-pem: %v", err)
		}
		signingKey = k
		log.Println("signing key loaded from PEM env var")
	} else {
		k, err := token.LoadOrGenerateKey(*keyFile)
		if err != nil {
			log.Fatalf("load/generate signing key: %v", err)
		}
		signingKey = k
		log.Println("signing key loaded from file")
	}
	tokenManager := token.NewManager(signingKey, *issuer)

	// ── Stores (file-based by default; Cosmos when endpoint is configured) ────
	var userStore      store.UserStore
	var refreshStore   store.RefreshTokenStore
	var roleStore      store.RoleStore
	var orgStore       store.OrgStore
	var joinStore      store.JoinRequestStore

	if *cosmosEndpoint != "" && *cosmosKey != "" {
		if err := store.ProvisionCosmos(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosUsersContainer, *cosmosIdentityContainer, *cosmosTokensContainer, *cosmosRolesContainer, *cosmosOrgsContainer, *cosmosJoinContainer); err != nil {
			log.Fatalf("cosmos provisioning: %v", err)
		}

		us, err := store.NewCosmosUserStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosUsersContainer, *cosmosIdentityContainer)
		if err != nil {
			log.Fatalf("init Cosmos user store: %v", err)
		}
		userStore = us

		rs, err := store.NewCosmosRefreshTokenStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosTokensContainer)
		if err != nil {
			log.Fatalf("init Cosmos refresh token store: %v", err)
		}
		refreshStore = rs

		roleStore, err = store.NewCosmosRoleStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosRolesContainer)
		if err != nil {
			log.Fatalf("init Cosmos role store: %v", err)
		}

		orgStore, err = store.NewCosmosOrgStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosOrgsContainer)
		if err != nil {
			log.Fatalf("init Cosmos org store: %v", err)
		}

		joinStore, err = store.NewCosmosJoinRequestStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosJoinContainer)
		if err != nil {
			log.Fatalf("init Cosmos join request store: %v", err)
		}
		log.Printf("using Cosmos DB stores (endpoint: %s, database: %s)", *cosmosEndpoint, *cosmosDatabase)
	} else {
		userStore    = store.NewFileUserStore(*dataDir)
		refreshStore = store.NewFileRefreshTokenStore(*dataDir)
		roleStore    = store.NewFileRoleStore(*dataDir)
		orgStore     = store.NewFileOrgStore(*dataDir)
		joinStore    = store.NewFileJoinRequestStore(*dataDir)
		log.Printf("using file-based stores (data-dir: %s)", *dataDir)
	}

	// ── Organization tree ─────────────────────────────────────────────────────
	// Held in memory: the service runs a single replica, and every token issued
	// resolves a branch to its federation. A failure to load is fatal rather than
	// a warning, because an empty tree is not a degraded tree — it silently strips
	// every federation admin of every branch they administer, and the service would
	// come up looking healthy while doing it.
	orgTree := org.New(orgStore)
	if err := orgTree.Reload(); err != nil {
		log.Fatalf("load organization tree: %v", err)
	}
	log.Printf("organization tree loaded: federations=%d branches=%d",
		len(orgTree.Federations()), len(orgTree.Branches()))

	// ── OIDC providers ────────────────────────────────────────────────────────
	providers := make(map[string]provider.Provider)
	domains   := make(map[string]string)

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

	if *microsoftClientID != "" && *microsoftClientSecret != "" {
		m, err := provider.NewMicrosoft(context.Background(), *microsoftClientID, *microsoftClientSecret, *microsoftRedirectURI)
		if err != nil {
			log.Fatalf("init Microsoft provider: %v", err)
		}
		providers["microsoft"] = m
		for _, d := range splitDomains(*microsoftDomains) {
			domains[d] = "microsoft"
		}
		log.Printf("Microsoft OIDC provider enabled (domains: %s)", *microsoftDomains)
	} else {
		log.Println("Microsoft OIDC provider disabled (set --microsoft-client-id and --microsoft-client-secret to enable)")
	}

	// ── Email sender (SMTP when configured; dev stdout otherwise) ─────────────
	var mailer email.Sender
	if *smtpHost != "" && *smtpFrom != "" {
		mode, err := email.ParseTLSMode(*smtpTLS)
		if err != nil {
			log.Fatalf("smtp: %v", err)
		}
		s, err := email.NewSMTPSender(*smtpHost, *smtpPort, *smtpUsername, *smtpPassword, *smtpFrom, mode)
		if err != nil {
			log.Fatalf("init SMTP email sender: %v", err)
		}
		mailer = s
		log.Printf("email sending via SMTP: %s", s.Describe())
	} else {
		mailer = email.LogSender{}
		log.Println("email sending disabled — verification codes will be logged to stdout (set SMTP_HOST and SMTP_FROM to enable)")
	}

	// ── HTTP server ───────────────────────────────────────────────────────────
	limiter := ratelimit.New(*rateLimitRPS, *rateLimitBurst)
	log.Printf("rate limiting: %.1f req/s per IP, burst %d", *rateLimitRPS, int(*rateLimitBurst))

	feedbackRecipients := splitList(*feedbackEmail)
	if len(feedbackRecipients) == 0 {
		log.Println("feedback endpoint disabled (set FEEDBACK_EMAIL to enable)")
	} else {
		log.Printf("feedback endpoint enabled (recipients: %s)", strings.Join(feedbackRecipients, ", "))
	}

	mux := http.NewServeMux()
	api.NewHandler(providers, domains, userStore, refreshStore, roleStore, orgTree, joinStore, tokenManager, mailer, *frontendURL, *cookieDomain, limiter, feedbackRecipients).Register(mux)

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

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

// splitList trims a comma-separated list without lowercasing — used for email
// addresses, which are forwarded as-is rather than indexed by value.
func splitList(s string) []string {
	var out []string
	for _, v := range strings.Split(s, ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}
