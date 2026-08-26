package email

import (
	"bytes"
	"fmt"
	"html/template"
)

// JoinRequestNotice is somebody asking to be let into a branch, as it reaches
// the admins who will decide.
type JoinRequestNotice struct {
	ApplicantName  string
	ApplicantEmail string
	BranchName     string
	Note           string // the applicant's own words; may be empty
	// PreviouslyDeniedAt is set when this address has been turned down before, so
	// whoever looks at it now is not judging blind.
	PreviouslyDeniedAt string
}

// joinCopy is one language's worth of the join messages. Three of them go to an
// applicant, who has just told us which language they are using; the fourth goes
// to the admins who will decide, in whichever language each of them last used
// the app in. That last part was not always knowable — the notice was written in
// English for everyone until members started carrying a language of their own.
type joinCopy struct {
	receivedSubject string
	receivedHeading string
	receivedBody    string // %s = branch name

	noticeSubject  string // %s = applicant name, %s = branch name
	noticeHeading  string
	noticeBody     string // %s = applicant name, %s = email, %s = branch name
	noticeNote     string // heading above the applicant's own words
	noticeDeclined string // %s = date this address was declined before
	noticeAction   string // what to do next

	approvedSubject string // %s = branch name
	approvedHeading string
	approvedBody    string // %s = branch name

	deniedSubject string // %s = branch name
	deniedHeading string
	deniedBody    string // %s = branch name
}

var joinTemplates = map[string]joinCopy{
	"sv": {
		noticeSubject:  "Ansökan om medlemskap: %s vill gå med i %s",
		noticeHeading:  "Ny ansökan om medlemskap",
		noticeBody:     "%s <%s> har ansökt om medlemskap i %s.",
		noticeNote:     "Med egna ord:",
		noticeDeclined: "Obs: den här adressen nekades tidigare, den %s.",
		noticeAction:   "Öppna appen för att godkänna eller neka ansökan.",

		receivedSubject: "Vi har tagit emot din ansökan",
		receivedHeading: "Ansökan mottagen",
		receivedBody:    "Din ansökan om medlemskap i %s har skickats vidare till klubbens administratörer. Du får ett mejl så snart den har behandlats.",

		approvedSubject: "Välkommen till %s",
		approvedHeading: "Din ansökan har godkänts",
		approvedBody:    "Du är nu medlem i %s och kan logga in i appen med den här e-postadressen.",

		deniedSubject: "Din ansökan till %s",
		deniedHeading: "Din ansökan har inte godkänts",
		deniedBody:    "Din ansökan om medlemskap i %s har tyvärr inte godkänts. Kontakta klubben om du tror att det är ett misstag — du är välkommen att ansöka igen.",
	},
	"en": {
		noticeSubject:  "Membership request: %s wants to join %s",
		noticeHeading:  "New membership request",
		noticeBody:     "%s <%s> has asked to join %s.",
		noticeNote:     "In their own words:",
		noticeDeclined: "Note: this address was previously declined on %s.",
		noticeAction:   "Open the app to approve or decline the request.",

		receivedSubject: "We have received your request",
		receivedHeading: "Request received",
		receivedBody:    "Your request to join %s has been passed to the branch's administrators. You will get an email as soon as it has been decided.",

		approvedSubject: "Welcome to %s",
		approvedHeading: "Your request was approved",
		approvedBody:    "You are now a member of %s and can sign in to the app with this email address.",

		deniedSubject: "Your request to join %s",
		deniedHeading: "Your request was not approved",
		deniedBody:    "Your request to join %s was not approved. Please contact the branch if you believe that is a mistake — you are welcome to apply again.",
	},
	"ja": {
		noticeSubject:  "入会申請: %s さんが %s への入会を希望しています",
		noticeHeading:  "新しい入会申請",
		noticeBody:     "%s <%s> さんが %s への入会を申請しました。",
		noticeNote:     "本人からのメッセージ:",
		noticeDeclined: "注意: このアドレスは %s に一度不承認となっています。",
		noticeAction:   "アプリを開いて申請を承認または却下してください。",

		receivedSubject: "申請を受け付けました",
		receivedHeading: "申請を受け付けました",
		receivedBody:    "%s への入会申請を支部の管理者に転送しました。結果が決まりましたらメールでお知らせします。",

		approvedSubject: "%s へようこそ",
		approvedHeading: "申請が承認されました",
		approvedBody:    "%s の会員として登録されました。このメールアドレスでアプリにログインできます。",

		deniedSubject: "%s への入会申請について",
		deniedHeading: "申請は承認されませんでした",
		deniedBody:    "%s への入会申請は承認されませんでした。お心当たりのない場合は支部にお問い合わせください。再度申請していただくこともできます。",
	},
	"tr": {
		noticeSubject:  "Üyelik başvurusu: %s, %s kulübüne katılmak istiyor",
		noticeHeading:  "Yeni üyelik başvurusu",
		noticeBody:     "%s <%s>, %s kulübüne katılmak için başvurdu.",
		noticeNote:     "Kendi sözleriyle:",
		noticeDeclined: "Not: bu adres daha önce %s tarihinde reddedildi.",
		noticeAction:   "Başvuruyu onaylamak veya reddetmek için uygulamayı açın.",

		receivedSubject: "Başvurunuzu aldık",
		receivedHeading: "Başvuru alındı",
		receivedBody:    "%s kulübüne katılma başvurunuz kulüp yöneticilerine iletildi. Karar verildiğinde size e-posta ile bildirilecektir.",

		approvedSubject: "%s kulübüne hoş geldiniz",
		approvedHeading: "Başvurunuz onaylandı",
		approvedBody:    "Artık %s üyesisiniz ve bu e-posta adresiyle uygulamaya giriş yapabilirsiniz.",

		deniedSubject: "%s kulübüne başvurunuz",
		deniedHeading: "Başvurunuz onaylanmadı",
		deniedBody:    "%s kulübüne katılma başvurunuz onaylanmadı. Bunun bir hata olduğunu düşünüyorsanız lütfen kulüple iletişime geçin — tekrar başvurabilirsiniz.",
	},
}

