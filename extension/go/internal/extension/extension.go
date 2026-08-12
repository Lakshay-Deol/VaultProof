package extension

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"extension-scaffold/internal/config"
	"extension-scaffold/internal/vaultproof"
	"extension-scaffold/pkg/types"

	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"

	"github.com/flare-foundation/tee-node/pkg/processorutils"
)

type Extension struct {
	mu     sync.RWMutex
	Server *http.Server

	// Observable state. Counters only — anything per-user here would leak
	// exactly what the enclave exists to protect.
	attestationCount int
	lastTier         uint8

	// Generated at boot, inside the enclave. The private half never leaves
	// this process; the public half goes into the attestation quote.
	keys *vaultproof.EnclaveKeyPair

	// measurement identifies the running image. In a real Confidential Space
	// deployment this comes from the platform; in simulated mode it is the
	// build's own tag hash, and the quote reports mode 1 so the browser can
	// tell the difference rather than being lied to.
	measurement string

	prices vaultproof.Prices
}

// --- DO NOT MODIFY: New(), actionHandler() are boilerplate.
func New(extensionPort, signPort int) *Extension {
	e := &Extension{}

	keys, err := vaultproof.NewEnclaveKeyPair()
	if err != nil {
		// A VaultProof enclave with no keypair cannot do anything safely, and
		// starting anyway would mean serving a quote with no key in it.
		panic(fmt.Sprintf("generating enclave keypair: %v", err))
	}
	e.keys = keys
	e.measurement = resolveMeasurement()

	// FTSO pricing is resolved lazily: a chain that is briefly unreachable at
	// boot should not stop the extension from starting and serving /quote.
	e.prices = newLazyPrices(config.ChainURL)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /state", e.stateHandler)
	mux.HandleFunc("GET /quote", e.quoteHandler)
	mux.HandleFunc("POST /sealed", e.sealedHandler)
	mux.HandleFunc("POST /action", e.actionHandler)

	e.Server = &http.Server{Addr: fmt.Sprintf(":%d", extensionPort), Handler: mux}
	return e
}

// stateHandler() structure is boilerplate but update the State field mapping to match your Extension fields.
func (e *Extension) stateHandler(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	stateResponse := types.StateResponse{
		StateVersion: teeutils.ToHash(config.Version),
		State: types.State{
			AttestationCount: e.attestationCount,
			LastTier:         e.lastTier,
			Measurement:      e.measurement,
			EnclavePubKey:    "0x" + hex.EncodeToString(e.keys.PublicKey()),
		},
	}
	e.mu.RUnlock()

	err := json.NewEncoder(w).Encode(stateResponse)
	if err != nil {
		http.Error(w, fmt.Sprintf("sending response: %v", err), http.StatusInternalServerError)
		return
	}
}

// quoteHandler serves the attestation quote the browser verifies before it
// seals anything.
//
// The enclave public key is inside the quote payload, not served beside it.
// That is what stops a relay swapping in its own key: the browser checks the
// key it is about to encrypt to against the one in the signed statement.
func (e *Extension) quoteHandler(w http.ResponseWriter, r *http.Request) {
	pubKey := "0x" + hex.EncodeToString(e.keys.PublicKey())

	// Ask the Confidential Space launcher for a hardware-signed token, binding
	// this enclave's public key as the nonce. A fresh token per request means
	// the browser is checking the key it is about to encrypt to, right now,
	// rather than a quote minted at boot and replayed for hours.
	quote, mode, measurement := "", 1, e.measurement

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	token, err := vaultproof.FetchAttestationToken(ctx, pubKey)
	switch {
	case err == nil:
		// Real hardware. The measurement is the image digest the launcher
		// signed, never a value this container chose for itself.
		claims, parseErr := vaultproof.ParseTokenClaims(token)
		if parseErr == nil && claims.Submods.Container.ImageDigest != "" {
			quote, mode = token, 0
			measurement = normaliseDigest(claims.Submods.Container.ImageDigest)
		} else {
			// A token we cannot read is a token we will not vouch for.
			mode = 1
		}

	case errors.Is(err, vaultproof.ErrNoAttestation):
		// Not on Confidential Space. Stay in simulated mode and say so — the
		// browser renders mode 1 as "simulated" and the whole point is that it
		// is never told a hardware story that is not true.

	default:
		// The socket exists but the launcher refused. Failing closed to
		// simulated is right: it is visible, and it does not overclaim.
		mode = 1
	}

	resp := map[string]any{
		"measurement":      measurement,
		"extensionVersion": config.Version,
		"enclavePubKey":    pubKey,
		"quote":            quote,
		"mode":             mode,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		http.Error(w, fmt.Sprintf("sending quote: %v", err), http.StatusInternalServerError)
	}
}

