package vaultproof

import (
	"crypto/hmac"
	"crypto/sha256"
	"fmt"
	"sync"
)

// nullifierSecret is derived once at boot and never leaves the enclave.
//
// It has to be secret, or anyone could compute the nullifier for a given
// exchange account and learn which wallet it backs — the exact linkage the
// scheme exists to prevent.
var (
	nullifierSecretOnce sync.Once
	nullifierSecret     []byte
	nullifierSecretErr  error
)

func enclaveNullifierSecret() ([]byte, error) {
	nullifierSecretOnce.Do(func() {
		nullifierSecret, nullifierSecretErr = randomBytes(32)
	})
	return nullifierSecret, nullifierSecretErr
}

// Nullifier derives a stable, unlinkable identifier for an exchange account.
//
//	HMAC-SHA256(enclaveSecret, exchange ‖ 0x00 ‖ accountID)
//
// Two properties matter, and they pull in opposite directions:
//
//   - Stable: the same exchange account always yields the same nullifier, so
//     SolvencyRegistry can refuse to let one account back ten wallets.
//   - Unlinkable: it cannot be inverted or brute-forced back to the account,
//     because the HMAC key is enclave-private. Without the secret this would
//     be a plain hash of a low-entropy identifier — trivially reversible by
//     dictionary attack, which would put account IDs on a public chain.
//
// The separator byte stops ("krak", "en123") and ("kraken", "123") colliding.
//
// accountID is credential-derived. It is never logged and never returned.
func Nullifier(exchange, accountID string) ([32]byte, error) {
	secret, err := enclaveNullifierSecret()
	if err != nil {
		return [32]byte{}, fmt.Errorf("deriving nullifier secret: %w", err)
	}

	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(exchange))
	mac.Write([]byte{0x00})
	mac.Write([]byte(accountID))

	var out [32]byte
	copy(out[:], mac.Sum(nil))
	return out, nil
}
