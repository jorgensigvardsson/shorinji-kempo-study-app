package main

import (
	"context"
	"log"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/org"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/usage"
)

// jobConfig is what a one-off job needs from the service's configuration, and no
// more: no signing key, no providers, no mail. The usage-snapshot job runs as a
// Container Apps job from the same image as the service, with only the
// environment it uses.
type jobConfig struct {
	dataDir                                   string
	cosmosEndpoint, cosmosKey, cosmosDatabase string
	usersContainer, identityContainer         string
	orgsContainer, historyContainer           string
	appInsightsResourceID                     string
	usageDemo                                 bool
}

// runJob runs the named job to completion and returns; main exits after it.
func runJob(name string, cfg jobConfig) {
	switch name {
	case "usage-snapshot":
		runUsageSnapshot(cfg)
	default:
		log.Fatalf("unknown job %q (known: usage-snapshot)", name)
	}
}

// runUsageSnapshot stores every finished week of usage that is not stored yet
// (see usage.SnapshotJob). Run weekly; any cadence works, and a missed run is
// caught up by the next.
func runUsageSnapshot(cfg jobConfig) {
	var users store.UserStore
	var history store.HistoryStore
	var orgs store.OrgStore
	if cfg.cosmosEndpoint != "" && cfg.cosmosKey != "" {
		us, err := store.NewCosmosUserStore(cfg.cosmosEndpoint, cfg.cosmosKey, cfg.cosmosDatabase, cfg.usersContainer, cfg.identityContainer)
		if err != nil {
			log.Fatalf("usage-snapshot: user store: %v", err)
		}
		hs, err := store.NewCosmosHistoryStore(cfg.cosmosEndpoint, cfg.cosmosKey, cfg.cosmosDatabase, cfg.historyContainer)
		if err != nil {
			log.Fatalf("usage-snapshot: history store: %v", err)
		}
		orgStore, err := store.NewCosmosOrgStore(cfg.cosmosEndpoint, cfg.cosmosKey, cfg.cosmosDatabase, cfg.orgsContainer)
		if err != nil {
			log.Fatalf("usage-snapshot: org store: %v", err)
		}
		users, history, orgs = us, hs, orgStore
	} else {
		users = store.NewFileUserStore(cfg.dataDir)
		history = store.NewFileHistoryStore(cfg.dataDir)
		orgs = store.NewFileOrgStore(cfg.dataDir)
	}

	var stats usage.WeekStatser
	switch {
	case cfg.appInsightsResourceID != "":
		credential, err := azidentity.NewDefaultAzureCredential(nil)
		if err != nil {
			log.Fatalf("usage-snapshot: credential: %v", err)
		}
		stats = usage.NewClient(cfg.appInsightsResourceID, credential)
	case cfg.usageDemo && cfg.cosmosEndpoint == "":
		// Invented weeks go into a developer's files and nowhere else; the same
		// refusal alongside Cosmos as the service makes.
		tree := org.New(orgs)
		if err := tree.Reload(); err != nil {
			log.Fatalf("usage-snapshot: organization tree: %v", err)
		}
		stats = usage.NewDemo(func() []string {
			var ids []string
			for _, b := range tree.Branches() {
				ids = append(ids, b.ID)
			}
			return ids
		})
		log.Println("usage-snapshot: storing INVENTED weeks (USAGE_DEMO)")
	default:
		log.Fatal("usage-snapshot: nothing to read from — set APPINSIGHTS_RESOURCE_ID (or USAGE_DEMO without Cosmos)")
	}

	job := usage.SnapshotJob{
		Stats:   stats,
		History: history,
		Members: func() (map[string]int, error) {
			all, err := users.List()
			if err != nil {
				return nil, err
			}
			members := map[string]int{}
			for _, u := range all {
				members[u.BranchID]++
			}
			return members, nil
		},
		Now: time.Now,
		// What Application Insights keeps; a week that began earlier cannot be
		// counted whole.
		Retention: 30 * 24 * time.Hour,
		// Sunday's last events are ingested within minutes; six hours is plenty.
		Settle: 6 * time.Hour,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	result, err := job.Run(ctx)
	if result != nil {
		for _, week := range result.Lost {
			log.Printf("usage-snapshot: week of %s is beyond telemetry's retention and was not stored", week[:10])
		}
		for _, week := range result.Stored {
			log.Printf("usage-snapshot: stored week of %s", week[:10])
		}
	}
	if err != nil {
		log.Fatalf("usage-snapshot: %v", err)
	}
	if result != nil && len(result.Stored) == 0 {
		log.Println("usage-snapshot: nothing new to store")
	}
}
