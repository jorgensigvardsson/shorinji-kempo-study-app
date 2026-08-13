package email

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"io"
	"math/big"
	"mime"
	"mime/multipart"
	"net"
	"net/mail"
	"net/textproto"
	"strings"
	"sync"
	"testing"
	"time"
)

// ── A scripted SMTP server ────────────────────────────────────────────────────
//
// Just enough of RFC 5321 to exercise the client: implicit TLS or STARTTLS,
// PLAIN or LOGIN auth, and one message. It records what it was told so the tests
// can assert on the envelope and the rendered message.

type fakeServer struct {
	ln         net.Listener
	tlsConf    *tls.Config
	implicit   bool
	noStartTLS bool
	authMechs  string // advertised after "AUTH "; empty advertises none

	mu       sync.Mutex
	from     string
	rcpts    []string
	data     string
	authUser string
	authPass string
	wasTLS   bool
}

func (f *fakeServer) addr() (host, port string) {
	host, port, err := net.SplitHostPort(f.ln.Addr().String())
	if err != nil {
		panic(err)
	}
	return host, port
}

func (f *fakeServer) serve() {
	conn, err := f.ln.Accept()
	if err != nil {
		return
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))

	if f.implicit {
		tc := tls.Server(conn, f.tlsConf)
		if err := tc.Handshake(); err != nil {
			return
		}
		conn = tc
		f.mu.Lock()
		f.wasTLS = true
		f.mu.Unlock()
	}

	tp := textproto.NewConn(conn)
	_ = tp.PrintfLine("220 fake ESMTP")

	for {
		line, err := tp.ReadLine()
		if err != nil {
			return
		}
		verb, rest, _ := strings.Cut(line, " ")
		switch strings.ToUpper(verb) {
		case "EHLO", "HELO":
			greeting := []string{"250-fake"}
			if !f.noStartTLS && !f.implicit {
				greeting = append(greeting, "250-STARTTLS")
			}
			if f.authMechs != "" {
				greeting = append(greeting, "250-AUTH "+f.authMechs)
			}
			// The final line uses a space instead of a hyphen.
			last := greeting[len(greeting)-1]
			greeting[len(greeting)-1] = strings.Replace(last, "-", " ", 1)
			for _, l := range greeting {
				_ = tp.PrintfLine("%s", l)
			}
		case "STARTTLS":
			_ = tp.PrintfLine("220 go ahead")
			tc := tls.Server(conn, f.tlsConf)
			if err := tc.Handshake(); err != nil {
				return
			}
			conn = tc
			tp = textproto.NewConn(conn)
			f.mu.Lock()
			f.wasTLS = true
			f.mu.Unlock()
		case "AUTH":
			if !f.handleAuth(tp, rest) {
				return
			}
		case "MAIL":
			f.mu.Lock()
			f.from = addrArg(rest)
			f.mu.Unlock()
			_ = tp.PrintfLine("250 OK")
		case "RCPT":
			f.mu.Lock()
			f.rcpts = append(f.rcpts, addrArg(rest))
			f.mu.Unlock()
			_ = tp.PrintfLine("250 OK")
		case "DATA":
			_ = tp.PrintfLine("354 end with .")
			body, err := io.ReadAll(tp.DotReader())
			if err != nil {
				return
			}
			f.mu.Lock()
			f.data = string(body)
			f.mu.Unlock()
			_ = tp.PrintfLine("250 queued")
		case "QUIT":
			_ = tp.PrintfLine("221 bye")
			return
		default:
			_ = tp.PrintfLine("500 unrecognised")
		}
	}
}

func (f *fakeServer) handleAuth(tp *textproto.Conn, rest string) bool {
	mech, arg, _ := strings.Cut(rest, " ")
	switch strings.ToUpper(mech) {
	case "PLAIN":
		raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(arg))
		if err != nil {
			_ = tp.PrintfLine("535 bad credentials")
			return false
		}
		parts := strings.Split(string(raw), "\x00")
		if len(parts) != 3 {
			_ = tp.PrintfLine("535 bad credentials")
			return false
		}
		f.mu.Lock()
		f.authUser, f.authPass = parts[1], parts[2]
		f.mu.Unlock()
	case "LOGIN":
		user, ok := f.challenge(tp, "Username:")
		if !ok {
			return false
		}
		pass, ok := f.challenge(tp, "Password:")
		if !ok {
			return false
		}
		f.mu.Lock()
		f.authUser, f.authPass = user, pass
		f.mu.Unlock()
	default:
		_ = tp.PrintfLine("504 unsupported mechanism")
		return true
	}
	_ = tp.PrintfLine("235 authenticated")
	return true
}

