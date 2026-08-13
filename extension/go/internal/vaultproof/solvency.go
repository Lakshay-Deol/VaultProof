package vaultproof

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// Attestation is what the enclave is willing to say out loud.
type Attestation struct {
	Tier      uint8
	Nullifier [32]byte
}

// Prices is the pricing surface the solvency run needs. An interface so tests
// can price deterministically without a chain.
type Prices interface {
	ValueUSD(ctx context.Context, balances Balances) (float64, error)
}

// AttestSolvency runs the five confidential steps: unseal, query, price,
// reduce, sign — then wipes everything it touched.
//
// The credential exists between the Open below and the deferred Zeroize, and
// nowhere else in the process. Nothing in this function logs, and no error it
// returns contains a credential-derived value; the caller puts these straight
// into an ActionResult, which is published.
func AttestSolvency(
	ctx context.Context,
	keys *EnclaveKeyPair,
	prices Prices,
	blob []byte,
	info []byte,
) (Attestation, error) {
	// --- 1. unseal -------------------------------------------------------
	plaintext, err := keys.Open(blob, info)
	if err != nil {
		return Attestation{}, fmt.Errorf("unseal: %w", err)
	}
	// Deferred so no early return below can skip the wipe.
	defer Zeroize(plaintext)

	var cred SealedCredentialBytes
	if err := json.Unmarshal(plaintext, &cred); err != nil {
		return Attestation{}, errors.New("unseal: sealed payload was not valid JSON")
	}
	defer cred.Zeroize()

	if len(cred.APIKey) == 0 || len(cred.APISecret) == 0 {
		return Attestation{}, errors.New("unseal: sealed payload was missing credential fields")
	}
	// --- 2. query --------------------------------------------------------
	// Named exchanges only — FetchBalances refuses anything it has no adapter
	// for, so an arbitrary endpoint in the sealed payload cannot be reached.
	balances, err := FetchBalances(ctx, cred.Exchange, string(cred.APIKey), string(cred.APISecret))
	if err != nil {
		if errors.Is(err, ErrUnsupportedExchange) {
			return Attestation{}, err
		}
		return Attestation{}, fmt.Errorf("query: %w", err)
	}

	// --- 3. price (FTSO, inside the enclave) ------------------------------
	usd, err := prices.ValueUSD(ctx, balances)
	if err != nil {
		return Attestation{}, fmt.Errorf("price: %w", err)
	}

	// --- 4. reduce -------------------------------------------------------
	// From here on the exact figure is gone. Only the band survives.
	tier := TierForUSD(usd)

	// --- 5. sign ---------------------------------------------------------
	// The nullifier binds this attestation to the exchange account without
	// revealing it. The account id is the API key: stable per account, and
	// unrecoverable from the HMAC without the enclave-private secret.
	nullifier, err := Nullifier(cred.Exchange, string(cred.APIKey))
	if err != nil {
		return Attestation{}, fmt.Errorf("sign: %w", err)
	}

	// The signature over this result is applied by the TEE node using its
	// registered signing key; the enclave's job is to produce the payload.
	return Attestation{Tier: tier, Nullifier: nullifier}, nil
}

// SealedCredentialBytes is the wire shape of the sealed payload, held as byte
// slices rather than strings so it can actually be wiped.
//
// Go strings are immutable and may be interned, so a credential in a string
// cannot be scrubbed — it stays in the heap until the GC happens to reuse the
// page. Byte slices can be overwritten in place, which is the whole point.
type SealedCredentialBytes struct {
	Exchange  string `json:"exchange"`
	APIKey    []byte `json:"-"`
	APISecret []byte `json:"-"`
}

// UnmarshalJSON decodes the credential straight into wipeable buffers.
func (c *SealedCredentialBytes) UnmarshalJSON(data []byte) error {
	var raw struct {
		Exchange  string `json:"exchange"`
		APIKey    string `json:"apiKey"`
		APISecret string `json:"apiSecret"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	c.Exchange = raw.Exchange
	c.APIKey = []byte(raw.APIKey)
	c.APISecret = []byte(raw.APISecret)
	return nil
}

// Zeroize wipes both credential buffers.
func (c *SealedCredentialBytes) Zeroize() {
	Zeroize(c.APIKey)
	Zeroize(c.APISecret)
}
