package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

// CosmosHistoryStore keeps usage history in the `usage_history` container,
// partitioned by /type. It grows by a handful of entries a week, forever, so the
// partitioning is about keeping the snapshot lookups to one partition rather than
// about spreading load there is none of.
type CosmosHistoryStore struct {
	container *azcosmos.ContainerClient
	now       func() time.Time
}

func NewCosmosHistoryStore(endpoint, key, database, container string) (*CosmosHistoryStore, error) {
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
	return &CosmosHistoryStore{container: cc, now: time.Now}, nil
}

// Append creates rather than upserts: an entry is written once and never again,
// and for a weekly snapshot the 409 is how a second run learns the week is done.
func (s *CosmosHistoryStore) Append(e *HistoryEntry) error {
	if e.ID == "" || e.Type == "" {
		return errors.New("history entry needs an id and a type")
	}
	stored := *e
	stored.RecordedAt = s.now().UTC().Format(RecordedAtFormat)
	data, err := json.Marshal(stored)
	if err != nil {
		return fmt.Errorf("cosmos marshal history entry: %w", err)
	}
	if _, err := s.container.CreateItem(context.Background(), azcosmos.NewPartitionKeyString(stored.Type), data, nil); err != nil {
		if isConflict(err) {
			return ErrHistoryExists
		}
		return fmt.Errorf("cosmos create history entry: %w", err)
	}
	e.RecordedAt = stored.RecordedAt
	return nil
}

// Since is a cross-partition query on recordedAt, which is the one path the
// container indexes. RecordedAtFormat is fixed-width UTC, so a string comparison
// is a time comparison.
func (s *CosmosHistoryStore) Since(recordedAt string) ([]*HistoryEntry, error) {
	query, params := "SELECT * FROM c", []azcosmos.QueryParameter(nil)
	if recordedAt != "" {
		query = "SELECT * FROM c WHERE c.recordedAt >= @since"
		params = []azcosmos.QueryParameter{{Name: "@since", Value: recordedAt}}
	}
	return s.query(query, azcosmos.NewPartitionKey(), params)
}

// LatestWeek reads the week partition and picks the newest in Go. A year is 52
// small documents; an ORDER BY would need an index for no gain.
func (s *CosmosHistoryStore) LatestWeek() (string, error) {
	weeks, err := s.query("SELECT * FROM c", azcosmos.NewPartitionKeyString(HistoryWeek), nil)
	if err != nil {
		return "", err
	}
	latest := ""
	for _, e := range weeks {
		if e.Week != nil && e.Week.Start > latest {
			latest = e.Week.Start
		}
	}
	return latest, nil
}

func (s *CosmosHistoryStore) query(query string, pk azcosmos.PartitionKey, params []azcosmos.QueryParameter) ([]*HistoryEntry, error) {
	ctx := context.Background()
	pager := s.container.NewQueryItemsPager(query, pk, &azcosmos.QueryOptions{QueryParameters: params})
	var out []*HistoryEntry
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			var respErr *azcore.ResponseError
			if errors.As(err, &respErr) && respErr.StatusCode == http.StatusNotFound {
				return nil, nil
			}
			return nil, fmt.Errorf("cosmos query history: %w", err)
		}
		for _, raw := range page.Items {
			var e HistoryEntry
			if err := json.Unmarshal(raw, &e); err != nil {
				log.Printf("warning: cosmos query history: unmarshal item: %v", err)
				continue
			}
			out = append(out, &e)
		}
	}
	return out, nil
}
