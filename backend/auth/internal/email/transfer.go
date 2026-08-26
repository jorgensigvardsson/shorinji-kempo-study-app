package email

import (
	"bytes"
	"fmt"
)

// TransferNotice is a member asking to move to another branch, as it reaches the
// admins of the branch they want to join.
type TransferNotice struct {
	MemberName     string
	MemberEmail    string
	FromBranchName string // empty when they belong to no branch we can name
	ToBranchName   string
	Note           string // the member's own words; may be empty
	// PreviouslyRejectedAt is set when this member has asked before and been told
	// no, so whoever looks at it now is not judging blind.
	PreviouslyRejectedAt string
}

// DepartureNotice tells a branch that one of its members has gone somewhere
// else. It is a courtesy rather than a request: the member moved, the receiving
// branch decided, and this is the club they left finding out — which is the whole
// difference between a transfer and a negotiation.
type DepartureNotice struct {
	MemberName     string
	MemberEmail    string
	FromBranchName string
	ToBranchName   string
}

// transferCopy is one language's worth of the transfer messages: two to the
// admins who decide or are told, two to the member who asked.
type transferCopy struct {
	noticeSubject  string // %s = member name, %s = destination branch
	noticeHeading  string
	noticeBody     string // %s = name, %s = email, %s = destination branch
	noticeFrom     string // %s = the branch they are leaving
	noticeNote     string // heading above the member's own words
	noticeRejected string // %s = date this member was refused before
	noticeAction   string

	departureSubject string // %s = member name
	departureHeading string
	departureBody    string // %s = name, %s = email, %s = old branch, %s = new branch

	acceptedSubject string // %s = branch name
	acceptedHeading string
	acceptedBody    string // %s = branch name

	rejectedSubject string // %s = branch name
	rejectedHeading string
	rejectedBody    string // %s = branch name
}

var transferTemplates = map[string]transferCopy{
	"sv": {
		noticeSubject:  "Ansökan om byte av gren: %s vill gå med i %s",
		noticeHeading:  "Ansökan om byte av gren",
		noticeBody:     "%s <%s> vill byta till %s.",
		noticeFrom:     "Nuvarande gren: %s.",
		noticeNote:     "Med egna ord:",
		noticeRejected: "Obs: den här medlemmen nekades tidigare, den %s.",
		noticeAction:   "Öppna appen för att godkänna eller neka ansökan.",

		departureSubject: "%s har bytt gren",
		departureHeading: "En medlem har bytt gren",
		departureBody:    "%s <%s> har lämnat %s och är nu medlem i %s.",

		acceptedSubject: "Välkommen till %s",
		acceptedHeading: "Din ansökan om byte har godkänts",
		acceptedBody:    "Du är nu medlem i %s. Ändringen syns i appen nästa gång du loggar in.",

		rejectedSubject: "Din ansökan om byte till %s",
		rejectedHeading: "Din ansökan om byte har inte godkänts",
		rejectedBody:    "Din ansökan om att byta till %s har inte godkänts. Du är kvar i din nuvarande gren — kontakta gärna klubben om du vill veta mer.",
	},
	"en": {
		noticeSubject:  "Transfer request: %s wants to join %s",
		noticeHeading:  "New transfer request",
		noticeBody:     "%s <%s> would like to transfer to %s.",
		noticeFrom:     "Currently a member of %s.",
		noticeNote:     "In their own words:",
		noticeRejected: "Note: this member was previously refused on %s.",
		noticeAction:   "Open the app to approve or decline the request.",

		departureSubject: "%s has transferred to another branch",
		departureHeading: "A member has transferred",
		departureBody:    "%s <%s> has left %s and is now a member of %s.",

		acceptedSubject: "Welcome to %s",
		acceptedHeading: "Your transfer was approved",
		acceptedBody:    "You are now a member of %s. The change will show in the app the next time you sign in.",

		rejectedSubject: "Your transfer request to %s",
		rejectedHeading: "Your transfer was not approved",
		rejectedBody:    "Your request to transfer to %s was not approved. You remain in your current branch — do contact the branch if you would like to know more.",
	},
	"ja": {
		noticeSubject:  "支部変更の申請: %s さんが %s への移籍を希望しています",
		noticeHeading:  "新しい支部変更の申請",
		noticeBody:     "%s <%s> さんが %s への移籍を希望しています。",
		noticeFrom:     "現在の所属: %s。",
		noticeNote:     "本人からのメッセージ:",
		noticeRejected: "注意: この会員は %s に一度不承認となっています。",
		noticeAction:   "アプリを開いて申請を承認または却下してください。",

		departureSubject: "%s さんが支部を移りました",
		departureHeading: "会員が支部を移りました",
		departureBody:    "%s <%s> さんが %s を離れ、%s の会員になりました。",

		acceptedSubject: "%s へようこそ",
		acceptedHeading: "支部変更が承認されました",
		acceptedBody:    "%s の会員として登録されました。次回ログイン時にアプリへ反映されます。",

		rejectedSubject: "%s への支部変更の申請について",
		rejectedHeading: "支部変更は承認されませんでした",
		rejectedBody:    "%s への移籍の申請は承認されませんでした。現在の支部に引き続き所属します。詳しくは支部にお問い合わせください。",
	},
	"tr": {
		noticeSubject:  "Kulüp değişikliği başvurusu: %s, %s kulübüne katılmak istiyor",
		noticeHeading:  "Yeni kulüp değişikliği başvurusu",
		noticeBody:     "%s <%s>, %s kulübüne geçmek istiyor.",
		noticeFrom:     "Şu anki kulübü: %s.",
		noticeNote:     "Kendi sözleriyle:",
		noticeRejected: "Not: bu üye daha önce %s tarihinde reddedildi.",
		noticeAction:   "Başvuruyu onaylamak veya reddetmek için uygulamayı açın.",

		departureSubject: "%s başka bir kulübe geçti",
		departureHeading: "Bir üye kulüp değiştirdi",
		departureBody:    "%s <%s>, %s kulübünden ayrıldı ve artık %s üyesi.",

		acceptedSubject: "%s kulübüne hoş geldiniz",
		acceptedHeading: "Kulüp değişikliğiniz onaylandı",
		acceptedBody:    "Artık %s üyesisiniz. Değişiklik bir sonraki girişinizde uygulamada görünecek.",

		rejectedSubject: "%s kulübüne geçiş başvurunuz",
		rejectedHeading: "Kulüp değişikliğiniz onaylanmadı",
		rejectedBody:    "%s kulübüne geçme başvurunuz onaylanmadı. Mevcut kulübünüzde kalmaya devam ediyorsunuz — daha fazlası için kulüple iletişime geçebilirsiniz.",
	},
}

