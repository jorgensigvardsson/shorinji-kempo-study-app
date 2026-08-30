// Package push signs and delivers Web Push messages to browser push services
// using the standard Web Push Protocol + VAPID. It wraps webpush-go, which
// handles ECDH payload encryption and VAPID JWT signing.
package push

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

// Payload is the JSON delivered to the service worker's push handler.
type Payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"`
}

// Sender holds the VAPID credentials and delivers notifications.
type Sender struct {
	publicKey  string
	privateKey string
	subject    string // "mailto:you@example.com" or a site URL
}

// New returns a Sender. publicKey/privateKey are the VAPID key pair (base64url);
// subject is the VAPID subject required by the protocol.
func New(publicKey, privateKey, subject string) *Sender {
	return &Sender{publicKey: publicKey, privateKey: privateKey, subject: subject}
}

// PublicKey returns the VAPID public key the client needs to subscribe.
func (s *Sender) PublicKey() string { return s.publicKey }

// ErrGone signals that the push service reported the subscription as permanently
// invalid (404/410). The caller should delete the stored subscription.
var ErrGone = fmt.Errorf("subscription gone")

// Send delivers payload to a single subscription. It returns ErrGone when the
// push service responds 404/410 so the caller can prune the dead subscription.
func (s *Sender) Send(sub *store.PushSubscription, payload Payload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	resp, err := webpush.SendNotification(body, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber:      s.subject,
		VAPIDPublicKey:  s.publicKey,
		VAPIDPrivateKey: s.privateKey,
		TTL:             24 * 60 * 60, // seconds the push service may hold the message
	})
	if err != nil {
		return fmt.Errorf("send notification: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body) // drain so the connection can be reused

	switch {
	// 403 means the VAPID key no longer matches this subscription — as dead as
	// 404/410, just reported differently.
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusForbidden:
		return ErrGone
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return nil
	default:
		return fmt.Errorf("push service responded %d", resp.StatusCode)
	}
}

// BroadcastResult summarises a broadcast run.
type BroadcastResult struct {
	Sent   int `json:"sent"`
	Pruned int `json:"pruned"`
	Failed int `json:"failed"`
}

// Pruner deletes a dead subscription by endpoint.
type Pruner interface {
	DeleteSubscription(endpoint string) error
}

// Broadcast sends payload to every subscription, pruning the ones the push
// service reports as gone. Other failures are counted but left in place so a
// transient outage doesn't drop subscriptions.
func (s *Sender) Broadcast(subs []*store.PushSubscription, payload Payload, pruner Pruner, logf func(string, ...any)) BroadcastResult {
	var res BroadcastResult
	for _, sub := range subs {
		err := s.Send(sub, payload)
		switch {
		case err == nil:
			res.Sent++
		case err == ErrGone:
			res.Pruned++
			if delErr := pruner.DeleteSubscription(sub.Endpoint); delErr != nil && logf != nil {
				logf("push: prune %s: %v", sub.Endpoint, delErr)
			}
		default:
			res.Failed++
			if logf != nil {
				logf("push: send %s: %v", sub.Endpoint, err)
			}
		}
	}
	return res
}

// NowRFC3339 is a tiny helper for handlers building subscription timestamps.
func NowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }
