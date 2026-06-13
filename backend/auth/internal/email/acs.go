package email

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ACSSender sends email through Azure Communication Services' Email REST API,
// authenticating each request with the resource access key via the HMAC-SHA256
// scheme ACS requires. It deliberately uses no Azure SDK — a single signed POST
// keeps the dependency surface (and binary) small.
type ACSSender struct {
	endpoint string // e.g. https://<resource>.communication.azure.com
	key      []byte // decoded access key
	sender   string // verified MailFrom address
	client   *http.Client
}

// NewACSSender builds a sender. endpoint and accessKey come from the ACS
// resource; senderAddress is the verified MailFrom (managed-domain or custom).
func NewACSSender(endpoint, accessKey, senderAddress string) (*ACSSender, error) {
	key, err := base64.StdEncoding.DecodeString(accessKey)
	if err != nil {
		return nil, fmt.Errorf("decode ACS access key: %w", err)
	}
	return &ACSSender{
		endpoint: strings.TrimRight(endpoint, "/"),
		key:      key,
		sender:   senderAddress,
		client:   &http.Client{Timeout: 15 * time.Second},
	}, nil
}

type acsEmailRequest struct {
	SenderAddress string             `json:"senderAddress"`
	Content       acsEmailContent    `json:"content"`
	Recipients    acsEmailRecipients `json:"recipients"`
}

type acsEmailContent struct {
	Subject   string `json:"subject"`
	PlainText string `json:"plainText"`
}

type acsEmailRecipients struct {
	To []acsEmailAddress `json:"to"`
}

type acsEmailAddress struct {
	Address string `json:"address"`
}

func (s *ACSSender) SendVerificationCode(ctx context.Context, to, code, lang string) error {
	subject, body := render(code, lang)
	payload, err := json.Marshal(acsEmailRequest{
		SenderAddress: s.sender,
		Content:       acsEmailContent{Subject: subject, PlainText: body},
		Recipients:    acsEmailRecipients{To: []acsEmailAddress{{Address: to}}},
	})
	if err != nil {
		return fmt.Errorf("marshal email request: %w", err)
	}

	const pathAndQuery = "/emails:send?api-version=2023-03-31"
	u, err := url.Parse(s.endpoint + pathAndQuery)
	if err != nil {
		return fmt.Errorf("parse ACS endpoint: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build ACS request: %w", err)
	}
	s.sign(req, u, payload)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("send ACS request: %w", err)
	}
	defer resp.Body.Close()

	// The send is asynchronous: 202 Accepted means ACS queued the message.
	if resp.StatusCode != http.StatusAccepted {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("ACS email send: status %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	return nil
}

// sign applies the ACS HMAC-SHA256 access-key signature to the request.
// stringToSign = "POST\n{path?query}\n{date};{host};{base64(sha256(body))}".
func (s *ACSSender) sign(req *http.Request, u *url.URL, body []byte) {
	date := time.Now().UTC().Format(http.TimeFormat) // RFC1123 with literal "GMT"
	host := u.Host

	contentSum := sha256.Sum256(body)
	contentHash := base64.StdEncoding.EncodeToString(contentSum[:])

	stringToSign := "POST\n" + u.RequestURI() + "\n" + date + ";" + host + ";" + contentHash

	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	req.Header.Set("x-ms-date", date)
	req.Header.Set("x-ms-content-sha256", contentHash)
	req.Header.Set("Authorization", "HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature="+signature)
	req.Header.Set("Content-Type", "application/json")
}
