package extension

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

// The browser refuses to seal unless the key it is about to encrypt to appears
// inside the quote. In simulated mode there is no launcher to sign one, so the
// enclave builds it — and if that token ever stops carrying the binding, a
// substituted relay key would sail through the check that exists to catch it.
func TestSimulatedQuoteBindsKeyAndMeasurement(t *testing.T) {
	const (
		measurement = "0x7661756c7470726f6f662d76302e342e30000000000000000000000000000000"
		pubKey      = "0xdaf3a25c4f06933b53e27a940ac773eecbbade40ad71ddad5a0262dc8e3f0563"
	)

	token := simulatedQuote(measurement, pubKey)

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token has %d segments, want 3 (JWT shape)", len(parts))
	}

	var payload struct {
		Iss     string `json:"iss"`
		Nonce   string `json:"eat_nonce"`
		Submods struct {
			Container struct {
				ImageDigest string `json:"image_digest"`
			} `json:"container"`
		} `json:"submods"`
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("payload is not unpadded base64url: %v", err)
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("payload is not JSON: %v", err)
	}

	if payload.Nonce != pubKey {
		t.Errorf("eat_nonce = %q, want the enclave public key %q", payload.Nonce, pubKey)
	}
	if payload.Submods.Container.ImageDigest != measurement {
		t.Errorf("image_digest = %q, want %q", payload.Submods.Container.ImageDigest, measurement)
	}
}

// A simulated token must never be mistakable for a Google-signed one. alg:none
// and a self-naming issuer mean that if it were ever presented as mode 0, the
// browser's verifier rejects it rather than trusting a forgery.
func TestSimulatedQuoteDoesNotImpersonateGoogle(t *testing.T) {
	token := simulatedQuote("0xabc", "0xdef")
	parts := strings.Split(token, ".")

	var header struct {
		Alg string `json:"alg"`
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatalf("header is not unpadded base64url: %v", err)
	}
	if err := json.Unmarshal(raw, &header); err != nil {
		t.Fatalf("header is not JSON: %v", err)
	}

	if header.Alg != "none" {
		t.Errorf("alg = %q, want \"none\" so it cannot pose as a signed token", header.Alg)
	}
	if strings.Contains(token, "confidentialcomputing.googleapis.com") {
		t.Error("simulated token names Google's issuer")
	}
}