func lookupJoin(lang string) joinCopy {
	if c, ok := joinTemplates[lang]; ok {
		return c
	}
	return joinTemplates[DefaultLanguage]
}

// renderJoinRequestNotice builds the message the deciding admins receive, in the
// language given — one send per language, since a single message cannot be in
// two. Its Reply-To is the applicant: the likeliest useful response to "somebody
// wants to join" is to ask them something, and that should not require copying an
// address out of the body.
func renderJoinRequestNotice(n JoinRequestNotice, lang string) (message, error) {
	c := lookupJoin(lang)
	subject := fmt.Sprintf(c.noticeSubject, n.ApplicantName, n.BranchName)
	body := fmt.Sprintf(c.noticeBody, n.ApplicantName, n.ApplicantEmail, n.BranchName)
	declined := ""
	if n.PreviouslyDeniedAt != "" {
		declined = fmt.Sprintf(c.noticeDeclined, n.PreviouslyDeniedAt)
	}

	rendered, err := renderAdminNotice(lang, subject, c.noticeHeading, body,
		c.noticeNote, n.Note, declined, c.noticeAction)
	if err != nil {
		return message{}, err
	}
	rendered.replyTo = n.ApplicantEmail
	return rendered, nil
}

// renderJoinReceived confirms to the applicant that the request went somewhere,
// so that waiting does not look like nothing having happened.
func renderJoinReceived(branchName, lang string) (message, error) {
	c := lookupJoin(lang)
	return renderApplicantMessage(lang, c.receivedSubject, c.receivedHeading,
		fmt.Sprintf(c.receivedBody, branchName))
}

