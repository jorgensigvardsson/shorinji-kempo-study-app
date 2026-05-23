// migrate imports file-store data from the auth and persistence services into Cosmos DB.
//
// Usage:
//
//	go run . \
//	  --auth-data-dir    ../../backend/auth/data \
//	  --persist-data-dir ../../backend/persistence/data \
//	  --cosmos-endpoint  https://your-account.documents.azure.com:443/ \
//	  --cosmos-key       <primary-key> \
//	  [--cosmos-database shorinji] \
//	  [--dry-run]
//
// What it migrates:
//
//	auth data dir:        <dir>/<uuid>.json              → users container
//	  (derived)           identity_index entries         → identity_index container
//	persistence data dir: <dir>/<uuid>.json              → documents container
//
// Refresh tokens are intentionally skipped — users simply log in again.
//
// Note on internal packages: Go's internal package rule prevents this tool from
// importing backend/{auth,persistence}/internal/store even within a workspace.
// The types below are defined locally but are byte-for-byte identical to their
// counterparts in those packages; any change to the backend structs must be
// reflected here as well.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// ── Types (mirrors backend/{auth,persistence}/internal/store) ─────────────────

type linkedIdentity struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
}

type user struct {
	ID               string                    `json:"id"`
	Email            string                    `json:"email"`
	DisplayName      string                    `json:"displayName"`
	LinkedIdentities map[string]linkedIdentity `json:"linkedIdentities"`
	CreatedAt        string                    `json:"createdAt"`
	LastLoginAt      string                    `json:"lastLoginAt"`
}

type document struct {
	Version   int             `json:"version"`
	UpdatedAt string          `json:"updatedAt"`
	DeviceID  string          `json:"deviceId"`
	Data      json.RawMessage `json:"data"`
}

// cosmosDocument wraps document with the Cosmos-required "id" field.
type cosmosDocument struct {
	ID string `json:"id"`
	document
}

// identityIndexItem is what is stored in the identity_index container.
type identityIndexItem struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Sub      string `json:"sub"`
	UserID   string `json:"userId"`
}

// identityKey computes the stable, URL-safe Cosmos item ID for a (provider, sub) pair.
// Must match backend/auth/internal/store/cosmos.go:identityKey exactly.
func identityKey(provider, sub string) string {
	h := sha256.Sum256([]byte(provider + ":" + sub))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	authDataDir    := flag.String("auth-data-dir",    "", "directory containing auth service file store (required)")
	persistDataDir := flag.String("persist-data-dir", "", "directory containing persistence service file store (required)")
	endpoint       := flag.String("cosmos-endpoint",  "", "Cosmos DB account endpoint URL (required)")
	key            := flag.String("cosmos-key",       "", "Cosmos DB account primary key (required)")
	database       := flag.String("cosmos-database",  "shorinji", "Cosmos DB database name")
	dryRun         := flag.Bool("dry-run",            false, "print what would be migrated without writing anything")
	flag.Parse()

	if *authDataDir == "" || *persistDataDir == "" || *endpoint == "" || *key == "" {
		flag.Usage()
		os.Exit(1)
	}

	m, err := newMigrator(*endpoint, *key, *database, *dryRun)
	if err != nil {
		log.Fatalf("init: %v", err)
	}

	if err := m.migrateUsers(*authDataDir); err != nil {
		log.Fatalf("migrate users: %v", err)
	}
	if err := m.migrateDocuments(*persistDataDir); err != nil {
		log.Fatalf("migrate documents: %v", err)
	}

	if *dryRun {
		log.Println("dry-run complete — no data was written")
	} else {
		log.Println("migration complete")
	}
}

// ── Migrator ─────────────────────────────────────────────────────────────────

type migrator struct {
	users  *azcosmos.ContainerClient
	index  *azcosmos.ContainerClient
	docs   *azcosmos.ContainerClient
	dryRun bool
}

func newMigrator(endpoint, key, database string, dryRun bool) (*migrator, error) {
	cred, err := azcosmos.NewKeyCredential(key)
	if err != nil {
		return nil, fmt.Errorf("cosmos key credential: %w", err)
	}
	client, err := azcosmos.NewClientWithKey(endpoint, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("cosmos client: %w", err)
	}

	if !dryRun {
		if err := provision(client, database); err != nil {
			return nil, fmt.Errorf("provision: %w", err)
		}
	}

	users, err := client.NewContainer(database, "users")
	if err != nil {
		return nil, fmt.Errorf("cosmos container users: %w", err)
	}
	index, err := client.NewContainer(database, "identity_index")
	if err != nil {
		return nil, fmt.Errorf("cosmos container identity_index: %w", err)
	}
	docs, err := client.NewContainer(database, "documents")
	if err != nil {
		return nil, fmt.Errorf("cosmos container documents: %w", err)
	}

	return &migrator{users: users, index: index, docs: docs, dryRun: dryRun}, nil
}

