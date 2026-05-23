package store

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// identityIndexItem is stored in the identity_index container.
// It maps (provider, sub) → userID with a stable, hash-derived item ID.
type identityIndexItem struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Sub      string `json:"sub"`
	UserID   string `json:"userId"`
}

// identityKey produces a stable, URL-safe item ID for a (provider, sub) pair.
func identityKey(provider, sub string) string {
	h := sha256.Sum256([]byte(provider + ":" + sub))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// CosmosUserStore persists users in the Cosmos DB `users` container and
// maintains a secondary `identity_index` container for efficient
// FindByLinkedIdentity lookups without cross-partition queries.
type CosmosUserStore struct {
	users *azcosmos.ContainerClient
	index *azcosmos.ContainerClient
}

func NewCosmosUserStore(endpoint, key, database, usersContainer, identityIndexContainer string) (*CosmosUserStore, error) {
	cred, err := azcosmos.NewKeyCredential(key)
	if err != nil {
		return nil, fmt.Errorf("cosmos key credential: %w", err)
	}
	client, err := azcosmos.NewClientWithKey(endpoint, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("cosmos client: %w", err)
	}
	uc, err := client.NewContainer(database, usersContainer)
	if err != nil {
		return nil, fmt.Errorf("cosmos container %s/%s: %w", database, usersContainer, err)
	}
	ic, err := client.NewContainer(database, identityIndexContainer)
	if err != nil {
		return nil, fmt.Errorf("cosmos container %s/%s: %w", database, identityIndexContainer, err)
	}
	return &CosmosUserStore{users: uc, index: ic}, nil
}

func (s *CosmosUserStore) FindByID(id string) (*User, error) {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(id)
	resp, err := s.users.ReadItem(ctx, pk, id, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos read user %s: %w", id, err)
	}
	var u User
	if err := json.Unmarshal(resp.Value, &u); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal user %s: %w", id, err)
	}
	return &u, nil
}

// FindByLinkedIdentity performs an O(1) point read against the identity index.
func (s *CosmosUserStore) FindByLinkedIdentity(provider, sub string) (*User, error) {
	ctx := context.Background()
	key := identityKey(provider, sub)
	pk := azcosmos.NewPartitionKeyString(key)
	resp, err := s.index.ReadItem(ctx, pk, key, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("cosmos read identity index %s/%s: %w", provider, sub, err)
	}
	var item identityIndexItem
	if err := json.Unmarshal(resp.Value, &item); err != nil {
		return nil, fmt.Errorf("cosmos unmarshal identity index: %w", err)
	}
	return s.FindByID(item.UserID)
}

// Save upserts the user record and synchronises the identity index.
// An ETag guard on the user record detects concurrent modifications and returns
// an error rather than silently clobbering a concurrent write.
func (s *CosmosUserStore) Save(user *User) error {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(user.ID)

	// Read the current version for ETag and to detect removed linked identities.
	var etag *azcore.ETag
	readResp, err := s.users.ReadItem(ctx, pk, user.ID, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if !errors.As(err, &respErr) || respErr.StatusCode != http.StatusNotFound {
			return fmt.Errorf("cosmos read user %s: %w", user.ID, err)
		}
		// New user — no existing record; proceed without ETag or index cleanup.
	} else {
		etag = &readResp.ETag
		var existing User
		if err := json.Unmarshal(readResp.Value, &existing); err == nil {
			for provider, identity := range existing.LinkedIdentities {
				if _, stillLinked := user.LinkedIdentities[provider]; !stillLinked {
					key := identityKey(provider, identity.Sub)
					ipk := azcosmos.NewPartitionKeyString(key)
					if _, err := s.index.DeleteItem(ctx, ipk, key, nil); err != nil {
						log.Printf("warning: cosmos delete identity index %s/%s: %v", provider, identity.Sub, err)
					}
				}
			}
		}
	}

	data, err := json.Marshal(user)
	if err != nil {
		return fmt.Errorf("cosmos marshal user %s: %w", user.ID, err)
	}

	opts := &azcosmos.ItemOptions{}
	if etag != nil {
		opts.IfMatchEtag = etag
	}
	if _, err := s.users.UpsertItem(ctx, pk, data, opts); err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusPreconditionFailed {
			return fmt.Errorf("cosmos save user %s: concurrent modification — retry the operation", user.ID)
		}
		return fmt.Errorf("cosmos upsert user %s: %w", user.ID, err)
	}

	// Upsert identity index entries for all current linked identities.
	for provider, identity := range user.LinkedIdentities {
		key := identityKey(provider, identity.Sub)
		item := identityIndexItem{
			ID:       key,
			Provider: provider,
			Sub:      identity.Sub,
			UserID:   user.ID,
		}
		data, err := json.Marshal(item)
		if err != nil {
			log.Printf("warning: cosmos marshal identity index %s/%s: %v", provider, identity.Sub, err)
			continue
		}
		ipk := azcosmos.NewPartitionKeyString(key)
		if _, err := s.index.UpsertItem(ctx, ipk, data, nil); err != nil {
			log.Printf("warning: cosmos upsert identity index %s/%s: %v", provider, identity.Sub, err)
		}
	}
	return nil
}

// Delete removes the user and all their identity index entries.
func (s *CosmosUserStore) Delete(id string) error {
	ctx := context.Background()

	// Load user to find which identity index entries to remove.
	user, err := s.FindByID(id)
	if err != nil {
		return err
	}
	if user != nil {
		for provider, identity := range user.LinkedIdentities {
			key := identityKey(provider, identity.Sub)
			pk := azcosmos.NewPartitionKeyString(key)
			if _, err := s.index.DeleteItem(ctx, pk, key, nil); err != nil {
				log.Printf("warning: cosmos delete identity index %s/%s: %v", provider, identity.Sub, err)
			}
		}
	}

	pk := azcosmos.NewPartitionKeyString(id)
	_, err = s.users.DeleteItem(ctx, pk, id, nil)
	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("cosmos delete user %s: %w", id, err)
	}
	return nil
}
