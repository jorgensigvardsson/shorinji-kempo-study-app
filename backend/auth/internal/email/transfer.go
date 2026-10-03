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
	// ByAdmin is set when an administrator moved the member rather than the
	// member asking, so the club they left is not left wondering why nobody asked.
	ByAdmin bool
}

// ArrivalNotice tells a branch that an administrator has moved a member into it.
// A member who asked to transfer needs no such notice — that branch decided —
// but one moved on somebody else's say-so arrives unannounced otherwise.
type ArrivalNotice struct {
	MemberName     string
	MemberEmail    string
	FromBranchName string // empty when they belonged to no branch we can name
	ToBranchName   string
}

// transferCopy is one language's worth of the transfer messages: those to the
// admins who decide or are told, two to the member who asked, and one to a
// member an admin has moved without being asked.
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
	departureByAdmin string // the same arguments, for a member an administrator moved

	arrivalSubject string // %s = member name, %s = new branch
	arrivalHeading string
	arrivalBody    string // %s = name, %s = email, %s = new branch
	arrivalFrom    string // %s = the branch they came from

	acceptedSubject string // %s = branch name
	acceptedHeading string
	acceptedBody    string // %s = branch name

	rejectedSubject string // %s = branch name
	rejectedHeading string
	rejectedBody    string // %s = branch name

	movedSubject    string // %s = new branch
	movedHeading    string
	movedBody       string // %s = old branch, %s = new branch
	movedBodyNoFrom string // %s = new branch; for a member who belonged nowhere we can name
	movedExtra      string
}

