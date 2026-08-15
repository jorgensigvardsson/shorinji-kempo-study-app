package store

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// CosmosUserDataStore keeps one item per document field, all sharing the user as
// partition key.
//
// Sharing a partition is what makes a document writable in one transactional batch:
// Cosmos only offers atomicity within a single partition. Without it a shadow write
// could land half-applied, and a half-applied document is worse than none.
type CosmosUserDataStore struct {
	container *azcosmos.ContainerClient
}

func NewCosmosUserDataStore(endpoint, key, database, container string) (*CosmosUserDataStore, error) {
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
	return &CosmosUserDataStore{container: cc}, nil
}

func (s *CosmosUserDataStore) Save(userID string, doc *Document, ifMatch string) (string, error) {
	return s.save(userID, doc, ifMatch, true)
}

func (s *CosmosUserDataStore) SaveUnconditional(userID string, doc *Document) (string, error) {
	return s.save(userID, doc, "", false)
}

func (s *CosmosUserDataStore) save(userID string, doc *Document, ifMatch string, checked bool) (string, error) {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)

	items, err := SplitDocument(userID, doc)
	if err != nil {
		return "", err
	}

	// Which field items the previous version had, so ones no longer present are
	// removed rather than left behind to reappear in a later reassembly.
	previous, _, err := s.loadMeta(userID)
	if err != nil {
		return "", err
	}

	batch := s.container.NewTransactionalBatch(pk)

	// The meta item goes in first and carries the precondition for the whole batch:
	// Cosmos rejects every operation in a batch if any one of them fails, so guarding
	// the item that changes on every write guards the document.
	metaEncoded, err := json.Marshal(items[0])
	if err != nil {
		return "", fmt.Errorf("marshal user data item %s/%s: %w", userID, items[0].ID, err)
	}
	switch {
	case !checked:
		batch.UpsertItem(metaEncoded, nil)
	case ifMatch == "":
		// A claim that nothing is stored yet, which CreateItem is the check for.
		batch.CreateItem(metaEncoded, nil)
	default:
		etag := azcore.ETag(ifMatch)
		batch.ReplaceItem(metaItemID, metaEncoded, &azcosmos.TransactionalBatchItemOptions{IfMatchETag: &etag})
	}

	for _, item := range items[1:] {
		encoded, err := json.Marshal(item)
		if err != nil {
			return "", fmt.Errorf("marshal user data item %s/%s: %w", userID, item.ID, err)
		}
		batch.UpsertItem(encoded, nil)
	}

	if previous != nil {
		current := make(map[string]bool, len(items))
		for _, item := range items {
			current[item.ID] = true
		}
		for _, name := range previous.Fields {
			id := fieldItemID(name, previous.ItemScheme)
			if current[id] {
				continue // still part of the document, and rewritten above
			}
			if previous.ItemScheme == SchemeLegacy {
				// Cosmos refuses to delete an id containing "/", so the item is emptied
				// instead. This is the path every field of a legacy document takes on
				// its first write under the new scheme: the value now lives under a new
				// id, and the old item is superseded and stripped of its contents.
				husk, err := legacyItemHusk(userID, id)
				if err != nil {
					return "", err
				}
				batch.UpsertItem(husk, nil)
				continue
			}
			batch.DeleteItem(id, nil)
		}
	}

	resp, err := s.container.ExecuteTransactionalBatch(ctx, batch, nil)
	if err != nil {
		return "", fmt.Errorf("cosmos save user data %s: %w", userID, err)
	}
	if !resp.Success {
		if checked && batchPreconditionFailed(resp) {
			return "", ErrPreconditionFailed
		}
		return "", fmt.Errorf("cosmos save user data %s: %w", userID, batchFailure(resp))
	}
	if len(resp.OperationResults) == 0 {
		return "", fmt.Errorf("cosmos save user data %s: batch reported no results", userID)
	}
	// The meta operation was first, so its ETag is the document's new version.
	return string(resp.OperationResults[0].ETag), nil
}

func (s *CosmosUserDataStore) Load(userID string) (*Document, string, error) {
	meta, etag, err := s.loadMeta(userID)
	if err != nil {
		return nil, "", err
	}
	if meta == nil {
		return nil, "", nil
	}

	encodedMeta, err := json.Marshal(meta)
	if err != nil {
		return nil, "", fmt.Errorf("marshal document meta %s: %w", userID, err)
	}
	items := []UserDataItem{{ID: metaItemID, UserID: userID, Value: encodedMeta}}

	// Point reads, driven by the field list in meta, so this container needs no
	// indexing — the same reason the one it replaces has none. The ids are built with
	// the scheme meta records, so a document written before the scheme changed is read
	// exactly as it was written rather than guessed at.
	for _, name := range meta.Fields {
		item, _, err := s.readItem(userID, fieldItemID(name, meta.ItemScheme))
		if err != nil {
			return nil, "", err
		}
		if item == nil {
			return nil, "", fmt.Errorf("cosmos load user data %s: meta names field %q but no item holds it", userID, name)
		}
		items = append(items, *item)
	}
	doc, err := AssembleDocument(items)
	if err != nil {
		return nil, "", err
	}
	return doc, etag, nil
}

