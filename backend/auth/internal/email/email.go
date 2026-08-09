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
)

// Sender delivers a verification code to a recipient in the given language.
// lang is one of "sv", "en", "tr", "ja"; unknown values fall back to English.
type Sender interface {
	SendVerificationCode(ctx context.Context, to, code, lang string) error
}

// localized holds one language's worth of copy. The pieces are kept separate
// rather than as one prose blob so the plain-text and HTML renderings say the
// same thing without either being a translation of the other.
type localized struct {
	// appName is the sender's display name — the "…" in `From: "…" <a@b>`. It
	// matches the localized app names in frontend/public/site.webmanifest.
	appName  string
	subject  string
	heading  string
	intro    string
	validity string
	ignore   string
}

// templates is keyed by language. English is the fallback (see lookup).
var templates = map[string]localized{
	"en": {
		appName:  "Shorinji Kempo Study App",
		subject:  "Your Shorinji Kempo sign-in code",
		heading:  "Your sign-in code",
		intro:    "Use the code below to sign in.",
		validity: "The code is valid for 10 minutes.",
		ignore:   "If you didn't request it, you can ignore this email.",
	},
	"sv": {
		appName:  "Shorinji Kempo Studieapp",
		subject:  "Din inloggningskod för Shorinji Kempo",
		heading:  "Din inloggningskod",
		intro:    "Använd koden här nedan för att logga in.",
		validity: "Koden gäller i 10 minuter.",
		ignore:   "Om du inte begärde koden kan du bortse från det här meddelandet.",
	},
	"tr": {
		appName:  "Shorinji Kempo Çalışma Uygulaması",
		subject:  "Shorinji Kempo giriş kodunuz",
		heading:  "Giriş kodunuz",
		intro:    "Giriş yapmak için aşağıdaki kodu kullanın.",
		validity: "Kod 10 dakika geçerlidir.",
		ignore:   "Bunu siz istemediyseniz bu e-postayı yoksayabilirsiniz.",
	},
	"ja": {
		appName:  "少林寺拳法学習アプリ",
		subject:  "Shorinji Kempo のログインコード",
		heading:  "ログインコード",
		intro:    "以下のコードを入力してログインしてください。",
		validity: "コードは10分間有効です。",
		ignore:   "心当たりがない場合は、このメールを無視してください。",
	},
}

func lookup(lang string) localized {
	if t, ok := templates[lang]; ok {
		return t
	}
	return templates["en"]
}

// message is one rendered verification email in every form the sender needs.
type message struct {
	senderName string // localized display name for the From: header
	subject    string
	plain      string
	html       string
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
    <p class="muted" style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#6c757d;">{{.Validity}}</p>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.5;color:#6c757d;">{{.Ignore}}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`))

// render builds the verification email for a language.
func render(code, lang string) (message, error) {
	s := lookup(lang)

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
		Validity: s.validity,
		Ignore:   s.ignore,
	})
	if err != nil {
		return message{}, fmt.Errorf("render verification email: %w", err)
	}

	return message{
		senderName: s.appName,
		subject:    s.subject,
		plain: fmt.Sprintf("%s\n\n    %s\n\n%s\n\n%s\n",
			s.intro, code, s.validity, s.ignore),
		html: html.String(),
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

// LogSender is the development fallback: it logs the code instead of sending an
// email, so local dev needs no email provider configured.
type LogSender struct{}

func (LogSender) SendVerificationCode(_ context.Context, to, code, lang string) error {
	log.Printf("[email:dev] verification code for %s (%s): %s", to, lang, code)
	return nil
}
