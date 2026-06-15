package store

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// ProvisionCosmos creates the auth service database and containers if they do not
// already exist. Safe to call on every startup — 409 Conflict responses are silently
// ignored for all create operations.
// Assumes provisioned throughput mode; 400 RU/s is requested at the database level
// so all containers share a single pool (free-tier eligible).
func ProvisionCosmos(endpoint, key, database, usersContainer, identityIndexContainer, tokensContainer, rolesContainer string) error {
	cred, err := azcosmos.NewKeyCredential(key)
	if err != nil {
		return fmt.Errorf("cosmos key credential: %w", err)
	}
	client, err := azcosmos.NewClientWithKey(endpoint, cred, nil)
	if err != nil {
		return fmt.Errorf("cosmos client: %w", err)
	}

	ctx := context.Background()

	throughput := azcosmos.NewManualThroughputProperties(400)
	if _, err = client.CreateDatabase(ctx, azcosmos.DatabaseProperties{ID: database}, &azcosmos.CreateDatabaseOptions{
		ThroughputProperties: &throughput,
	}); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create database %q: %w", database, err)
	}

	db, err := client.NewDatabase(database)
	if err != nil {
		return fmt.Errorf("cosmos database client %q: %w", database, err)
	}

	// identity_index — all access is point reads; item id = SHA-256(provider:sub),
	//   so FindByLinkedIdentity is always a direct key lookup, never a query.
	noIndex := &azcosmos.IndexingPolicy{
		Automatic:     false,
		IndexingMode:  azcosmos.IndexingMode("none"),
		IncludedPaths: []azcosmos.IncludedPath{},
		ExcludedPaths: []azcosmos.ExcludedPath{},
	}

	// users — login-path access is all point reads (FindByID → ReadItem by /id),
	// but the admin user-management UI needs a cross-partition SELECT * FROM c,
	// which "none" indexing blocks. Use "consistent" with all paths excluded
	// (the refresh_tokens precedent): zero write-time index overhead while still
	// permitting the scan.
	// NOTE: ProvisionCosmos ignores already-existing containers (409), so an
	// existing users container's indexing policy must be updated out-of-band once.
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{
		ID:                     usersContainer,
		PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
		IndexingPolicy: &azcosmos.IndexingPolicy{
			Automatic:     true,
			IndexingMode:  azcosmos.IndexingMode("consistent"),
			IncludedPaths: []azcosmos.IncludedPath{},
			ExcludedPaths: []azcosmos.ExcludedPath{{Path: "/*"}},
		},
	}, nil); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create container %q: %w", usersContainer, err)
	}

	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{
		ID:                     identityIndexContainer,
		PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
		IndexingPolicy:         noIndex,
	}, nil); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create container %q: %w", identityIndexContainer, err)
	}

	// roles — point reads only (Roles → ReadItem by /id, where id = lowercased email).
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{
		ID:                     rolesContainer,
		PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
		IndexingPolicy:         noIndex,
	}, nil); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create container %q: %w", rolesContainer, err)
	}

	// refresh_tokens — point reads + partition-scoped scan in DeleteByUserID.
	// "none" mode blocks all queries even within a partition, so we use "consistent"
	// with all paths excluded. This gives zero write-time index overhead while
	// still permitting the SELECT c.id FROM c partition scan.
	// DefaultTimeToLive is a 30-day safety net; the application checks ExpiresAt first.
	ttl := int32(2592000) // 30 days
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{
		ID:                     tokensContainer,
		PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/userId"}, Kind: azcosmos.PartitionKeyKindHash},
		IndexingPolicy: &azcosmos.IndexingPolicy{
			Automatic:     true,
			IndexingMode:  azcosmos.IndexingMode("consistent"),
			IncludedPaths: []azcosmos.IncludedPath{},
			ExcludedPaths: []azcosmos.ExcludedPath{{Path: "/*"}},
		},
		DefaultTimeToLive: &ttl,
	}, nil); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create container %q: %w", tokensContainer, err)
	}

	return nil
}

func isConflict(err error) bool {
	var respErr *azcore.ResponseError
	return errors.As(err, &respErr) && respErr.StatusCode == http.StatusConflict
}
