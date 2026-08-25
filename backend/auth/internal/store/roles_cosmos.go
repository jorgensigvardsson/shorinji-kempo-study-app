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

// CosmosRoleStore reads role assignments from the Cosmos `roles` container.
// Each item's id is the lowercased email, so lookups are O(1) point reads.
type CosmosRoleStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosRoleStore(endpoint, key, database, container string) (*CosmosRoleStore, error) {
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
	return &CosmosRoleStore{container: cc}, nil
}

func (s *CosmosRoleStore) Roles(email string) ([]string, error) {
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
		return nil, fmt.Errorf("cosmos read roles %s: %w", id, err)
	}
	var rec RoleRecord
	if err := json.Unmarshal(resp.Value, &rec); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal roles %s: %w", id, err)
	}
	return rec.Roles, nil
}

// SetRoles upserts the role record for email (id = lowercased email). When roles
// is empty the item is deleted so empties don't linger. Point operations only,
// so the roles container's "none" indexing is fine.
func (s *CosmosRoleStore) SetRoles(email string, roles []string) error {
	id := NormalizeEmail(email)
	if id == "" {
		return nil
	}
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(id)

	if len(roles) == 0 {
		_, err := s.container.DeleteItem(ctx, pk, id, nil)
		if err != nil {
			var respErr *azcore.ResponseError
			if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
				return nil
			}
			return fmt.Errorf("cosmos delete roles %s: %w", id, err)
		}
		return nil
	}

	data, err := json.Marshal(RoleRecord{ID: id, Roles: roles})
	if err != nil {
		return fmt.Errorf("cosmos marshal roles %s: %w", id, err)
	}
	if _, err := s.container.UpsertItem(ctx, pk, data, nil); err != nil {
		return fmt.Errorf("cosmos upsert roles %s: %w", id, err)
	}
	return nil
}

// ListAll returns every role assignment, cross-partition. It answers the reverse
// question the point reads cannot — "who holds branch_admin for this branch?" —
// which is how a join request finds the admins to notify.
//
// This requires the container to be queryable at all: it was provisioned with
// "none" indexing originally, which blocks queries outright rather than merely
// making them expensive. See ProvisionCosmos.
func (s *CosmosRoleStore) ListAll() ([]RoleRecord, error) {
	ctx := context.Background()
	pager := s.container.NewQueryItemsPager("SELECT * FROM c", azcosmos.NewPartitionKey(), nil)
	var records []RoleRecord
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("cosmos list roles: %w", err)
		}
		for _, raw := range page.Items {
			var rec RoleRecord
			if err := json.Unmarshal(raw, &rec); err != nil {
				log.Printf("warning: cosmos list roles: unmarshal item: %v", err)
				continue
			}
			records = append(records, rec)
		}
	}
	return records, nil
}
