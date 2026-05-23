package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// cosmosDocument wraps Document with the Cosmos DB required "id" field.
type cosmosDocument struct {
	ID string `json:"id"` // userID doubles as the Cosmos item ID
	Document
}

// CosmosDBStore persists documents in Azure Cosmos DB (NoSQL API).
// One item per user; the item ID and partition key are both the user UUID.
type CosmosDBStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosDBStore(endpoint, key, database, container string) (*CosmosDBStore, error) {
	cred, err := azcosmos.NewKeyCredential(key)
	if err != nil {
		return nil, fmt.Errorf("cosmos key credential: %w", err)
	}
	client, err := azcosmos.NewClientWithKey(endpoint, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("cosmos client: %w", err)
	}
	cc, err := client.NewContainer(database, container)
	if err != nil {
		return nil, fmt.Errorf("cosmos container %s/%s: %w", database, container, err)
	}
	return &CosmosDBStore{container: cc}, nil
}

func (s *CosmosDBStore) Load(userID string) (*Document, error) {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	resp, err := s.container.ReadItem(ctx, pk, userID, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos load document %s: %w", userID, err)
	}
	var cd cosmosDocument
	if err := json.Unmarshal(resp.Value, &cd); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal document %s: %w", userID, err)
	}
	return &cd.Document, nil
}

func (s *CosmosDBStore) Save(userID string, doc *Document) error {
	ctx := context.Background()
	cd := cosmosDocument{ID: userID, Document: *doc}
	data, err := json.Marshal(cd)
	if err != nil {
		return fmt.Errorf("cosmos marshal document %s: %w", userID, err)
	}
	pk := azcosmos.NewPartitionKeyString(userID)
	_, err = s.container.UpsertItem(ctx, pk, data, nil)
	if err != nil {
		return fmt.Errorf("cosmos save document %s: %w", userID, err)
	}
	return nil
}

func (s *CosmosDBStore) Delete(userID string) error {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	_, err := s.container.DeleteItem(ctx, pk, userID, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("cosmos delete document %s: %w", userID, err)
	}
	return nil
}