func (f *fakeServer) challenge(tp *textproto.Conn, prompt string) (string, bool) {
	_ = tp.PrintfLine("334 %s", base64.StdEncoding.EncodeToString([]byte(prompt)))
	line, err := tp.ReadLine()
	if err != nil {
		return "", false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(line))
	if err != nil {
		return "", false
	}
	return string(raw), true
}

// addrArg pulls the address out of "FROM:<a@b>" / "TO:<a@b>".
func addrArg(s string) string {
	_, after, ok := strings.Cut(s, ":")
	if !ok {
		return ""
	}
	return strings.Trim(strings.TrimSpace(after), "<>")
}

// startFake spins up a server on localhost and returns it along with a sender
// wired to it. The sender trusts the throwaway certificate.
func startFake(t *testing.T, mode TLSMode, authMechs string, opts ...func(*fakeServer)) (*fakeServer, *SMTPSender) {
	t.Helper()

	cert, pool := throwawayCert(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { ln.Close() })

	f := &fakeServer{
		ln:        ln,
		tlsConf:   &tls.Config{Certificates: []tls.Certificate{cert}},
		implicit:  mode == TLSImplicit,
		authMechs: authMechs,
	}
	for _, opt := range opts {
		opt(f)
	}
	go f.serve()

	host, port := f.addr()
	user, pass := "", ""
	if authMechs != "" {
		user, pass = "kenshi", "hunter2"
	}
	s, err := NewSMTPSender(host, port, user, pass, "Shorinji Kempo <noreply@example.test>", mode)
	if err != nil {
		t.Fatalf("NewSMTPSender: %v", err)
	}
	s.rootCAs = pool
	return f, s
}

// throwawayCert issues a self-signed certificate valid for 127.0.0.1.
func throwawayCert(t *testing.T) (tls.Certificate, *x509.CertPool) {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "fake smtp"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IsCA:         true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(parsed)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key, Leaf: parsed}, pool
}

// parseMessage decodes what the server received into its headers and its
// multipart/alternative parts, in the order they appeared on the wire.
// textproto's DotReader has already normalised CRLF to LF by the time the
// server records it, so the message is restored before handing it to net/mail.
func parseMessage(t *testing.T, raw string) (mail.Header, []mimePart) {
	t.Helper()

	msg, err := mail.ReadMessage(strings.NewReader(strings.ReplaceAll(raw, "\n", "\r\n")))
	if err != nil {
		t.Fatalf("parse message: %v\n%s", err, raw)
	}

	mediaType, params, err := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	if err != nil {
		t.Fatalf("parse Content-Type: %v", err)
	}
	if mediaType != "multipart/alternative" {
		t.Fatalf("Content-Type = %q, want multipart/alternative", mediaType)
	}

	var parts []mimePart
	mr := multipart.NewReader(msg.Body, params["boundary"])
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read part: %v", err)
		}
		encoded, err := io.ReadAll(p)
		if err != nil {
			t.Fatalf("read part body: %v", err)
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(string(encoded), "\r\n", ""))
		if err != nil {
			t.Fatalf("decode part body: %v", err)
		}
		mt, _, err := mime.ParseMediaType(p.Header.Get("Content-Type"))
		if err != nil {
			t.Fatalf("parse part Content-Type: %v", err)
		}
		parts = append(parts, mimePart{contentType: mt, body: string(decoded)})
	}
	return msg.Header, parts
}

