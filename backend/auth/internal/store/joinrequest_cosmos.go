package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// CosmosJoinRequestStore persists join requests in the `joinrequests` container,
// partitioned by /id — the lowercased email — so "one pending request per
// address" is a point read rather than a query somebody has to remember to run.
//
// Expiry is Cosmos' own: a denied request carries a `ttl`, the container has
// time-to-live enabled, and the row leaves without a sweeper to write or forget.
type CosmosJoinRequestStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosJoinRequestStore(endpoint, key, database, container string) (*CosmosJoinRequestStore, error) {
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
	return &CosmosJoinRequestStore{container: cc}, nil
}

func (s *CosmosJoinRequestStore) Get(email string) (*JoinRequest, error) {
	id := NormalizeEmail(email)
	if id == "" {
		return nil, nil
	}
	pk := azcosmos.NewPartitionKeyString(id)
	resp, err := s.container.ReadItem(context.Background(), pk, id, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos read join request: %w", err)
	}
	var req JoinRequest
	if err := json.Unmarshal(resp.Value, &req); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal join request: %w", err)
	}
	return &req, nil
}

func (s *CosmosJoinRequestStore) Save(req *JoinRequest) error {
	id := NormalizeEmail(req.ID)
	if id == "" {
		return errors.New("join request has no address")
	}
	req.ID = id
	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("cosmos marshal join request: %w", err)
	}
	pk := azcosmos.NewPartitionKeyString(id)
	if _, err := s.container.UpsertItem(context.Background(), pk, data, nil); err != nil {
		return fmt.Errorf("cosmos upsert join request: %w", err)
	}
	return nil
}

func (s *CosmosJoinRequestStore) Delete(email string) error {
	id := NormalizeEmail(email)
	if id == "" {
		return nil
	}
	pk := azcosmos.NewPartitionKeyString(id)
	if _, err := s.container.DeleteItem(context.Background(), pk, id, nil); err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("cosmos delete join request: %w", err)
	}
	return nil
}

// List returns every request, cross-partition. The container holds tens of
// items — one per person waiting at the door — so this is cheaper than keeping a
// second partitioning scheme in step with the first.
func (s *CosmosJoinRequestStore) List() ([]*JoinRequest, error) {
	ctx := context.Background()
	pager := s.container.NewQueryItemsPager("SELECT * FROM c", azcosmos.NewPartitionKey(), nil)
	var requests []*JoinRequest
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("cosmos list join requests: %w", err)
		}
		for _, raw := range page.Items {
			var req JoinRequest
			if err := json.Unmarshal(raw, &req); err != nil {
				log.Printf("warning: cosmos list join requests: unmarshal item: %v", err)
				continue
			}
			requests = append(requests, &req)
		}
	}
	return requests, nil
}