// retireLegacyItem empties an item whose id Cosmos will not let us delete.
//
// Upsert is accepted for these ids even though delete is not, so the item is
// overwritten with a husk holding nothing but the id and partition key. The user's
// data is what goes; the shell stays behind, unreachable, because meta no longer
// names the field or names it under a different scheme.
//
// Expiring them instead would be tidier, but TTL cannot be enabled on a container
// with indexing turned off, and this one has all access by point read precisely so
// that it can stay off. An empty shell is the price of the original mistake.
// Returns the husk rather than taking the batch, deliberately: TransactionalBatch is
// a value type whose methods append to a slice it holds, so handing one to a function
// hands over a copy, and every operation added inside is discarded on return. The
// first version of this did exactly that — the writes all succeeded, and the legacy
// items quietly kept their contents.
func legacyItemHusk(userID, id string) ([]byte, error) {
	husk, err := json.Marshal(UserDataItem{ID: id, UserID: userID})
	if err != nil {
		return nil, fmt.Errorf("marshal husk for %s/%s: %w", userID, id, err)
	}
	return husk, nil
}

func (s *CosmosUserDataStore) Delete(userID string) error {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(userID)

	meta, _, err := s.loadMeta(userID)
	if err != nil {
		return err
	}
	if meta == nil {
		return nil
	}

	batch := s.container.NewTransactionalBatch(pk)
	for _, name := range meta.Fields {
		id := fieldItemID(name, meta.ItemScheme)
		// Deleting an account has to actually remove the data. For a legacy id Cosmos
		// refuses the delete, so the item is overwritten with a husk that expires —
		// which clears the user's data in the same batch either way.
		if meta.ItemScheme == SchemeLegacy {
			husk, err := legacyItemHusk(userID, id)
			if err != nil {
				return err
			}
			batch.UpsertItem(husk, nil)
			continue
		}
		batch.DeleteItem(id, nil)
	}
	batch.DeleteItem(metaItemID, nil)

	resp, err := s.container.ExecuteTransactionalBatch(ctx, batch, nil)
	if err != nil {
		return fmt.Errorf("cosmos delete user data %s: %w", userID, err)
	}
	if !resp.Success {
		return fmt.Errorf("cosmos delete user data %s: %w", userID, batchFailure(resp))
	}
	return nil
}

// loadMeta returns the meta item and its ETag — the ETag of the document as a whole,
// since every write rewrites this item.
func (s *CosmosUserDataStore) loadMeta(userID string) (*DocumentMeta, string, error) {
	item, etag, err := s.readItem(userID, metaItemID)
	if err != nil || item == nil {
		return nil, "", err
	}
	var meta DocumentMeta
	if err := json.Unmarshal(item.Value, &meta); err != nil {
		return nil, "", fmt.Errorf("cosmos unmarshal document meta %s: %w", userID, err)
	}
	return &meta, etag, nil
}

func (s *CosmosUserDataStore) readItem(userID, id string) (*UserDataItem, string, error) {
	pk := azcosmos.NewPartitionKeyString(userID)
	resp, err := s.container.ReadItem(context.Background(), pk, id, nil)
	if err != nil {
		if statusOf(err) == http.StatusNotFound {
			return nil, "", nil
		}
		return nil, "", fmt.Errorf("cosmos read user data item %s/%s: %w", userID, id, err)
	}
	var item UserDataItem
	if err := json.Unmarshal(resp.Value, &item); err != nil {
		return nil, "", fmt.Errorf("cosmos unmarshal user data item %s/%s: %w", userID, id, err)
	}
	return &item, string(resp.ETag), nil
}

// batchPreconditionFailed reports whether a rejected batch was rejected because the
// meta item's precondition did not hold — the document moved under this write —
// rather than for some other reason.
func batchPreconditionFailed(resp azcosmos.TransactionalBatchResponse) bool {
	for _, result := range resp.OperationResults {
		switch result.StatusCode {
		case http.StatusPreconditionFailed, http.StatusConflict, http.StatusNotFound:
			return true
		case http.StatusFailedDependency:
			continue
		default:
			return false
		}
	}
	return false
}

// batchFailure names the operation that actually failed. Every other operation in a
// rejected batch reports 424 Failed Dependency, so reporting the first non-424 result
// is the difference between a usable error and a wall of noise.
func batchFailure(resp azcosmos.TransactionalBatchResponse) error {
	for i, result := range resp.OperationResults {
		if result.StatusCode != http.StatusFailedDependency {
			return fmt.Errorf("operation %d failed with status %d", i, result.StatusCode)
		}
	}
	return fmt.Errorf("batch rejected with no failing operation reported")
}
