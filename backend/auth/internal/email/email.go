// Package email sends transactional email for the auth service. Today its only
// job is delivering one-time verification codes to users on domains without an
// OIDC provider.
package email

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"log"
	"strings"
	"time"
)

// Sender delivers a verification code to a recipient in the given language.
// lang is one of "sv", "en", "tr", "ja"; unknown values fall back to English.
// validFor is how long the code the caller generated will be accepted; the copy
// states it, so it comes from whoever enforces it rather than from a number kept
// here that would drift from the real TTL.
type Sender interface {
	SendVerificationCode(ctx context.Context, to, code, lang string, validFor time.Duration) error

	// SendFeedback relays an in-app feedback submission to the given recipients.
	SendFeedback(ctx context.Context, to []string, submission FeedbackSubmission) error

	// SendJoinRequestNotice tells the admins who will decide that somebody has
	// asked to join their branch, in the language they last used the app in. The
	// caller groups recipients by language and calls this once per group.
	SendJoinRequestNotice(ctx context.Context, to []string, lang string, notice JoinRequestNotice) error

	// SendJoinReceived confirms to an applicant that the request went somewhere,
	// so that waiting does not look like nothing having happened.
	SendJoinReceived(ctx context.Context, to, branchName, lang string) error

	// SendJoinDecision tells an applicant what was decided, either way.
	SendJoinDecision(ctx context.Context, to, branchName, lang string, approved bool) error

	// SendTransferRequestNotice tells the admins of a branch that a member of
	// another one has asked to move to theirs. Grouped by language like the join
	// notice, and for the same reason.
	SendTransferRequestNotice(ctx context.Context, to []string, lang string, notice TransferNotice) error

	// SendTransferDeparture tells a branch that one of its members has moved on.
	// It asks nothing of them; a transfer is not a negotiation.
	SendTransferDeparture(ctx context.Context, to []string, lang string, notice DepartureNotice) error

	// SendTransferDecision tells a member what the receiving branch decided.
	SendTransferDecision(ctx context.Context, to, branchName, lang string, accepted bool) error
}

// FeedbackSubmission is one in-app feedback submission, along with the context
// that helps a maintainer triage it.
type FeedbackSubmission struct {
	// SubmitterName/SubmitterEmail identify the signed-in user who submitted it,
	// so the recipient can reply directly to them.
	SubmitterName  string
	SubmitterEmail string
	// AppVersion is the frontend build identifier the submitter was running
	// (see frontend/src/sync/backend.ts); "unknown" if the client didn't send one.
	AppVersion string
	// Language is the submitter's selected UI language ("sv", "en", "tr", "ja").
	Language string
	// UserAgent is read server-side from the request, not client-supplied.
	UserAgent string
	Message   string
}

// localized holds one language's worth of copy. The pieces are kept separate
// rather than as one prose blob so the plain-text and HTML renderings say the
// same thing without either being a translation of the other.
type localized struct {
	// appName is the sender's display name — the "…" in `From: "…" <a@b>`. It
	// matches the localized app names in frontend/public/site.webmanifest.
	appName string
	subject string
	heading string
	intro   string
	// validity carries the code's lifetime and takes the number of minutes as its
	// single %d verb; validityOne is the same sentence worded for exactly one
	// minute, which no amount of formatting gets right by itself.
	validity    string
	validityOne string
	ignore      string
}

// templates is keyed by language. English is the fallback (see lookup).
var templates = map[string]localized{
	"en": {
		appName:     "Shorinji Kempo Study App",
		subject:     "Your Shorinji Kempo sign-in code",
		heading:     "Your sign-in code",
		intro:       "Use the code below to sign in.",
		validity:    "The code is valid for %d minutes.",
		validityOne: "The code is valid for one minute.",
		ignore:      "If you didn't request it, you can ignore this email.",
	},
	"sv": {
		appName:     "Shorinji Kempo Studieapp",
		subject:     "Din inloggningskod för Shorinji Kempo",
		heading:     "Din inloggningskod",
		intro:       "Använd koden här nedan för att logga in.",
		validity:    "Koden gäller i %d minuter.",
		validityOne: "Koden gäller i en minut.",
		ignore:      "Om du inte begärde koden kan du bortse från det här meddelandet.",
	},
	"tr": {
		appName:     "Shorinji Kempo Çalışma Uygulaması",
		subject:     "Shorinji Kempo giriş kodunuz",
		heading:     "Giriş kodunuz",
		intro:       "Giriş yapmak için aşağıdaki kodu kullanın.",
		validity:    "Kod %d dakika geçerlidir.",
		validityOne: "Kod bir dakika geçerlidir.",
		ignore:      "Bunu siz istemediyseniz bu e-postayı yoksayabilirsiniz.",
	},
	"ja": {
		appName:     "少林寺拳法学習アプリ",
		subject:     "Shorinji Kempo のログインコード",
		heading:     "ログインコード",
		intro:       "以下のコードを入力してログインしてください。",
		validity:    "コードは%d分間有効です。",
		validityOne: "コードは1分間有効です。",
		ignore:      "心当たりがない場合は、このメールを無視してください。",
	},
}

