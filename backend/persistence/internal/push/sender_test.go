package push

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

// VAPID key pair for the sender under test — any valid P-256 pair works, this
// one is just fixed so tests are deterministic.
const testVAPIDPublic = "BMFC5ak6g3tvewUomeT9j-88XsBs0H8rS-0jIOi5JWg2QK_ZOan24AyRro7USk33XsqgUKYq_4vqt9dJ5TYXBTw"
const testVAPIDPrivate = "DsidlmkQ3_MmHM9RsbpNp2TqP8Seh-aD4Otm4dTZxZQ"

// realSubscriptionKeys generates a syntactically valid p256dh/auth pair — a
// genuine P-256 public key and a random 16-byte auth secret, the shape a
// browser's PushManager actually produces — so webpush-go's aes128gcm
// encryption succeeds and the library gets as far as making the HTTP request
// this test wants to observe the response of.
func realSubscriptionKeys(t *testing.T) (p256dh, auth string) {
	t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate subscriber key: %v", err)
	}
	authSecret := make([]byte, 16)
	if _, err := rand.Read(authSecret); err != nil {
		t.Fatalf("generate auth secret: %v", err)
	}
	return base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()),
		base64.RawURLEncoding.EncodeToString(authSecret)
}

func testSubscription(t *testing.T, endpoint string) *store.PushSubscription {
	t.Helper()
	p256dh, auth := realSubscriptionKeys(t)
	return &store.PushSubscription{Endpoint: endpoint, P256dh: p256dh, Auth: auth}
}

func TestSend_NotFoundOrGone_ReturnsErrGone(t *testing.T) {
	for _, status := range []int{http.StatusNotFound, http.StatusGone} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
		}))
		defer srv.Close()

		s := New(testVAPIDPublic, testVAPIDPrivate, "mailto:test@example.com")
		err := s.Send(testSubscription(t, srv.URL), Payload{Title: "hi"})
		if err != ErrGone {
			t.Errorf("status %d: got %v, want ErrGone", status, err)
		}
	}
}

// A key mismatch after VAPID rotation typically surfaces as 403, and it means
// the subscription is exactly as dead as a 404/410 — it should prune the same
// way (PUSH-AUDIENCE-PLAN.md §7).
func TestSend_Forbidden_ReturnsErrGone(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	s := New(testVAPIDPublic, testVAPIDPrivate, "mailto:test@example.com")
	err := s.Send(testSubscription(t, srv.URL), Payload{Title: "hi"})
	if err != ErrGone {
		t.Errorf("got %v, want ErrGone", err)
	}
}

func TestSend_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	s := New(testVAPIDPublic, testVAPIDPrivate, "mailto:test@example.com")
	if err := s.Send(testSubscription(t, srv.URL), Payload{Title: "hi"}); err != nil {
		t.Errorf("got %v, want nil", err)
	}
}

func TestSend_ServerError_NotGone(t *testing.T) {
	// A transient server-side failure is not the subscription's fault, so it
	// must not be pruned — counted as Failed by Broadcast, left in place.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	s := New(testVAPIDPublic, testVAPIDPrivate, "mailto:test@example.com")
	err := s.Send(testSubscription(t, srv.URL), Payload{Title: "hi"})
	if err == nil || err == ErrGone {
		t.Errorf("got %v, want a non-ErrGone error", err)
	}
}

// fakePruner records which endpoints Broadcast asked to delete.
type fakePruner struct{ deleted []string }

func (p *fakePruner) DeleteSubscription(endpoint string) error {
	p.deleted = append(p.deleted, endpoint)
	return nil
}

func TestBroadcast_PrunesGoneSubscriptions(t *testing.T) {
	gone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer gone.Close()
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	defer ok.Close()

	s := New(testVAPIDPublic, testVAPIDPrivate, "mailto:test@example.com")
	subs := []*store.PushSubscription{
		testSubscription(t, gone.URL),
		testSubscription(t, ok.URL),
	}
	pruner := &fakePruner{}
	res := s.Broadcast(subs, Payload{Title: "hi"}, pruner, nil)

	if res.Sent != 1 || res.Pruned != 1 || res.Failed != 0 {
		t.Errorf("got %+v, want Sent=1 Pruned=1 Failed=0", res)
	}
	if len(pruner.deleted) != 1 || pruner.deleted[0] != gone.URL {
		t.Errorf("expected the 403 subscription pruned, got %v", pruner.deleted)
	}
}
