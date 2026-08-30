package store

// PushSubscription is a Web Push subscription as reported by the browser's
// PushManager, plus a little server-side bookkeeping. The endpoint uniquely
// identifies the subscription; re-subscribing with the same endpoint upserts.
type PushSubscription struct {
	Endpoint   string `json:"endpoint"`
	P256dh     string `json:"p256dh"`     // keys.p256dh from the browser subscription
	Auth       string `json:"auth"`       // keys.auth from the browser subscription
	UserID     string `json:"userId"`     // empty for anonymous subscriptions
	CreatedAt  string `json:"createdAt"`  // RFC3339
	LastSeenAt string `json:"lastSeenAt"` // RFC3339, bumped on every re-subscribe
}

// PushStore persists Web Push subscriptions. Implementations must treat Endpoint
// as the unique key: SaveSubscription upserts on it, DeleteSubscription removes by
// it, and ListSubscriptions returns every stored subscription for broadcast.
type PushStore interface {
	SaveSubscription(sub *PushSubscription) error
	DeleteSubscription(endpoint string) error
	ListSubscriptions() ([]*PushSubscription, error)

	// ListSubscriptionsForUsers returns the subscriptions belonging to any of
	// the given user ids — the scoped counterpart to ListSubscriptions, for a
	// push audience narrower than everybody. Given no ids it returns nothing
	// without touching the store, matching UserStore.ListByBranches on the
	// auth side.
	ListSubscriptionsForUsers(userIDs []string) ([]*PushSubscription, error)
}
