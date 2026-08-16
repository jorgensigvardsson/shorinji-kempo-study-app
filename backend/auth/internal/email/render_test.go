package email

import (
	"strings"
	"testing"
	"time"
)

// The lifetime in the copy is the one the auth service passes in, not a number
// this package keeps: a changed TTL has to reach the reader in every language,
// in both the plain-text and the HTML rendering.
func TestRender_StatesTheGivenValidity(t *testing.T) {
	for _, tc := range []struct {
		name     string
		lang     string
		validFor time.Duration
		want     string
	}{
		{"english", "en", 10 * time.Minute, "The code is valid for 10 minutes."},
		{"swedish", "sv", 10 * time.Minute, "Koden gäller i 10 minuter."},
		{"turkish", "tr", 10 * time.Minute, "Kod 10 dakika geçerlidir."},
		{"japanese", "ja", 10 * time.Minute, "コードは10分間有効です。"},
		{"unknown language falls back to English", "xx", 10 * time.Minute, "The code is valid for 10 minutes."},
		{"a TTL other than the current one", "en", 25 * time.Minute, "The code is valid for 25 minutes."},
		{"one minute is worded in the singular", "en", time.Minute, "The code is valid for one minute."},
		{"one minute in Swedish", "sv", time.Minute, "Koden gäller i en minut."},
		// Down, never up: a code with 2½ minutes left is not a three-minute code.
		{"a part-minute is dropped rather than rounded up", "en", 150 * time.Second, "The code is valid for 2 minutes."},
	} {
		t.Run(tc.name, func(t *testing.T) {
			msg, err := render("123456", tc.lang, tc.validFor)
			if err != nil {
				t.Fatalf("render: %v", err)
			}
			if !strings.Contains(msg.plain, tc.want) {
				t.Errorf("plain text does not state %q:\n%s", tc.want, msg.plain)
			}
			if !strings.Contains(msg.html, tc.want) {
				t.Errorf("HTML does not state %q", tc.want)
			}
		})
	}
}

// Under a minute there is no true wording left, so the line goes rather than
// telling the reader the code is valid for zero minutes.
func TestRender_OmitsAnUnstatableValidity(t *testing.T) {
	msg, err := render("123456", "en", 30*time.Second)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if strings.Contains(msg.plain, "valid for") || strings.Contains(msg.html, "valid for") {
		t.Errorf("expected no validity line:\n%s", msg.plain)
	}
	// The rest of the message still has to hold together around the gap.
	for _, want := range []string{"Use the code below to sign in.", "123456", "you can ignore this email"} {
		if !strings.Contains(msg.plain, want) {
			t.Errorf("plain text lost %q:\n%s", want, msg.plain)
		}
	}
	if strings.Contains(msg.plain, "\n\n\n") {
		t.Errorf("plain text left a blank paragraph behind:\n%q", msg.plain)
	}
}
