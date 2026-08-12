package vaultproof

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"time"
)

// JWTs use unpadded base64url.
var base64URLDecoder = base64.URLEncoding

// Real hardware attestation on GCP Confidential Space.
//
// The container does not sign anything itself. It asks the Confidential Space
// launcher — over a unix socket that only exists inside a real confidential VM
// — for an attestation token. The launcher is outside the container's control,
// which is the whole point: the workload cannot mint a token describing an
// image other than the one actually booted.
//
// The returned token is a JWT signed by Google's Confidential Computing
// service. It carries, among other claims:
//
//	submods.container.image_digest  the image that booted — our measurement
//	eat_nonce                       caller-supplied nonces, echoed inside the
//	                                signature. We pass the enclave's X25519
//	                                public key here, which is what binds "this
//	                                key" to "this code" and defeats a relay
//	                                that tries to substitute its own key.
//	hwmodel / swname                the platform, e.g. AMD SEV-SNP
//
// If the socket is absent we are not on Confidential Space, and the caller
// falls back to simulated mode and reports mode 1 rather than pretending.

const (
	// launcherSocket is mounted by the Confidential Space launcher. Its
	// presence is the signal that we are on real hardware.
	launcherSocket = "/run/container_launcher/teeserver.sock"

	// tokenPath is the launcher's token endpoint. The host part of the URL is
	// ignored — the transport dials the unix socket.
	tokenURL = "http://localhost/v1/token"

	// TokenAudience identifies who the token is for. The verifier checks it,
	// so a token minted for another audience cannot be replayed at us.
	TokenAudience = "vaultproof"
)

// AttestationAvailable reports whether real hardware attestation can be had.
func AttestationAvailable() bool {
	_, err := os.Stat(launcherSocket)
	return err == nil
}

// launcherClient dials the launcher's unix socket instead of the network.
func launcherClient() *http.Client {
	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", launcherSocket)
			},
		},
	}
}

// tokenRequest is the launcher's request shape.
type tokenRequest struct {
	Audience  string   `json:"audience"`
	Nonces    []string `json:"nonces"`
	TokenType string   `json:"token_type"`
}

// FetchAttestationToken asks the launcher for a hardware-signed token binding
// the supplied nonce.
//
// nonce must be 10–74 bytes once encoded; we pass the hex-encoded X25519
// public key, which is 66 characters and therefore in range.
func FetchAttestationToken(ctx context.Context, nonce string) (string, error) {
	if !AttestationAvailable() {
		return "", ErrNoAttestation
	}
	if len(nonce) < 10 || len(nonce) > 74 {
		return "", fmt.Errorf("attestation nonce must be 10-74 bytes, got %d", len(nonce))
	}

	body, err := json.Marshal(tokenRequest{
		Audience:  TokenAudience,
		Nonces:    []string{nonce},
		TokenType: "OIDC",
	})
	if err != nil {
		return "", fmt.Errorf("encoding token request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("building token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := launcherClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("requesting attestation token: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("reading attestation token: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("launcher returned HTTP %d requesting a token", resp.StatusCode)
	}

	token := string(bytes.TrimSpace(raw))
	if token == "" {
		return "", errors.New("launcher returned an empty attestation token")
	}
	return token, nil
}

// ErrNoAttestation means we are not running on Confidential Space.
var ErrNoAttestation = errors.New("no Confidential Space launcher socket; not running on real TEE hardware")

// TokenClaims is the subset of the attestation token the extension reads back.
type TokenClaims struct {
	Audience string `json:"aud"`
	HWModel  string `json:"hwmodel"`
	SWName   string `json:"swname"`
	EatNonce any    `json:"eat_nonce"`
	Submods  struct {
		Container struct {
			ImageDigest string `json:"image_digest"`
		} `json:"container"`
	} `json:"submods"`
}

// ParseTokenClaims decodes the JWT payload WITHOUT verifying the signature.
//
// This is only used inside the enclave to read back its own image digest. It
// must never be used to make a trust decision — the signature check that
// matters happens in the user's browser, against Google's public keys, because
// verification performed by the party being trusted proves nothing (spec §6).
func ParseTokenClaims(token string) (*TokenClaims, error) {
	parts := bytes.Split([]byte(token), []byte("."))
	if len(parts) != 3 {
		return nil, errors.New("attestation token is not a well-formed JWT")
	}

	payload, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decoding token payload: %w", err)
	}

	var claims TokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("parsing token claims: %w", err)
	}
	return &claims, nil
}

// base64URLDecode handles the unpadded base64url JWTs use.
func base64URLDecode(in []byte) ([]byte, error) {
	s := string(in)
	if pad := len(s) % 4; pad != 0 {
		s += "===="[:4-pad]
	}
	return base64URLDecoder.DecodeString(s)
}