// DefaultLanguage is what we write in when nobody has told us otherwise. It is
// exported because callers group recipients by language before sending, and must
// agree with this package about what an unknown one falls back to.
const DefaultLanguage = "en"

func lookup(lang string) localized {
	if t, ok := templates[lang]; ok {
		return t
	}
	return templates[DefaultLanguage]
}

// validityLine states how long the code lasts, in whole minutes. Part-minutes
// are dropped rather than rounded, so the sentence never promises the reader more
// time than the code actually has. A lifetime shorter than a minute has no
// wording left that would be true, so it says nothing at all; callers leave the
// line out when this is empty.
func (s localized) validityLine(validFor time.Duration) string {
	minutes := int(validFor / time.Minute)
	switch {
	case minutes < 1:
		return ""
	case minutes == 1:
		return s.validityOne
	default:
		return fmt.Sprintf(s.validity, minutes)
	}
}

// message is one rendered email in every form the sender needs.
type message struct {
	senderName string // display name for the From: header
	subject    string
	plain      string
	html       string
	// replyTo overrides the default noreply@<domain> Reply-To address when set.
	replyTo string
}

// htmlTemplate mirrors the app's own look: the gold accent (#dfbe5a light,
// #f3d36c dark) from frontend/src/styles/bootstrap-theme.scss on a card.
//
// The constraints are email's, not the web's — tables for layout, inline styles
// on every element, no external assets. The one <style> block carries the
// dark-mode overrides; clients that drop it (or don't honour prefers-color-
// scheme) simply keep the light design, which is why every colour is also set
// inline. Deliberately image-free: Gmail refuses data: URIs in <img>, and a
// broken logo would look worse than none.
var htmlTemplate = template.Must(template.New("verification").Parse(`<!DOCTYPE html>
<html lang="{{.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{.Subject}}</title>
<style>
@media (prefers-color-scheme: dark) {
  .page     { background:#1b1e21 !important; }
  .card     { background:#2b3035 !important; }
  .text     { color:#dee2e6 !important; }
  .muted    { color:#adb5bd !important; }
  .band     { background:#f3d36c !important; }
  .code-box { background:#3b3626 !important; border-color:#6b5f34 !important; }
  .code     { color:#f3d36c !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#f8f9fa;">
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" class="card" cellpadding="0" cellspacing="0" border="0" width="480" style="width:100%;max-width:480px;background:#ffffff;border-radius:12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td class="band" style="background:#dfbe5a;height:6px;line-height:6px;font-size:0;border-radius:12px 12px 0 0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 0 28px;">
    <div class="muted" style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6c757d;">{{.AppName}}</div>
    <div class="text" style="margin-top:6px;font-size:20px;font-weight:600;color:#212529;">{{.Heading}}</div>
    <p class="text" style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#212529;">{{.Intro}}</p>
  </td></tr>
  <tr><td style="padding:20px 28px;">
    <div class="code-box" style="background:#faf3df;border:1px solid #efdca9;border-radius:10px;padding:18px 12px;text-align:center;">
      <span class="code" style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.2em;color:#6b5300;">{{.Code}}</span>
    </div>
  </td></tr>
  <tr><td style="padding:0 28px 26px 28px;">
    {{if .Validity}}<p class="muted" style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6c757d;">{{.Validity}}</p>{{end}}
    <p class="muted" style="margin:0;font-size:13px;line-height:1.5;color:#6c757d;">{{.Ignore}}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`))

// render builds the verification email for a language. validFor is the lifetime
// of the code, which the copy states.
func render(code, lang string, validFor time.Duration) (message, error) {
	s := lookup(lang)
	validity := s.validityLine(validFor)

	var html bytes.Buffer
	err := htmlTemplate.Execute(&html, struct {
		Lang, Subject, AppName, Heading, Intro, Code, Validity, Ignore string
	}{
		Lang:     langAttr(lang),
		Subject:  s.subject,
		AppName:  s.appName,
		Heading:  s.heading,
		Intro:    s.intro,
		Code:     code,
		Validity: validity,
		Ignore:   s.ignore,
	})
	if err != nil {
		return message{}, fmt.Errorf("render verification email: %w", err)
	}

	// Assembled from the parts that have something to say, so an absent validity
	// leaves no blank gap behind in the plain-text rendering.
	paragraphs := []string{s.intro, "    " + code}
	if validity != "" {
		paragraphs = append(paragraphs, validity)
	}
	paragraphs = append(paragraphs, s.ignore)

	return message{
		senderName: s.appName,
		subject:    s.subject,
		plain:      strings.Join(paragraphs, "\n\n") + "\n",
		html:       html.String(),
	}, nil
}

// langAttr is the value for the html lang attribute; unknown languages render
// as English, matching the copy they get.
func langAttr(lang string) string {
	if _, ok := templates[lang]; ok {
		return lang
	}
	return "en"
}

