package email

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"slices"
	"strings"
	"time"
)

// TLSMode selects how the connection to the SMTP server is secured. The names
// follow RFC 8314: *implicit* TLS is negotiated before any SMTP command (SMTPS,
// conventionally port 465), while *explicit* TLS connects in the clear and
// upgrades in-band with STARTTLS (conventionally port 587).
type TLSMode string

const (
	// TLSImplicit wraps the connection in TLS from the first byte (port 465).
	TLSImplicit TLSMode = "implicit"
	// TLSStartTLS connects in the clear, then issues STARTTLS (port 587).
	// The upgrade is mandatory: a server that does not advertise it is an error,
	// never a silent fallback to plaintext.
	TLSStartTLS TLSMode = "starttls"
	// TLSNone disables encryption entirely. For a relay on localhost, or a local
	// catch-all like MailHog. Credentials are refused on such a connection.
	TLSNone TLSMode = "none"
)

// ParseTLSMode maps a configuration string to a TLSMode.
func ParseTLSMode(s string) (TLSMode, error) {
	switch m := TLSMode(strings.ToLower(strings.TrimSpace(s))); m {
	case TLSImplicit, TLSStartTLS, TLSNone:
		return m, nil
	case "":
		return TLSStartTLS, nil
	default:
		return "", fmt.Errorf("unknown TLS mode %q (want %q, %q or %q)", s, TLSImplicit, TLSStartTLS, TLSNone)
	}
}

// SMTPSender delivers verification codes through an ordinary SMTP relay.
type SMTPSender struct {
	host     string
	port     string
	username string
	password string
	from     mail.Address // envelope sender and From: header
	mode     TLSMode
	timeout  time.Duration
	rootCAs  *x509.CertPool // nil = the system pool; set by tests to trust a throwaway cert
}

// NewSMTPSender builds a sender for the given relay. from may be a bare address
// ("noreply@example.com") or include a display name ("Shorinji Kempo
// <noreply@example.com>"). An empty username disables authentication, which only
// makes sense for a relay that authorises by network location.
func NewSMTPSender(host, port, username, password, from string, mode TLSMode) (*SMTPSender, error) {
	if strings.TrimSpace(host) == "" {
		return nil, errors.New("smtp: host is required")
	}
	if strings.TrimSpace(port) == "" {
		return nil, errors.New("smtp: port is required")
	}
	addr, err := mail.ParseAddress(strings.TrimSpace(from))
	if err != nil {
		return nil, fmt.Errorf("smtp: parse from address %q: %w", from, err)
	}
	if username != "" && mode == TLSNone {
		return nil, errors.New("smtp: refusing to send credentials over an unencrypted connection (set the TLS mode to implicit or starttls)")
	}
	return &SMTPSender{
		host:     strings.TrimSpace(host),
		port:     strings.TrimSpace(port),
		username: username,
		password: password,
		from:     *addr,
		mode:     mode,
		// A user is staring at a spinner while this runs, and the HTTP server's
		// write timeout is 30 s — overshooting that would turn a slow relay into a
		// dropped connection instead of a clean "could not send" response.
		timeout: 20 * time.Second,
	}, nil
}

// Describe renders the configuration for the startup log. It never includes the
// password.
func (s *SMTPSender) Describe() string {
	auth := "unauthenticated"
	if s.username != "" {
		auth = "user " + s.username
	}
	return fmt.Sprintf("%s (tls: %s, from: %s, %s)", net.JoinHostPort(s.host, s.port), s.mode, s.from.Address, auth)
}

func (s *SMTPSender) SendVerificationCode(ctx context.Context, to, code, lang string, validFor time.Duration) error {
	// The recipient is attacker-supplied and goes into a header, so it must be a
	// single, well-formed address. Without this a CR/LF in the address would let
	// a caller inject headers (a Bcc:, say) into the message.
	rcpt, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("smtp: invalid recipient address: %w", err)
	}

	rendered, err := render(code, lang, validFor)
	if err != nil {
		return err
	}
	msg, err := s.message([]string{rcpt.Address}, rendered)
	if err != nil {
		return err
	}
	return s.send(ctx, []string{rcpt.Address}, msg)
}