func lookupTransfer(lang string) transferCopy {
	if c, ok := transferTemplates[lang]; ok {
		return c
	}
	return transferTemplates[DefaultLanguage]
}

// renderTransferNotice builds the message the receiving branch's admins get, in
// the language given — one send per language, since a message can only be in
// one. Reply-To is the member, for the same reason a join notice replies to the
// applicant: the useful answer is usually a question back.
func renderTransferNotice(n TransferNotice, lang string) (message, error) {
	c := lookupTransfer(lang)
	subject := fmt.Sprintf(c.noticeSubject, n.MemberName, n.ToBranchName)
	body := fmt.Sprintf(c.noticeBody, n.MemberName, n.MemberEmail, n.ToBranchName)
	// Where they are coming from is worth stating, and is not always knowable: a
	// member with no branch, or one whose branch has since been removed.
	if n.FromBranchName != "" {
		body += " " + fmt.Sprintf(c.noticeFrom, n.FromBranchName)
	}
	rejected := ""
	if n.PreviouslyRejectedAt != "" {
		rejected = fmt.Sprintf(c.noticeRejected, n.PreviouslyRejectedAt)
	}

	rendered, err := renderAdminNotice(lang, subject, c.noticeHeading, body,
		c.noticeNote, n.Note, rejected, c.noticeAction)
	if err != nil {
		return message{}, err
	}
	rendered.replyTo = n.MemberEmail
	return rendered, nil
}

// renderTransferDeparture tells the branch a member has left. It carries no
// action and no Reply-To decision to make: nothing is being asked of them.
func renderTransferDeparture(n DepartureNotice, lang string) (message, error) {
	c := lookupTransfer(lang)
	return renderAdminNotice(lang,
		fmt.Sprintf(c.departureSubject, n.MemberName),
		c.departureHeading,
		fmt.Sprintf(c.departureBody, n.MemberName, n.MemberEmail, n.FromBranchName, n.ToBranchName),
		"", "", "", "")
}

// renderTransferDecision tells the member what was decided. Both outcomes are one
// function for the same reason the join decision is: the difference between them
// is the words, not the shape.
func renderTransferDecision(branchName, lang string, accepted bool) (message, error) {
	c := lookupTransfer(lang)
	if accepted {
		return renderApplicantMessage(lang,
			fmt.Sprintf(c.acceptedSubject, branchName), c.acceptedHeading,
			fmt.Sprintf(c.acceptedBody, branchName))
	}
	return renderApplicantMessage(lang,
		fmt.Sprintf(c.rejectedSubject, branchName), c.rejectedHeading,
		fmt.Sprintf(c.rejectedBody, branchName))
}

// renderAdminNotice draws any of the "somebody has done something and you may
// want to act on it" messages into the shared card. Every part but the body is
// optional, and an empty one is left out rather than rendered blank.
func renderAdminNotice(lang, subject, heading, body, noteLabel, note, warning, action string) (message, error) {
	var html bytes.Buffer
	err := adminNoticeHTMLTemplate.Execute(&html, struct {
		Lang, Subject, Heading, Body, NoteLabel, Note, Declined, Action string
	}{
		Lang:      langAttr(lang),
		Subject:   subject,
		Heading:   heading,
		Body:      body,
		NoteLabel: noteLabel,
		Note:      note,
		Declined:  warning,
		Action:    action,
	})
	if err != nil {
		return message{}, fmt.Errorf("render admin notice: %w", err)
	}

	plain := body + "\n"
	if note != "" {
		plain += fmt.Sprintf("\n%s\n%s\n", noteLabel, note)
	}
	if warning != "" {
		plain += "\n" + warning + "\n"
	}
	if action != "" {
		plain += "\n" + action + "\n"
	}

	return message{
		senderName: lookup(lang).appName,
		subject:    subject,
		plain:      plain,
		html:       html.String(),
	}, nil
}