// feedbackHTMLTemplate mirrors the verification email's card look. This one goes
// to the developer, not an end user, so it carries no language switching and no
// dark-mode block — plenty of mail clients render it fine either way, and it's
// not worth the upkeep for an internal-only message.
var feedbackHTMLTemplate = template.Must(template.New("feedback").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Subject}}</title>
</head>
<body style="margin:0;padding:0;background:#f8f9fa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="background:#dfbe5a;height:6px;line-height:6px;font-size:0;border-radius:12px 12px 0 0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 0 28px;">
    <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6c757d;">Shorinji Kempo Study App</div>
    <div style="margin-top:6px;font-size:20px;font-weight:600;color:#212529;">App feedback</div>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#6c757d;">From {{.SubmitterName}} &lt;{{.SubmitterEmail}}&gt;</p>
    <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#6c757d;">
      App version: {{.AppVersion}}<br>
      Language: {{.Language}}<br>
      User agent: {{.UserAgent}}
    </p>
  </td></tr>
  <tr><td style="padding:20px 28px 28px 28px;">
    <div style="background:#faf3df;border:1px solid #efdca9;border-radius:10px;padding:16px;white-space:pre-wrap;font-size:15px;line-height:1.5;color:#212529;">{{.Feedback}}</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`))

// renderFeedback builds a feedback-notification email for the site's maintainer.
// It is deliberately English-only and unlocalized: the recipient is a developer,
// not the app's end user.
func renderFeedback(fb FeedbackSubmission) (message, error) {
	subject := fmt.Sprintf("App feedback from %s <%s>", fb.SubmitterName, fb.SubmitterEmail)

	var html bytes.Buffer
	err := feedbackHTMLTemplate.Execute(&html, struct {
		Subject, SubmitterName, SubmitterEmail, AppVersion, Language, UserAgent, Feedback string
	}{
		Subject:        subject,
		SubmitterName:  fb.SubmitterName,
		SubmitterEmail: fb.SubmitterEmail,
		AppVersion:     fb.AppVersion,
		Language:       fb.Language,
		UserAgent:      fb.UserAgent,
		Feedback:       fb.Message,
	})
	if err != nil {
		return message{}, fmt.Errorf("render feedback email: %w", err)
	}

	return message{
		senderName: "Shorinji Kempo Study App",
		subject:    subject,
		plain: fmt.Sprintf("From %s <%s>\nApp version: %s\nLanguage: %s\nUser agent: %s\n\n%s\n",
			fb.SubmitterName, fb.SubmitterEmail, fb.AppVersion, fb.Language, fb.UserAgent, fb.Message),
		html:    html.String(),
		replyTo: fb.SubmitterEmail,
	}, nil
}

// LogSender is the development fallback: it logs the code instead of sending an
// email, so local dev needs no email provider configured.
type LogSender struct{}

func (LogSender) SendVerificationCode(_ context.Context, to, code, lang string, validFor time.Duration) error {
	log.Printf("[email:dev] verification code for %s (%s, valid %s): %s", to, lang, validFor, code)
	return nil
}

func (LogSender) SendFeedback(_ context.Context, to []string, fb FeedbackSubmission) error {
	log.Printf("[email:dev] feedback from %s <%s> (app %s, lang %s, ua %q) for %v:\n%s",
		fb.SubmitterName, fb.SubmitterEmail, fb.AppVersion, fb.Language, fb.UserAgent, to, fb.Message)
	return nil
}

func (LogSender) SendJoinRequestNotice(_ context.Context, to []string, lang string, n JoinRequestNotice) error {
	log.Printf("[email:dev] join request from %s <%s> for branch %q → %v (%s); note: %q",
		n.ApplicantName, n.ApplicantEmail, n.BranchName, to, lang, n.Note)
	return nil
}

func (LogSender) SendJoinReceived(_ context.Context, to, branchName, lang string) error {
	log.Printf("[email:dev] join request received, to %s (%s), branch %q", to, lang, branchName)
	return nil
}

func (LogSender) SendTransferRequestNotice(_ context.Context, to []string, lang string, n TransferNotice) error {
	log.Printf("[email:dev] transfer request from %s <%s>: %q → %q, to %v (%s); note: %q",
		n.MemberName, n.MemberEmail, n.FromBranchName, n.ToBranchName, to, lang, n.Note)
	return nil
}

func (LogSender) SendTransferDeparture(_ context.Context, to []string, lang string, n DepartureNotice) error {
	log.Printf("[email:dev] member departed: %s <%s> left %q for %q, telling %v (%s)",
		n.MemberName, n.MemberEmail, n.FromBranchName, n.ToBranchName, to, lang)
	return nil
}

func (LogSender) SendTransferDecision(_ context.Context, to, branchName, lang string, accepted bool) error {
	outcome := "refused"
	if accepted {
		outcome = "accepted"
	}
	log.Printf("[email:dev] transfer %s, to %s (%s), branch %q", outcome, to, lang, branchName)
	return nil
}

func (LogSender) SendJoinDecision(_ context.Context, to, branchName, lang string, approved bool) error {
	outcome := "declined"
	if approved {
		outcome = "approved"
	}
	log.Printf("[email:dev] join request %s, to %s (%s), branch %q", outcome, to, lang, branchName)
	return nil
}
