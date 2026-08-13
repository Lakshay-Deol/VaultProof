// Package config contains configuration values and defaults used by the extension.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	Version = "vaultproof-v0.4.0"

	// OPType / OPCommand routing pair.
	//
	// These MUST match contracts/src/vaultproof/VaultProofConstants.sol byte
	// for byte. Both sides hash the same string with keccak256, so the strings
	// are the contract — a silent mismatch produces instructions that vanish
	// with no error. Change both sides together.
	OPTypeVaultProof        = "VAULTPROOF"
	OPCommandAttestSolvency = "ATTEST_SOLVENCY"

	// How long an issued attestation stays valid. Mirrors
	// VaultProofConstants.ATTESTATION_VALIDITY; freshness is re-checked at
	// drawdown by SolvencyRegistry.tierOf, which enforces expiry on read.
	AttestationValiditySeconds = 86400

	// Ceiling on how long the enclave will spend talking to an exchange. A
	// hung upstream must not pin a credential in enclave memory indefinitely.
	ExchangeTimeout = 20 * time.Second

	TimeoutShutdown = 5 * time.Second

	// The only endpoints a production enclave will ever talk to. Constants, so
	// that an operator-supplied override is detectable by comparison.
	DefaultKrakenBaseURL  = "https://api.kraken.com"
	DefaultBinanceBaseURL = "https://api.binance.com"
)

// Defaults.
var (
	ExtensionPort = 8080
	SignPort      = 9090

	// ChainURL is used for FTSO reads. The enclave prices holdings itself
	// rather than trusting the exchange's own USD valuation.
	ChainURL = "https://coston2-api.flare.network/ext/C/rpc"

	// ChainID binds sealed blobs to a network. It appears in the HPKE info
	// string, so a blob sealed for Coston2 cannot be opened by an enclave
	// running against a different chain.
	ChainID int64 = 114

	// ExchangeBaseURLOverride, when non-empty, replaces the API root of
	// whichever exchange is queried.
	//
	// It exists for exactly one reason: a run that cannot reach a real
	// exchange — no account in the operator's jurisdiction, or an offline
	// demo — needs a stub to stand in, or the FCC pipeline cannot be
	// exercised end to end at all.
	//
	// That is also an attack: an operator who can choose the endpoint can
	// point the enclave at a server reporting whatever balance mints the top
	// tier. So the override is refused on real hardware, and refused at the
	// point of use rather than only at startup — see
	// vaultproof.CheckExchangeOverride.
	ExchangeBaseURLOverride = ""
)

// ExchangeBaseURLOverridden reports whether an operator supplied an endpoint
// in place of the canonical ones.
func ExchangeBaseURLOverridden() bool {
	return ExchangeBaseURLOverride != ""
}

// ExchangeBaseURL returns the API root for a named exchange.
//
// An empty return means the exchange is not one this enclave knows how to
// talk to; callers treat that as a refusal rather than a default.
func ExchangeBaseURL(exchange string) string {
	if ExchangeBaseURLOverride != "" {
		return ExchangeBaseURLOverride
	}
	switch exchange {
	case "kraken":
		return DefaultKrakenBaseURL
	case "binance":
		return DefaultBinanceBaseURL
	default:
		return ""
	}
}

// Environment variables override defaults.
func init() {
	if v, err := strconv.Atoi(os.Getenv("EXTENSION_PORT")); err == nil && v != 0 {
		ExtensionPort = v
	}
	if v, err := strconv.Atoi(os.Getenv("SIGN_PORT")); err == nil && v != 0 {
		SignPort = v
	}
	if v := os.Getenv("CHAIN_URL"); v != "" {
		ChainURL = v
	}
	if v, err := strconv.ParseInt(os.Getenv("CHAIN_ID"), 10, 64); err == nil && v != 0 {
		ChainID = v
	}
	// Trailing slashes are trimmed because the endpoint path is concatenated
	// directly and Kraken's signature covers the path — "//0/private/Balance"
	// would sign one string and request another.
	if v := os.Getenv("VAULTPROOF_EXCHANGE_BASE_URL"); v != "" {
		ExchangeBaseURLOverride = strings.TrimRight(v, "/")
	}
}
