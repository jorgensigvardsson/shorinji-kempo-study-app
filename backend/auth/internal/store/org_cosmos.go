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

// CosmosOrgStore persists the organization tree in the Cosmos `organizations`
// container, partitioned by /id. Federations and branches share the container:
// the tree is always read whole, and splitting it would turn one scan into two.
//
// The container is read in full exactly once per process, at startup, because
// the service keeps the tree in memory — see the org package. Everything here
// is therefore either that one scan or one of the handful of writes a year that
// follow it.
type CosmosOrgStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosOrgStore(endpoint, key, database, container string) (*CosmosOrgStore, error) {
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
	return &CosmosOrgStore{container: cc}, nil
}

func (s *CosmosOrgStore) Get(id string) (*OrgNode, error) {
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
		return nil, fmt.Errorf("cosmos read org node %s: %w", id, err)
	}
	var n OrgNode
	if err := json.Unmarshal(resp.Value, &n); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal org node %s: %w", id, err)
	}
	return &n, nil
}

// List returns every node, cross-partition. The container's indexing is
// "consistent" with every path excluded, which permits the scan at no
// write-time index cost — the same arrangement refresh_tokens uses.
func (s *CosmosOrgStore) List() ([]*OrgNode, error) {
	ctx := context.Background()
	pager := s.container.NewQueryItemsPager("SELECT * FROM c", azcosmos.NewPartitionKey(), nil)
	var nodes []*OrgNode
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("cosmos list org nodes: %w", err)
		}
		for _, raw := range page.Items {
			var n OrgNode
			if err := json.Unmarshal(raw, &n); err != nil {
				// One malformed node must not cost the caller the whole tree:
				// an empty tree silently strips every federation admin of
				// their branches, which is worse than a missing node.
				log.Printf("warning: cosmos list org nodes: unmarshal item: %v", err)
				continue
			}
			nodes = append(nodes, &n)
		}
	}
	return nodes, nil
}

// Save upserts a node. Unlike the user store this takes no ETag guard: nodes
// are whole-document writes made by hand a few times a year, so the concurrent
// rename the guard would catch is a race between two admins editing the same
// branch in the same second. If organization editing ever becomes routine, this
// is the line to revisit.
func (s *CosmosOrgStore) Save(node *OrgNode) error {
	if node == nil || node.ID == "" {
		return errors.New("org node has no id")
	}
	data, err := json.Marshal(node)
	if err != nil {
		return fmt.Errorf("cosmos marshal org node %s: %w", node.ID, err)
	}
	pk := azcosmos.NewPartitionKeyString(node.ID)
	if _, err := s.container.UpsertItem(context.Background(), pk, data, nil); err != nil {
		return fmt.Errorf("cosmos upsert org node %s: %w", node.ID, err)
	}
	return nil
}