// SendFeedback relays an in-app feedback submission to every configured
// recipient, with Reply-To set to the submitter's own address so a maintainer
// can reply straight to them.
func (s *SMTPSender) SendFeedback(ctx context.Context, to []string, fb FeedbackSubmission) error {
	if len(to) == 0 {
		return errors.New("smtp: no feedback recipients configured")
	}
	rcpts := make([]string, 0, len(to))
	for _, addr := range to {
		parsed, err := mail.ParseAddress(addr)
		if err != nil {
			return fmt.Errorf("smtp: invalid feedback recipient %q: %w", addr, err)
		}
		rcpts = append(rcpts, parsed.Address)
	}
	// SubmitterEmail comes from the authenticated user's account record, but it
	// still lands in a header, so it gets the same validation as any recipient.
	replyTo, err := mail.ParseAddress(fb.SubmitterEmail)
	if err != nil {
		return fmt.Errorf("smtp: invalid submitter address: %w", err)
	}
	fb.SubmitterEmail = replyTo.Address

	rendered, err := renderFeedback(fb)
	if err != nil {
		return err
	}
	msg, err := s.message(rcpts, rendered)
	if err != nil {
		return err
	}
	return s.send(ctx, rcpts, msg)
}

// SendJoinRequestNotice mails the deciding admins. One message addressed to all
// of them, since they are deciding the same thing and a reply is likely to be to
// each other as much as to us — so the caller groups them by language and calls
// this once per group, a message being able to be in only one.
// parseRecipients validates every address before any of them reaches the wire.
// A CR/LF smuggled into one would inject headers into the message, so the parse
// is the check rather than a formality.
func parseRecipients(to []string, what string) ([]string, error) {
	if len(to) == 0 {
		return nil, fmt.Errorf("smtp: no recipients for the %s", what)
	}
	rcpts := make([]string, 0, len(to))
	for _, addr := range to {
		parsed, err := mail.ParseAddress(addr)
		if err != nil {
			return nil, fmt.Errorf("smtp: invalid %s recipient %q: %w", what, addr, err)
		}
		rcpts = append(rcpts, parsed.Address)
	}
	return rcpts, nil
}

func (s *SMTPSender) SendJoinRequestNotice(ctx context.Context, to []string, lang string, n JoinRequestNotice) error {
	rcpts, err := parseRecipients(to, "notice")
	if err != nil {
		return err
	}
	// The applicant's address becomes a Reply-To header, so it is re-parsed for
	// the same reason every recipient is: a CR/LF in it would inject a header.
	applicant, err := mail.ParseAddress(n.ApplicantEmail)
	if err != nil {
		return fmt.Errorf("smtp: invalid applicant address: %w", err)
	}
	n.ApplicantEmail = applicant.Address

	rendered, err := renderJoinRequestNotice(n, lang)
	if err != nil {
		return err
	}
	msg, err := s.message(rcpts, rendered)
	if err != nil {
		return err
	}
	return s.send(ctx, rcpts, msg)
}

// SendTransferRequestNotice mails the admins of the branch being asked to take a
// member in. One message per language group, as with the join notice.
func (s *SMTPSender) SendTransferRequestNotice(ctx context.Context, to []string, lang string, n TransferNotice) error {
	rcpts, err := parseRecipients(to, "transfer notice")
	if err != nil {
		return err
	}
	// The member's address becomes a Reply-To header, so it is re-parsed for the
	// same reason every recipient is: a CR/LF in it would inject a header.
	member, err := mail.ParseAddress(n.MemberEmail)
	if err != nil {
		return fmt.Errorf("smtp: invalid member address: %w", err)
	}
	n.MemberEmail = member.Address

	rendered, err := renderTransferNotice(n, lang)
	if err != nil {
		return err
	}
	msg, err := s.message(rcpts, rendered)
	if err != nil {
		return err
	}
	return s.send(ctx, rcpts, msg)
}

// SendTransferDeparture tells the branch a member has left. No Reply-To: nothing
// is being asked of them, and the member is no longer theirs to answer for.
func (s *SMTPSender) SendTransferDeparture(ctx context.Context, to []string, lang string, n DepartureNotice) error {
	rcpts, err := parseRecipients(to, "departure notice")
	if err != nil {
		return err
	}
	member, err := mail.ParseAddress(n.MemberEmail)
	if err != nil {
		return fmt.Errorf("smtp: invalid member address: %w", err)
	}
	n.MemberEmail = member.Address

	rendered, err := renderTransferDeparture(n, lang)
	if err != nil {
		return err
	}
	msg, err := s.message(rcpts, rendered)
	if err != nil {
		return err
	}
	return s.send(ctx, rcpts, msg)
}

func (s *SMTPSender) SendTransferDecision(ctx context.Context, to, branchName, lang string, accepted bool) error {
	rendered, err := renderTransferDecision(branchName, lang, accepted)
	if err != nil {
		return err
	}
	return s.sendTo(ctx, to, rendered)
}

