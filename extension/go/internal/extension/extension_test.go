package extension

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"extension-scaffold/internal/config"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
)

// toHash derives a routing value the same way the Solidity side does.
func toHash(s string) common.Hash { return opHash(s) }

// buildTestAction constructs a teetypes.Action whose Data.Message is the
// JSON-encoded DataFixed payload. This is what processAction expects to parse.
func buildTestAction(opType, opCommand common.Hash, originalMessage []byte) teetypes.Action {
	// OriginalMessage is hexutil.Bytes on the wire, so it must be 0x-prefixed
	// hex rather than the base64 encoding/json gives a plain []byte.
	type dataFixed struct {
		OPType          common.Hash   `json:"opType"`
		OPCommand       common.Hash   `json:"opCommand"`
		OriginalMessage hexutil.Bytes `json:"originalMessage"`
	}
	msg, _ := json.Marshal(dataFixed{
		OPType:          opType,
		OPCommand:       opCommand,
		OriginalMessage: originalMessage,
	})
	return teetypes.Action{Data: teetypes.ActionData{Message: msg}}
}

// The routing pair is the contract with the Solidity side. If either string
// drifts from VaultProofConstants.sol, instructions vanish with no error —
// so the hashes are asserted directly rather than assumed.
func TestOPTypeMatchesSolidityConstants(t *testing.T) {
	// keccak256("VAULTPROOF"), as emitted by VaultProofConstants.OP_TYPE.
	const wantOPType = "0xd22f8145e23d8af1f59d0f309234550ffb3933f686bb03faf447d939df49d8b5"

	got := opHash(config.OPTypeVaultProof).Hex()
	if !strings.EqualFold(got, wantOPType) {
		t.Fatalf("OP_TYPE drifted from the contract:\n got %s\nwant %s", got, wantOPType)
	}
}

func TestUnsupportedOPTypeIsRejected(t *testing.T) {
	e := &Extension{}
	action := buildTestAction(toHash("GREETING"), toHash("SAY_HELLO"), []byte(`{}`))

	status, body := e.processAction(action)

	if status != http.StatusNotImplemented {
		t.Fatalf("status = %d, want %d", status, http.StatusNotImplemented)
	}
	if !strings.Contains(string(body), "unsupported op type") {
		t.Fatalf("body did not name the failure: %s", body)
	}
}

func TestUnsupportedOPCommandIsRejected(t *testing.T) {
	e := &Extension{}
	action := buildTestAction(
		toHash(config.OPTypeVaultProof),
		toHash("SOMETHING_ELSE"),
		[]byte(`{}`),
	)

	status, body := e.processAction(action)

	if status != http.StatusNotImplemented {
		t.Fatalf("status = %d, want %d", status, http.StatusNotImplemented)
	}
	if !strings.Contains(string(body), "unsupported op command") {
		t.Fatalf("body did not name the failure: %s", body)
	}
}

// A request whose hash was never anchored on-chain must be refused. This is
// the replay defence: the enclave only processes blobs it can tie back to a
// confirmed RequestSubmitted event.
func TestUnanchoredRequestIsRefused(t *testing.T) {
	e := &Extension{}
	msg, _ := json.Marshal(map[string]string{
		"wallet":      "0xEa0de9C49d2E935a2c3757F82a42f1e00ab2730e",
		"requestHash": "0xdeadbeef",
		"nonce":       "0x01",
	})
	action := buildTestAction(
		toHash(config.OPTypeVaultProof),
		toHash(config.OPCommandAttestSolvency),
		msg,
	)

	_, body := e.processAction(action)

	var ar teetypes.ActionResult
	if err := json.Unmarshal(body, &ar); err != nil {
		t.Fatalf("result was not an ActionResult: %s", body)
	}
	if ar.Status != 0 {
		t.Fatalf("status = %d, want 0 (error) for an unanchored request", ar.Status)
	}
	if !strings.Contains(ar.Log, "no sealed blob is pending") {
		t.Fatalf("log did not explain the refusal: %s", ar.Log)
	}
}

// A blob is single-use: reading it removes it, so the same ciphertext cannot
// be processed twice.
func TestSealedBlobIsSingleUse(t *testing.T) {
	const hash = "0xABC123"
	StoreSealedBlob(hash, []byte("ciphertext"))

	if _, err := lookupSealedBlob(hash); err != nil {
		t.Fatalf("first lookup failed: %v", err)
	}
	if _, err := lookupSealedBlob(hash); err == nil {
		t.Fatal("second lookup succeeded; the blob should have been consumed")
	}
}

// Lookup is case-insensitive on the hash, because callers disagree about
// whether hex is upper or lower.
func TestSealedBlobLookupIsCaseInsensitive(t *testing.T) {
	StoreSealedBlob("0xAaBb", []byte("ciphertext"))
	if _, err := lookupSealedBlob("0xaabb"); err != nil {
		t.Fatalf("case-insensitive lookup failed: %v", err)
	}
}

// A measurement must always be resolvable — an enclave with no identity
// cannot be checked against the on-chain whitelist.
func TestMeasurementAlwaysResolves(t *testing.T) {
	m := resolveMeasurement()
	if !strings.HasPrefix(m, "0x") || len(m) < 10 {
		t.Fatalf("measurement is not a usable hash: %q", m)
	}
}