var transferTemplates = map[string]transferCopy{
	"sv": {
		noticeSubject:  "Ansökan om byte av klubb: %s vill gå med i %s",
		noticeHeading:  "Ansökan om byte av klubb",
		noticeBody:     "%s <%s> vill byta till %s.",
		noticeFrom:     "Nuvarande klubb: %s.",
		noticeNote:     "Med egna ord:",
		noticeRejected: "Obs: den här medlemmen nekades tidigare, den %s.",
		noticeAction:   "Öppna appen för att godkänna eller neka ansökan.",

		departureSubject: "%s har bytt klubb",
		departureHeading: "En medlem har bytt klubb",
		departureBody:    "%s <%s> har lämnat %s och är nu medlem i %s.",
		departureByAdmin: "En administratör har flyttat %s <%s> från %s till %s.",

		arrivalSubject: "%s har flyttats till %s",
		arrivalHeading: "En ny medlem i klubben",
		arrivalBody:    "En administratör har flyttat %s <%s> till %s.",
		arrivalFrom:    "Tidigare klubb: %s.",

		acceptedSubject: "Välkommen till %s",
		acceptedHeading: "Din ansökan om byte har godkänts",
		acceptedBody:    "Du är nu medlem i %s. Ändringen syns i appen nästa gång du loggar in.",

		rejectedSubject: "Din ansökan om byte till %s",
		rejectedHeading: "Din ansökan om byte har inte godkänts",
		rejectedBody:    "Din ansökan om att byta till %s har inte godkänts. Du är kvar i din nuvarande klubb — kontakta gärna klubben om du vill veta mer.",

		movedSubject:    "Du är nu medlem i %s",
		movedHeading:    "Du har flyttats till en annan klubb",
		movedBody:       "En administratör har flyttat dig från %s till %s. Ändringen syns i appen nästa gång du loggar in.",
		movedBodyNoFrom: "En administratör har flyttat dig till %s. Ändringen syns i appen nästa gång du loggar in.",
		movedExtra:      "Om du inte väntade dig det här, kontakta gärna din klubb.",
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
		departureByAdmin: "An administrator has moved %s <%s> from %s to %s.",

		arrivalSubject: "%s has been moved to %s",
		arrivalHeading: "A new member in your branch",
		arrivalBody:    "An administrator has moved %s <%s> to %s.",
		arrivalFrom:    "Previously a member of %s.",

		acceptedSubject: "Welcome to %s",
		acceptedHeading: "Your transfer was approved",
		acceptedBody:    "You are now a member of %s. The change will show in the app the next time you sign in.",

		rejectedSubject: "Your transfer request to %s",
		rejectedHeading: "Your transfer was not approved",
		rejectedBody:    "Your request to transfer to %s was not approved. You remain in your current branch — do contact the branch if you would like to know more.",

		movedSubject:    "You are now a member of %s",
		movedHeading:    "You have been moved to another branch",
		movedBody:       "An administrator has moved you from %s to %s. The change will show in the app the next time you sign in.",
		movedBodyNoFrom: "An administrator has moved you to %s. The change will show in the app the next time you sign in.",
		movedExtra:      "If you were not expecting this, please contact your branch.",
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
		departureByAdmin: "管理者が %s <%s> さんの所属を %s から %s に変更しました。",

		arrivalSubject: "%s さんが %s に移りました",
		arrivalHeading: "支部に新しい会員が加わりました",
		arrivalBody:    "管理者が %s <%s> さんの所属を %s に変更しました。",
		arrivalFrom:    "以前の所属: %s。",

		acceptedSubject: "%s へようこそ",
		acceptedHeading: "支部変更が承認されました",
		acceptedBody:    "%s の会員として登録されました。次回ログイン時にアプリへ反映されます。",

		rejectedSubject: "%s への支部変更の申請について",
		rejectedHeading: "支部変更は承認されませんでした",
		rejectedBody:    "%s への移籍の申請は承認されませんでした。現在の支部に引き続き所属します。詳しくは支部にお問い合わせください。",

		movedSubject:    "%s の所属になりました",
		movedHeading:    "所属支部が変更されました",
		movedBody:       "管理者があなたの所属を %s から %s に変更しました。次回ログイン時にアプリへ反映されます。",
		movedBodyNoFrom: "管理者があなたの所属を %s に変更しました。次回ログイン時にアプリへ反映されます。",
		movedExtra:      "心当たりがない場合は、所属支部にお問い合わせください。",
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
		departureByAdmin: "Bir yönetici %s <%s> üyesini %s kulübünden %s kulübüne taşıdı.",

		arrivalSubject: "%s, %s kulübüne taşındı",
		arrivalHeading: "Kulübünüzde yeni bir üye",
		arrivalBody:    "Bir yönetici %s <%s> üyesini %s kulübüne taşıdı.",
		arrivalFrom:    "Önceki kulübü: %s.",

		acceptedSubject: "%s kulübüne hoş geldiniz",
		acceptedHeading: "Kulüp değişikliğiniz onaylandı",
		acceptedBody:    "Artık %s üyesisiniz. Değişiklik bir sonraki girişinizde uygulamada görünecek.",

		rejectedSubject: "%s kulübüne geçiş başvurunuz",
		rejectedHeading: "Kulüp değişikliğiniz onaylanmadı",
		rejectedBody:    "%s kulübüne geçme başvurunuz onaylanmadı. Mevcut kulübünüzde kalmaya devam ediyorsunuz — daha fazlası için kulüple iletişime geçebilirsiniz.",

		movedSubject:    "Artık %s üyesisiniz",
		movedHeading:    "Başka bir kulübe taşındınız",
		movedBody:       "Bir yönetici sizi %s kulübünden %s kulübüne taşıdı. Değişiklik bir sonraki girişinizde uygulamada görünecek.",
		movedBodyNoFrom: "Bir yönetici sizi %s kulübüne taşıdı. Değişiklik bir sonraki girişinizde uygulamada görünecek.",
		movedExtra:      "Bunu beklemiyorsanız lütfen kulübünüzle iletişime geçin.",
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
	body := c.departureBody
	if n.ByAdmin {
		body = c.departureByAdmin
	}
	return renderAdminNotice(lang,
		fmt.Sprintf(c.departureSubject, n.MemberName),
		c.departureHeading,
		fmt.Sprintf(body, n.MemberName, n.MemberEmail, n.FromBranchName, n.ToBranchName),
		"", "", "", "")
}

// renderMemberArrival tells a branch an administrator has moved a member into
// it. Like the departure it asks nothing, so it carries no action.
func renderMemberArrival(n ArrivalNotice, lang string) (message, error) {
	c := lookupTransfer(lang)
	body := fmt.Sprintf(c.arrivalBody, n.MemberName, n.MemberEmail, n.ToBranchName)
	if n.FromBranchName != "" {
		body += " " + fmt.Sprintf(c.arrivalFrom, n.FromBranchName)
	}
	return renderAdminNotice(lang,
		fmt.Sprintf(c.arrivalSubject, n.MemberName, n.ToBranchName),
		c.arrivalHeading, body, "", "", "", "")
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

// renderMovedByAdmin tells a member that an admin has moved them to another
// branch. Unlike a transfer decision it answers no question of theirs, so it
// says who did it — an administrator, not the club they asked — and what to do
// if it comes as a surprise.
func renderMovedByAdmin(fromBranchName, toBranchName, lang string) (message, error) {
	c := lookupTransfer(lang)
	body := fmt.Sprintf(c.movedBodyNoFrom, toBranchName)
	if fromBranchName != "" {
		body = fmt.Sprintf(c.movedBody, fromBranchName, toBranchName)
	}
	return renderApplicantMessageWith(lang,
		fmt.Sprintf(c.movedSubject, toBranchName), c.movedHeading, body, c.movedExtra)
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