func (s *SMTPSender) SendJoinReceived(ctx context.Context, to, branchName, lang string) error {
	rendered, err := renderJoinReceived(branchName, lang)
	if err != nil {
		return err
	}
	return s.sendTo(ctx, to, rendered)
}

func (s *SMTPSender) SendJoinDecision(ctx context.Context, to, branchName, lang string, approved bool) error {
	rendered, err := renderJoinDecision(branchName, lang, approved)
	if err != nil {
		return err
	}
	return s.sendTo(ctx, to, rendered)
}

// sendTo delivers one rendered message to one recipient, re-parsing the address
// before it reaches a header.
func (s *SMTPSender) sendTo(ctx context.Context, to string, rendered message) error {
	parsed, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("smtp: invalid recipient %q: %w", to, err)
	}
	msg, err := s.message([]string{parsed.Address}, rendered)
	if err != nil {
		return err
	}
	return s.send(ctx, []string{parsed.Address}, msg)
}

func (s *SMTPSender) send(ctx context.Context, to []string, msg []byte) error {
	// net/smtp has no context support, so dial and conversation share a single
	// deadline covering the whole exchange. Without it an unresponsive relay would
	// hold the HTTP handler open for as long as the TCP connection survives.
	deadline := time.Now().Add(s.timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}

	dialer := &net.Dialer{Deadline: deadline}
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(s.host, s.port))
	if err != nil {
		return fmt.Errorf("smtp: dial %s: %w", net.JoinHostPort(s.host, s.port), err)
	}
	_ = conn.SetDeadline(deadline)

	if s.mode == TLSImplicit {
		tlsConn := tls.Client(conn, s.tlsConfig())
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			conn.Close()
			return fmt.Errorf("smtp: TLS handshake: %w", err)
		}
		conn = tlsConn
	}

	c, err := smtp.NewClient(conn, s.host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp: greeting: %w", err)
	}
	defer c.Close()

	// Identify as the sender's domain. net/smtp would otherwise say "localhost",
	// which plenty of relays reject outright.
	if err := c.Hello(s.heloName()); err != nil {
		return fmt.Errorf("smtp: EHLO: %w", err)
	}

	if s.mode == TLSStartTLS {
		if ok, _ := c.Extension("STARTTLS"); !ok {
			return errors.New("smtp: server does not advertise STARTTLS")
		}
		if err := c.StartTLS(s.tlsConfig()); err != nil {
			return fmt.Errorf("smtp: STARTTLS: %w", err)
		}
	}

	if s.username != "" {
		auth, err := s.authFor(c)
		if err != nil {
			return err
		}
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("smtp: authenticate: %w", err)
		}
	}

	if err := c.Mail(s.from.Address); err != nil {
		return fmt.Errorf("smtp: MAIL FROM: %w", err)
	}
	for _, addr := range to {
		if err := c.Rcpt(addr); err != nil {
			return fmt.Errorf("smtp: RCPT TO %s: %w", addr, err)
		}
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp: DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		w.Close()
		return fmt.Errorf("smtp: write message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp: finish message: %w", err)
	}
	// QUIT is what turns "the server accepted the bytes" into "the server took
	// responsibility for the message", so its error matters.
	if err := c.Quit(); err != nil {
		return fmt.Errorf("smtp: QUIT: %w", err)
	}
	return nil
}

func (s *SMTPSender) tlsConfig() *tls.Config {
	return &tls.Config{
		ServerName: s.host,
		MinVersion: tls.VersionTLS12,
		RootCAs:    s.rootCAs,
	}
}

// authFor picks a mechanism the server actually advertises. PLAIN is preferred;
// LOGIN is the fallback that older relays (Exim on shared hosting, most
// cPanel-managed boxes) still insist on.
func (s *SMTPSender) authFor(c *smtp.Client) (smtp.Auth, error) {
	ok, params := c.Extension("AUTH")
	if !ok {
		return nil, errors.New("smtp: server does not advertise AUTH but credentials are configured")
	}
	mechs := strings.Fields(strings.ToUpper(params))
	switch {
	case slices.Contains(mechs, "PLAIN"):
		return smtp.PlainAuth("", s.username, s.password, s.host), nil
	case slices.Contains(mechs, "LOGIN"):
		return &loginAuth{username: s.username, password: s.password, host: s.host}, nil
	default:
		return nil, fmt.Errorf("smtp: no supported AUTH mechanism (server offers: %s)", params)
	}
}

// heloName is the domain half of the sender address.
func (s *SMTPSender) heloName() string {
	if _, domain, ok := strings.Cut(s.from.Address, "@"); ok && domain != "" {
		return domain
	}
	return s.host
}

