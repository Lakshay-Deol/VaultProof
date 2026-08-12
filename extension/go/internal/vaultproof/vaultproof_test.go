package vaultproof

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/cloudflare/circl/hpke"
)

// sealFor mirrors what the browser does in web/lib/crypto/hpke.ts: seal to the
// enclave's public key and concatenate enc ‖ ciphertext.
func sealFor(t *testing.T, pubRaw, plaintext, info []byte) []byte {
	t.Helper()

	pub, err := kemID.Scheme().UnmarshalBinaryPublicKey(pubRaw)
	if err != nil {
		t.Fatalf("parsing enclave public key: %v", err)
	}

	sender, err := suite.NewSender(pub, info)
	if err != nil {
		t.Fatalf("creating sender: %v", err)
	}
	enc, sealer, err := sender.Setup(cryptoRandReader{})
	if err != nil {
		t.Fatalf("sender setup: %v", err)
	}
	ct, err := sealer.Seal(plaintext, nil)
	if err != nil {
		t.Fatalf("sealing: %v", err)
	}
	return append(enc, ct...)
}

type cryptoRandReader struct{}

func (cryptoRandReader) Read(p []byte) (int, error) {
	b, err := randomBytes(len(p))
	if err != nil {
		return 0, err
	}
	return copy(p, b), nil
}

func TestHPKERoundtrip(t *testing.T) {
	keys, err := NewEnclaveKeyPair()
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}

	info := SealInfo("0xabc", 114)
	want := []byte(`{"exchange":"kraken","apiKey":"k","apiSecret":"cw=="}`)

	blob := sealFor(t, keys.PublicKey(), want, info)

	got, err := keys.Open(blob, info)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("roundtrip mismatch:\n got %s\nwant %s", got, want)
	}
}

// The measurement is inside the HPKE info string, so a blob sealed for one
// enclave build must not open under another. This is what stops a downgrade
// to a compromised image.
func TestBlobSealedForAnotherBuildDoesNotOpen(t *testing.T) {
	keys, _ := NewEnclaveKeyPair()

	blob := sealFor(t, keys.PublicKey(), []byte("secret"), SealInfo("0xBUILD_A", 114))

	if _, err := keys.Open(blob, SealInfo("0xBUILD_B", 114)); err == nil {
		t.Fatal("a blob sealed for build A opened under build B")
	}
}

// Binding the chain id means a blob sealed for Coston2 cannot be replayed
// against an enclave running on a different network.
func TestBlobSealedForAnotherChainDoesNotOpen(t *testing.T) {
	keys, _ := NewEnclaveKeyPair()

	blob := sealFor(t, keys.PublicKey(), []byte("secret"), SealInfo("0xabc", 114))

	if _, err := keys.Open(blob, SealInfo("0xabc", 16)); err == nil {
		t.Fatal("a blob sealed for chain 114 opened under chain 16")
	}
}

func TestTamperedCiphertextFailsAuthentication(t *testing.T) {
	keys, _ := NewEnclaveKeyPair()
	info := SealInfo("0xabc", 114)

	blob := sealFor(t, keys.PublicKey(), []byte("secret"), info)
	blob[len(blob)-1] ^= 0xFF // flip a bit in the AEAD tag

	if _, err := keys.Open(blob, info); err == nil {
		t.Fatal("a tampered blob opened; AEAD authentication is not being checked")
	}
}

func TestShortBlobIsRejected(t *testing.T) {
	keys, _ := NewEnclaveKeyPair()
	if _, err := keys.Open([]byte("tooshort"), SealInfo("0xabc", 114)); err == nil {
		t.Fatal("a blob shorter than the encapsulated key was accepted")
	}
}

// The suite must match the browser's exactly, or nothing it seals ever opens.
func TestSuiteMatchesBrowser(t *testing.T) {
	kem, kdf, aead := suite.Params()
	if kem != hpke.KEM_X25519_HKDF_SHA256 {
		t.Errorf("KEM = %v, want X25519_HKDF_SHA256", kem)
	}
	if kdf != hpke.KDF_HKDF_SHA256 {
		t.Errorf("KDF = %v, want HKDF_SHA256", kdf)
	}
	if aead != hpke.AEAD_ChaCha20Poly1305 {
		t.Errorf("AEAD = %v, want ChaCha20Poly1305", aead)
	}
}

