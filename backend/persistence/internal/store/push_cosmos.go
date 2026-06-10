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

// cosmosSubscription wraps PushSubscription with the Cosmos-required "id" field.
// The id (and partition key) is sha256(endpoint), so subscriptions distribute
// evenly and upsert/delete are single-partition point operations.
type cosmosSubscription struct {
	ID string `json:"id"`
	PushSubscription
}

// CosmosPushStore persists Web Push subscriptions in a dedicated Cosmos container.
type CosmosPushStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosPushStore(endpoint, key, database, container string) (*CosmosPushStore, error) {
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
	return &CosmosPushStore{container: cc}, nil
}

func (s *CosmosPushStore) SaveSubscription(sub *PushSubscription) error {
	id := endpointKey(sub.Endpoint)
	cs := cosmosSubscription{ID: id, PushSubscription: *sub}
	data, err := json.Marshal(cs)
	if err != nil {
		return fmt.Errorf("cosmos marshal subscription: %w", err)
	}
	pk := azcosmos.NewPartitionKeyString(id)
	if _, err := s.container.UpsertItem(context.Background(), pk, data, nil); err != nil {
		return fmt.Errorf("cosmos save subscription: %w", err)
	}
	return nil
}

func (s *CosmosPushStore) DeleteSubscription(endpoint string) error {
	id := endpointKey(endpoint)
	pk := azcosmos.NewPartitionKeyString(id)
	if _, err := s.container.DeleteItem(context.Background(), pk, id, nil); err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("cosmos delete subscription: %w", err)
	}
	return nil
}

func (s *CosmosPushStore) ListSubscriptions() ([]*PushSubscription, error) {
	ctx := context.Background()
	// Empty partition key fans the query out across all partitions.
	pager := s.container.NewQueryItemsPager("SELECT * FROM c", azcosmos.NewPartitionKey(), nil)
	var subs []*PushSubscription
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("cosmos list subscriptions: %w", err)
		}
		for _, item := range page.Items {
			var cs cosmosSubscription
			if err := json.Unmarshal(item, &cs); err != nil {
				return nil, fmt.Errorf("cosmos unmarshal subscription: %w", err)
			}
			sub := cs.PushSubscription
			subs = append(subs, &sub)
		}
	}
	return subs, nil
}
