// Package email sends transactional email for the auth service. Today its only
// job is delivering one-time verification codes to users on domains without an
// OIDC provider.
package email

import (
	"context"
	"fmt"
	"log"
)

// Sender delivers a verification code to a recipient in the given language.
// lang is one of "sv", "en", "tr", "ja"; unknown values fall back to English.
type Sender interface {
	SendVerificationCode(ctx context.Context, to, code, lang string) error
}

// template holds the localized subject and body for the verification email.
// %s in body is replaced with the code.
type template struct {
	subject string
	body    string
}

// templates is keyed by language. English is the fallback (see render).
var templates = map[string]template{
	"en": {
		subject: "Your Shorinji Kempo sign-in code",
		body:    "Your verification code is: %s\n\nIt is valid for 10 minutes. If you didn't request it, you can ignore this email.",
	},
	"sv": {
		subject: "Din inloggningskod för Shorinji Kempo",
		body:    "Din verifieringskod är: %s\n\nDen gäller i 10 minuter. Om du inte begärde den kan du bortse från det här meddelandet.",
	},
	"tr": {
		subject: "Shorinji Kempo giriş kodunuz",
		body:    "Doğrulama kodunuz: %s\n\n10 dakika geçerlidir. Bunu siz istemediyseniz bu e-postayı yoksayabilirsiniz.",
	},
	"ja": {
		subject: "Shorinji Kempo のログインコード",
		body:    "確認コード: %s\n\n10分間有効です。心当たりがない場合は、このメールを無視してください。",
	},
}

// render returns the subject and body for a language, falling back to English.
func render(code, lang string) (subject, body string) {
	t, ok := templates[lang]
	if !ok {
		t = templates["en"]
	}
	return t.subject, fmt.Sprintf(t.body, code)
}

// LogSender is the development fallback: it logs the code instead of sending an
// email, so local dev needs no email provider configured.
type LogSender struct{}

func (LogSender) SendVerificationCode(_ context.Context, to, code, lang string) error {
	log.Printf("[email:dev] verification code for %s (%s): %s", to, lang, code)
	return nil
}
