package main

import (
	"context"
	"crypto/rsa"
	"crypto/sha256"
	"flag"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/api"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/email"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/org"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/provider"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/usage"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/envutil"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/logsafe"
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
	cosmosTransfersContainer := flag.String("cosmos-transfers-container",   envutil.String("COSMOS_TRANSFERS_CONTAINER",     "transfers"),      "Cosmos container for pending branch transfers")
	cosmosHistoryContainer  := flag.String("cosmos-history-container",      envutil.String("COSMOS_HISTORY_CONTAINER",      "usage_history"),  "Cosmos container for the anonymous usage history")

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

	// ── Usage statistics ──────────────────────────────────────────────────────
	appInsightsResourceID := flag.String("appinsights-resource-id", envutil.String("APPINSIGHTS_RESOURCE_ID", ""), "Azure resource id of the Application Insights component to read usage from (empty disables GET /auth/admin/usage)")
	usageDemo             := flag.Bool("usage-demo", envutil.String("USAGE_DEMO", "") == "true", "serve invented usage statistics, for looking at the usage page on a development machine (refused alongside Cosmos)")

	// ── One-off jobs ──────────────────────────────────────────────────────────
	job := flag.String("job", envutil.String("SERVICE_JOB", ""), "run a one-off job to completion instead of serving: usage-snapshot")

	// ── Rate limiting ─────────────────────────────────────────────────────────
	// The ceiling is per IP, which is per household rather than per person: a
	// family shares one public address, and so does everybody behind a mobile
	// carrier. It also has to cover what one page costs — opening the admin queue
	// is half a dozen calls in the same breath — so a budget of one request a
	// second refused ordinary use, and did: an admin approving members hit 53
	// rejections in a single minute on 2026-09-06, each one surfacing as a failure
	// she could do nothing about.
	//
	// What this protects is not the wallet directly. The endpoints that cost real
	// money — anything that sends mail — carry their own global caps, measured in
	// seconds per message rather than messages per second, and those are unchanged.
	// This is here to stop a scanner from grinding through the API, and 5/s with a
	// burst of 20 still does that comfortably.
	rateLimitRPS   := flag.Float64("rate-limit-rps",   envutil.Float64("RATE_LIMIT_RPS",   5.0),  "max requests per second per IP (0 = disabled)")
	rateLimitBurst := flag.Float64("rate-limit-burst", envutil.Float64("RATE_LIMIT_BURST", 20.0), "rate limit burst size")

	flag.Parse()

	// A job needs none of what follows — no signing key, no providers, no mail —
	// and in its container could not load some of it, so it takes its own short
	// path and the process ends with it.
	if *job != "" {
		runJob(*job, jobConfig{
			dataDir:               *dataDir,
			cosmosEndpoint:        *cosmosEndpoint,
			cosmosKey:             *cosmosKey,
			cosmosDatabase:        *cosmosDatabase,
			usersContainer:        *cosmosUsersContainer,
			identityContainer:     *cosmosIdentityContainer,
			orgsContainer:         *cosmosOrgsContainer,
			historyContainer:      *cosmosHistoryContainer,
			appInsightsResourceID: *appInsightsResourceID,
			usageDemo:             *usageDemo,
		})
		return
	}

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

	// Keys the tokens that stand in for email addresses in the log (see
	// shared/logsafe). Derived from the signing key rather than configured, so
	// there is no new secret to create, distribute and eventually forget to set —
	// and from the private exponent, never the modulus, which is published in the
	// JWKS document and would make the key public along with it.
	//
	// Rotating the signing key changes every token, so lines written either side of
	// a rotation cannot be tied together. Rotation is rare, and correlating a
	// month-old log line is not a reason to defer one.
	logsafeKey := sha256.Sum256(append([]byte("shorinji-kempo/log-pseudonym/v1"), signingKey.D.Bytes()...))
	logsafe.Init(logsafeKey[:])

	// ── Stores (file-based by default; Cosmos when endpoint is configured) ────
	var userStore      store.UserStore
	var refreshStore   store.RefreshTokenStore
	var roleStore      store.RoleStore
	var orgStore       store.OrgStore
	var joinStore      store.JoinRequestStore
	var transferStore  store.TransferStore
	var historyStore   store.HistoryStore

	if *cosmosEndpoint != "" && *cosmosKey != "" {
		if err := store.ProvisionCosmos(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosUsersContainer, *cosmosIdentityContainer, *cosmosTokensContainer, *cosmosRolesContainer, *cosmosOrgsContainer, *cosmosJoinContainer, *cosmosTransfersContainer, *cosmosHistoryContainer); err != nil {
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

		transferStore, err = store.NewCosmosTransferStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosTransfersContainer)
		if err != nil {
			log.Fatalf("init Cosmos transfer store: %v", err)
		}

		historyStore, err = store.NewCosmosHistoryStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosHistoryContainer)
		if err != nil {
			log.Fatalf("init Cosmos history store: %v", err)
		}
		log.Printf("using Cosmos DB stores (endpoint: %s, database: %s)", *cosmosEndpoint, *cosmosDatabase)
	} else {
		userStore     = store.NewFileUserStore(*dataDir)
		refreshStore  = store.NewFileRefreshTokenStore(*dataDir)
		roleStore     = store.NewFileRoleStore(*dataDir)
		orgStore      = store.NewFileOrgStore(*dataDir)
		joinStore     = store.NewFileJoinRequestStore(*dataDir)
		transferStore = store.NewFileTransferStore(*dataDir)
		historyStore  = store.NewFileHistoryStore(*dataDir)
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

	// Read with whatever identity the environment provides: the container's
	// managed identity in Azure, an `az login` on a developer's machine. There is
	// no credential to configure, which is the point — see the usage package.
	//
	// An explicit nil when switched off, not a nil *usage.Cached: the handler
	// tests the interface, and an interface holding a nil pointer is not nil.
	var usageSource usage.Source
	if *appInsightsResourceID != "" {
		credential, err := azidentity.NewDefaultAzureCredential(nil)
		if err != nil {
			log.Fatalf("usage statistics: credential: %v", err)
		}
		usageSource = usage.NewCached(usage.NewClient(*appInsightsResourceID, credential), 10*time.Minute)
		log.Println("usage statistics enabled")
	} else if *usageDemo && *cosmosEndpoint != "" {
		// Cosmos is how this service tells real data from a developer's files, so
		// it is also how invented statistics are kept from ever standing in for
		// real ones. Refused rather than fatal: a development stack pointed at
		// Cosmos should still start.
		log.Println("usage statistics disabled: USAGE_DEMO is refused while Cosmos is configured")
	} else if *usageDemo {
		usageSource = usage.NewDemo(func() []string {
			var ids []string
			for _, b := range orgTree.Branches() {
				ids = append(ids, b.ID)
			}
			return ids
		})
		log.Println("usage statistics: serving INVENTED data (USAGE_DEMO)")
	} else {
		log.Println("usage statistics disabled (set APPINSIGHTS_RESOURCE_ID to enable)")
	}

	// The usage history is recorded wherever usage statistics are switched on —
	// production, and a demo stack — and nowhere else. Staging records nothing,
	// so its traffic never mixes into anybody's long view.
	if usageSource == nil {
		historyStore = nil
		log.Println("usage history disabled (it follows usage statistics)")
	}

	mux := http.NewServeMux()
	api.NewHandler(providers, domains, userStore, refreshStore, roleStore, orgTree, joinStore, transferStore, tokenManager, mailer, *frontendURL, *cookieDomain, limiter, feedbackRecipients, usageSource, historyStore).Register(mux)

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
