package store

import "encoding/json"

// Document mirrors the AppDataDocument shape from the frontend.
// The Data field is kept as raw JSON so the server stays agnostic to its internals.
type Document struct {
	Version   int             `json:"version"`
	UpdatedAt string          `json:"updatedAt"`
	DeviceID  string          `json:"deviceId"`
	Data      json.RawMessage `json:"data"`
}

type Store interface {
	Load(userID string) (*Document, error)
	Save(userID string, doc *Document) error
}
