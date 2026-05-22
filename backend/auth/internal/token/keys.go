package token

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
)

// LoadOrGenerateKey loads an RSA private key from path, generating and saving
// one if the file does not yet exist.
func LoadOrGenerateKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return generateAndSave(path)
	}
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("failed to decode PEM block from key file")
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func generateAndSave(path string) (*rsa.PrivateKey, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	data := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return nil, err
	}
	return key, nil
}
