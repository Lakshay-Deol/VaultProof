// Package vaultproof holds the confidential half of VaultProof: the code that
// touches credentials.
//
// Rules for every file in this package, from spec §9:
//   - No logging. Not the credential, not a prefix of it, not its length.
//   - No credential-derived value in an error message, ever. Errors say which
//     step failed, never what the data was.
//   - Zeroize in a defer, so an early return cannot skip it.
package vaultproof

import (
	"crypto/rand"
	"errors"
	"fmt"

	"github.com/cloudflare/circl/hpke"
	"github.com/cloudflare/circl/kem"
)

// The suite must match web/lib/crypto/hpke.ts exactly:
// X25519 / HKDF-SHA256 / ChaCha20-Poly1305, RFC 9180 base mode.
// A mismatch here fails to open every blob the browser produces.
const kemID = hpke.KEM_X25519_HKDF_SHA256

var suite = hpke.NewSuite(
	kemID,
	hpke.KDF_HKDF_SHA256,
	hpke.AEAD_ChaCha20Poly1305,
)

// encLength is the X25519 encapsulated-key size. The browser sends
// enc ‖ ciphertext as one blob, so the split point is fixed by the KEM.
const encLength = 32

// EnclaveKeyPair is generated at boot, inside the enclave. The private half
// never leaves this process and is never written to disk; the public half is
// embedded in the signed attestation quote, which is what binds "this key" to
// "this code" and defeats a relay that tries to substitute its own key.
type EnclaveKeyPair struct {
	priv kem.PrivateKey
	pub  []byte
}

// NewEnclaveKeyPair generates a fresh X25519 keypair. Called once at boot: a
// key that outlived a reboot would weaken the binding between the running code
// and the key the browser sealed to.
func NewEnclaveKeyPair() (*EnclaveKeyPair, error) {
	pub, priv, err := kemID.Scheme().GenerateKeyPair()
	if err != nil {
		return nil, fmt.Errorf("generating enclave keypair: %w", err)
	}

	raw, err := pub.MarshalBinary()
	if err != nil {
		return nil, fmt.Errorf("serialising enclave public key: %w", err)
	}

	return &EnclaveKeyPair{priv: priv, pub: raw}, nil
}

// PublicKey returns the serialised X25519 public key for embedding in the quote.
func (k *EnclaveKeyPair) PublicKey() []byte {
	out := make([]byte, len(k.pub))
	copy(out, k.pub)
	return out
}

// SealInfo is the HPKE context binding from spec §6. It must match
// sealInfo() in web/lib/crypto/hpke.ts character for character.
//
// The measurement is inside the info string, so a blob sealed for one enclave
// build cannot be opened by a different build even if that build holds a valid
// key — which is what stops a downgrade to a compromised image.
func SealInfo(measurement string, chainID int64) []byte {
	return []byte(fmt.Sprintf("vaultproof/v1|%s|%d", measurement, chainID))
}

// Open decrypts a sealed blob (enc ‖ ciphertext) produced by the browser.
//
// The returned plaintext is live credential material. Callers must Zeroize it
// in a defer. Errors here never include any part of the input.
func (k *EnclaveKeyPair) Open(blob, info []byte) ([]byte, error) {
	if len(blob) <= encLength {
		return nil, errors.New("sealed blob is shorter than the encapsulated key")
	}

	enc, ciphertext := blob[:encLength], blob[encLength:]

	receiver, err := suite.NewReceiver(k.priv, info)
	if err != nil {
		return nil, fmt.Errorf("creating HPKE receiver: %w", err)
	}

	opener, err := receiver.Setup(enc)
	if err != nil {
		// Wrong enclave build, wrong chain, or a tampered encapsulated key.
		return nil, fmt.Errorf("HPKE setup rejected the encapsulated key: %w", err)
	}

	plaintext, err := opener.Open(ciphertext, nil)
	if err != nil {
		// AEAD authentication failed: the blob was modified in transit.
		return nil, fmt.Errorf("HPKE open failed authentication: %w", err)
	}

	return plaintext, nil
}

// Zeroize overwrites a buffer in place. Go gives no guarantee the compiler
// keeps this, but on the confidential-VM path it is the difference between a
// credential sitting in a reused heap page and not.
func Zeroize(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// ZeroizeString does what it can for a string. Strings are immutable in Go, so
// this cannot actually scrub the backing array — the real defence is never
// putting credential material in a string in the first place. Kept as a
// marker at the call sites where that rule is load-bearing.
func randomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("reading entropy: %w", err)
	}
	return b, nil
}
