package extension

import (
	"context"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"sync"

	"extension-scaffold/internal/config"
	"extension-scaffold/internal/vaultproof"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

// opHash derives an OPType / OPCommand routing value.
//
// This is keccak256 of the string, NOT teeutils.ToHash — which right-pads into
// a bytes32 the way Solidity's bytes32("GREETING") literal does. The scaffold's
// HelloWorld contract uses the literal form; VaultProofConstants.sol uses
// keccak256, and the deployed VaultProofInstructionSender reports
// 0xd22f8145… for OP_TYPE. The frontend derives it the same way.
//
// Getting this wrong is the failure the spec warns about: the TEE simply never
// matches the instruction, and the request vanishes with no error anywhere.
func opHash(s string) common.Hash {
	return crypto.Keccak256Hash([]byte(s))
}

// normaliseDigest turns an image digest into the 0x-prefixed 32-byte hash the
// registry and the browser both expect. Confidential Space reports it as
// "sha256:abcd…"; the chain stores bare bytes32.
func normaliseDigest(digest string) string {
	d := strings.TrimPrefix(digest, "sha256:")
	if !strings.HasPrefix(d, "0x") {
		d = "0x" + d
	}
	return strings.ToLower(d)
}

// resolveMeasurement returns the identity of the running code.
//
// On real Confidential Space the platform supplies the image digest via the
// environment; the reproducible build is what lets anyone else derive the same
// value and check it against the on-chain whitelist. In simulated mode we fall
// back to hashing the build tag, and quoteHandler reports mode 1 so the
// browser marks the run as simulated rather than being told a hardware story
// that is not true.
func resolveMeasurement() string {
	for _, key := range []string{"TEE_MEASUREMENT", "IMAGE_DIGEST", "CODE_HASH"} {
		if v := os.Getenv(key); v != "" {
			if strings.HasPrefix(v, "0x") {
				return v
			}
			return "0x" + strings.TrimPrefix(v, "sha256:")
		}
	}
	return teeutils.ToHash(config.Version).Hex()
}

// lazyPrices defers dialling the chain until the first attestation.
//
// A chain that is briefly unreachable at boot should not stop the extension
// serving /quote — the browser needs the quote before it seals anything, and
// that path touches no chain.
type lazyPrices struct {
	rpcURL string

	once sync.Once
	feed *vaultproof.PriceFeed
	err  error
}

func newLazyPrices(rpcURL string) *lazyPrices {
	return &lazyPrices{rpcURL: rpcURL}
}

func (l *lazyPrices) ValueUSD(ctx context.Context, balances vaultproof.Balances) (float64, error) {
	l.once.Do(func() {
		l.feed, l.err = vaultproof.NewPriceFeed(ctx, l.rpcURL)
	})
	if l.err != nil {
		return 0, l.err
	}
	return l.feed.ValueUSD(ctx, balances)
}

// sealedBlobs holds ciphertexts delivered out of band, keyed by the request
// hash the browser anchored on-chain.
//
// The blob is deleted as soon as it is read: a ciphertext that lingers is a
// ciphertext that can be replayed, and single-use is enforced here rather than
// trusted to the caller.
var sealedBlobs sync.Map // requestHash -> []byte

// StoreSealedBlob is called by the delivery endpoint when a ciphertext arrives.
func StoreSealedBlob(requestHash string, blob []byte) {
	sealedBlobs.Store(strings.ToLower(requestHash), blob)
}

func lookupSealedBlob(requestHash string) ([]byte, error) {
	if requestHash == "" {
		return nil, errors.New("request hash was empty")
	}
	key := strings.ToLower(requestHash)

	v, ok := sealedBlobs.LoadAndDelete(key)
	if !ok {
		// Either the hash was never anchored, or this blob has already been
		// processed. Both are refusals, and both look identical from outside.
		return nil, errors.New("no sealed blob is pending for this request hash")
	}

	blob, ok := v.([]byte)
	if !ok || len(blob) == 0 {
		return nil, errors.New("stored blob was empty")
	}
	return blob, nil
}

// decodeHexBlob accepts the 0x-prefixed hex the browser posts.
func decodeHexBlob(s string) ([]byte, error) {
	return hex.DecodeString(strings.TrimPrefix(s, "0x"))
}
