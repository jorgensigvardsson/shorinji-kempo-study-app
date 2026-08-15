package store

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// ProvisionCosmos creates the persistence service database and containers if they
// do not already exist. Safe to call on every startup — 409 Conflict responses
// are silently ignored for all create operations.
func ProvisionCosmos(endpoint, key, database, container, pushContainer, userDataContainer string) error {
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

	// documents — all access is point reads (Load/Save/Delete by userID = item id = partition key).
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{
		ID:                     container,
		PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
		IndexingPolicy: &azcosmos.IndexingPolicy{
			Automatic:     false,
			IndexingMode:  azcosmos.IndexingMode("none"),
			IncludedPaths: []azcosmos.IncludedPath{},
			ExcludedPaths: []azcosmos.ExcludedPath{},
		},
	}, nil); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create container %q: %w", container, err)
	}

	// userdata — the document split across several items, partitioned by user rather
	// than by item so that all of a user's items live together and can be written in
	// one transactional batch. Cosmos cannot repartition a container in place, which
	// is why this is a new one rather than a change to `documents`.
	//
	// Reassembly is point reads driven by the field list in the meta item, so no
	// indexing is needed here either.
	//
	// Indexing stays off, which rules TTL out — Cosmos rejects a container that has
	// both. That matters because an item whose id was built by the legacy scheme
	// cannot be deleted, and expiry would have been the other way to remove one. The
	// store overwrites them with an empty husk instead, which takes the user's data
	// with it and leaves only a shell. See retireLegacyItem.
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{
		ID:                     userDataContainer,
		PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/userId"}, Kind: azcosmos.PartitionKeyKindHash},
		IndexingPolicy: &azcosmos.IndexingPolicy{
			Automatic:     false,
			IndexingMode:  azcosmos.IndexingMode("none"),
			IncludedPaths: []azcosmos.IncludedPath{},
			ExcludedPaths: []azcosmos.ExcludedPath{},
		},
	}, nil); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create container %q: %w", userDataContainer, err)
	}

	// pushsubscriptions — id/partition key is sha256(endpoint). Broadcast does a
	// cross-partition scan, so indexing is left at the default (automatic).
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{
		ID:                     pushContainer,
		PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/id"}, Kind: azcosmos.PartitionKeyKindHash},
	}, nil); err != nil && !isConflict(err) {
		return fmt.Errorf("cosmos create container %q: %w", pushContainer, err)
	}

	return nil
}

func isConflict(err error) bool {
	var respErr *azcore.ResponseError
	return errors.As(err, &respErr) && respErr.StatusCode == http.StatusConflict
}
