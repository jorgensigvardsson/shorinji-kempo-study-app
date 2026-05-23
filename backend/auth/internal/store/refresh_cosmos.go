package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// CosmosRefreshTokenStore persists refresh tokens in a Cosmos DB container.
// The container partition key is /userId; token ID encodes userId so all
// operations can derive the partition key without a separate lookup.
type CosmosRefreshTokenStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosRefreshTokenStore(endpoint, key, database, container string) (*CosmosRefreshTokenStore, error) {
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
	return &CosmosRefreshTokenStore{container: cc}, nil
}

func (s *CosmosRefreshTokenStore) Create(token *RefreshToken) error {
	ctx := context.Background()
	data, err := json.Marshal(token)
	if err != nil {
		return fmt.Errorf("marshal refresh token: %w", err)
	}
	pk := azcosmos.NewPartitionKeyString(token.UserID)
	_, err = s.container.UpsertItem(ctx, pk, data, nil)
	if err != nil {
		return fmt.Errorf("cosmos upsert refresh token: %w", err)
	}
	return nil
}

func (s *CosmosRefreshTokenStore) Find(tokenID string) (*RefreshToken, error) {
	userID, ok := UserIDFromTokenID(tokenID)
	if !ok {
		return nil, nil
	}
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	resp, err := s.container.ReadItem(ctx, pk, tokenID, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos read refresh token: %w", err)
	}
	var t RefreshToken
	if err := json.Unmarshal(resp.Value, &t); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal refresh token: %w", err)
	}
	exp, err := time.Parse(time.RFC3339, t.ExpiresAt)
	if err != nil || time.Now().After(exp) {
		_ = s.Delete(tokenID)
		return nil, nil
	}
	return &t, nil
}

func (s *CosmosRefreshTokenStore) Delete(tokenID string) error {
	userID, ok := UserIDFromTokenID(tokenID)
	if !ok {
		return nil
	}
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	_, err := s.container.DeleteItem(ctx, pk, tokenID, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("cosmos delete refresh token: %w", err)
	}
	return nil
}

func (s *CosmosRefreshTokenStore) DeleteByUserID(userID string) error {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	query := "SELECT c.id FROM c"
	opts := &azcosmos.QueryOptions{QueryParameters: []azcosmos.QueryParameter{}}
	pager := s.container.NewQueryItemsPager(query, pk, opts)
	var ids []string
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return fmt.Errorf("cosmos query refresh tokens for user %s: %w", userID, err)
		}
		for _, raw := range page.Items {
			var item struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(raw, &item); err == nil && item.ID != "" {
				ids = append(ids, item.ID)
			}
		}
	}
	for _, id := range ids {
		_, err := s.container.DeleteItem(ctx, pk, id, nil)
		if err != nil {
			var respErr *azcore.ResponseError
			if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
				continue
			}
			return fmt.Errorf("cosmos delete refresh token %s: %w", id, err)
		}
	}
	return nil
}
