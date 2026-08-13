// Command demo-bridge completes stages 5 and 6 of the VaultProof pipeline
// locally, for demonstrations.
//
// # WHAT IT REPLACES, AND WHAT IT DOES NOT
//
// The only step it stands in for is FCC *delivery*: the hop where an
// independent FTDC provider picks up a dispatched instruction and POSTs it to
// the extension proxy. That hop has never been observed working for this
// deployment — the instruction dispatches on-chain and the enclave never hears
// about it — and it is not something this repository can fix, because whether a
// provider attempted delivery lives in provider logs.
//
// Everything else is real:
//
//   - the browser sealed a real HPKE blob to the key inside the enclave's quote
//   - the request hash was anchored on-chain by a transaction the user signed
//   - THIS TOOL asks the real enclave to do the work, over the same /action
//     endpoint a provider would use, with the same opType/opCommand and the same
//     message schema the contract emits
//   - the enclave unseals, queries the exchange, prices via FTSO, reduces to a
//     tier and signs — none of that is simulated here
//   - the resulting tier is written on-chain through the real
//     VaultProofInstructionSender.deliverAttestation, and SolvencyRegistry
//     applies its own checks (measurement whitelist, nullifier, expiry)
//
// So a demo driven by this bridge shows the true pipeline with one hop shorted
// out, and the tier that lands on-chain was genuinely computed inside the
// enclave. Say that out loud when demoing; do not present it as FCC delivery
// working.
//
// Usage:
//
//	go run ./cmd/demo-bridge -wallet 0x… -request-hash 0x…
//
// The request hash is the one stage 4 shows and anchors. Watch mode polls the
// sender's RequestSubmitted events instead:
//
//	go run ./cmd/demo-bridge -watch
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const senderABI = `[
 {"type":"function","name":"deliverAttestation","stateMutability":"nonpayable",
  "inputs":[{"name":"wallet","type":"address"},{"name":"tier","type":"uint8"},
            {"name":"validForSeconds","type":"uint64"},{"name":"nullifier","type":"bytes32"},
            {"name":"nonce","type":"bytes32"},{"name":"measurement","type":"bytes32"}],
  "outputs":[]},
 {"type":"event","name":"RequestSubmitted","anonymous":false,
  "inputs":[{"name":"wallet","type":"address","indexed":true},
            {"name":"requestHash","type":"bytes32","indexed":true}]}
]`

func main() {
	enclave := flag.String("enclave", "http://127.0.0.1:7702", "enclave base URL")
	rpc := flag.String("rpc", "https://coston2-api.flare.network/ext/C/rpc", "chain RPC")
	senderAddr := flag.String("sender", "", "VaultProofInstructionSender address (default: $INSTRUCTION_SENDER)")
	key := flag.String("key", "", "teeExecutor private key (default: $DEPLOYMENT_PRIVATE_KEY)")
	wallet := flag.String("wallet", "", "wallet the attestation binds to")
	requestHash := flag.String("request-hash", "", "keccak256 of the sealed blob, as anchored")
	watch := flag.Bool("watch", false, "poll RequestSubmitted and handle each one")
	dryRun := flag.Bool("dry-run", false, "run the enclave step but do not write on-chain")
	flag.Parse()

	if *senderAddr == "" {
		*senderAddr = os.Getenv("INSTRUCTION_SENDER")
	}
	if *key == "" {
		*key = os.Getenv("DEPLOYMENT_PRIVATE_KEY")
	}
	if *senderAddr == "" {
		die("no sender address: pass -sender or set INSTRUCTION_SENDER")
	}

	fmt.Println("VaultProof demo bridge")
	fmt.Println("  Stands in for FCC provider delivery ONLY. The enclave does the real work,")
	fmt.Println("  and the tier is written on-chain through the real contract.")
	fmt.Println()

	if *watch {
		runWatch(*enclave, *rpc, *senderAddr, *key, *dryRun)
		return
	}
	if *wallet == "" || *requestHash == "" {
		die("pass -wallet and -request-hash, or use -watch")
	}
	if err := handle(*enclave, *rpc, *senderAddr, *key, *wallet, *requestHash, *dryRun); err != nil {
		die(err.Error())
	}
}

