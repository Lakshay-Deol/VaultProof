// Package types contains types that could be useful to other apps when interacting with this extension.
package types

import (
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// AttestSolvencyRequest is the instruction payload sent via the Solidity
// contract. It carries no credential — only the hash of the sealed blob that
// the browser anchored on-chain, plus the wallet the attestation binds to.
//
// The ciphertext itself arrives out of band via the extension proxy, and the
// enclave refuses any blob whose hash does not match a request it has seen
// anchored. That ordering is the replay defence (spec §5, steps 5–7).
type AttestSolvencyRequest struct {
	Wallet      string `json:"wallet"`
	RequestHash string `json:"requestHash"`
	Nonce       string `json:"nonce"`
}

// AttestSolvencyResponse is the JSON payload returned in ActionResult.Data.
//
// Every field here is safe to publish. There is deliberately no field for a
// balance, an account identifier, an exchange name, or anything derived from
// the credential — if one were added, the product claim would be gone.
type AttestSolvencyResponse struct {
	Wallet          string `json:"wallet"`
	Tier            uint8  `json:"tier"`
	ValidForSeconds uint64 `json:"validForSeconds"`
	Nullifier       string `json:"nullifier"`
	Nonce           string `json:"nonce"`
	Measurement     string `json:"measurement"`
}

// SealedCredential is the plaintext inside the HPKE blob. It exists only
// inside enclave memory, is never logged, never serialised back out, and is
// zeroized by the caller in a defer.
type SealedCredential struct {
	Exchange  string `json:"exchange"`
	APIKey    string `json:"apiKey"`
	APISecret string `json:"apiSecret"`
}

// AttestSolvencyMessageArg describes the ABI layout of the instruction payload
// emitted by VaultProofInstructionSender.
var AttestSolvencyMessageArg abi.Argument

func init() {
	tupleTy, _ := abi.NewType("tuple", "", []abi.ArgumentMarshaling{
		{Name: "wallet", Type: "address"},
		{Name: "requestHash", Type: "bytes32"},
		{Name: "nonce", Type: "bytes32"},
	})
	AttestSolvencyMessageArg = abi.Argument{Type: tupleTy}
}

// State holds the extension's observable state, returned by GET /state.
//
// Counters only. A state endpoint that exposed anything per-user would leak
// exactly what the enclave exists to protect.
type State struct {
	AttestationCount int    `json:"attestationCount"`
	LastTier         uint8  `json:"lastTier"`
	Measurement      string `json:"measurement"`
	EnclavePubKey    string `json:"enclavePubKey"`
}

// --- DO NOT MODIFY below this line. ---

// StateResponse is the envelope returned by GET /state.
type StateResponse struct {
	StateVersion common.Hash `json:"stateVersion"`
	State        State       `json:"state"`
}
