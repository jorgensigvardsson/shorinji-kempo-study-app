package store

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
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
//
// Security: the full token value (which includes the random secret) is never
// written to Cosmos. Only a SHA-256 hash of the token ID is stored as the item
// ID, so a Cosmos data-plane leak does not yield usable bearer tokens.
type CosmosRefreshTokenStore struct {
	container *azcosmos.ContainerClient
}

// cosmosTokenRecord is the document shape stored in Cosmos.
// It intentionally omits the original token ID — only its hash is stored.
type cosmosTokenRecord struct {
	ID        string `json:"id"`        // sha256(token.ID), base64url — the Cosmos item ID
	UserID    string `json:"userId"`    // partition key
	FamilyID  string `json:"familyId"`
	ExpiresAt string `json:"expiresAt"`
	CreatedAt string `json:"createdAt"`
}

// tokenStorageKey returns the SHA-256 hash of a token ID, encoded as base64url.
// This is used as the Cosmos item ID so the secret random bytes are never stored.
func tokenStorageKey(tokenID string) string {
	h := sha256.Sum256([]byte(tokenID))
	return base64.RawURLEncoding.EncodeToString(h[:])
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
	rec := cosmosTokenRecord{
		ID:        tokenStorageKey(token.ID), // store hash of the secret, not the secret itself
		UserID:    token.UserID,
		FamilyID:  token.FamilyID,
		ExpiresAt: token.ExpiresAt,
		CreatedAt: token.CreatedAt,
	}
	data, err := json.Marshal(rec)
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
	resp, err := s.container.ReadItem(ctx, pk, tokenStorageKey(tokenID), nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos read refresh token: %w", err)
	}
	var rec cosmosTokenRecord
	if err := json.Unmarshal(resp.Value, &rec); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal refresh token: %w", err)
	}
	exp, err := time.Parse(time.RFC3339, rec.ExpiresAt)
	if err != nil || time.Now().After(exp) {
		_ = s.Delete(tokenID)
		return nil, nil
	}
	return &RefreshToken{
		ID:        tokenID,
		UserID:    rec.UserID,
		FamilyID:  rec.FamilyID,
		ExpiresAt: rec.ExpiresAt,
		CreatedAt: rec.CreatedAt,
	}, nil
}

// FindAndDelete atomically reads and deletes a token using an ETag guard so
// that concurrent rotation attempts cannot both succeed. If the ETag-guarded
// delete fails with 412, another concurrent request already rotated this token;
// ErrConcurrentModification is returned so the caller can distinguish that from
// a replay attack.
func (s *CosmosRefreshTokenStore) FindAndDelete(tokenID string) (*RefreshToken, error) {
	userID, ok := UserIDFromTokenID(tokenID)
	if !ok {
		return nil, nil
	}
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	key := tokenStorageKey(tokenID)

	readResp, err := s.container.ReadItem(ctx, pk, key, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos read refresh token: %w", err)
	}

	var rec cosmosTokenRecord
	if err := json.Unmarshal(readResp.Value, &rec); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal refresh token: %w", err)
	}
	exp, err := time.Parse(time.RFC3339, rec.ExpiresAt)
	if err != nil || time.Now().After(exp) {
		return nil, nil
	}

	// ETag-guarded delete: only succeeds if no other request modified the record
	// between our read and this delete. A 412 means a concurrent rotation won.
	etag := readResp.ETag
	_, err = s.container.DeleteItem(ctx, pk, key, &azcosmos.ItemOptions{IfMatchEtag: &etag})
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusPreconditionFailed {
			return nil, ErrConcurrentModification
		}
		return nil, fmt.Errorf("cosmos delete refresh token: %w", err)
	}

	return &RefreshToken{
		ID:        tokenID,
		UserID:    rec.UserID,
		FamilyID:  rec.FamilyID,
		ExpiresAt: rec.ExpiresAt,
		CreatedAt: rec.CreatedAt,
	}, nil
}

func (s *CosmosRefreshTokenStore) FindByFamilyID(userID, familyID string) (*RefreshToken, error) {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	query := "SELECT * FROM c WHERE c.familyId = @fid"
	opts := &azcosmos.QueryOptions{
		QueryParameters: []azcosmos.QueryParameter{{Name: "@fid", Value: familyID}},
	}
	pager := s.container.NewQueryItemsPager(query, pk, opts)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("cosmos query refresh tokens by family %s: %w", familyID, err)
		}
		for _, raw := range page.Items {
			var rec cosmosTokenRecord
			if err := json.Unmarshal(raw, &rec); err != nil {
				continue
			}
			exp, err := time.Parse(time.RFC3339, rec.ExpiresAt)
			if err != nil || time.Now().After(exp) {
				continue
			}
			return &RefreshToken{
				UserID:    rec.UserID,
				FamilyID:  rec.FamilyID,
				ExpiresAt: rec.ExpiresAt,
				CreatedAt: rec.CreatedAt,
			}, nil
		}
	}
	return nil, nil
}

func (s *CosmosRefreshTokenStore) Delete(tokenID string) error {
	userID, ok := UserIDFromTokenID(tokenID)
	if !ok {
		return nil
	}
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)
	_, err := s.container.DeleteItem(ctx, pk, tokenStorageKey(tokenID), nil)
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
	// Item IDs in this partition are hashes; SELECT c.id retrieves them directly.
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
