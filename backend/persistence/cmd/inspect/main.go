package main

// Read-only: reports what is actually stored in the userdata container, per user.
// Temporary; deleted after use.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

type row struct {
	ID     string          `json:"id"`
	UserID string          `json:"userId"`
	Value  json.RawMessage `json:"value"`
}

func main() {
	cred, err := azcosmos.NewKeyCredential(os.Getenv("COSMOS_DB_KEY"))
	must(err)
	client, err := azcosmos.NewClientWithKey(os.Getenv("COSMOS_DB_ENDPOINT"), cred, nil)
	must(err)
	cc, err := client.NewContainer(os.Getenv("COSMOS_DB_DATABASE"), "userdata")
	must(err)

	// Indexing is off on this container, so a scan has to be asked for explicitly.
	// "value" is a reserved word in the Cosmos dialect (SELECT VALUE ...), so it has
	// to be reached by property accessor rather than named directly.
	const query = `SELECT c.id, c.userId, c["value"] FROM c`
	pager := cc.NewQueryItemsPager(query, azcosmos.NewPartitionKey(),
		&azcosmos.QueryOptions{EnableScanInQuery: true})

	byUser := map[string][]row{}
	for pager.More() {
		page, err := pager.NextPage(context.Background())
		must(err)
		for _, raw := range page.Items {
			var r row
			must(json.Unmarshal(raw, &r))
			byUser[r.UserID] = append(byUser[r.UserID], r)
		}
	}

	users := make([]string, 0, len(byUser))
	for u := range byUser {
		users = append(users, u)
	}
	sort.Strings(users)

	totalLegacy, totalLegacyWithData := 0, 0
	for _, u := range users {
		rows := byUser[u]
		sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
		scheme := "?"
		for _, r := range rows {
			if r.ID == "meta" {
				var m struct {
					ItemScheme int `json:"itemScheme"`
				}
				_ = json.Unmarshal(r.Value, &m)
				scheme = fmt.Sprint(m.ItemScheme)
			}
		}
		legacy, legacyWithData, current := 0, 0, 0
		for _, r := range rows {
			switch {
			case len(r.ID) > 6 && r.ID[:6] == "field/":
				legacy++
				if len(r.Value) > 0 && string(r.Value) != "null" {
					legacyWithData++
				}
			case len(r.ID) > 6 && r.ID[:6] == "field_":
				current++
			}
		}
		totalLegacy += legacy
		totalLegacyWithData += legacyWithData
		fmt.Printf("%-40s scheme=%s  current=%2d  legacy=%2d  legacy-still-holding-data=%d\n",
			u, scheme, current, legacy, legacyWithData)
	}
	fmt.Printf("\ntotals: %d legacy items, %d of them still holding data\n", totalLegacy, totalLegacyWithData)
}


func must(err error) {
	if err != nil {
		fmt.Println("FAILED:", err)
		os.Exit(1)
	}
}
