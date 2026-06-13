package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
)

// acsScope is the Entra token audience for the Azure Communication Services data plane.
const acsScope = "https://communication.azure.com/.default"

// ACSSender sends email through Azure Communication Services' Email REST API,
// authenticating with a user-assigned managed identity (Entra ID) rather than an
// access key — no secret is ever held by the service. There is no Go data-plane
// SDK for ACS Email, so this issues the signed REST call directly: acquire a
// bearer token for the ACS scope, then POST the message.
type ACSSender struct {
	endpoint string // e.g. https://<resource>.<region>.communication.azure.com
	sender   string // verified MailFrom address
	cred     azcore.TokenCredential
	client   *http.Client
}

// NewACSSender builds a sender authenticated by the user-assigned managed identity
// with the given client ID (the identity attached to the container app). endpoint
// and senderAddress identify the ACS resource and its verified MailFrom address.
func NewACSSender(endpoint, senderAddress, identityClientID string) (*ACSSender, error) {
	opts := &azidentity.ManagedIdentityCredentialOptions{}
	if identityClientID != "" {
		opts.ID = azidentity.ClientID(identityClientID)
	}
	cred, err := azidentity.NewManagedIdentityCredential(opts)
	if err != nil {
		return nil, fmt.Errorf("managed identity credential: %w", err)
	}
	return &ACSSender{
		endpoint: strings.TrimRight(endpoint, "/"),
		sender:   senderAddress,
		cred:     cred,
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

	tok, err := s.cred.GetToken(ctx, policy.TokenRequestOptions{Scopes: []string{acsScope}})
	if err != nil {
		return fmt.Errorf("acquire ACS token: %w", err)
	}

	url := s.endpoint + "/emails:send?api-version=2023-03-31"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build ACS request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tok.Token)
	req.Header.Set("Content-Type", "application/json")

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
