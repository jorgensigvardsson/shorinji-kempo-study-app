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
//
// Cosmos maintains an ETag per item and enforces If-Match server-side, so the
// concurrency check costs nothing extra here — it is the same round trip either way.
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

func (s *CosmosDBStore) Load(userID string) (*Document, string, error) {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	resp, err := s.container.ReadItem(ctx, pk, userID, nil)
	if err != nil {
		if statusOf(err) == http.StatusNotFound {
			return nil, "", nil
		}
		return nil, "", fmt.Errorf("cosmos load document %s: %w", userID, err)
	}
	var cd cosmosDocument
	if err := json.Unmarshal(resp.Value, &cd); err != nil {
		return nil, "", fmt.Errorf("cosmos unmarshal document %s: %w", userID, err)
	}
	return &cd.Document, string(resp.ETag), nil
}

func (s *CosmosDBStore) Save(userID string, doc *Document, ifMatch string) (string, error) {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	data, err := s.marshal(userID, doc)
	if err != nil {
		return "", err
	}

	// No ifMatch is a claim that the item does not exist yet, which CreateItem is
	// exactly the check for: it fails with 409 if one has appeared in the meantime.
	if ifMatch == "" {
		resp, err := s.container.CreateItem(ctx, pk, data, nil)
		if err != nil {
			if statusOf(err) == http.StatusConflict {
				return "", ErrPreconditionFailed
			}
			return "", fmt.Errorf("cosmos create document %s: %w", userID, err)
		}
		return string(resp.ETag), nil
	}

	etag := azcore.ETag(ifMatch)
	resp, err := s.container.ReplaceItem(ctx, pk, userID, data, &azcosmos.ItemOptions{IfMatchEtag: &etag})
	if err != nil {
		// 412 is the ETag no longer matching. 404 means the item was deleted while
		// this caller held it — also a stale copy, and the same thing to do about it.
		if status := statusOf(err); status == http.StatusPreconditionFailed || status == http.StatusNotFound {
			return "", ErrPreconditionFailed
		}
		return "", fmt.Errorf("cosmos save document %s: %w", userID, err)
	}
	return string(resp.ETag), nil
}

func (s *CosmosDBStore) SaveUnconditional(userID string, doc *Document) (string, error) {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	data, err := s.marshal(userID, doc)
	if err != nil {
		return "", err
	}
	resp, err := s.container.UpsertItem(ctx, pk, data, nil)
	if err != nil {
		return "", fmt.Errorf("cosmos save document %s: %w", userID, err)
	}
	return string(resp.ETag), nil
}

func (s *CosmosDBStore) Delete(userID string) error {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	_, err := s.container.DeleteItem(ctx, pk, userID, nil)
	if err != nil {
		if statusOf(err) == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("cosmos delete document %s: %w", userID, err)
	}
	return nil
}

func (s *CosmosDBStore) marshal(userID string, doc *Document) ([]byte, error) {
	data, err := json.Marshal(cosmosDocument{ID: userID, Document: *doc})
	if err != nil {
		return nil, fmt.Errorf("cosmos marshal document %s: %w", userID, err)
	}
	return data, nil
}

func statusOf(err error) int {
	var respErr *azcore.ResponseError
	if errors.As(err, &respErr) {
		return respErr.StatusCode
	}
	return 0
}