// renderJoinDecision tells the applicant what was decided. Both outcomes are one
// function because the difference between them is the words, not the shape — and
// keeping them together makes it obvious that a denial is answered as promptly
// and as plainly as an approval.
func renderJoinDecision(branchName, lang string, approved bool) (message, error) {
	c := lookupJoin(lang)
	if approved {
		return renderApplicantMessage(lang,
			fmt.Sprintf(c.approvedSubject, branchName), c.approvedHeading,
			fmt.Sprintf(c.approvedBody, branchName))
	}
	return renderApplicantMessage(lang,
		fmt.Sprintf(c.deniedSubject, branchName), c.deniedHeading,
		fmt.Sprintf(c.deniedBody, branchName))
}

func renderApplicantMessage(lang, subject, heading, body string) (message, error) {
	var html bytes.Buffer
	err := applicantHTMLTemplate.Execute(&html, struct {
		Lang, Subject, Heading, Body string
	}{
		Lang:    langAttr(lang),
		Subject: subject,
		Heading: heading,
		Body:    body,
	})
	if err != nil {
		return message{}, fmt.Errorf("render applicant message: %w", err)
	}
	return message{
		senderName: lookup(lang).appName,
		subject:    subject,
		plain:      heading + "\n\n" + body + "\n",
		html:       html.String(),
	}, nil
}

// The card the admin notices are drawn in — a join request, a transfer asking to
// come in, a member leaving. All four fields are optional except the body, so one
// template serves every message that says "somebody has done something and you
// may want to act on it".
//
// A card in the app's gold, with a dark variant for clients that honour the
// reader's system theme — the same shape as the verification-code mail, and no
// images, since Gmail blocks data: URIs in <img>.
var applicantHTMLTemplate = template.Must(template.New("applicant").Parse(`<!DOCTYPE html>
<html lang="{{.Lang}}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Subject}}</title>
<style>
@media (prefers-color-scheme: dark) {
  .card { background: #1b1b1b !important; border-color: #3a3a3a !important; }
  .card, .card p, .card h1 { color: #f0f0f0 !important; }
  body { background: #111 !important; }
}
</style></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" class="card" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e3e3e3;border-radius:12px;" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:4px;background:#c8a44b;border-radius:12px 12px 0 0;"></td></tr>
<tr><td style="padding:28px 32px 32px 32px;">
<h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#222;">{{.Heading}}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#444;">{{.Body}}</p>
</td></tr></table>
</td></tr></table>
</body></html>`))

// The card an admin notice is drawn in: a join request, a transfer asking to
// come in, a member leaving. Every field but the body is optional, so one
// template serves any message that says "somebody has done something, and you
// may want to act on it".
var adminNoticeHTMLTemplate = template.Must(template.New("adminnotice").Parse(`<!DOCTYPE html>
<html lang="{{.Lang}}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Subject}}</title>
<style>
@media (prefers-color-scheme: dark) {
  .card { background: #1b1b1b !important; border-color: #3a3a3a !important; }
  .card, .card p, .card h1, .card td { color: #f0f0f0 !important; }
  body { background: #111 !important; }
}
</style></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" class="card" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e3e3e3;border-radius:12px;" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:4px;background:#c8a44b;border-radius:12px 12px 0 0;"></td></tr>
<tr><td style="padding:28px 32px 32px 32px;">
<h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#222;">{{.Heading}}</h1>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#444;">{{.Body}}</p>
{{if .Note}}<p style="margin:0 0 8px 0;font-size:14px;color:#666;">{{.NoteLabel}}</p>
<p style="margin:0 0 16px 0;padding:12px 16px;background:#faf6ec;border-left:3px solid #c8a44b;font-size:15px;line-height:1.6;color:#444;white-space:pre-wrap;">{{.Note}}</p>{{end}}
{{if .Declined}}<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#8a6d1f;">{{.Declined}}</p>{{end}}
<p style="margin:0;font-size:15px;line-height:1.6;color:#444;">{{.Action}}</p>
</td></tr></table>
</td></tr></table>
</body></html>`))
