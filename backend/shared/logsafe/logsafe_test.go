package logsafe

import (
	"strings"
	"testing"
)

func TestEmailIsStableForTheSamePerson(t *testing.T) {
	Init([]byte("test key"))

	if Email("member@example.org") != Email("member@example.org") {
		t.Fatal("same address tokenised differently; log lines could not be tied together")
	}
}

// The same person written as they typed it and as it was stored must not become
// two people in the log.
func TestEmailIgnoresCaseAndSurroundingSpace(t *testing.T) {
	Init([]byte("test key"))
	want := Email("member@example.org")

	for _, variant := range []string{"Member@Example.org", "  member@example.org  ", "MEMBER@EXAMPLE.ORG"} {
		if got := Email(variant); got != want {
			t.Errorf("Email(%q) = %q, want %q", variant, got, want)
		}
	}
}

func TestEmailDiffersBetweenPeople(t *testing.T) {
	Init([]byte("test key"))

	if Email("one@example.org") == Email("two@example.org") {
		t.Fatal("two addresses tokenised alike")
	}
}

// The address must not be recoverable from the token, which is the entire point.
func TestEmailNeverContainsTheAddress(t *testing.T) {
	Init([]byte("test key"))

	got := Email("member@example.org")

	for _, fragment := range []string{"member", "example.org", "@"} {
		if strings.Contains(got, fragment) {
			t.Errorf("token %q leaks %q", got, fragment)
		}
	}
}

// An address is guessable, so an unkeyed hash of one is an address with extra
// steps. Holding the logs must not be enough to work backwards.
func TestEmailDependsOnTheKey(t *testing.T) {
	Init([]byte("one key"))
	first := Email("member@example.org")
	Init([]byte("another key"))

	if Email("member@example.org") == first {
		t.Fatal("token ignored the key; a dictionary would reverse it")
	}
}

// Failing closed: with no key the line loses its detail, never its safety.
func TestEmailWithoutAKeyReportsNothingUseful(t *testing.T) {
	key.Store(nil)

	got := Email("member@example.org")

	if got != "usr:unkeyed" {
		t.Errorf("got %q, want usr:unkeyed", got)
	}
	if strings.Contains(got, "member") || strings.Contains(got, "example") {
		t.Errorf("token %q leaked the address it refused to hash", got)
	}
}

// An empty key must not silently replace a real one and quietly change every
// token in the log.
func TestInitIgnoresAnEmptyKey(t *testing.T) {
	Init([]byte("test key"))
	want := Email("member@example.org")

	Init(nil)
	Init([]byte{})

	if got := Email("member@example.org"); got != want {
		t.Errorf("got %q, want %q — an empty key overwrote a real one", got, want)
	}
}

func TestEmailHandlesAnEmptyAddress(t *testing.T) {
	Init([]byte("test key"))

	if got := Email("   "); got != "usr:none" {
		t.Errorf("got %q, want usr:none", got)
	}
}
