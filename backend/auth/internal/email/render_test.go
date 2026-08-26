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

// The notice to the deciding admins used to be English for everyone, because the
// server had no way of knowing what they read. Members now carry a language, so
// it is written in theirs.
func TestRenderJoinRequestNotice_Localized(t *testing.T) {
	notice := JoinRequestNotice{
		ApplicantName:      "Hopeful Person",
		ApplicantEmail:     "hopeful@example.org",
		BranchName:         "Karlstad",
		Note:               "Jag tränar på tisdagar",
		PreviouslyDeniedAt: "2026-05-01",
	}

	sv, err := renderJoinRequestNotice(notice, "sv")
	if err != nil {
		t.Fatalf("render sv: %v", err)
	}
	if !strings.Contains(sv.subject, "Ansökan om medlemskap") {
		t.Errorf("swedish subject = %q", sv.subject)
	}
	if !strings.Contains(sv.plain, "Med egna ord:") || !strings.Contains(sv.plain, "Jag tränar på tisdagar") {
		t.Errorf("swedish body left out the applicant's own words:\n%s", sv.plain)
	}
	// A re-application is not the same question as a first one, in any language.
	if !strings.Contains(sv.plain, "2026-05-01") {
		t.Errorf("swedish body did not mention the earlier refusal:\n%s", sv.plain)
	}
	// Replying to "somebody wants to join" usually means asking them something.
	if sv.replyTo != "hopeful@example.org" {
		t.Errorf("reply-to = %q", sv.replyTo)
	}

	// A language nobody has written copy for falls back rather than rendering
	// empty, which is what makes an unknown tag safe to store.
	fallback, err := renderJoinRequestNotice(notice, "fi")
	if err != nil {
		t.Fatalf("render fi: %v", err)
	}
	if !strings.Contains(fallback.subject, "Membership request") {
		t.Errorf("fallback subject = %q, want the English copy", fallback.subject)
	}
}

// The applicant writes their own name and note, and both land in an admin's mail
// client. Nothing they type may become markup.
func TestRenderJoinRequestNotice_EscapesTheApplicant(t *testing.T) {
	rendered, err := renderJoinRequestNotice(JoinRequestNotice{
		ApplicantName:  "<script>alert(1)</script>",
		ApplicantEmail: "x@example.org",
		BranchName:     "Karlstad",
		Note:           "<img src=x onerror=alert(2)>",
	}, "en")
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	// Escaped, the note still reads "onerror=" — what must not appear is a tag.
	if strings.Contains(rendered.html, "<script>") || strings.Contains(rendered.html, "<img") {
		t.Errorf("applicant input reached the HTML unescaped:\n%s", rendered.html)
	}
}
