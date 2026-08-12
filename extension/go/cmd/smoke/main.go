// Boots the VaultProof extension and drives it over HTTP the way the browser
// would: fetch the quote, seal a credential to the key inside it, deliver the
// ciphertext, then fire the ATTEST_SOLVENCY instruction.
package main

import (
	"bytes"
	cryptorand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"extension-scaffold/internal/extension"

	"github.com/cloudflare/circl/hpke"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
)

const base = "http://127.0.0.1:8111"

func main() {
	e := extension.New(8111, 9111)
	go func() { _ = e.Server.ListenAndServe() }()
	defer func() { _ = e.Server.Close() }()

	waitReady()

	// --- 1. quote -------------------------------------------------------
	var quote struct {
		Measurement   string `json:"measurement"`
		EnclavePubKey string `json:"enclavePubKey"`
		Mode          int    `json:"mode"`
	}
	getJSON("/quote", &quote)
	fmt.Printf("1. quote        measurement=%s… mode=%d\n", quote.Measurement[:14], quote.Mode)
	if quote.EnclavePubKey == "" {
		fail("quote carried no enclave public key")
	}
	fmt.Printf("   enclave key  %s…\n", quote.EnclavePubKey[:20])

	// --- 2. seal, exactly as the browser does ----------------------------
	pubRaw, _ := hex.DecodeString(quote.EnclavePubKey[2:])
	info := []byte(fmt.Sprintf("vaultproof/v1|%s|%d", quote.Measurement, 114))
	credential := []byte(`{"exchange":"kraken","apiKey":"TEST-KEY","apiSecret":"c2VjcmV0"}`)

	blob := seal(pubRaw, credential, info)
	requestHash := crypto.Keccak256Hash(blob).Hex()
	fmt.Printf("2. sealed       %d bytes, requestHash=%s…\n", len(blob), requestHash[:14])

	// --- 3. deliver the ciphertext out of band ---------------------------
	var sealedResp struct {
		RequestID string `json:"requestId"`
		Accepted  bool   `json:"accepted"`
	}
	postJSON("/sealed", map[string]string{
		"requestHash": requestHash,
		"blob":        "0x" + hex.EncodeToString(blob),
	}, &sealedResp)
	if !sealedResp.Accepted {
		fail("enclave refused the ciphertext")
	}
	fmt.Printf("3. delivered    accepted=%v\n", sealedResp.Accepted)

	// --- 4. fire ATTEST_SOLVENCY -----------------------------------------
	msg, _ := json.Marshal(map[string]string{
		"wallet":      "0xEa0de9C49d2E935a2c3757F82a42f1e00ab2730e",
		"requestHash": requestHash,
		"nonce":       "0x01",
	})
	action := buildAction(
		crypto.Keccak256Hash([]byte("VAULTPROOF")),
		crypto.Keccak256Hash([]byte("ATTEST_SOLVENCY")),
		msg,
	)

	var result struct {
		Status uint8         `json:"status"`
		Log    string        `json:"log"`
		Data   hexutil.Bytes `json:"data"`
	}
	postJSON("/action", action, &result)
	fmt.Printf("4. attest       status=%d log=%q\n", result.Status, result.Log)

	// The credential is fake, so Kraken rejects it — which is the correct
	// outcome and proves unseal succeeded and the exchange call really ran.
	switch {
	case result.Status == 1:
		fmt.Println("\nRESULT: full attestation issued")
	case bytes.Contains([]byte(result.Log), []byte("query:")):
		fmt.Println("\nRESULT: unseal OK — HPKE roundtrip through the live server worked.")
		fmt.Println("        Failed at the exchange step, as expected for a fake key.")
	case bytes.Contains([]byte(result.Log), []byte("unseal:")):
		fail("unseal failed — the Go and browser HPKE suites disagree")
	default:
		fail("unexpected: " + result.Log)
	}

	// --- 5. the blob must be single-use ----------------------------------
	postJSON("/action", action, &result)
	if !bytes.Contains([]byte(result.Log), []byte("no sealed blob is pending")) {
		fail("replay was not refused: " + result.Log)
	}
	fmt.Println("5. replay       refused — blob was consumed on first use")
}

func seal(pubRaw, plaintext, info []byte) []byte {
	suite := hpke.NewSuite(
		hpke.KEM_X25519_HKDF_SHA256, hpke.KDF_HKDF_SHA256, hpke.AEAD_ChaCha20Poly1305,
	)
	pub, err := hpke.KEM_X25519_HKDF_SHA256.Scheme().UnmarshalBinaryPublicKey(pubRaw)
	check(err, "parsing enclave key")

	sender, err := suite.NewSender(pub, info)
	check(err, "sender")
	enc, sealer, err := sender.Setup(cryptoRand{})
	check(err, "setup")
	ct, err := sealer.Seal(plaintext, nil)
	check(err, "seal")
	return append(enc, ct...)
}

func buildAction(opType, opCommand common.Hash, message []byte) map[string]any {
	df, _ := json.Marshal(struct {
		OPType          common.Hash   `json:"opType"`
		OPCommand       common.Hash   `json:"opCommand"`
		OriginalMessage hexutil.Bytes `json:"originalMessage"`
	}{opType, opCommand, message})
	return map[string]any{"data": map[string]any{"message": hexutil.Bytes(df)}}
}

type cryptoRand struct{}

func (cryptoRand) Read(p []byte) (int, error) { return cryptorand.Read(p) }

func waitReady() {
	for i := 0; i < 50; i++ {
		if _, err := http.Get(base + "/state"); err == nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	fail("server never came up")
}

func getJSON(path string, out any) {
	resp, err := http.Get(base + path)
	check(err, "GET "+path)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	check(json.Unmarshal(body, out), "decode "+path+": "+string(body))
}

func postJSON(path string, in, out any) {
	b, _ := json.Marshal(in)
	resp, err := http.Post(base+path, "application/json", bytes.NewReader(b))
	check(err, "POST "+path)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	check(json.Unmarshal(body, out), "decode "+path+": "+string(body))
}

func check(err error, what string) {
	if err != nil {
		fail(what + ": " + err.Error())
	}
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "FAIL: "+msg)
	os.Exit(1)
}
