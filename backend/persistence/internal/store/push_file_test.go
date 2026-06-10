package store

import "testing"

func sampleSub(endpoint string) *PushSubscription {
	return &PushSubscription{
		Endpoint:   endpoint,
		P256dh:     "p256dh-" + endpoint,
		Auth:       "auth-" + endpoint,
		CreatedAt:  "2026-06-10T00:00:00Z",
		LastSeenAt: "2026-06-10T00:00:00Z",
	}
}

func TestFilePushStore_SaveListDelete(t *testing.T) {
	s := NewFilePushStore(t.TempDir())

	if subs, err := s.ListSubscriptions(); err != nil || len(subs) != 0 {
		t.Fatalf("empty list: subs=%v err=%v", subs, err)
	}

	if err := s.SaveSubscription(sampleSub("https://push.example/a")); err != nil {
		t.Fatalf("save a: %v", err)
	}
	if err := s.SaveSubscription(sampleSub("https://push.example/b")); err != nil {
		t.Fatalf("save b: %v", err)
	}

	subs, err := s.ListSubscriptions()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(subs) != 2 {
		t.Fatalf("expected 2 subscriptions, got %d", len(subs))
	}

	if err := s.DeleteSubscription("https://push.example/a"); err != nil {
		t.Fatalf("delete a: %v", err)
	}
	subs, _ = s.ListSubscriptions()
	if len(subs) != 1 || subs[0].Endpoint != "https://push.example/b" {
		t.Fatalf("after delete expected only b, got %+v", subs)
	}
}

func TestFilePushStore_SaveUpsertsOnEndpoint(t *testing.T) {
	s := NewFilePushStore(t.TempDir())
	const endpoint = "https://push.example/same"

	first := sampleSub(endpoint)
	first.Auth = "old"
	if err := s.SaveSubscription(first); err != nil {
		t.Fatalf("save first: %v", err)
	}

	second := sampleSub(endpoint)
	second.Auth = "new"
	if err := s.SaveSubscription(second); err != nil {
		t.Fatalf("save second: %v", err)
	}

	subs, err := s.ListSubscriptions()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(subs) != 1 {
		t.Fatalf("re-subscribe should upsert, got %d rows", len(subs))
	}
	if subs[0].Auth != "new" {
		t.Errorf("expected upserted auth %q, got %q", "new", subs[0].Auth)
	}
}

func TestFilePushStore_DeleteMissing_NoError(t *testing.T) {
	s := NewFilePushStore(t.TempDir())
	if err := s.DeleteSubscription("https://push.example/missing"); err != nil {
		t.Errorf("delete missing should be a no-op, got %v", err)
	}
}
