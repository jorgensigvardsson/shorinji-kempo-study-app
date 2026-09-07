package email

import "fmt"

// inviteCopy is one language's worth of the message somebody gets when an
// administrator has made them an account rather than their having asked for one.
//
// It is the only mail we send to an address that has proved nothing to us: every
// other message in this package answers something the recipient did. That is why
// the way out is spelled out in the message itself rather than left to be found —
// somebody who never wanted an account should not have to work out how to be rid
// of it.
type inviteCopy struct {
	subject string
	heading string
	body    string // %s = branch name
	mistake string // how to undo it, for somebody who never asked
}

var inviteTemplates = map[string]inviteCopy{
	"sv": {
		subject: "Ett konto har skapats åt dig",
		heading: "Ett konto har skapats åt dig",
		body:    "En administratör för %s har skapat ett konto åt dig i appen. Logga in med den här e-postadressen för att komma igång — du behöver inte registrera dig.",
		mistake: "Om det här är ett misstag kan du logga in och radera kontot under Inställningar.",
	},
	"en": {
		subject: "An account has been created for you",
		heading: "An account has been created for you",
		body:    "An administrator for %s has created an account for you in the app. Sign in with this email address to get started — there is nothing to register.",
		mistake: "If this is a mistake, you can sign in and delete the account under Settings.",
	},
	"ja": {
		subject: "アカウントが作成されました",
		heading: "アカウントが作成されました",
		body:    "%s の管理者が、アプリのアカウントをあなたのために作成しました。登録の手続きは不要です。このメールアドレスでログインしてご利用ください。",
		mistake: "お心当たりがない場合は、ログインして「設定」からアカウントを削除できます。",
	},
	"tr": {
		subject: "Sizin için bir hesap oluşturuldu",
		heading: "Sizin için bir hesap oluşturuldu",
		body:    "%s yöneticisi, uygulamada sizin için bir hesap oluşturdu. Kayıt olmanıza gerek yok — başlamak için bu e-posta adresiyle giriş yapın.",
		mistake: "Bu bir hataysa giriş yapıp Ayarlar bölümünden hesabı silebilirsiniz.",
	},
}

func lookupInvite(lang string) inviteCopy {
	if c, ok := inviteTemplates[lang]; ok {
		return c
	}
	return inviteTemplates[DefaultLanguage]
}

// renderAccountCreated builds the message. The branch is named and the
// administrator is not: the club is public information, whereas the name of the
// person who typed the address would be personal data sent to an address nobody
// has yet proved belongs to the reader.
func renderAccountCreated(branchName, lang string) (message, error) {
	c := lookupInvite(lang)
	return renderApplicantMessageWith(lang, c.subject, c.heading,
		fmt.Sprintf(c.body, branchName), c.mistake)
}