// handle drives one request through the enclave and, unless dry-run, on-chain.
func handle(enclave, rpc, senderAddr, key, wallet, requestHash string, dryRun bool) error {
	fmt.Printf("request  wallet=%s hash=%s\n", wallet, short(requestHash))

	// 1. Ask the enclave, exactly as a provider would: same opType/opCommand,
	//    and the same message shape VaultProofInstructionSender emits.
	msg, err := json.Marshal(map[string]string{
		"wallet":      wallet,
		"requestHash": requestHash,
		"nonce":       requestHash,
	})
	if err != nil {
		return fmt.Errorf("encoding message: %w", err)
	}

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
	// The browser anchors first and POSTs the ciphertext immediately after, so
	// in watch mode the event can arrive before the blob does. Retry briefly on
	// exactly that condition rather than failing a live demo on a race.
	for attempt := 1; ; attempt++ {
		if err := postJSON(enclave+"/action", action, &result); err != nil {
			return fmt.Errorf("calling enclave: %w", err)
		}
		if result.Status == 1 {
			break
		}
		if !strings.Contains(result.Log, "no sealed blob is pending") || attempt >= 10 {
			return fmt.Errorf("enclave refused: %s", result.Log)
		}
		fmt.Printf("  waiting for the ciphertext (%d/10)…\n", attempt)
		time.Sleep(2 * time.Second)
	}

	var att struct {
		Wallet          string `json:"wallet"`
		Tier            uint8  `json:"tier"`
		ValidForSeconds uint64 `json:"validForSeconds"`
		Nullifier       string `json:"nullifier"`
		Nonce           string `json:"nonce"`
		Measurement     string `json:"measurement"`
	}
	if err := json.Unmarshal(result.Data, &att); err != nil {
		return fmt.Errorf("decoding attestation: %w", err)
	}
	fmt.Printf("enclave  tier=T%d validFor=%ds measurement=%s\n",
		att.Tier, att.ValidForSeconds, short(att.Measurement))

	if dryRun {
		fmt.Println("dry-run  not writing on-chain")
		return nil
	}
	if key == "" {
		return fmt.Errorf("no key: pass -key or set DEPLOYMENT_PRIVATE_KEY")
	}

	// 2. Write it through the real contract. SolvencyRegistry re-checks the
	//    measurement against its whitelist and enforces nullifier and expiry
	//    rules here, so this is not a rubber stamp.
	txHash, err := deliver(rpc, senderAddr, key, att.Wallet, att.Tier, att.ValidForSeconds,
		att.Nullifier, att.Nonce, att.Measurement)
	if err != nil {
		return fmt.Errorf("delivering on-chain: %w", err)
	}
	fmt.Printf("on-chain tx=%s\n", txHash)
	fmt.Println("\nStage 6 should now show the tier. Borrow within the cap to finish the demo.")
	return nil
}

