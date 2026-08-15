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
			if id := fieldItemID(name); !current[id] {
				batch.DeleteItem(id, nil)
			}
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
	// indexing — the same reason the one it replaces has none.
	for _, name := range meta.Fields {
		item, _, err := s.readItem(userID, fieldItemID(name))
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
		batch.DeleteItem(fieldItemID(name), nil)
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
