package email

import (
	"strings"
	"testing"
)

// The whole point of this message is that its reader did not ask for it. It has
// to name the club that vouched for them, and it has to say how to undo the
// thing — in the language they are most likely to read, and in both renderings,
// since a client shows whichever part it understands.
func TestRenderAccountCreated_NamesTheBranchAndTheWayOut(t *testing.T) {
	for _, tc := range []struct {
		name      string
		lang      string
		wantBody  string
		wantUndo  string
		wantTitle string
	}{
		{"swedish", "sv", "En administratör för Karlstad", "radera kontot under Inställningar", "Ett konto har skapats åt dig"},
		{"english", "en", "An administrator for Karlstad", "delete the account under Settings", "An account has been created for you"},
		{"turkish", "tr", "Karlstad yöneticisi", "Ayarlar bölümünden hesabı silebilirsiniz", "Sizin için bir hesap oluşturuldu"},
		{"japanese", "ja", "Karlstad の管理者", "アカウントを削除できます", "アカウントが作成されました"},
		{"an unknown language falls back to English", "fi", "An administrator for Karlstad", "delete the account under Settings", "An account has been created for you"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			msg, err := renderAccountCreated("Karlstad", tc.lang)
			if err != nil {
				t.Fatalf("render: %v", err)
			}
			if msg.subject != tc.wantTitle {
				t.Errorf("subject = %q, want %q", msg.subject, tc.wantTitle)
			}
			for _, want := range []string{tc.wantBody, tc.wantUndo} {
				if !strings.Contains(msg.plain, want) {
					t.Errorf("plain text does not state %q:\n%s", want, msg.plain)
				}
				if !strings.Contains(msg.html, want) {
					t.Errorf("HTML does not state %q", want)
				}
			}
		})
	}
}

// The second paragraph is the one this message added to the shared card. Every
// message that has nothing to put there must still render as it did — a blank
// paragraph in a decision mail would be a visible change to messages nobody
// touched.
func TestRenderApplicantMessage_LeavesNoGapWithoutAnExtra(t *testing.T) {
	msg, err := renderJoinDecision("Karlstad", "en", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if strings.Contains(msg.plain, "\n\n\n") {
		t.Errorf("plain text left a blank paragraph behind:\n%q", msg.plain)
	}
	if strings.Contains(msg.html, "<p class=\"muted\"") {
		t.Errorf("HTML rendered the extra paragraph with nothing in it:\n%s", msg.html)
	}
}

// The branch's name is somebody's own text, and it lands in a mail client.
func TestRenderAccountCreated_EscapesTheBranchName(t *testing.T) {
	msg, err := renderAccountCreated("<script>alert(1)</script>", "en")
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if strings.Contains(msg.html, "<script>") {
		t.Errorf("a branch name reached the HTML unescaped:\n%s", msg.html)
	}
}
