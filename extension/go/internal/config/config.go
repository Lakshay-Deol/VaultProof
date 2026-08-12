// Package config contains configuration values and defaults used by the extension.
package config

import (
	"os"
	"strconv"
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
)

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
}
