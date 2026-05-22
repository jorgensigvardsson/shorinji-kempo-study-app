package store

import "errors"

// CosmosDBStore will persist documents in Azure Cosmos DB (NoSQL API).
// Connection parameters are set at construction time; the actual SDK calls
// are not yet implemented.
type CosmosDBStore struct {
	endpoint  string
	key       string
	database  string
	container string
}

func NewCosmosDBStore(endpoint, key, database, container string) *CosmosDBStore {
	return &CosmosDBStore{
		endpoint:  endpoint,
		key:       key,
		database:  database,
		container: container,
	}
}

func (s *CosmosDBStore) Load() (*Document, error) {
	return nil, errors.New("CosmosDB storage backend not yet implemented")
}

func (s *CosmosDBStore) Save(doc *Document) error {
	return errors.New("CosmosDB storage backend not yet implemented")
}
