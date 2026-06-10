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