// The info string is a wire contract with web/lib/crypto/hpke.ts. If the
// format changes on one side only, every seal silently stops opening.
func TestSealInfoFormat(t *testing.T) {
	got := string(SealInfo("0xdead", 114))
	const want = "vaultproof/v1|0xdead|114"
	if got != want {
		t.Fatalf("info = %q, want %q", got, want)
	}
}

func TestTierBands(t *testing.T) {
	cases := []struct {
		usd  float64
		want uint8
	}{
		{0, 0}, {999.99, 0},
		{1_000, 1}, {9_999, 1},
		{10_000, 2}, {49_999, 2},
		{50_000, 3}, {249_999, 3},
		{250_000, 4}, {10_000_000, 4},
	}
	for _, c := range cases {
		if got := TierForUSD(c.usd); got != c.want {
			t.Errorf("TierForUSD(%v) = %d, want %d", c.usd, got, c.want)
		}
	}
}

// Stable: the same account always yields the same nullifier, so the registry
// can stop one exchange account backing several wallets.
func TestNullifierIsStable(t *testing.T) {
	a, err := Nullifier("kraken", "account-1")
	if err != nil {
		t.Fatalf("nullifier: %v", err)
	}
	b, _ := Nullifier("kraken", "account-1")
	if a != b {
		t.Fatal("the same account produced two different nullifiers")
	}
}

func TestNullifierSeparatesAccountsAndExchanges(t *testing.T) {
	a, _ := Nullifier("kraken", "account-1")
	b, _ := Nullifier("kraken", "account-2")
	if a == b {
		t.Fatal("two accounts collided")
	}

	// The separator byte must stop ("krak","en1") colliding with ("kraken","1").
	c, _ := Nullifier("krak", "en1")
	d, _ := Nullifier("kraken", "1")
	if c == d {
		t.Fatal("the domain separator is not working")
	}
}

// Credentials must land in wipeable buffers, and Zeroize must actually clear
// them — the defence depends on it.
func TestCredentialZeroize(t *testing.T) {
	var cred SealedCredentialBytes
	if err := json.Unmarshal(
		[]byte(`{"exchange":"kraken","apiKey":"KEY","apiSecret":"SECRET"}`), &cred,
	); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(cred.APIKey) != "KEY" || string(cred.APISecret) != "SECRET" {
		t.Fatal("credential did not decode into byte buffers")
	}

	cred.Zeroize()

	if !bytes.Equal(cred.APIKey, make([]byte, 3)) {
		t.Error("API key was not wiped")
	}
	if !bytes.Equal(cred.APISecret, make([]byte, 6)) {
		t.Error("API secret was not wiped")
	}
}

// An unnamed exchange must be refused: pointing the enclave at an arbitrary
// endpoint would let a user run their own "exchange" and mint any tier.
func TestUnknownExchangeIsRefused(t *testing.T) {
	keys, _ := NewEnclaveKeyPair()
	info := SealInfo("0xabc", 114)
	payload := []byte(`{"exchange":"my-own-server","apiKey":"k","apiSecret":"cw=="}`)
	blob := sealFor(t, keys.PublicKey(), payload, info)

	_, err := AttestSolvency(context.Background(), keys, stubPrices{}, blob, info)
	if err == nil || !strings.Contains(err.Error(), "unsupported exchange") {
		t.Fatalf("err = %v, want unsupported exchange", err)
	}
}

func TestMissingCredentialFieldsAreRefused(t *testing.T) {
	keys, _ := NewEnclaveKeyPair()
	info := SealInfo("0xabc", 114)
	blob := sealFor(t, keys.PublicKey(), []byte(`{"exchange":"kraken"}`), info)

	_, err := AttestSolvency(context.Background(), keys, stubPrices{}, blob, info)
	if err == nil || !strings.Contains(err.Error(), "missing credential fields") {
		t.Fatalf("err = %v, want missing credential fields", err)
	}
}

// Kraken's legacy tickers have to map onto FTSO feed symbols, or the holdings
// price at zero and every user reads as T0.
func TestAssetNormalisation(t *testing.T) {
	cases := map[string]string{
		"XXBT": "BTC", "XETH": "ETH", "ZUSD": "USD",
		"XXRP": "XRP", "USDC": "USDC",
	}
	for in, want := range cases {
		if got := normaliseAsset(in); got != want {
			t.Errorf("normaliseAsset(%q) = %q, want %q", in, got, want)
		}
	}
}

type stubPrices struct{}

func (stubPrices) ValueUSD(context.Context, Balances) (float64, error) { return 0, nil }
