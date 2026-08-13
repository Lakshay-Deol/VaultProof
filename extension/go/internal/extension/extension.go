package extension

import (
	"context"
	"encoding/base64"
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

	// measurement identifies the running image, and is guarded by mu because
	// the launcher is the authority on it and may only answer after boot.
	//
	// On Confidential Space this is the image digest the launcher signed —
	// never a value this container chose for itself. Off it, it falls back to
	// the build's own tag hash and the quote reports mode 1, so the browser can
	// tell the difference rather than being lied to.
	//
	// It MUST be the same string the browser saw in the quote: both sides put
	// it in the HPKE info (vaultproof.SealInfo), so a drift of one character
	// means every unseal fails with no useful error.
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

	// Ask the launcher who we are, before serving anything. On Confidential
	// Space the socket exists from container start, so this normally settles
	// the measurement once and for all; if it does not, quoteHandler adopts it
	// on the first successful token instead.
	e.adoptLauncherMeasurement(context.Background())

	// FTSO pricing is resolved lazily: a chain that is briefly unreachable at
	// boot should not stop the extension from starting and serving /quote.
	e.prices = newLazyPrices(config.ChainURL)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /state", e.stateHandler)
	mux.HandleFunc("GET /quote", e.quoteHandler)
	mux.HandleFunc("POST /sealed", e.sealedHandler)
	mux.HandleFunc("POST /action", e.actionHandler)

	// The browser talks to /quote and /sealed directly from the user's tab, so
	// the mux is wrapped rather than each handler setting its own headers.
	e.Server = &http.Server{Addr: fmt.Sprintf(":%d", extensionPort), Handler: withCORS(mux)}
	return e
}

// currentMeasurement returns the identity of the running code.
func (e *Extension) currentMeasurement() string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.measurement
}

// adoptLauncherMeasurement replaces the measurement with the one the
// Confidential Space launcher signed.
//
// This is the value the browser binds its HPKE seal to, because it is the value
// the browser saw in the quote. Keeping the boot-time fallback here instead
// would mean the two sides derive different `info` strings and every unseal
// fails — the same shape of silent mismatch that the OPType keccak bug had.
func (e *Extension) adoptLauncherMeasurement(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	token, err := vaultproof.FetchAttestationToken(ctx, "0x"+hex.EncodeToString(e.keys.PublicKey()))
	if err != nil {
		return // Not on Confidential Space, or the launcher refused.
	}
	claims, err := vaultproof.ParseTokenClaims(token)
	if err != nil || claims.Submods.Container.ImageDigest == "" {
		return
	}

	digest := normaliseDigest(claims.Submods.Container.ImageDigest)

	e.mu.Lock()
	e.measurement = digest
	e.mu.Unlock()
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
	quote, mode, measurement := "", 1, e.currentMeasurement()

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

			// Serve and unseal under the same identity. The browser is about
			// to bind its HPKE info to this exact string.
			e.mu.Lock()
			e.measurement = measurement
			e.mu.Unlock()
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

	// Simulated mode still has to serve a structurally real token. The check
	// that actually protects the user is that the key they are about to
	// encrypt to appears INSIDE the quote — that is what a substituted relay
	// key fails. Serving an empty quote here would leave the browser nothing
	// to bind against, so the only way to keep the pipeline moving would be to
	// skip the binding check, which is the one check worth having.
	//
	// The token is marked alg:none and issued by "vaultproof-simulated", so it
	// cannot be mistaken for a Google-signed one; the browser only verifies a
	// signature when mode is 0, and would reject alg:none if it tried.
	if mode == 1 {
		quote = simulatedQuote(measurement, pubKey)
	}

	resp := map[string]any{
		"measurement":      measurement,
		"extensionVersion": config.Version,
		"enclavePubKey":    pubKey,
		"quote":            quote,
		"mode":             mode,
	}

	// A run against a stub exchange must not be indistinguishable from a real
	// one. It can only happen in simulated mode — CheckExchangeOverride
	// refuses it on hardware — but "simulated" alone does not tell the user
	// the holdings were read from somewhere other than the exchange, so the
	// endpoint is named here rather than left to be inferred.
	if config.ExchangeBaseURLOverridden() {
		resp["exchangeBaseURL"] = config.ExchangeBaseURLOverride
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

	// Must be the same measurement the browser read out of the quote — it is
	// half of the HPKE info string on both sides.
	measurement := e.currentMeasurement()
	info := vaultproof.SealInfo(measurement, config.ChainID)

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
		Measurement:     measurement,
	}
	data, _ := json.Marshal(resp)

	return buildResult(action, df, data, 1, nil)
}

// simulatedQuote builds the attestation token served when there is no
// Confidential Space launcher to sign one.
//
// It is deliberately NOT a forgery of a Google token. `alg` is "none" and the
// issuer names the simulation, so it cannot be mistaken for a hardware
// attestation by anything that looks at it — and the browser's verifier, which
// rejects alg:none, would refuse it outright if it were ever presented as
// mode 0. What it does carry is the binding that matters: the measurement and
// the enclave's X25519 public key, inside the payload, so a relay that swaps
// in its own key still fails the browser's check (b) exactly as it would on
// real hardware.
//
// Field names mirror the Confidential Space token so the browser reads both
// with one code path.
func simulatedQuote(measurement, pubKey string) string {
	header := map[string]any{"alg": "none", "typ": "JWT"}
	payload := map[string]any{
		"iss":     "vaultproof-simulated",
		"hwmodel": "SIMULATED",
		"swname":  "SIMULATED_TEE",
		"submods": map[string]any{
			"container": map[string]any{"image_digest": measurement},
		},
		"eat_nonce": pubKey,
	}

	// JWT segments are unpadded base64url. The signature segment is a literal
	// marker rather than a signature: there is no key to sign with, and
	// inventing one would be the dishonest version of this function.
	return segment(header) + "." + segment(payload) + "." +
		base64.RawURLEncoding.EncodeToString([]byte("simulated"))
}

func segment(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		// Both inputs are string maps built here; this cannot fail in practice.
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}