// message renders an RFC 5322 message carrying both a plain-text and an HTML
// rendering as multipart/alternative. Plain text comes first: a client picks the
// last part it understands, so the order is what makes HTML the preferred form
// while a text-only reader still gets a readable code.
//
// Both parts are base64-encoded because every language we send in has non-ASCII
// text, and 8-bit bodies are not universally accepted.
//
// The From display name is the app's name in the recipient's language, so the
// inbox listing reads the same way the app does.
func (s *SMTPSender) message(to []string, m message) ([]byte, error) {
	id, err := messageID(s.heloName())
	if err != nil {
		return nil, err
	}
	boundary, err := mimeBoundary()
	if err != nil {
		return nil, err
	}

	from := mail.Address{Name: m.senderName, Address: s.from.Address}
	if from.Name == "" {
		from.Name = s.from.Name // fall back to any name configured in SMTP_FROM
	}

	toHeader := make([]string, 0, len(to))
	for _, addr := range to {
		toHeader = append(toHeader, (&mail.Address{Address: addr}).String())
	}

	// A human hitting "Reply" would otherwise land in SMTP_FROM's inbox, which
	// nobody reads. Defaults to a noreply mailbox on the same domain — the
	// From/envelope address is untouched, so bounces still reach SMTP_FROM as
	// documented in BACKEND.md — but a message can override it (feedback mail
	// sets it to the submitter's own address so a reply reaches them directly).
	replyTo := m.replyTo
	if replyTo == "" {
		replyTo = "noreply@" + s.heloName()
	}

	var b strings.Builder
	b.WriteString("From: " + from.String() + "\r\n")
	b.WriteString("To: " + strings.Join(toHeader, ", ") + "\r\n")
	b.WriteString("Reply-To: " + (&mail.Address{Address: replyTo}).String() + "\r\n")
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", m.subject) + "\r\n")
	b.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("Message-ID: " + id + "\r\n")
	// Tells well-behaved autoresponders not to reply to a login code.
	b.WriteString("Auto-Submitted: auto-generated\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n")
	b.WriteString("\r\n")

	writePart := func(contentType, body string) {
		b.WriteString("--" + boundary + "\r\n")
		b.WriteString("Content-Type: " + contentType + "; charset=UTF-8\r\n")
		b.WriteString("Content-Transfer-Encoding: base64\r\n")
		b.WriteString("\r\n")
		b.WriteString(base64Lines(body))
	}
	writePart("text/plain", m.plain)
	writePart("text/html", m.html)
	b.WriteString("--" + boundary + "--\r\n")

	return []byte(b.String()), nil
}

// mimeBoundary returns a delimiter that cannot occur in base64 part bodies.
func mimeBoundary() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("smtp: generate MIME boundary: %w", err)
	}
	return "=_sk_" + hex.EncodeToString(buf[:]), nil
}

func messageID(domain string) (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("smtp: generate message id: %w", err)
	}
	return "<" + hex.EncodeToString(buf[:]) + "@" + domain + ">", nil
}

// base64Lines encodes s and wraps it to 76 characters, as RFC 2045 requires.
func base64Lines(s string) string {
	const lineLen = 76
	enc := base64.StdEncoding.EncodeToString([]byte(s))
	var b strings.Builder
	for len(enc) > lineLen {
		b.WriteString(enc[:lineLen])
		b.WriteString("\r\n")
		enc = enc[lineLen:]
	}
	b.WriteString(enc)
	b.WriteString("\r\n")
	return b.String()
}

// loginAuth implements the non-standard but widespread AUTH LOGIN exchange:
// the server prompts for the username, then the password, each base64-encoded.
// net/smtp decodes the challenges before handing them to Next.
type loginAuth struct {
	username string
	password string
	host     string
}

func (a *loginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	// Same guard rails net/smtp's PlainAuth applies: credentials only travel over
	// an encrypted connection, and only to the host we meant to talk to.
	if !server.TLS {
		return "", nil, errors.New("smtp: refusing to send LOGIN credentials over an unencrypted connection")
	}
	if server.Name != a.host {
		return "", nil, fmt.Errorf("smtp: server name %q does not match configured host %q", server.Name, a.host)
	}
	return "LOGIN", nil, nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(strings.TrimSuffix(string(fromServer), ":"))) {
	case "username":
		return []byte(a.username), nil
	case "password":
		return []byte(a.password), nil
	default:
		return nil, fmt.Errorf("smtp: unexpected LOGIN challenge %q", fromServer)
	}
}
