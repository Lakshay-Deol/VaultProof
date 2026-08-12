package vaultproof

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// On a laptop there is no launcher socket, so attestation must be reported as
// unavailable rather than faked. The caller turns this into mode 1.
func TestAttestationUnavailableOffConfidentialSpace(t *testing.T) {
	if AttestationAvailable() {
		t.Skip("running on Confidential Space; this test covers the laptop case")
	}

	_, err := FetchAttestationToken(context.Background(), strings.Repeat("a", 32))
	if !errors.Is(err, ErrNoAttestation) {
		t.Fatalf("err = %v, want ErrNoAttestation", err)
	}
}

// Confidential Space rejects nonces outside 10-74 bytes, so catching it here
// turns a confusing launcher error into an obvious one.
func TestNonceLengthIsValidated(t *testing.T) {
	for _, nonce := range []string{"", "short", strings.Repeat("x", 75)} {
		_, err := FetchAttestationToken(context.Background(), nonce)
		if err == nil {
			t.Fatalf("nonce %q was accepted", nonce)
		}
	}
}

// The enclave reads its own image digest back out of the token it was handed.
func TestParseTokenClaims(t *testing.T) {
	payload := map[string]any{
		"aud":       "vaultproof",
		"hwmodel":   "AMD_SEV_SNP",
		"swname":    "CONFIDENTIAL_SPACE",
		"eat_nonce": "0xdeadbeef",
		"submods": map[string]any{
			"container": map[string]any{"image_digest": "sha256:abc123"},
		},
	}
	body, _ := json.Marshal(payload)
	token := "header." + base64.RawURLEncoding.EncodeToString(body) + ".signature"

	claims, err := ParseTokenClaims(token)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.Submods.Container.ImageDigest != "sha256:abc123" {
		t.Errorf("image digest = %q", claims.Submods.Container.ImageDigest)
	}
	if claims.HWModel != "AMD_SEV_SNP" {
		t.Errorf("hwmodel = %q", claims.HWModel)
	}
}

func TestMalformedTokenIsRejected(t *testing.T) {
	for _, token := range []string{"", "not-a-jwt", "only.two"} {
		if _, err := ParseTokenClaims(token); err == nil {
			t.Errorf("token %q was accepted", token)
		}
	}
}