func deliver(rpc, senderAddr, key, wallet string, tier uint8, validFor uint64,
	nullifier, nonce, measurement string) (string, error) {
	client, err := ethclient.Dial(rpc)
	if err != nil {
		return "", fmt.Errorf("dialling chain: %w", err)
	}
	defer client.Close()

	parsed, err := abi.JSON(strings.NewReader(senderABI))
	if err != nil {
		return "", fmt.Errorf("parsing ABI: %w", err)
	}

	priv, err := crypto.HexToECDSA(strings.TrimPrefix(key, "0x"))
	if err != nil {
		return "", fmt.Errorf("parsing key: %w", err)
	}

	chainID, err := client.ChainID(context.Background())
	if err != nil {
		return "", fmt.Errorf("reading chain id: %w", err)
	}
	auth, err := bind.NewKeyedTransactorWithChainID(priv, chainID)
	if err != nil {
		return "", fmt.Errorf("building transactor: %w", err)
	}

	contract := bind.NewBoundContract(common.HexToAddress(senderAddr), parsed, client, client, client)
	tx, err := contract.Transact(auth, "deliverAttestation",
		common.HexToAddress(wallet), tier, validFor,
		common.HexToHash(nullifier), common.HexToHash(nonce), common.HexToHash(measurement))
	if err != nil {
		return "", err
	}

	receipt, err := bind.WaitMined(context.Background(), client, tx)
	if err != nil {
		return "", fmt.Errorf("waiting for receipt: %w", err)
	}
	if receipt.Status != 1 {
		return tx.Hash().Hex(), fmt.Errorf("transaction reverted")
	}
	return tx.Hash().Hex(), nil
}

// runWatch polls RequestSubmitted and handles each new request once.
func runWatch(enclave, rpc, senderAddr, key string, dryRun bool) {
	client, err := ethclient.Dial(rpc)
	if err != nil {
		die(fmt.Sprintf("dialling chain: %v", err))
	}
	defer client.Close()

	parsed, err := abi.JSON(strings.NewReader(senderABI))
	if err != nil {
		die(fmt.Sprintf("parsing ABI: %v", err))
	}
	topic := parsed.Events["RequestSubmitted"].ID

	head, err := client.BlockNumber(context.Background())
	if err != nil {
		die(fmt.Sprintf("reading head: %v", err))
	}
	// Start slightly behind so a request anchored moments ago is still caught.
	from := head - 20

	fmt.Printf("watching %s from block %d — anchor a request in the browser\n\n", senderAddr, from)
	seen := map[string]bool{}

	for {
		head, err = client.BlockNumber(context.Background())
		if err != nil {
			fmt.Fprintf(os.Stderr, "head: %v\n", err)
			time.Sleep(5 * time.Second)
			continue
		}
		if head < from {
			time.Sleep(3 * time.Second)
			continue
		}

		logs, err := client.FilterLogs(context.Background(), ethereum.FilterQuery{
			FromBlock: new(big.Int).SetUint64(from),
			ToBlock:   new(big.Int).SetUint64(head),
			Addresses: []common.Address{common.HexToAddress(senderAddr)},
			Topics:    [][]common.Hash{{topic}},
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "filter: %v\n", err)
			time.Sleep(5 * time.Second)
			continue
		}

		for _, l := range logs {
			if len(l.Topics) < 3 {
				continue
			}
			wallet := common.HexToAddress(l.Topics[1].Hex()).Hex()
			hash := l.Topics[2].Hex()
			if seen[hash] {
				continue
			}
			seen[hash] = true

			if err := handle(enclave, rpc, senderAddr, key, wallet, hash, dryRun); err != nil {
				fmt.Fprintf(os.Stderr, "  failed: %v\n\n", err)
				continue
			}
			fmt.Println()
		}

		from = head + 1
		time.Sleep(3 * time.Second)
	}
}

func buildAction(opType, opCommand common.Hash, message []byte) map[string]any {
	df, _ := json.Marshal(struct {
		OPType          common.Hash   `json:"opType"`
		OPCommand       common.Hash   `json:"opCommand"`
		OriginalMessage hexutil.Bytes `json:"originalMessage"`
	}{opType, opCommand, message})
	return map[string]any{"data": map[string]any{"message": hexutil.Bytes(df)}}
}

func short(s string) string {
	if len(s) <= 14 {
		return s
	}
	return s[:14] + "…"
}

func die(msg string) {
	fmt.Fprintln(os.Stderr, "demo-bridge: "+msg)
	os.Exit(1)
}

// postJSON posts a JSON body to an absolute URL and decodes the reply.
func postJSON(url string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return fmt.Errorf("encoding request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("reading response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	return json.Unmarshal(raw, out)
}