type mimePart struct {
	contentType string
	body        string
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestSendVerificationCode_ImplicitTLS_PlainAuth(t *testing.T) {
	f, s := startFake(t, TLSImplicit, "PLAIN")

	if err := s.SendVerificationCode(context.Background(), "kenshi@example.test", "123456", "sv"); err != nil {
		t.Fatalf("SendVerificationCode: %v", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	if !f.wasTLS {
		t.Error("connection was not encrypted")
	}
	if f.authUser != "kenshi" || f.authPass != "hunter2" {
		t.Errorf("credentials = %q/%q, want kenshi/hunter2", f.authUser, f.authPass)
	}
	if f.from != "noreply@example.test" {
		t.Errorf("envelope sender = %q, want noreply@example.test (the address, not the display name)", f.from)
	}
	if len(f.rcpts) != 1 || f.rcpts[0] != "kenshi@example.test" {
		t.Errorf("recipients = %v, want [kenshi@example.test]", f.rcpts)
	}

	header, parts := parseMessage(t, f.data)

	// Plain text must come first: clients render the last part they understand.
	if len(parts) != 2 {
		t.Fatalf("got %d parts, want 2 (plain then HTML)", len(parts))
	}
	if parts[0].contentType != "text/plain" || parts[1].contentType != "text/html" {
		t.Errorf("part order = %q, %q; want text/plain then text/html", parts[0].contentType, parts[1].contentType)
	}
	for _, p := range parts {
		if !strings.Contains(p.body, "123456") {
			t.Errorf("%s part does not carry the code:\n%s", p.contentType, p.body)
		}
	}
	if !strings.Contains(parts[1].body, "Shorinji Kempo Studieapp") {
		t.Error("HTML part does not name the app in the recipient's language")
	}

	// The Swedish subject has non-ASCII in it, so it must be MIME word-encoded
	// on the wire — and decode back to the original.
	if !strings.Contains(f.data, "Subject: =?utf-8?") {
		t.Errorf("subject is not encoded:\n%s", f.data)
	}
	subject, err := new(mime.WordDecoder).DecodeHeader(header.Get("Subject"))
	if err != nil {
		t.Fatalf("decode subject: %v", err)
	}
	if subject != "Din inloggningskod för Shorinji Kempo" {
		t.Errorf("subject = %q", subject)
	}

	for _, h := range []string{"From", "To", "Date", "Message-ID", "MIME-Version"} {
		if header.Get(h) == "" {
			t.Errorf("missing %s header:\n%s", h, f.data)
		}
	}
}

// The inbox listing should read in the recipient's language while the address
// stays whatever SMTP_FROM configured.
func TestSendVerificationCode_LocalizedSenderName(t *testing.T) {
	for _, tc := range []struct{ lang, want string }{
		{"sv", "Shorinji Kempo Studieapp"},
		{"en", "Shorinji Kempo Study App"},
		{"tr", "Shorinji Kempo Çalışma Uygulaması"},
		{"ja", "少林寺拳法学習アプリ"},
		{"xx", "Shorinji Kempo Study App"}, // unknown language falls back to English
	} {
		t.Run(tc.lang, func(t *testing.T) {
			f, s := startFake(t, TLSImplicit, "PLAIN")
			if err := s.SendVerificationCode(context.Background(), "kenshi@example.test", "123456", tc.lang); err != nil {
				t.Fatalf("SendVerificationCode: %v", err)
			}

			f.mu.Lock()
			defer f.mu.Unlock()

			header, _ := parseMessage(t, f.data)
			from, err := mail.ParseAddress(header.Get("From"))
			if err != nil {
				t.Fatalf("parse From %q: %v", header.Get("From"), err)
			}
			if from.Name != tc.want {
				t.Errorf("From display name = %q, want %q", from.Name, tc.want)
			}
			if from.Address != "noreply@example.test" {
				t.Errorf("From address = %q, want noreply@example.test", from.Address)
			}
			// The envelope sender is what bounces go to; it must stay the address.
			if f.from != "noreply@example.test" {
				t.Errorf("envelope sender = %q", f.from)
			}
		})
	}
}

func TestSendVerificationCode_StartTLS(t *testing.T) {
	f, s := startFake(t, TLSStartTLS, "PLAIN")

	if err := s.SendVerificationCode(context.Background(), "kenshi@example.test", "654321", "en"); err != nil {
		t.Fatalf("SendVerificationCode: %v", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.wasTLS {
		t.Error("STARTTLS did not upgrade the connection")
	}
	_, parts := parseMessage(t, f.data)
	for _, p := range parts {
		if !strings.Contains(p.body, "654321") {
			t.Errorf("%s part does not carry the code:\n%s", p.contentType, p.body)
		}
	}
}

func TestSendVerificationCode_LoginAuthFallback(t *testing.T) {
	f, s := startFake(t, TLSImplicit, "LOGIN")

	if err := s.SendVerificationCode(context.Background(), "kenshi@example.test", "111222", "ja"); err != nil {
		t.Fatalf("SendVerificationCode: %v", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.authUser != "kenshi" || f.authPass != "hunter2" {
		t.Errorf("credentials = %q/%q, want kenshi/hunter2", f.authUser, f.authPass)
	}
}

// A server that only offers plaintext must not silently get the message anyway.
func TestSendVerificationCode_StartTLSNotOffered(t *testing.T) {
	f, s := startFake(t, TLSStartTLS, "PLAIN", func(f *fakeServer) { f.noStartTLS = true })

	err := s.SendVerificationCode(context.Background(), "kenshi@example.test", "123456", "en")
	if err == nil {
		t.Fatal("send succeeded without STARTTLS")
	}
	if !strings.Contains(err.Error(), "STARTTLS") {
		t.Errorf("error = %v, want it to mention STARTTLS", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.data != "" {
		t.Error("message was delivered over an unencrypted connection")
	}
}

// The recipient reaches us from a JSON request body, so a CR/LF in it would let
// a caller append headers of their own.
func TestSendVerificationCode_RejectsHeaderInjection(t *testing.T) {
	f, s := startFake(t, TLSImplicit, "PLAIN")

	err := s.SendVerificationCode(context.Background(), "kenshi\r\nBcc: attacker@evil.test@example.test", "123456", "en")
	if err == nil {
		t.Fatal("accepted an address containing CRLF")
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.data != "" {
		t.Error("a message was sent for an invalid address")
	}
}

func TestNewSMTPSender_RejectsCredentialsWithoutTLS(t *testing.T) {
	if _, err := NewSMTPSender("localhost", "25", "kenshi", "hunter2", "noreply@example.test", TLSNone); err == nil {
		t.Fatal("accepted credentials on an unencrypted connection")
	}
	// Without credentials, plaintext is a legitimate local-relay setup.
	if _, err := NewSMTPSender("localhost", "25", "", "", "noreply@example.test", TLSNone); err != nil {
		t.Fatalf("rejected an unauthenticated plaintext relay: %v", err)
	}
}

func TestParseTLSMode(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want TLSMode
		ok   bool
	}{
		{"implicit", TLSImplicit, true},
		{"STARTTLS", TLSStartTLS, true},
		{" none ", TLSNone, true},
		{"", TLSStartTLS, true}, // unset defaults to the port-587 convention
		{"ssl", "", false},
	} {
		got, err := ParseTLSMode(tc.in)
		if tc.ok && err != nil {
			t.Errorf("ParseTLSMode(%q): %v", tc.in, err)
		}
		if !tc.ok && err == nil {
			t.Errorf("ParseTLSMode(%q) = %q, want an error", tc.in, got)
		}
		if tc.ok && got != tc.want {
			t.Errorf("ParseTLSMode(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSendFeedback_MultipleRecipientsAndReplyTo(t *testing.T) {
	f, s := startFake(t, TLSImplicit, "PLAIN")

	err := s.SendFeedback(context.Background(),
		[]string{"maintainer1@example.test", "maintainer2@example.test"},
		"Kenshi", "kenshi@example.test", "This app is great, but X could be better.")
	if err != nil {
		t.Fatalf("SendFeedback: %v", err)
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	// The envelope sender stays SMTP_FROM regardless of who submitted feedback.
	if f.from != "noreply@example.test" {
		t.Errorf("envelope sender = %q, want noreply@example.test", f.from)
	}
	wantRcpts := []string{"maintainer1@example.test", "maintainer2@example.test"}
	if len(f.rcpts) != len(wantRcpts) {
		t.Fatalf("recipients = %v, want %v", f.rcpts, wantRcpts)
	}
	for i, want := range wantRcpts {
		if f.rcpts[i] != want {
			t.Errorf("rcpts[%d] = %q, want %q", i, f.rcpts[i], want)
		}
	}

	header, parts := parseMessage(t, f.data)
	if got := header.Get("Reply-To"); !strings.Contains(got, "kenshi@example.test") {
		t.Errorf("Reply-To = %q, want it to carry the submitter's address", got)
	}
	for _, p := range parts {
		if !strings.Contains(p.body, "Kenshi") || !strings.Contains(p.body, "X could be better") {
			t.Errorf("%s part is missing submitter/message content:\n%s", p.contentType, p.body)
		}
	}
}

// The submitter's own address ultimately lands in a header (Reply-To), so it
// gets the same anti-injection validation as any other address.
func TestSendFeedback_RejectsHeaderInjectionInSubmitterAddress(t *testing.T) {
	f, s := startFake(t, TLSImplicit, "PLAIN")

	err := s.SendFeedback(context.Background(), []string{"maintainer@example.test"},
		"Kenshi", "kenshi\r\nBcc: attacker@evil.test@example.test", "feedback")
	if err == nil {
		t.Fatal("accepted a submitter address containing CRLF")
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.data != "" {
		t.Error("a message was sent despite the invalid submitter address")
	}
}

func TestSendFeedback_NoRecipients(t *testing.T) {
	_, s := startFake(t, TLSImplicit, "PLAIN")

	if err := s.SendFeedback(context.Background(), nil, "Kenshi", "kenshi@example.test", "feedback"); err == nil {
		t.Fatal("SendFeedback with no recipients should fail")
	}
}

// A long body must be wrapped: RFC 5321 caps a line at 1000 octets.
func TestBase64Lines_Wraps(t *testing.T) {
	out := base64Lines(strings.Repeat("räknar till tio. ", 40))
	for _, line := range strings.Split(strings.TrimSpace(out), "\r\n") {
		if len(line) > 76 {
			t.Fatalf("line of %d characters exceeds the 76-character limit", len(line))
		}
	}
	joined := strings.ReplaceAll(strings.TrimSpace(out), "\r\n", "")
	decoded, err := base64.StdEncoding.DecodeString(joined)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(decoded) != strings.Repeat("räknar till tio. ", 40) {
		t.Error("round trip changed the body")
	}
}