func provision(client *azcosmos.Client, database string) error {
	ctx := context.Background()

	throughput := azcosmos.NewManualThroughputProperties(400)
	if _, err := client.CreateDatabase(ctx, azcosmos.DatabaseProperties{ID: database}, &azcosmos.CreateDatabaseOptions{
		ThroughputProperties: &throughput,
	}); err != nil && !isConflict(err) {
		return fmt.Errorf("create database %q: %w", database, err)
	}

	db, err := client.NewDatabase(database)
	if err != nil {
		return fmt.Errorf("database client: %w", err)
	}

	noIndex := &azcosmos.IndexingPolicy{
		Automatic:     false,
		IndexingMode:  azcosmos.IndexingMode("none"),
		IncludedPaths: []azcosmos.IncludedPath{},
		ExcludedPaths: []azcosmos.ExcludedPath{},
	}
	ttl := int32(2592000)

	containers := []azcosmos.ContainerProperties{
		{
			ID:                     "users",
			PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
			IndexingPolicy:         noIndex,
		},
		{
			ID:                     "identity_index",
			PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
			IndexingPolicy:         noIndex,
		},
		{
			ID:                     "refresh_tokens",
			PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/userId"}, Kind: azcosmos.PartitionKeyKindHash},
			IndexingPolicy: &azcosmos.IndexingPolicy{
				Automatic:     true,
				IndexingMode:  azcosmos.IndexingMode("consistent"),
				IncludedPaths: []azcosmos.IncludedPath{},
				ExcludedPaths: []azcosmos.ExcludedPath{{Path: "/*"}},
			},
			DefaultTimeToLive: &ttl,
		},
		{
			ID:                     "documents",
			PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
			IndexingPolicy:         noIndex,
		},
	}

	for _, c := range containers {
		if _, err := db.CreateContainer(ctx, c, nil); err != nil && !isConflict(err) {
			return fmt.Errorf("create container %q: %w", c.ID, err)
		}
		log.Printf("  container %q ready", c.ID)
	}
	return nil
}

// migrateUsers reads every <uuid>.json from authDataDir, upserts the user record,
// and builds all identity_index entries.
func (m *migrator) migrateUsers(dir string) error {
	entries, err := readJSONDir(dir)
	if err != nil {
		return err
	}

	userCount, indexCount := 0, 0
	for _, e := range entries {
		var u user
		if err := json.Unmarshal(e.data, &u); err != nil {
			log.Printf("  SKIP %s: parse error: %v", e.name, err)
			continue
		}
		if u.ID == "" {
			u.ID = strings.TrimSuffix(e.name, ".json")
		}

		log.Printf("  user %s (%s)", u.ID, u.Email)
		if !m.dryRun {
			pk := azcosmos.NewPartitionKeyString(u.ID)
			data, _ := json.Marshal(u)
			if _, err := m.users.UpsertItem(context.Background(), pk, data, nil); err != nil {
				log.Printf("    ERROR upsert user %s: %v", u.ID, err)
				continue
			}
		}
		userCount++

		for provider, ident := range u.LinkedIdentities {
			ikey := identityKey(provider, ident.Sub)
			item := identityIndexItem{
				ID:       ikey,
				Provider: provider,
				Sub:      ident.Sub,
				UserID:   u.ID,
			}
			log.Printf("    identity_index %s → %s/%s", ikey[:8]+"…", provider, ident.Sub)
			if !m.dryRun {
				pk := azcosmos.NewPartitionKeyString(ikey)
				data, _ := json.Marshal(item)
				if _, err := m.index.UpsertItem(context.Background(), pk, data, nil); err != nil {
					log.Printf("    ERROR upsert identity index %s/%s: %v", provider, ident.Sub, err)
					continue
				}
			}
			indexCount++
		}
	}

	log.Printf("users: %d records, %d identity index entries", userCount, indexCount)
	return nil
}

// migrateDocuments reads every <uuid>.json from persistDataDir and upserts it into
// the documents container. The filename (minus .json) is used as the item id.
func (m *migrator) migrateDocuments(dir string) error {
	entries, err := readJSONDir(dir)
	if err != nil {
		return err
	}

	count := 0
	for _, e := range entries {
		var doc document
		if err := json.Unmarshal(e.data, &doc); err != nil {
			log.Printf("  SKIP %s: parse error: %v", e.name, err)
			continue
		}
		userID := strings.TrimSuffix(e.name, ".json")
		wrapped := cosmosDocument{ID: userID, document: doc}

		log.Printf("  document %s (v%d, updated %s)", userID, doc.Version, doc.UpdatedAt)
		if !m.dryRun {
			pk := azcosmos.NewPartitionKeyString(userID)
			data, _ := json.Marshal(wrapped)
			if _, err := m.docs.UpsertItem(context.Background(), pk, data, nil); err != nil {
				log.Printf("    ERROR upsert document %s: %v", userID, err)
				continue
			}
		}
		count++
	}

	log.Printf("documents: %d records", count)
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type jsonEntry struct {
	name string
	data []byte
}

func readJSONDir(dir string) ([]jsonEntry, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		log.Printf("  directory %q does not exist, skipping", dir)
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read dir %q: %w", dir, err)
	}

	var out []jsonEntry
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			log.Printf("  SKIP %s: %v", e.Name(), err)
			continue
		}
		out = append(out, jsonEntry{name: e.Name(), data: data})
	}
	return out, nil
}

// isConflict returns true for HTTP 409 Conflict responses from the Cosmos SDK.
// Kept here in case future code needs to distinguish create vs upsert.
func isConflict(err error) bool {
	var respErr *azcore.ResponseError
	return errors.As(err, &respErr) && respErr.StatusCode == http.StatusConflict
}