// sealedHandler accepts the ciphertext, which travels out of band rather than
// through calldata.
//
// Putting the blob on-chain would publish it permanently, so a future
// compromise of the enclave key would retroactively expose every credential
// ever submitted. Only its hash is anchored; this endpoint carries the bytes.
//
// The blob is opaque here — it is not decrypted until an ATTEST_SOLVENCY
// instruction arrives quoting a request hash, and nothing on this path logs.
func (e *Extension) sealedHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RequestHash string `json:"requestHash"`
		Blob        string `json:"blob"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		http.Error(w, "decoding sealed payload", http.StatusBadRequest)
		return
	}
	if req.RequestHash == "" {
		http.Error(w, "requestHash must not be empty", http.StatusBadRequest)
		return
	}

	blob, err := decodeHexBlob(req.Blob)
	if err != nil || len(blob) == 0 {
		http.Error(w, "blob must be non-empty 0x-prefixed hex", http.StatusBadRequest)
		return
	}

	StoreSealedBlob(req.RequestHash, blob)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"requestId": req.RequestHash,
		"accepted":  true,
	})
}

func (e *Extension) processAction(action teetypes.Action) (int, []byte) {
	dataFixed, err := processorutils.Parse[instruction.DataFixed](action.Data.Message)
	if err != nil {
		return http.StatusBadRequest, []byte(fmt.Sprintf("decoding fixed data: %v", err))
	}

	switch {
	case dataFixed.OPType == opHash(config.OPTypeVaultProof):
		return e.processVaultProof(action, dataFixed)

	default:
		return http.StatusNotImplemented, []byte(fmt.Sprintf(
			"unsupported op type: received %s, expected %s (%s)",
			dataFixed.OPType.Hex(), opHash(config.OPTypeVaultProof).Hex(), config.OPTypeVaultProof,
		))
	}
}

// processVaultProof routes VAULTPROOF instructions by OPCommand.
func (e *Extension) processVaultProof(action teetypes.Action, df *instruction.DataFixed) (int, []byte) {
	switch {
	case df.OPCommand == opHash(config.OPCommandAttestSolvency):
		ar := e.processAttestSolvency(action, df)
		b, _ := json.Marshal(ar)
		return http.StatusOK, b

	default:
		return http.StatusNotImplemented, []byte(fmt.Sprintf(
			"unsupported op command: received %s, expected %s (%s)",
			df.OPCommand.Hex(),
			opHash(config.OPCommandAttestSolvency).Hex(), config.OPCommandAttestSolvency,
		))
	}
}

// processAttestSolvency handles ATTEST_SOLVENCY: unseal, query, price, reduce,
// sign, wipe.
//
// No logging anywhere in this path, and no error returned from it carries a
// credential-derived value — the result is published in an ActionResult.
func (e *Extension) processAttestSolvency(action teetypes.Action, df *instruction.DataFixed) teetypes.ActionResult {
	var req types.AttestSolvencyRequest
	if err := json.Unmarshal(df.OriginalMessage, &req); err != nil {
		return buildResult(action, df, nil, 0, fmt.Errorf("decoding request: %w", err))
	}
	if req.Wallet == "" {
		return buildResult(action, df, nil, 0, fmt.Errorf("wallet must not be empty"))
	}

	// The sealed ciphertext arrives out of band, keyed by the request hash the
	// browser anchored on-chain. A blob whose hash was never anchored is
	// refused — that ordering is the replay defence (spec §5).
	blob, err := lookupSealedBlob(req.RequestHash)
	if err != nil {
		return buildResult(action, df, nil, 0, fmt.Errorf("resolving sealed blob: %w", err))
	}
	defer vaultproof.Zeroize(blob)

	ctx, cancel := context.WithTimeout(context.Background(), config.ExchangeTimeout)
	defer cancel()

	info := vaultproof.SealInfo(e.measurement, config.ChainID)

	att, err := vaultproof.AttestSolvency(ctx, e.keys, e.prices, blob, info)
	if err != nil {
		return buildResult(action, df, nil, 0, err)
	}

	e.mu.Lock()
	e.attestationCount++
	e.lastTier = att.Tier
	e.mu.Unlock()

	resp := types.AttestSolvencyResponse{
		Wallet:          req.Wallet,
		Tier:            att.Tier,
		ValidForSeconds: config.AttestationValiditySeconds,
		Nullifier:       "0x" + hex.EncodeToString(att.Nullifier[:]),
		Nonce:           req.Nonce,
		Measurement:     e.measurement,
	}
	data, _ := json.Marshal(resp)

	return buildResult(action, df, data, 1, nil)
}
