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

// CosmosTransferStore persists transfer requests in the `transfers` container,
// partitioned by /id — the member's user id — so "one pending transfer per
// member" is a point read rather than a query somebody has to remember to run.
//
// Expiry is Cosmos' own: a rejected transfer carries a `ttl`, the container has
// time-to-live enabled, and the row leaves without a sweeper to write or forget.
type CosmosTransferStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosTransferStore(endpoint, key, database, container string) (*CosmosTransferStore, error) {
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
	return &CosmosTransferStore{container: cc}, nil
}

func (s *CosmosTransferStore) Get(userID string) (*TransferRequest, error) {
	if userID == "" {
		return nil, nil
	}
	pk := azcosmos.NewPartitionKeyString(userID)
	resp, err := s.container.ReadItem(context.Background(), pk, userID, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos read transfer request: %w", err)
	}
	var req TransferRequest
	if err := json.Unmarshal(resp.Value, &req); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal transfer request: %w", err)
	}
	return &req, nil
}

func (s *CosmosTransferStore) Save(req *TransferRequest) error {
	if req.ID == "" {
		return errors.New("transfer request has no usable member id")
	}
	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("cosmos marshal transfer request: %w", err)
	}
	pk := azcosmos.NewPartitionKeyString(req.ID)
	if _, err := s.container.UpsertItem(context.Background(), pk, data, nil); err != nil {
		return fmt.Errorf("cosmos upsert transfer request: %w", err)
	}
	return nil
}

func (s *CosmosTransferStore) Delete(userID string) error {
	if userID == "" {
		return nil
	}
	pk := azcosmos.NewPartitionKeyString(userID)
	if _, err := s.container.DeleteItem(context.Background(), pk, userID, nil); err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("cosmos delete transfer request: %w", err)
	}
	return nil
}

// List returns every transfer, cross-partition. The container holds a handful of
// items — one per member currently between clubs — so this is cheaper than
// keeping a second partitioning scheme in step with the first.
func (s *CosmosTransferStore) List() ([]*TransferRequest, error) {
	ctx := context.Background()
	pager := s.container.NewQueryItemsPager("SELECT * FROM c", azcosmos.NewPartitionKey(), nil)
	var requests []*TransferRequest
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("cosmos list transfer requests: %w", err)
		}
		for _, raw := range page.Items {
			var req TransferRequest
			if err := json.Unmarshal(raw, &req); err != nil {
				log.Printf("warning: cosmos list transfer requests: unmarshal item: %v", err)
				continue
			}
			requests = append(requests, &req)
		}
	}
	return requests, nil
}
